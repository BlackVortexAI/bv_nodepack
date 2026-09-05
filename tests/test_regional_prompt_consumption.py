from pathlib import Path
import json
import sys
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))
from util.regional.zimage_attention import compile_zimage_attention
from util.regional.flux2_klein_attention import compile_flux2_klein_attention
from util.regional.krea2_attention import compile_krea2_attention
from util.regional.anima_adapter import compile_anima_adapter


class TextClip:
    def __init__(self, width):
        self.width = width
        self.texts = []

    def tokenize(self, text):
        return text

    def encode_from_tokens_scheduled(self, text):
        self.texts.append(text)
        length = 5 if "NEG" in text else 2
        value = -3.0 if "NEG" in text else 2.0
        return [[torch.full((1, length, self.width), value),
                 {"attention_mask": torch.ones((1, length)),
                  "pooled_output": torch.full((1, 2), value)}]]


def document():
    value = json.loads((ROOT / "tests/fixtures/regional/v1_hybrid_joint.json").read_text())
    value["canvas"] = {"width": 8, "height": 8}
    value["prompts"]["global"]["negative_source"] = ""
    value["prompts"]["background"]["negative_source"] = ""
    for region in value["regions"]:
        region["prompts"]["negative_source"] = ""
    return value


class PromptConsumptionTests(unittest.TestCase):
    def test_attention_mode_matrix_consumes_existing_negative_fields(self):
        for compiler, width in ((compile_zimage_attention, 8),
                                (compile_flux2_klein_attention, 12288),
                                (compile_krea2_attention, 30720)):
            for mode, has_negative, expected in (("prompt", True, True), ("prompt", False, True),
                    ("auto", True, True), ("auto", False, False),
                    ("zero_out", True, False)):
                with self.subTest(backend=compiler.__name__, mode=mode, filled=has_negative):
                    doc = document()
                    doc["negative_mode"] = mode
                    if has_negative:
                        doc["prompts"]["background"]["negative_source"] = "BACKGROUND NEG"
                        doc["regions"][0]["prompts"]["negative_source"] = "REGION NEG"
                    clip = TextClip(width)
                    pos, neg, slots, _ = compiler(doc, clip)
                    self.assertEqual(pos[0][0].shape, neg[0][0].shape)
                    self.assertEqual(any("BACKGROUND NEG" in text for text in clip.texts), expected and has_negative)
                    self.assertEqual(any("REGION NEG" in text for text in clip.texts), expected and has_negative)
                    self.assertEqual(bool(torch.count_nonzero(neg[0][0])), expected)
                    if not expected:
                        self.assertEqual(torch.count_nonzero(neg[0][1]["pooled_output"]), 0)
                    elif has_negative:
                        self.assertGreaterEqual(slots[1].token_count, 5)

    def test_negative_only_scopes_are_not_dropped(self):
        for compiler, width in ((compile_zimage_attention, 8),
                                (compile_flux2_klein_attention, 12288),
                                (compile_krea2_attention, 30720)):
            with self.subTest(backend=compiler.__name__):
                doc = document()
                doc["negative_mode"] = "auto"
                doc["prompts"]["background"]["positive_source"] = ""
                doc["prompts"]["background"]["negative_source"] = "BACKGROUND NEG"
                doc["regions"][0]["prompts"]["positive_source"] = ""
                doc["regions"][0]["prompts"]["negative_source"] = "REGION NEG"
                clip = TextClip(width)
                _, _, slots, _ = compiler(doc, clip)
                self.assertIn("background", [slot.name for slot in slots])
                self.assertIn(doc["regions"][0]["name"], [slot.name for slot in slots])
                self.assertIn("BACKGROUND NEG", clip.texts)
                self.assertIn("REGION NEG", clip.texts)

    def test_positive_longer_than_negative_preserves_slot_boundaries(self):
        for compiler, width in ((compile_zimage_attention, 8),
                                (compile_flux2_klein_attention, 12288),
                                (compile_krea2_attention, 30720)):
            doc = document()
            doc["negative_mode"] = "prompt"
            doc["prompts"]["background"]["positive_source"] = "LONG NEG TOKEN SEQUENCE"
            positive, negative, slots, _ = compiler(doc, TextClip(width))
            self.assertEqual(positive[0][0].shape, negative[0][0].shape)
            self.assertEqual(slots[1].positive_token_count, 5)
            self.assertEqual(slots[1].negative_token_count, 2)

    def test_auto_ignores_disabled_and_detailer_only_negative_sources(self):
        from util.regional.prompt_policy import use_negative_prompts
        for change in ({"enabled": False}, {"usage": "detailer"}):
            doc = document()
            doc["negative_mode"] = "auto"
            doc["regions"][0].update(change)
            doc["regions"][0]["prompts"]["negative_source"] = "INACTIVE NEG"
            self.assertFalse(use_negative_prompts(doc))

    def test_joint_attention_hooks_mask_padding_in_each_cfg_polarity(self):
        from util.regional.flux2_klein_attention import Flux2KleinAttentionPatch
        from util.regional.krea2_attention import Krea2AttentionPatch
        for compiler, width, patch_type in (
                (compile_flux2_klein_attention, 12288, Flux2KleinAttentionPatch),
                (compile_krea2_attention, 30720, Krea2AttentionPatch)):
            doc = document()
            doc["negative_mode"] = "prompt"
            doc["prompts"]["background"]["negative_source"] = "BACKGROUND NEG"
            positive, negative, slots, aspect = compiler(doc, TextClip(width))
            text_tokens = positive[0][0].shape[1]
            prefix = text_tokens - sum(slot.token_count for slot in slots)
            patch = patch_type(slots, aspect, 1., 10., 0.)
            q = torch.zeros((2, 1, text_tokens + 4, 1))
            for order in ([0, 1], [1, 0], [0]):
                with self.subTest(backend=compiler.__name__, order=order):
                    bias = patch(q, q, q, extra_options={
                        "img_slice": [text_tokens, text_tokens+4],
                        "cond_or_uncond": order})["attn_mask"]
                    offset = prefix + slots[0].token_count
                    pos_batch = order.index(0)
                    neg_batch = order.index(1) if 1 in order else None
                    self.assertTrue(torch.isneginf(bias[pos_batch, :, :, offset+2:offset+5]).all())
                    # At least text queries can attend to the actual negative tokens.
                    if neg_batch is not None:
                        self.assertTrue(torch.isfinite(bias[neg_batch, :, prefix, offset+2:offset+5]).all())

    def test_anima_consumes_negative_only_region_and_background(self):
        doc = document()
        doc["negative_mode"] = "auto"
        doc["prompts"]["background"]["negative_source"] = "BACKGROUND NEG"
        doc["regions"][0]["prompts"]["positive_source"] = ""
        doc["regions"][0]["prompts"]["negative_source"] = "REGION NEG"
        clip = TextClip(8)
        _, negative, chain, background = compile_anima_adapter(doc, clip)
        self.assertIn("BACKGROUND NEG", clip.texts)
        self.assertIn("REGION NEG", clip.texts)
        self.assertIn(doc["regions"][0]["id"], [r.scope for r in chain.flatten()])
        self.assertTrue(torch.count_nonzero(negative[0][0]))

    def test_anima_zero_out_never_encodes_local_negatives(self):
        doc = document()
        doc["negative_mode"] = "zero_out"
        doc["prompts"]["background"]["negative_source"] = "BACKGROUND NEG"
        doc["regions"][0]["prompts"]["negative_source"] = "REGION NEG"
        clip = TextClip(8)
        _, negative, _, _ = compile_anima_adapter(doc, clip)
        self.assertFalse(any("NEG" in text for text in clip.texts))
        self.assertEqual(torch.count_nonzero(negative[0][0]), 0)


if __name__ == "__main__":
    unittest.main()
