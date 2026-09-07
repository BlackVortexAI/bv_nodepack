from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import torch

sys.path.insert(0, str(Path(__file__).parents[1] / "py"))
from util.regional.krea2_attention import build_krea2_joint_attention_bias
from util.regional.flux2_klein_attention import build_flux2_joint_attention_bias
from util.regional.zimage_attention import build_joint_attention_bias
from util.regional import dense_attention, zimage_attention
from util.regional.krea2_attention import Krea2AttentionPatch
from util.regional.flux2_klein_attention import Flux2KleinAttentionPatch


class DenseAttentionBudgetTests(unittest.TestCase):
    def test_byte_boundary_batch_and_dtype(self):
        with patch.object(dense_attention, "MAX_DENSE_MASK_BYTES", 64):
            for batch, dtype, allowed in ((1, torch.float32, True), (2, torch.float16, True),
                                          (2, torch.bfloat16, True), (2, torch.float32, False),
                                          (1, torch.float64, False)):
                for build in self.builders(batch, dtype):
                    with self.subTest(batch=batch, dtype=dtype, build=build):
                        if allowed:
                            self.assertEqual(tuple(build().shape), (batch, 1, 4, 4))
                        else:
                            with patch("torch.zeros", side_effect=AssertionError("allocation attempted")):
                                with self.assertRaisesRegex(RuntimeError, "batch=.*dtype="):
                                    build()

    def test_patch_uses_actual_query_batch_and_reference_tokens(self):
        for kind in (Krea2AttentionPatch, Flux2KleinAttentionPatch):
            attention = kind([], 1.0, 1.0, 10.0, 0.0)
            q = torch.empty((2, 1, 4, 8))
            with self.subTest(kind=kind), patch.object(dense_attention, "MAX_DENSE_MASK_BYTES", 64):
                with self.assertRaisesRegex(RuntimeError, "batch=2, tokens=4"):
                    attention(q, q, q, extra_options={"img_slice": [1, 4], "reference_image_num_tokens": [2]})

    def test_zimage_uses_embedding_batch_and_padded_sequence(self):
        class Diffusion:
            patch_size = 1
            pad_tokens_multiple = 1
            def patchify_and_embed(self):
                return (torch.empty((2, 4, 8)), None)
        class Executor:
            class_obj = Diffusion()
            def __call__(self, *args, **kwargs):
                return self.class_obj.patchify_and_embed()
        executor = Executor()
        original = executor.class_obj.patchify_and_embed
        with patch.object(dense_attention, "MAX_DENSE_MASK_BYTES", 64):
            with self.assertRaisesRegex(RuntimeError, "batch=2, tokens=4"):
                zimage_attention._diffusion_model_wrapper(
                    executor, torch.empty((1, 1, 1, 1)), None, torch.empty((1, 0, 8)),
                    transformer_options={zimage_attention.WRAPPER_KEY: zimage_attention.ZImageAttentionPatch([], 1, 10, 0)},
                )
        self.assertEqual(executor.class_obj.patchify_and_embed, original)

    def builders(self, batch, dtype):
        return (
            lambda: build_krea2_joint_attention_bias([], 0, 4, 0, 1, 1, torch.device("cpu"), dtype, batch),
            lambda: build_flux2_joint_attention_bias([], 0, 4, 0, 1, 1, torch.device("cpu"), dtype, batch),
            lambda: build_joint_attention_bias([], 0, 2, 2, 1, 4, 1, torch.device("cpu"), dtype, batch),
        )

    def test_large_actual_batch_rejected_before_allocation(self):
        # 16 entries per item passes the old total**2 check; batch makes it huge.
        for build in self.builders(100_000_000, torch.float32):
            with self.subTest(build=build), patch("torch.zeros", side_effect=AssertionError("allocation attempted")):
                with self.assertRaisesRegex(RuntimeError, "regional attention mask"):
                    build()


if __name__ == "__main__":
    unittest.main()
