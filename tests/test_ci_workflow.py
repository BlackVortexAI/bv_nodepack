import unittest
from pathlib import Path


class CiWorkflowTests(unittest.TestCase):
    def test_python_route_test_dependencies_are_installed(self):
        workflow = (
            Path(__file__).parents[1] / ".github" / "workflows" / "validate.yml"
        ).read_text(encoding="utf-8")

        self.assertIn('"aiohttp>=3.10,<4"', workflow)


if __name__ == "__main__":
    unittest.main()
