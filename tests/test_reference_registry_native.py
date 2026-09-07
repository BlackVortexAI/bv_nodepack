"""Optional integration checks against an installed ComfyUI V3 API."""
from fractions import Fraction
import importlib.util
import json
import unittest
import uuid

import torch

try:
    COMFY_AVAILABLE = importlib.util.find_spec("comfy_api.latest") is not None
except (ModuleNotFoundError, ValueError):
    COMFY_AVAILABLE = False


@unittest.skipUnless(COMFY_AVAILABLE, "requires installed ComfyUI V3 API")
class NativeReferenceRegistryTests(unittest.TestCase):
    def test_native_schema_finalizes_mixed_optional_autogrow(self):
        from comfy_api.latest import _io
        from py.nodes.bv_reference_registry import BVReferenceRegistryNode as Node, NODE_CLASS_MAPPINGS
        self.assertIs(NODE_CLASS_MAPPINGS["BV Reference Registry"], Node)
        self.assertEqual(Node.GET_SCHEMA().node_id, "BV Reference Registry")
        inputs, _, dynamic = _io.get_finalized_class_inputs(Node.INPUT_TYPES(), {"config_json": "", "media.media0": ["1", 0], "media.media1": ["2", 0]})
        self.assertEqual(inputs["optional"]["media.media0"][0], "IMAGE,AUDIO,VIDEO")
        self.assertEqual(set(inputs["required"]), {"config_json"})
        self.assertTrue(inputs["required"]["config_json"][1]["socketless"])
        self.assertIn("media.media1", dynamic["dynamic_paths"])
        empty, _, empty_dynamic = _io.get_finalized_class_inputs(Node.INPUT_TYPES(), {"config_json": ""})
        self.assertEqual(set(empty["required"]), {"config_json"})
        self.assertIn("media", empty_dynamic["dynamic_paths_default_value"])

    def test_real_image_audio_video_provider_does_not_decode_or_copy(self):
        from comfy_api.latest._input_impl.video_types import VideoFromComponents
        from comfy_api.latest._util import VideoComponents
        from py.nodes.bv_reference_registry import BVReferenceRegistryNode as Node
        from py.util.regional.reference_registry import reference_catalog, resolve_reference
        images = torch.rand(2, 4, 4, 3)
        audio = {"waveform": torch.zeros(1, 2, 200), "sample_rate": 44100}
        video = VideoFromComponents(VideoComponents(images=images, frame_rate=Fraction(24), audio=audio))
        def forbidden(*args, **kwargs):
            raise AssertionError("Registry must not decode video")
        video.get_components = forbidden
        config = {"schema": "bv.reference_registry_config", "version": 1, "collector_id": str(uuid.uuid4()),
                  "entries": [{"id": str(uuid.uuid4()), "slot": f"media{i}"} for i in range(3)]}
        provider = Node.execute(json.dumps(config), dict(zip(["media0", "media1", "media2"], [images, audio, video]))).result[0]
        self.assertEqual([entry["name"] for entry in reference_catalog(provider)["entries"]], ["Image 1", "Audio 1", "Video 1"])
        for entry, original in zip(config["entries"], [images, audio, video]):
            self.assertIs(resolve_reference(provider, config["collector_id"], entry["id"]), original)


if __name__ == "__main__":
    unittest.main()
