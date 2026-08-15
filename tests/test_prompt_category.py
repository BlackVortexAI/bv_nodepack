import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "py" / "util" / "prompt" / "category.py"
SPEC = importlib.util.spec_from_file_location("bv_prompt_category", MODULE_PATH)
CATEGORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CATEGORY)


class PromptCategoryTests(unittest.TestCase):
    def test_comment_removal_preserves_line_break(self):
        ast = CATEGORY.parse_prompt_to_ast("red dress ## note\ncinematic lighting")

        self.assertEqual(
            CATEGORY.ast_to_plain_text(ast),
            "red dress \ncinematic lighting",
        )
        self.assertEqual(
            CATEGORY.ast_to_plain_text(ast, include_comments=True),
            "red dress ## note\ncinematic lighting",
        )

    def test_unclosed_inline_category_reports_location(self):
        with self.assertRaisesRegex(
            ValueError,
            "Unclosed inline category 'face' opened at line 1, column 1",
        ):
            CATEGORY.parse_prompt_to_ast("@<face>portrait")

    def test_block_directive_rejects_open_inline_category(self):
        with self.assertRaisesRegex(ValueError, "before block directive on line 2"):
            CATEGORY.parse_prompt_to_ast("@<face>portrait\n@@style\ncinematic")

    def test_unexpected_inline_closer_reports_location(self):
        with self.assertRaisesRegex(
            ValueError,
            "Unexpected inline category closer '@@' at line 1, column 10",
        ):
            CATEGORY.parse_prompt_to_ast("portrait @@")

    def test_standalone_default_block_directive_remains_valid(self):
        ast = CATEGORY.parse_prompt_to_ast("@@\nplain")

        self.assertEqual(CATEGORY.ast_to_plain_text(ast), "plain")


if __name__ == "__main__":
    unittest.main()
