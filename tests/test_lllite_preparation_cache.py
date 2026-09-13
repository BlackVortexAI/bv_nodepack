"""Native-shaped LLLite cache regression, including legacy bypass control."""
import copy
import sys
import types
import unittest
import uuid
from unittest.mock import patch
import test_krea_preparation_cache as cache_tests


def containers(value):
    if type(value) is dict:
        return {key: containers(item) for key, item in value.items()}
    if type(value) is list:
        return [containers(item) for item in value]
    return value


class NativeModel:
    def __init__(self):
        self.model = object()
        self.model_options = {"transformer_options": {}}
        self.patches_uuid = uuid.uuid4()
        self.attachments = {}
    def clone(self):
        result = copy.copy(self)
        result.model_options = containers(self.model_options)
        result.attachments = dict(self.attachments)
        return result
    def set_model_patch(self, value, name):
        patches = self.model_options["transformer_options"].setdefault("patches", {})
        patches[name] = patches.get(name, []) + [value]


class Root:
    pass


class Attention:
    def __init__(self, root, targets):
        self.patch, self.targets = root, targets


class MLP:
    def __init__(self, root):
        self.patch = root


class LLLiteCacheTests(unittest.TestCase):
    def apply(self):
        return self.cache.apply(self.model, self.clip, self.entries, self.prepare)

    def setUp(self):
        cache_tests.PreparationCacheTests.setUp(self)
        module = types.ModuleType("comfy.model_patcher")
        module.ModelPatcher = NativeModel
        module.ModelPatcherDynamic = type("Dynamic", (NativeModel,), {})
        lllite = types.ModuleType("comfy.ldm.anima.lllite")
        lllite.AnimaLLLitePatch, lllite.AnimaLLLiteAttentionPatch, lllite.AnimaLLLiteMLPPatch = Root, Attention, MLP
        utils = types.ModuleType("comfy.utils")
        utils.deepcopy_list_dict = containers
        context = patch.dict(sys.modules, {"comfy.model_patcher": module, "comfy.ldm.anima.lllite": lllite, "comfy.utils": utils})
        context.start()
        self.addCleanup(context.stop)
        self.base = NativeModel()

    def wrapped(self, strength=1):
        model = self.base.clone()
        root = Root()
        root.image, root.strength, root.sigma_start, root.sigma_end = object(), strength, strength + 1, strength - 1
        model.set_model_patch(root, "post_input")
        model.set_model_patch(Attention(root, {"q": "self_attn_q_proj", "k": "self_attn_k_proj", "v": "self_attn_v_proj"}), "attn1_patch")
        model.set_model_patch(Attention(root, {"q": "cross_attn_q_proj"}), "attn2_patch")
        model.set_model_patch(MLP(root), "mlp_patch")
        return model, root

    def test_current_wrappers_rebind_with_stable_weights_and_legacy_control(self):
        self.model, old = self.wrapped()
        # The old opaque-state behavior demonstrably prepares every time.
        with patch("util.lora_preparation_cache._lllite_options", return_value=None):
            self.apply(); self.apply()
        self.assertEqual(self.prepare.call_count, 2)
        self.prepare.reset_mock()
        first, _ = self.apply()
        self.model, current = self.wrapped(.4)
        second, _ = self.apply()
        self.assertEqual(self.prepare.call_count, 1)
        self.assertEqual(first.patches_uuid, second.patches_uuid)
        first_patches = first.model_options["transformer_options"]["patches"]
        second_patches = second.model_options["transformer_options"]["patches"]
        self.assertIs(first_patches["post_input"][0], old)
        self.assertIs(second_patches["post_input"][0], current)
        for name in ("attn1_patch", "attn2_patch", "mlp_patch"):
            self.assertIs(second_patches[name][0].patch, current)
        self.assertNotIn("patches", self.cache._entry[3][0].model_options["transformer_options"])
        second_patches["post_input"].append(object())
        self.assertEqual(len(self.model.model_options["transformer_options"]["patches"]["post_input"]), 1)
        self.base.patches_uuid = uuid.uuid4()
        self.model, _ = self.wrapped()
        self.apply()
        self.assertEqual(self.prepare.call_count, 2)

    def test_unknown_or_incoherent_groups_still_bypass(self):
        for mutation in (
            lambda p: p["post_input"].append(Root()),
            lambda p: p.update(other=[object()]),
            lambda p: setattr(p["attn1_patch"][0], "patch", Root()),
            lambda p: setattr(p["attn2_patch"][0], "targets", {"q": "different"}),
            lambda p: p.update(mlp_patch=[type("Subclass", (MLP,), {})(p["post_input"][0])]),
        ):
            self.model, _ = self.wrapped()
            mutation(self.model.model_options["transformer_options"]["patches"])
            self.apply(); self.apply()
            self.assertIsNone(self.cache._entry)

    def test_specialized_key_retains_configuration_and_extension_guards(self):
        self.model, _ = self.wrapped()
        self.apply()
        self.model, _ = self.wrapped()
        self.model.model_options["transformer_options"]["plain_setting"] = 1
        self.apply()
        self.assertEqual(self.prepare.call_count, 2)
        self.model.attachments["foreign"] = object()
        self.apply()
        self.assertIsNone(self.cache._entry)

    def test_specialized_weight_identity_and_device_invalidate(self):
        self.model, _ = self.wrapped()
        self.apply()
        for expected, attribute, value in (
            (2, "model", object()),
            (3, "load_device", "different-device"),
            (4, "force_cast_weights", True),
            (5, "clone_base_uuid", uuid.uuid4()),
        ):
            setattr(self.base, attribute, value)
            self.model, _ = self.wrapped()
            self.apply()
            self.assertEqual(self.prepare.call_count, expected)
        self.model, _ = self.wrapped()
        self.model.__class__ = type("ForeignPatcher", (NativeModel,), {})
        self.apply()
        self.assertIsNone(self.cache._entry)


if __name__ == "__main__":
    unittest.main()
