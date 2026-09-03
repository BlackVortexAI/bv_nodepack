"""Release runtime must never discover regression-only node fixtures."""
import unittest
from pathlib import Path


class ReleaseTestNodeBoundary(unittest.TestCase):
    def test_test_nodes_are_outside_runtime_autoload(self):
        root = Path(__file__).resolve().parents[1]
        for name in ("bv_titlebar_port_canary.py", "bv_regional_v3_m0.py"):
            self.assertFalse((root / "py" / "nodes" / name).exists())
            self.assertTrue((root / "tests" / "fixtures" / name).is_file())
        for source in (root / "py" / "nodes").glob("*.py"):
            self.assertNotIn("BV Titlebar Port Canary", source.read_text(encoding="utf-8"))
            self.assertNotIn("BV M0 Fake", source.read_text(encoding="utf-8"))
