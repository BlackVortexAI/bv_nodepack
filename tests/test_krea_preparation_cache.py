"""Preparation cache regression: replay changed downstream work with stable inputs."""
import copy
import ast
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock

from test_basis_model_patcher import AutomaticLoraServiceTests, Model, Clip, subject
from util.lora_preparation_cache import LoraPreparationCache


class PreparationCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "weights.safetensors"
        self.path.write_bytes(b"fixture")
        self.entries = [(str(self.path), 1., .5)]
        self.model, self.clip = Model(), Clip()
        self.model.model_options = {"transformer_options": {}}
        self.model.patches_uuid = uuid.uuid4()
        self.cache = LoraPreparationCache()
        def prepare(model, clip, entries):
            model, clip = model.clone(), clip.clone()
            model.patches_uuid = uuid.uuid4()
            return model, clip
        self.prepare = Mock(side_effect=prepare)

    def apply(self):
        return self.cache.apply(self.model, self.clip, self.entries, self.prepare)

    def test_repeated_preparation_preserves_patch_uuid_and_isolates_outputs(self):
        first, _ = self.apply()
        identifier = first.patches_uuid
        first.model_options["transformer_options"]["attention"] = "downstream"
        first.set_attachments("downstream", {})
        second, _ = self.apply()
        self.assertEqual(self.prepare.call_count, 1)
        self.assertEqual(second.patches_uuid, identifier)
        self.assertEqual(second.model_options, self.model.model_options)
        self.assertEqual(second.attachments, {})
        self.assertIsNot(first, second)

    def test_invalidation_and_single_entry(self):
        self.apply()
        mutations = [
            lambda: setattr(self.model, "patches_uuid", uuid.uuid4()),
            lambda: self.model.model_options.update(extra=True),
            lambda: setattr(self.clip, "layer_idx", -2),
            lambda: self.path.write_bytes(b"new weights"),
            lambda: self.entries.append((str(self.path), .25, -.5)),
            lambda: self.entries.reverse(),
            lambda: self.entries.pop(),
            lambda: setattr(self, "model", self.model.clone()),
            lambda: setattr(self, "clip", self.clip.clone()),
        ]
        for count, mutate in enumerate(mutations, 2):
            mutate()
            self.apply()
            self.assertEqual(self.prepare.call_count, count)
        other = LoraPreparationCache()
        other.apply(self.model, self.clip, self.entries, self.prepare)
        self.assertEqual(self.prepare.call_count, len(mutations) + 2)

    def test_opaque_extension_bypasses_and_failure_is_not_cached(self):
        self.model.attachments["foreign"] = object()
        self.apply(); self.apply()
        self.assertEqual(self.prepare.call_count, 2)
        self.model.attachments.clear()
        self.prepare.side_effect = RuntimeError("failed")
        with self.assertRaises(RuntimeError): self.apply()
        self.assertIsNone(self.cache._entry)

    def test_missing_file_does_not_hit_old_preparation(self):
        self.apply()
        self.path.unlink()
        self.apply()
        self.assertEqual(self.prepare.call_count, 2)
        self.assertIsNone(self.cache._entry)

    def test_strength_change_and_return_to_previous_entry(self):
        original = list(self.entries)
        self.apply()
        self.entries = [(str(self.path), .5, .5)]
        self.apply()
        self.entries = original
        self.apply()
        self.assertEqual(self.prepare.call_count, 3)

    def test_cyclic_options_bypass(self):
        self.model.model_options["cycle"] = self.model.model_options
        self.apply()
        self.apply()
        self.assertEqual(self.prepare.call_count, 2)

    def test_clip_immutable_object_patches_hit_and_invalidate(self):
        import torch
        self.clip.patcher.object_patches = {"manual_cast_dtype": torch.float32}
        self.apply(); self.apply()
        self.assertEqual(self.prepare.call_count, 1)
        self.clip.patcher.object_patches["manual_cast_dtype"] = torch.bfloat16
        self.apply()
        self.assertEqual(self.prepare.call_count, 2)
        self.clip.patcher.object_patches = {"flag": True}
        self.apply()
        self.clip.patcher.object_patches = {"flag": 1}
        self.apply()
        self.assertEqual(self.prepare.call_count, 4)

    def test_mutable_object_patches_still_bypass(self):
        import torch
        for value in ({}, [], object(), torch.zeros(1), lambda: None):
            self.clip.patcher.object_patches = {"extension": value}
            self.apply()
            self.assertIsNone(self.cache._entry)


class CachedAutomaticTests(AutomaticLoraServiceTests):
    def test_occurrences_validated_on_hits_and_empty_clears(self):
        cache = LoraPreparationCache()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lora"
            path.write_bytes(b"fixture")
            resources = self.resources()
            resources[0]["stack"] = [(str(path), -.5, .25), (str(path), 1., .25)]
            def run(model=None, data=None):
                return subject.apply_automatic_resources(model or self.model, self.clip,
                    resources if data is None else data, preparation_cache=cache)
            first, _ = run()
            second, _ = run()
            self.assertEqual(self.apply.call_count, 1)
            self.assertEqual(len(self.apply.call_args.args[2]), 2)
            self.assertEqual(first.attachments, second.attachments)
            changed = copy.deepcopy(resources)
            changed[0]["stack"][0] = (str(path), .7, .25)
            with self.assertRaises(ValueError): run(first, changed)
            run(data=[])
            self.assertIsNone(cache._entry)


class ConsumerPreparationTests(unittest.TestCase):
    def test_all_consumers_share_helper_but_not_cache_instances(self):
        source = Path(__file__).parents[1] / "py/nodes/bv_regional.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        names = {"BVRegionalNativeConditioningNode", "BVRegionalSDXLAttentionNode",
                 "BVRegionalZImageAttentionNode", "BVRegionalFlux2KleinAttentionNode",
                 "BVRegionalKrea2AttentionNode", "BVRegionalAnimaConditioningNode"}
        base = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                    and node.name == "_GlobalLoraPreparation")
        # Execute the real shared helper without importing GPU backend modules.
        base = copy.deepcopy(base)
        constructor = next(node for node in base.body if getattr(node, "name", None) == "__init__")
        constructor.body = [node for node in constructor.body if not isinstance(node, ast.ImportFrom)]
        apply = Mock(return_value=("model", "clip"))
        namespace = {"LoraPreparationCache": LoraPreparationCache, "apply_global_patches": apply}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[base], type_ignores=[])), str(source), "exec"), namespace)
        caches = []
        for node in tree.body:
            if not isinstance(node, ast.ClassDef) or node.name not in names:
                continue
            self.assertEqual([item.id for item in node.bases], ["_GlobalLoraPreparation"])
            self.assertFalse(any(getattr(item, "name", None) == "__init__" for item in node.body))
            calls = [item for item in ast.walk(node) if isinstance(item, ast.Call)
                     and isinstance(item.func, ast.Attribute) and item.func.attr == "_prepare_global_loras"]
            self.assertEqual(len(calls), 1, node.name)
            instance = type(node.name, (namespace["_GlobalLoraPreparation"],), {})()
            instance._prepare_global_loras(None, "clip", "regional")
            cache = apply.call_args.kwargs["preparation_cache"]
            instance._prepare_global_loras(None, "clip", "changed regional")
            self.assertIs(apply.call_args.kwargs["preparation_cache"], cache)
            caches.append(cache)
        self.assertEqual(len({id(cache) for cache in caches}), len(names))


@unittest.skipUnless(os.environ.get("BV_NATIVE_COMFY_ROOT"), "requires native CPU process")
class NativePreparationTests(unittest.TestCase):
    def test_native_patch_identity_and_clone_isolation(self):
        sys.path.insert(0, os.environ["BV_NATIVE_COMFY_ROOT"])
        import comfy.options
        comfy.options.enable_args_parsing()
        sys.argv = [sys.argv[0], "--cpu"]
        import torch
        import comfy.model_patcher
        base = comfy.model_patcher.ModelPatcher(
            torch.nn.Linear(2, 2), torch.device("cpu"), torch.device("cpu"))
        base.set_model_compute_dtype(torch.float32)
        def prepare(model, clip, entries):
            result = model.clone()
            result.add_patches({"weight": ("diff", (torch.ones(2, 2),))})
            return result, None
        apply = Mock(side_effect=prepare)
        cache = LoraPreparationCache()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture"
            path.write_bytes(b"fixture")
            entries = [(str(path), 1., 0.)]
            first, _ = cache.apply(base, None, entries, apply)
            identifier = first.patches_uuid
            first.model_options["transformer_options"]["changed"] = True
            first.set_attachments("downstream", {"mutable": []})
            second, _ = cache.apply(base, None, entries, apply)
            self.assertEqual(apply.call_count, 1)
            self.assertEqual(identifier, second.patches_uuid)
            self.assertEqual(second.model_options, base.model_options)
            self.assertFalse(second.attachments)
            self.assertFalse(base.patches)
            self.assertTrue(second.patches)
            self.assertEqual(second.object_patches["manual_cast_dtype"], torch.float32)
            base.set_model_compute_dtype(torch.bfloat16)
            third, _ = cache.apply(base, None, entries, apply)
            self.assertEqual(apply.call_count, 2)
            self.assertEqual(third.object_patches["manual_cast_dtype"], torch.bfloat16)


if __name__ == "__main__":
    unittest.main()
