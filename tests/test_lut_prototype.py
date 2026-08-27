import tempfile
import unittest
from collections import namedtuple
from pathlib import Path
from unittest.mock import patch
import types

import numpy as np
import torch

from py.util.lut_prototype import apply_lut, builtin_lut, normalize_mask, parse_cube, refine_mask, select_segs
from py.nodes.bv_lut_prototype import (
    BVApplyLutPrototype,
    BVImpactDetectorMaskPrototype,
    BVLutJobPrototype,
    BVLutLoopJobResolverPrototype,
    BVLutLoaderPrototype,
    _BVLutLoopAdvancePrototype,
    _BVLutLoopResultPrototype,
    register_lut_folder,
)


class LutPrototypeTests(unittest.TestCase):
    def test_loop_strength_connection_is_explicit_in_node_metadata(self):
        tooltip = BVApplyLutPrototype.INPUT_TYPES()["required"]["strength"][1]["tooltip"]
        self.assertIn("connect", tooltip.lower())
        self.assertIn("strength", BVLutLoopJobResolverPrototype.OUTPUT_TOOLTIPS[3].lower())

    def test_lut_folder_registration_creates_default_and_preserves_extra_paths(self):
        with tempfile.TemporaryDirectory() as root:
            models = Path(root) / "models"
            extra = Path(root) / "shared-luts"
            fake = types.SimpleNamespace(
                models_dir=str(models),
                folder_names_and_paths={"luts": ([str(extra)], set())},
            )

            def add_model_folder_path(name, path, is_default=False):
                paths, _extensions = fake.folder_names_and_paths.setdefault(name, ([], set()))
                if path not in paths:
                    paths.insert(0 if is_default else len(paths), path)

            fake.add_model_folder_path = add_model_folder_path
            registered = register_lut_folder(fake)

            self.assertEqual(registered, models / "luts")
            self.assertTrue(registered.is_dir())
            paths, extensions = fake.folder_names_and_paths["luts"]
            self.assertEqual(paths, [str(models / "luts"), str(extra)])
            self.assertEqual(extensions, {".cube"})

    def test_loader_choices_refresh_from_registered_folder_paths(self):
        state = {"names": ["cinema/first.cube"]}
        fake = types.SimpleNamespace(
            get_filename_list=lambda _folder: list(state["names"]),
            get_full_path=lambda _folder, name: f"X:/models/luts/{name}",
        )
        with patch.dict("sys.modules", {"folder_paths": fake}):
            first = BVLutLoaderPrototype.INPUT_TYPES()["required"]["lut_name"][0]
            state["names"].append("second.cube")
            refreshed = BVLutLoaderPrototype.INPUT_TYPES()["required"]["lut_name"][0]

        self.assertIn("cinema/first.cube", first)
        self.assertNotIn("second.cube", first)
        self.assertIn("second.cube", refreshed)

    def test_builtin_identity_round_trips(self):
        image = torch.rand((2, 7, 5, 3))
        self.assertTrue(torch.allclose(apply_lut(image, builtin_lut("Identity")), image, atol=1e-6))

    def test_file_identity_round_trips_and_preserves_cube_channel_order(self):
        cube = """LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
"""
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "identity.cube"
            path.write_text(cube, encoding="utf-8")
            image = torch.tensor([[[[0.1, 0.4, 0.8]]]])
            self.assertTrue(torch.allclose(apply_lut(image, parse_cube(path)), image, atol=1e-6))

    def test_cube_domain_is_applied_and_alpha_is_preserved(self):
        cube = """LUT_3D_SIZE 2
DOMAIN_MIN -1 -1 -1
DOMAIN_MAX 1 1 1
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
"""
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "domain.cube"
            path.write_text(cube, encoding="utf-8")
            image = torch.tensor([[[[-1.0, 0.0, 1.0, 0.25]]]])
            result = apply_lut(image, parse_cube(path))
        self.assertTrue(torch.allclose(result[..., :3], torch.tensor([[[[0.0, 0.5, 1.0]]]]), atol=1e-6))
        self.assertEqual(result[..., 3].item(), 0.25)

    def test_cube_rejects_duplicate_size_non_finite_and_entry_count(self):
        invalid = {
            "duplicate": "LUT_3D_SIZE 2\nLUT_3D_SIZE 2\n",
            "nonfinite": "LUT_3D_SIZE 2\nnan 0 0\n",
            "count": "LUT_3D_SIZE 2\n0 0 0\n",
        }
        with tempfile.TemporaryDirectory() as root:
            for name, content in invalid.items():
                with self.subTest(name=name):
                    path = Path(root) / f"{name}.cube"
                    path.write_text(content, encoding="utf-8")
                    with self.assertRaises(ValueError):
                        parse_cube(path)

    def test_mask_broadcast_and_resize(self):
        image = torch.zeros((2, 8, 6, 3))
        mask = normalize_mask(torch.ones((1, 4, 3)), image)
        self.assertEqual(tuple(mask.shape), (2, 8, 6))

    def test_strength_zero_half_one_and_masked_pixels(self):
        image = torch.full((1, 2, 4, 3), 0.5)
        mask = torch.tensor([[[0.0, 0.0, 1.0, 1.0], [0.0, 0.0, 1.0, 1.0]]])
        node = BVApplyLutPrototype()
        zero, _ = node.apply(image, builtin_lut("Warm Contrast"), 0.0, mask)
        half, _ = node.apply(image, builtin_lut("Warm Contrast"), 0.5, mask)
        full, _ = node.apply(image, builtin_lut("Warm Contrast"), 1.0, mask)
        self.assertTrue(torch.equal(zero, image))
        self.assertTrue(torch.equal(full[:, :, :2], image[:, :, :2]))
        self.assertTrue(torch.allclose(half[:, :, 2:], (image[:, :, 2:] + full[:, :, 2:]) / 2, atol=1e-6))

    def test_sequential_lut_order_is_not_assumed_commutative(self):
        image = torch.rand((1, 5, 7, 3))
        warm_then_cool = apply_lut(apply_lut(image, builtin_lut("Warm Contrast")), builtin_lut("Cool Graphite"))
        cool_then_warm = apply_lut(apply_lut(image, builtin_lut("Cool Graphite")), builtin_lut("Warm Contrast"))
        self.assertFalse(torch.allclose(warm_then_cool, cool_then_warm, atol=1e-6))

    def test_refine_mask_grows_shrinks_and_feathers(self):
        source = torch.zeros((1, 9, 9))
        source[:, 3:6, 3:6] = 1
        self.assertGreater(torch.count_nonzero(refine_mask(source, grow=1)), torch.count_nonzero(source))
        self.assertLess(torch.count_nonzero(refine_mask(source, grow=-1)), torch.count_nonzero(source))
        feathered = refine_mask(source, feather=2)
        self.assertTrue(torch.any((feathered > 0) & (feathered < 1)))

    def test_instance_selection_combined_largest_index_and_missing(self):
        Segment = namedtuple("Segment", "bbox")
        segs = ((10, 10), [Segment((0, 0, 2, 2)), Segment((0, 0, 8, 7))])
        self.assertEqual(len(select_segs(segs, "combined")[0][1]), 2)
        self.assertEqual(select_segs(segs, "largest")[0][1][0].bbox, (0, 0, 8, 7))
        self.assertEqual(select_segs(segs, "index", 0)[0][1][0].bbox, (0, 0, 2, 2))
        self.assertEqual(select_segs(segs, "index", 9)[0][1], [])

    def test_largest_instance_accepts_impact_numpy_bbox(self):
        Segment = namedtuple("Segment", "bbox crop_region")
        segs = ((10, 10), [
            Segment(np.array([0, 0, 2, 2]), np.array([0, 0, 3, 3])),
            Segment(np.array([0, 0, 8, 7]), np.array([0, 0, 9, 8])),
        ])
        selected, _ = select_segs(segs, "largest")
        self.assertTrue(np.array_equal(selected[1][0].bbox, np.array([0, 0, 8, 7])))

    def test_detector_node_prefers_segmentation_and_empty_result_stays_empty(self):
        Segment = namedtuple("Segment", "bbox")
        class Detector:
            def __init__(self, segments): self.segments = segments
            def detect(self, image, *_args): return ((image.shape[1], image.shape[2]), self.segments)
        core = types.ModuleType("impact.core")
        def combined(segs):
            height, width = segs[0]
            result = torch.zeros((1, height, width))
            if segs[1]: result[:, 2:-2, 2:-2] = 1
            return result
        core.segs_to_combined_mask = combined
        impact = types.ModuleType("impact")
        impact.core = core
        with patch.dict("sys.modules", {"impact": impact, "impact.core": core}):
            node = BVImpactDetectorMaskPrototype()
            mask, info = node.detect(
                torch.zeros((1, 8, 8, 3)), detector_mode="segmentation", mask_feather=0,
                segm_detector=Detector([]), bbox_detector=Detector([Segment((0, 0, 8, 8))]),
            )
        self.assertEqual(torch.count_nonzero(mask), 0)
        self.assertIn("segmentation", info)

    def test_bbox_sam_uses_selected_bbox_and_sam_mask(self):
        Segment = namedtuple("Segment", "bbox")
        class Detector:
            def detect(self, image, *_args):
                return ((image.shape[1], image.shape[2]), [Segment((0, 0, 2, 2)), Segment((0, 0, 7, 7))])
        core = types.ModuleType("impact.core")
        core.segs_to_combined_mask = lambda segs: torch.zeros((1, *segs[0]))
        core.make_sam_mask = lambda _sam, segs, _image, *_args: torch.ones((1, *segs[0])) * len(segs[1])
        impact = types.ModuleType("impact")
        impact.core = core
        with patch.dict("sys.modules", {"impact": impact, "impact.core": core}):
            mask, info = BVImpactDetectorMaskPrototype().detect(
                torch.zeros((1, 8, 8, 3)), detector_mode="bbox_sam", instance_mode="largest", mask_feather=0,
                bbox_detector=Detector(), sam_model=object(),
            )
        self.assertTrue(torch.all(mask == 1))
        self.assertIn("largest", info)

    def test_loop_job_builder_is_immutable_and_resolver_exposes_plain_values(self):
        builder = BVLutJobPrototype()
        first_lut = builtin_lut("Warm Contrast")
        second_lut = builtin_lut("Cool Graphite")
        first, count, _ = builder.append(first_lut, 0.5)
        mask = torch.zeros((1, 4, 6)); mask[:, :, 3:] = 1
        second, count2, summary = builder.append(second_lut, 0.75, plan=first, mask=mask)
        self.assertEqual((count, count2), (1, 2))
        self.assertEqual(len(first["jobs"]), 1)
        self.assertEqual(len(second["jobs"]), 2)
        self.assertIn("Warm Contrast", summary)
        image = torch.zeros((1, 4, 6, 3))
        state = {
            "schema": "bv.lut_loop_state.prototype", "version": 1,
            "job_index": 1, "current_image": image, "plan": second,
        }
        current, lut, resolved_mask, strength, info = BVLutLoopJobResolverPrototype().resolve(state)
        self.assertIs(current, image)
        self.assertIs(lut, second_lut)
        self.assertTrue(torch.equal(resolved_mask, mask))
        self.assertEqual(strength, 0.75)
        self.assertIn("2/2", info)

    def test_loop_job_can_invert_its_resolved_mask(self):
        source = torch.zeros((1, 4, 6)); source[:, :, :2] = 1
        plan = BVLutJobPrototype().append(
            builtin_lut("Identity"), mask=source, mask_invert=True,
        )[0]
        state = {
            "schema": "bv.lut_loop_state.prototype", "version": 1,
            "job_index": 0, "current_image": torch.zeros((1, 4, 6, 3)), "plan": plan,
        }
        resolved = BVLutLoopJobResolverPrototype().resolve(state)[2]
        self.assertTrue(torch.equal(resolved, 1.0 - source))

    def test_loop_advance_preserves_batch_and_requires_shape_stability(self):
        builder = BVLutJobPrototype()
        plan = builder.append(builtin_lut("Identity"))[0]
        plan = builder.append(builtin_lut("Warm Contrast"), plan=plan)[0]
        first = torch.zeros((2, 4, 6, 3))
        second = torch.ones_like(first)
        state = {
            "schema": "bv.lut_loop_state.prototype", "version": 1,
            "job_index": 0, "current_image": first, "plan": plan,
        }
        next_state, keep_going = _BVLutLoopAdvancePrototype().advance(state, second)
        self.assertTrue(keep_going)
        self.assertEqual(next_state["job_index"], 1)
        final_state, keep_going = _BVLutLoopAdvancePrototype().advance(next_state, first)
        self.assertFalse(keep_going)
        self.assertIs(_BVLutLoopResultPrototype().extract(final_state)[0], first)
        with self.assertRaisesRegex(ValueError, "unchanged"):
            _BVLutLoopAdvancePrototype().advance(state, torch.zeros((1, 4, 6, 3)))


if __name__ == "__main__":
    unittest.main()
