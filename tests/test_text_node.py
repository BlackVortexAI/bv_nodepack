import importlib.util
from pathlib import Path
import unittest


class TextNodeTests(unittest.TestCase):
    def test_native_text_is_exact_and_requires_no_provider(self):
        path = Path(__file__).parents[1] / "py/nodes/bv_text.py"
        spec = importlib.util.spec_from_file_location("bv_text_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        node = module.NODE_CLASS_MAPPINGS["BV Text"]()
        for text in ("", "  ", "Grüße 👋\nsecond line\r\n", "{a|b} @@markup"):
            self.assertEqual(node.output(text), (text,))
        self.assertEqual(node.RETURN_TYPES, ("STRING",))
        options = node.INPUT_TYPES()["required"]["text"][1]
        self.assertTrue(options["multiline"])
        self.assertFalse(options["dynamicPrompts"])
