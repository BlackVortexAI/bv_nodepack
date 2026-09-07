import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, call

sys.path.insert(0, str(Path(__file__).parents[1] / "py"))
from util.regional.lora_hooks import apply_static_lora_stack


class StaticLoraStackTests(unittest.TestCase):
    def test_empty_and_disabled_stacks_preserve_objects(self):
        model, clip = object(), object()
        self.assertEqual(apply_static_lora_stack(model, clip, []), (model, clip))

    def test_order_strengths_clones_and_safe_loading(self):
        comfy = types.ModuleType("comfy")
        comfy.sd = types.ModuleType("comfy.sd")
        comfy.utils = types.ModuleType("comfy.utils")
        comfy.utils.load_torch_file = Mock(side_effect=["weights-a", "weights-b"])
        comfy.sd.load_lora_for_models = Mock(side_effect=[("model-a", "clip-a"), ("model-b", "clip-b")])
        with patch.dict(sys.modules, {"comfy": comfy, "comfy.sd": comfy.sd, "comfy.utils": comfy.utils}):
            result = apply_static_lora_stack("model", "clip", [("a", .8, .2), ("disabled", 0, 0), ("b", -.5, 1.)])
        self.assertEqual(result, ("model-b", "clip-b"))
        self.assertEqual(comfy.utils.load_torch_file.call_args_list, [call("a", safe_load=True), call("b", safe_load=True)])
        self.assertEqual(comfy.sd.load_lora_for_models.call_args_list,
            [call("model", "clip", "weights-a", .8, .2), call("model-a", "clip-a", "weights-b", -.5, 1.)])

    def test_load_failure_propagates(self):
        comfy = types.ModuleType("comfy")
        comfy.sd = types.ModuleType("comfy.sd")
        comfy.utils = types.ModuleType("comfy.utils")
        comfy.utils.load_torch_file = Mock(side_effect=OSError("unreadable LoRA"))
        comfy.sd.load_lora_for_models = Mock()
        with patch.dict(sys.modules, {"comfy": comfy, "comfy.sd": comfy.sd, "comfy.utils": comfy.utils}):
            with self.assertRaisesRegex(OSError, "unreadable LoRA"):
                apply_static_lora_stack("model", "clip", [("a", 1., 1.)])
        comfy.sd.load_lora_for_models.assert_not_called()


if __name__ == "__main__": unittest.main()
