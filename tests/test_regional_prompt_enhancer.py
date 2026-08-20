import copy
import json
from pathlib import Path
import tempfile
import unittest

from py.util.regional.prompt_enhancer import (
    MAX_RESPONSE_BYTES,
    ComfyClipGenerateProvider,
    EnhancementVerificationError,
    LLMResponse,
    PROMPT_BUNDLE_PATH,
    PromptBundleError,
    apply_enhancement,
    build_repair_request,
    build_request,
    enhancement_result,
    load_prompt_bundle,
    normalize_model_contracts,
    prompt_bundle_fingerprint,
    preservation_issues,
    regional_policy_issues,
    regional_source_warnings,
    source_digest,
    verify_response,
)
from py.util.regional.document import parse_document


ROOT = Path(__file__).parents[1]


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        return parse_document(json.load(handle))


def proposal(document):
    return {
        "schema_version": 1,
        "document_id": document["document_id"],
        "prompts": copy.deepcopy(document["prompts"]),
        "regions": [
            {"id": region["id"], **copy.deepcopy(region["prompts"])}
            for region in document["regions"]
        ],
    }


class RegionalPromptEnhancerTests(unittest.TestCase):
    def test_regional_enhancer_evaluation_examples_are_valid_documents(self):
        names = (
            "regional-prompt-enhancer-geometry-only.bv-regional.json",
            "regional-prompt-enhancer-spatial-stress.bv-regional.json",
            "regional-prompt-enhancer-parent-overlap-stress.bv-regional.json",
            "krea2-two-explorers-space-observatory.bv-regional.json",
        )
        for name in names:
            with self.subTest(name=name):
                value = json.loads((ROOT / "examples" / name).read_text(encoding="utf-8"))
                self.assertEqual(parse_document(value), value)

    def test_prompt_bundle_loads_balanced_policy_and_metadata(self):
        bundle = load_prompt_bundle()
        self.assertEqual(bundle.version, 1)
        self.assertEqual(bundle.default_policy, "anima_hybrid_v1")
        self.assertIn("source-faithful improvement", bundle.policies["balanced_v1"])
        self.assertIn("anima_hybrid_v1", bundle.policies)
        self.assertIn("retaining every valid enhancement", bundle.repair_protocol)
        self.assertIn("natural_language_v1", bundle.policies)
        self.assertIn("tag_only_v1", bundle.policies)
        self.assertEqual(len(bundle.sha256), 64)

    def test_anima_subject_aliases_are_source_bound(self):
        original = fixture()
        original["regions"][0]["prompts"]["positive_source"] = "woman, red jacket"
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] = "1girl, red jacket"
        self.assertEqual(preservation_issues(original, candidate), [])

        original["regions"][0]["prompts"]["positive_source"] = "man, green sweater"
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] = "1girl, green sweater"
        issues = "\n".join(preservation_issues(original, candidate))
        self.assertIn("creativity budget", issues)
        self.assertIn("woman", issues)
        self.assertIn("removes source-supported terms: man", issues)

    def test_request_can_select_anima_hybrid_policy(self):
        request = build_request(fixture(), "", 1024, 42, policy_id="anima_hybrid_v1")
        self.assertEqual(request.policy_id, "anima_hybrid_v1")
        self.assertIn("exactly 'man' may become '1boy'", request.user_prompt)

    def test_prompt_bundle_hot_reload_changes_fingerprint_without_module_reload(self):
        source = PROMPT_BUNDLE_PATH.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bundle.json"
            path.write_text(source, encoding="utf-8")
            before = prompt_bundle_fingerprint(path)
            path.write_text(source.replace("Improve every", "Enhance every", 1), encoding="utf-8")
            after = prompt_bundle_fingerprint(path)
        self.assertNotEqual(before, after)

    def test_invalid_prompt_bundle_fails_closed_before_request_building(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bundle.json"
            path.write_text('{"schema":"wrong"}', encoding="utf-8")
            with self.assertRaisesRegex(PromptBundleError, "must contain exactly"):
                load_prompt_bundle(path)

    def test_valid_response_updates_prompt_text_only(self):
        original = fixture()
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] += ", cinematic lighting"
        candidate["regions"][1]["positive_source"] += ", sharp facial detail"
        result = enhancement_result(original, LLMResponse(json.dumps(candidate, separators=(",", ":")), "test", "fake"))
        enhanced = apply_enhancement(original, result)
        expected = copy.deepcopy(original)
        expected["prompts"]["global"]["positive_source"] = candidate["prompts"]["global"]["positive_source"]
        expected["regions"][1]["prompts"]["positive_source"] = candidate["regions"][1]["positive_source"]
        self.assertTrue(result["valid"])
        self.assertEqual(enhanced, expected)
        self.assertEqual(original, fixture())

    def test_invalid_result_preserves_source(self):
        original = fixture()
        before = json.dumps(original, ensure_ascii=False, separators=(",", ":"))
        result = enhancement_result(original, LLMResponse("not json", "test", "fake"))
        output = apply_enhancement(original, result)
        self.assertFalse(result["valid"])
        self.assertEqual(json.dumps(output, ensure_ascii=False, separators=(",", ":")), before)

    def test_apply_rejects_result_for_changed_source(self):
        original = fixture()
        result = enhancement_result(original, LLMResponse(json.dumps(proposal(original), separators=(",", ":")), "test", "fake"))
        changed = copy.deepcopy(original)
        changed["title"] = "Changed after proposal"
        self.assertEqual(apply_enhancement(changed, result), changed)
        self.assertNotEqual(source_digest(original), source_digest(changed))

    def test_rejects_fences_prose_trailing_values_duplicates_and_constants(self):
        original = fixture()
        valid = json.dumps(proposal(original), separators=(",", ":"))
        cases = [
            f"```json\n{valid}\n```",
            f"Result: {valid}",
            f"{valid} {{}}",
            valid.replace('"schema_version":1', '"schema_version":1,"schema_version":1', 1),
            valid.replace('"schema_version":1', '"schema_version":NaN', 1),
        ]
        for raw in cases:
            with self.subTest(raw=raw[:30]), self.assertRaises(EnhancementVerificationError):
                verify_response(original, raw)

    def test_accepts_json_whitespace_but_rejects_oversized_and_deep_responses(self):
        original = fixture()
        valid = json.dumps(proposal(original), separators=(",", ":"))
        self.assertEqual(verify_response(original, f"\n{valid}\r\n")["document_id"], original["document_id"])
        with self.assertRaisesRegex(EnhancementVerificationError, "exceeds"):
            verify_response(original, " " * (MAX_RESPONSE_BYTES + 1))
        deep = '{"schema_version":1,"document_id":"x","prompts":{},"regions":' + "[" * 17 + "0" + "]" * 17 + "}"
        with self.assertRaisesRegex(EnhancementVerificationError, "nesting"):
            verify_response(original, deep)

    def test_rejects_missing_foreign_duplicate_reordered_regions_and_extra_fields(self):
        original = fixture()
        cases = []
        missing = proposal(original); missing["regions"].pop(); cases.append(missing)
        foreign = proposal(original); foreign["regions"][0]["id"] = "ffffffff-ffff-4fff-8fff-ffffffffffff"; cases.append(foreign)
        duplicate = proposal(original); duplicate["regions"][1]["id"] = duplicate["regions"][0]["id"]; cases.append(duplicate)
        reordered = proposal(original); reordered["regions"].reverse(); cases.append(reordered)
        extra = proposal(original); extra["regions"][0]["geometry"] = []; cases.append(extra)
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaises(EnhancementVerificationError):
                verify_response(original, json.dumps(candidate, separators=(",", ":")))

    def test_empty_prompt_must_remain_empty(self):
        original = fixture()
        original["prompts"]["background"]["negative_source"] = ""
        candidate = proposal(original)
        candidate["prompts"]["background"]["negative_source"] = "new content"
        with self.assertRaisesRegex(EnhancementVerificationError, "must remain empty"):
            verify_response(original, json.dumps(candidate, separators=(",", ":")))

    def test_rejects_prompt_text_that_breaks_bv_ast_contract(self):
        original = fixture()
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] = "@<person> unclosed"
        with self.assertRaisesRegex(EnhancementVerificationError, "proposed prompt is invalid"):
            verify_response(original, json.dumps(candidate, separators=(",", ":")))

    def test_preservation_check_reports_new_descriptive_terms_per_prompt_field(self):
        original = fixture()
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = (
            "masterpiece, two people, cafe, natural lighting, realistic textures"
        )
        issues = preservation_issues(original, candidate)
        self.assertEqual(len(issues), 1)
        self.assertIn("natural", issues[0])
        self.assertIn("textures", issues[0])

    def test_preservation_check_allows_reordering_and_minimal_grammar(self):
        original = fixture()
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = "two people in a cafe, masterpiece"
        self.assertEqual(preservation_issues(original, candidate), [])

    def test_preservation_check_rejects_removing_generic_quality_terms(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = (
            "a picture, two people, cafe, good quality, detailed, nice lighting"
        )
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = (
            "a picture, two people, cafe, nice lighting"
        )
        issues = preservation_issues(original, candidate)
        removed = "\n".join(issues)
        self.assertIn("detailed", removed)
        self.assertIn("good", removed)
        self.assertIn("quality", removed)

    def test_preservation_check_rejects_removed_source_supported_facts(self):
        original = fixture()
        original["regions"][0]["prompts"]["positive_source"] = (
            "woman left, red jacket, black short hair, sitting, holding white coffee cup, detailed woman, looks calm"
        )
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] = "woman left, red jacket, black short hair, sitting, holding white coffee cup"
        issues = preservation_issues(original, candidate)
        self.assertTrue(any("removes source-supported terms" in issue for issue in issues))
        self.assertTrue(any("calm" in issue for issue in issues))

    def test_preservation_check_rejects_the_over_aggressive_real_repair_output(self):
        original = fixture()
        original["regions"][0]["prompts"]["positive_source"] = (
            "woman left, red jacket, black short hair, sitting, holding white coffee cup, detailed woman, looks calm"
        )
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] = "woman left, red jacket, black short hair, sitting, holding white coffee cup"
        issues = preservation_issues(original, candidate)
        removed = "\n".join(issues)
        self.assertIn("calm", removed)
        self.assertIn("looks", removed)

    def test_request_keeps_structure_protocol_separate_from_user_instruction(self):
        request = build_request(fixture(), "Use richer prose", 1024, 42)
        self.assertIn("You may modify prompt text only", request.system_prompt)
        self.assertIn("Anima's hybrid", request.user_prompt)
        self.assertIn("Use richer prose", request.user_prompt)
        self.assertNotIn("Use richer prose", request.system_prompt)
        self.assertEqual(request.seed, 42)
        self.assertEqual(request.policy_id, "anima_hybrid_v1")

    def test_creativity_contract_expands_semantic_permission(self):
        low = build_request(fixture(), "", 1024, 42, creativity=0.1)
        high = build_request(fixture(), "", 1024, 42, creativity=1.0)
        self.assertIn("Correct spelling, grammar, punctuation", low.user_prompt)
        self.assertIn("full creative enhancement range", high.user_prompt)
        self.assertEqual(high.creativity, 1.0)

    def test_creativity_budget_allows_richer_terms_only_at_higher_levels(self):
        original = fixture()
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] += ", natural daylight, cinematic atmosphere"
        self.assertTrue(preservation_issues(original, candidate, creativity=0.1))
        self.assertEqual(preservation_issues(original, candidate, creativity=1.0), [])

    def test_semantic_anima_rewrite_is_allowed_from_medium_creativity(self):
        original = fixture()
        original["regions"][0]["prompts"]["positive_source"] = "woman, looks calm"
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] = "1girl with a relaxed expression"
        self.assertTrue(
            preservation_issues(original, candidate, "anima_hybrid_v1", creativity=0.3)
        )
        self.assertEqual(
            preservation_issues(original, candidate, "anima_hybrid_v1", creativity=0.5),
            [],
        )

    def test_tag_only_never_bypasses_lexical_preservation(self):
        original = fixture()
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = "cinematic reinterpretation"
        self.assertTrue(preservation_issues(original, candidate, "tag_only_v1", creativity=1.0))

    def test_tag_only_policy_caps_creative_additions(self):
        request = build_request(
            fixture(), "", 1024, 42,
            policy_id="tag_only_v1", prompt_language="tag_only", creativity=1.0,
        )
        self.assertIn("Creativity contract: 0.300", request.user_prompt)
        self.assertEqual(request.creativity, 0.3)

    def test_creative_anima_global_still_requires_exact_persona_suffix(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        original["regions"][0]["prompts"]["positive_source"] = "woman, red jacket"
        original["regions"][1]["prompts"]["positive_source"] = "man, green sweater"
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = (
            "a cinematic picture of two people in a cafe with warm daylight; 1girl; 1boy"
        )
        self.assertEqual(
            regional_policy_issues(original, candidate, "anima_hybrid_v1", creativity=1.0),
            [],
        )

    def test_anima_persona_contract_is_normalized_locally_from_comma_suffix(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        original["regions"][0]["prompts"]["positive_source"] = "woman, red jacket"
        original["regions"][1]["prompts"]["positive_source"] = "man, green sweater"
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = (
            "a cinematic picture of two people in a cafe, 1girl; 1boy"
        )
        normalized, warnings = normalize_model_contracts(original, candidate, "anima_hybrid_v1")
        self.assertEqual(
            normalized["prompts"]["global"]["positive_source"],
            "a cinematic picture of two people in a cafe; 1girl; 1boy",
        )
        self.assertEqual(len(warnings), 1)
        self.assertEqual(regional_policy_issues(original, normalized, "anima_hybrid_v1", creativity=1.0), [])

    def test_anima_persona_normalization_preserves_inline_sentence_grammar(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "Two people share a cafe scene."
        original["regions"][0]["prompts"]["positive_source"] = "A woman wears a red jacket."
        original["regions"][1]["prompts"]["positive_source"] = "A man wears a green sweater."
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] = (
            "A cafe scene featuring 1girl and 1boy sitting together in soft light."
        )
        normalized, _warnings = normalize_model_contracts(original, candidate, "anima_hybrid_v1")
        self.assertEqual(
            normalized["prompts"]["global"]["positive_source"],
            "A cafe scene featuring two people sitting together in soft light; 1girl; 1boy",
        )

    def test_repair_request_preserves_valid_enhancements_and_has_source_fallback(self):
        request = build_request(fixture(), "", 1024, 42)
        repair = build_repair_request(request, "{}", ["regions[0] removes source-supported terms: calm"])
        self.assertIn("retaining every valid enhancement", repair.user_prompt)
        self.assertIn("copy that source field unchanged", repair.user_prompt)
        self.assertEqual(repair.repair_protocol, request.repair_protocol)

    def test_request_includes_deterministic_read_only_regional_context(self):
        request = build_request(fixture(), "", 1024, 42)
        marker = "Regional prompt payload:\n"
        payload = json.loads(request.user_prompt.split(marker, 1)[1])
        context = payload["immutable_regional_context"]
        self.assertEqual(context["canvas"], {"width": 1536, "height": 1024})
        self.assertEqual(context["overlap_mode"], "joint")
        first = context["regions"][0]
        self.assertEqual(first["name"], "Person left")
        self.assertEqual(first["normalized_bounds"], [0.1, 0.1, 0.6, 0.9])
        self.assertIn("left", first["spatial_terms"])
        self.assertEqual(
            first["overlaps_region_ids"],
            ["10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"],
        )

    def test_preservation_allows_only_geometry_supported_spatial_terms_per_region(self):
        original = fixture()
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] += ", on the left"
        self.assertEqual(preservation_issues(original, candidate), [])

        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] += ", on the right"
        issues = preservation_issues(original, candidate)
        self.assertTrue(any("creativity budget" in issue and "right" in issue for issue in issues))

    def test_regional_policy_requires_missing_supported_horizontal_position(self):
        original = fixture()
        candidate = proposal(original)

        issues = regional_policy_issues(original, candidate)
        self.assertTrue(any("regions[0].prompts.positive_source" in issue and "left" in issue for issue in issues))

        source = candidate["regions"][0]["positive_source"]
        first, remainder = source.split(",", 1)
        candidate["regions"][0]["positive_source"] = f"{first} on the left,{remainder}"
        self.assertFalse(any("regions[0]" in issue for issue in regional_policy_issues(original, candidate)))

        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] += ", on the left"
        self.assertTrue(any("leading subject segment" in issue for issue in regional_policy_issues(original, candidate)))

        original["regions"][0]["enabled"] = False
        candidate = proposal(original)
        self.assertFalse(any("regions[0]" in issue for issue in regional_policy_issues(original, candidate)))

    def test_anima_policy_does_not_require_redundant_spatial_prompt_words(self):
        original = fixture()
        candidate = proposal(original)
        self.assertEqual(regional_policy_issues(original, candidate, "anima_hybrid_v1"), [])

    def test_anima_global_persona_contract_requires_exact_region_evidence(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        original["regions"][0]["prompts"]["positive_source"] = "woman, red jacket"
        original["regions"][1]["prompts"]["positive_source"] = "man, green sweater"
        original["regions"][2]["prompts"]["positive_source"] = "wood table"
        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] += "; 1girl; 1boy"
        self.assertEqual(preservation_issues(original, candidate, "anima_hybrid_v1"), [])
        self.assertEqual(regional_policy_issues(original, candidate, "anima_hybrid_v1"), [])

        self.assertTrue(preservation_issues(original, candidate, "balanced_v1"))

        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] += "; 1girl"
        issues = regional_policy_issues(original, candidate, "anima_hybrid_v1")
        self.assertTrue(any("persona contract" in issue for issue in issues))

        candidate = proposal(original)
        candidate["prompts"]["global"]["positive_source"] += (
            "; 1girl; 1boy; 1girl"
        )
        self.assertTrue(regional_policy_issues(original, candidate, "anima_hybrid_v1"))

    def test_request_exposes_exact_anima_persona_contract_as_immutable_context(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        original["regions"][0]["prompts"]["positive_source"] = "woman, red jacket, black short hair"
        original["regions"][1]["prompts"]["positive_source"] = "man, green sweater, brown curly hair"

        request = build_request(original, "", 1024, 42, policy_id="anima_hybrid_v1")
        payload = json.loads(request.user_prompt.split("Regional prompt payload:\n", 1)[1])

        self.assertEqual(
            payload["immutable_regional_context"]["anima_persona_contract"],
            [
                "1girl",
                "1boy",
            ],
        )

    def test_anima_persona_contract_stays_empty_without_exact_two_person_evidence(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "people in a cafe"
        original["regions"][0]["prompts"]["positive_source"] = "woman, red jacket"
        original["regions"][1]["prompts"]["positive_source"] = "man, green sweater"
        request = build_request(original, "", 1024, 42, policy_id="anima_hybrid_v1")
        payload = json.loads(request.user_prompt.split("Regional prompt payload:\n", 1)[1])
        self.assertEqual(payload["immutable_regional_context"]["anima_persona_contract"], [])

    def test_anima_persona_contract_understands_sentence_leading_subjects(self):
        original = fixture()
        original["prompts"]["global"]["positive_source"] = "Two people share a quiet cafe scene."
        original["regions"][0]["prompts"]["positive_source"] = (
            "A woman with short black hair wears a red jacket. She holds a cup."
        )
        original["regions"][1]["prompts"]["positive_source"] = (
            "A man with curly brown hair wears a green sweater. He sits opposite the woman."
        )
        request = build_request(original, "", 1024, 42, policy_id="anima_hybrid_v1")
        payload = json.loads(request.user_prompt.split("Regional prompt payload:\n", 1)[1])
        self.assertEqual(
            payload["immutable_regional_context"]["anima_persona_contract"],
            ["1girl", "1boy"],
        )

    def test_regional_policy_requires_disabled_region_prompts_to_remain_unchanged(self):
        original = fixture()
        original["regions"][0]["enabled"] = False
        candidate = proposal(original)
        candidate["regions"][0]["positive_source"] += ", on the left"
        candidate["regions"][0]["negative_source"] += ", altered"

        issues = regional_policy_issues(original, candidate)
        combined = "\n".join(issues)
        self.assertIn("regions[0].prompts.positive_source", combined)
        self.assertIn("regions[0].prompts.negative_source", combined)
        self.assertIn("disabled region prompts must remain unchanged", combined)

    def test_source_warnings_report_horizontal_and_vertical_geometry_conflicts(self):
        original = fixture()
        original["regions"][0]["prompts"]["positive_source"] = "person on the right, near the bottom"

        warnings = regional_source_warnings(original)
        combined = "\n".join(warnings)
        self.assertIn("regions[0].prompts.positive_source", combined)
        self.assertIn("geometry indicates left", combined)
        self.assertIn("prompt explicitly says right", combined)
        self.assertIn("geometry indicates middle", combined)
        self.assertIn("prompt explicitly says lower", combined)

        original["regions"][0]["enabled"] = False
        self.assertEqual(regional_source_warnings(original), [])

    def test_provider_preflight_rejects_non_generative_clip_before_tokenization(self):
        class FakeClip:
            tokenizer = object()
            cond_stage_model = object()
            tokenize = lambda *_args, **_kwargs: self.fail("must not execute")
            generate = lambda *_args, **_kwargs: None
            decode = lambda *_args, **_kwargs: ""

        with self.assertRaisesRegex(ValueError, "not generative.*cond_stage_model.generate"):
            ComfyClipGenerateProvider(FakeClip())

    def test_provider_uses_comfy_generate_contract_without_sampling(self):
        calls = {}

        class Model:
            def generate(self):
                pass

        class FakeClip:
            tokenizer = object()
            cond_stage_model = Model()

            def tokenize(self, prompt, **kwargs):
                calls["tokenize"] = (prompt, kwargs)
                return "tokens"

            def generate(self, tokens, **kwargs):
                calls["generate"] = (tokens, kwargs)
                return "ids"

            def decode(self, ids):
                calls["decode"] = ids
                return "{}"

        provider = ComfyClipGenerateProvider(FakeClip())
        response = provider.generate(build_request(fixture(), "Improve wording", 777, 9))
        self.assertEqual(response.raw_text, "{}")
        self.assertFalse(calls["generate"][1]["do_sample"])
        self.assertEqual(calls["generate"][1]["max_length"], 777)
        self.assertFalse(calls["tokenize"][1]["skip_template"])


if __name__ == "__main__":
    unittest.main()
