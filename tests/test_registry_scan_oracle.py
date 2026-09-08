"""Heuristic replica of the Comfy Registry's automated scan over the packaged file set.

This is a compatibility check, not a security test. The Registry's scanner is not
public; the patterns below are the literals it reported for this pack
(``GET /nodes/bv_nodepack/versions?include_status_reason=true``, field
``metadata.matched_patterns``) plus the literals three other node packs measured
and published for the same rule families. Matching is lexical. The Registry
reports one finding per (rule, file) anchored at the first match; this replica
keeps every match so a new own match behind an accepted library match in the same
file stays visible.

A result of zero findings here does not mean the Registry will activate a
version; a finding here is a line worth looking at before publishing. The
expected remaining findings live in ``tests/fixtures/registry_scan/baseline.json``
together with the reason each one is accepted. The baseline comparison is a
report: it prints and warns on drift but does not fail the suite. The self-tests
of the replica itself are ordinary assertions.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "tests" / "fixtures" / "registry_scan" / "baseline.json"

CODE_SUFFIXES = {".py", ".pyw", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"}
PROSE_SUFFIXES = {".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".cfg", ".ini"}

# rule family -> ((pattern id, regex), ...). Ordered like the Registry's own ids.
RULES: dict[str, tuple[tuple[str, re.Pattern[str]], ...]] = {
    "python_environment_manipulation": (
        ("$env_read", re.compile(r"os\.environ\b")),
        ("$env_read3", re.compile(r"os\.getenv\s*\(")),
    ),
    "python_network_operations": (
        ("$http1", re.compile(r"requests\.(?:get|post|put|patch|delete|head)\s*\(")),
        ("$http2", re.compile(r"urllib\.request\.urlopen\s*\(")),
        ("$http5", re.compile(r"aiohttp\s*\.\s*ClientSession")),
        ("$socket1", re.compile(r"socket\.socket\s*\(")),
        ("$socket2", re.compile(r"\.create_connection\s*\(")),
        ("$socket3", re.compile(r"\.connect\s*\(")),
        ("$socket4", re.compile(r"\.bind\s*\(")),
        ("$socket_stage_recv", re.compile(r"\.(?:send(?:all|to)?|recv(?:from|_into)?)\s*\(")),
    ),
    "python_command_injection_risk": (
        ("$subprocess", re.compile(r"subprocess\.(?:Popen|run|call|check_output|check_call)\s*\(|os\.system\s*\(")),
    ),
    "contains_blacklisted_url": (
        ("$blacklisted_url4", re.compile(r"://raw\.githubusercontent\.com")),
    ),
}
# Which file kinds each family was observed on. Prose is included for the network
# family because the Registry flagged ``docs/design/*.md`` on ``.connect(``; the
# URL family was not reported for the catalog JSON files, so it stays code-only.
RULE_SCOPE = {
    "python_environment_manipulation": CODE_SUFFIXES,
    "python_network_operations": CODE_SUFFIXES | PROSE_SUFFIXES,
    "python_command_injection_risk": CODE_SUFFIXES,
    "contains_blacklisted_url": CODE_SUFFIXES,
}


def packaged_files(root: Path) -> list[str] | None:
    """Git-tracked files minus ``.comfyignore``, the way ``comfy node publish`` packs.

    comfy-cli applies the ignore file with gitwildmatch semantics. ``pathspec`` is
    used when installed; otherwise only the plain directory and file-name patterns
    this repository uses are honoured and anything else returns ``None`` so the
    caller can skip instead of guessing.
    """
    try:
        listed = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    files = [entry.decode("utf-8") for entry in listed.split(b"\0") if entry]
    ignore_file = root / ".comfyignore"
    patterns = []
    if ignore_file.is_file():
        patterns = [line.strip() for line in ignore_file.read_text(encoding="utf-8").splitlines()
                    if line.strip() and not line.lstrip().startswith("#")]
    if not patterns:
        return files
    try:
        import pathspec  # type: ignore
    except ImportError:
        pathspec = None
    if pathspec is not None:
        spec = pathspec.PathSpec.from_lines("gitwildmatch", patterns)
        return [name for name in files if not spec.match_file(name)]
    if any(any(char in pattern for char in "*?[]!\\") or "/" in pattern.rstrip("/") for pattern in patterns):
        return None
    directories = {pattern.rstrip("/") for pattern in patterns if pattern.endswith("/")}
    names = {pattern for pattern in patterns if not pattern.endswith("/")}
    kept = []
    for name in files:
        parts = name.split("/")
        if any(part in directories for part in parts[:-1]) or parts[-1] in names:
            continue
        kept.append(name)
    return kept


def scan_text(relative: str, text: str) -> list[dict[str, object]]:
    """Every match in ``text``: one entry per (rule, pattern) with all line numbers."""
    suffix = Path(relative).suffix.lower()
    findings = []
    for rule, patterns in RULES.items():
        if suffix not in RULE_SCOPE[rule]:
            continue
        for pattern_id, regex in patterns:
            lines = [text.count("\n", 0, match.start()) + 1 for match in regex.finditer(text)]
            if lines:
                findings.append({"file": relative, "rule": rule, "pattern": pattern_id, "lines": lines})
    return findings


def scan_files(root: Path, files: list[str]) -> list[dict[str, object]]:
    findings = []
    for relative in sorted(files):
        path = root / relative
        if path.suffix.lower() not in CODE_SUFFIXES | PROSE_SUFFIXES or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        findings.extend(scan_text(relative, text))
    return findings


def summarize(findings: list[dict[str, object]]) -> list[tuple[str, str, str]]:
    """(file, rule, pattern) triples, the identity the baseline is compared on."""
    return sorted({(str(item["file"]), str(item["rule"]), str(item["pattern"])) for item in findings})


def compare_with_baseline(findings: list[dict[str, object]], baseline: dict) -> dict[str, list[tuple[str, str, str]]]:
    accepted = {(item["file"], item["rule"], item["pattern"]) for item in baseline["accepted"]}
    actual = set(summarize(findings))
    return {"new": sorted(actual - accepted), "gone": sorted(accepted - actual)}


def format_report(findings: list[dict[str, object]], diff: dict[str, list[tuple[str, str, str]]]) -> str:
    lines = ["Registry scan replica report"]
    for item in findings:
        hits = item["lines"]
        lines.append(f"  {item['file']}  {item['rule']}  {item['pattern']}  x{len(hits)}  first line {hits[0]}")
    if not findings:
        lines.append("  (no matches)")
    lines.append(f"  new vs baseline: {diff['new'] or 'none'}")
    lines.append(f"  gone vs baseline: {diff['gone'] or 'none'}")
    return "\n".join(lines)


class RegistryScanOracleSelfTest(unittest.TestCase):
    def test_reports_every_match_with_line_numbers(self):
        text = "x = os.environ.get('A')\nsock.connect(('h', 1))\nother.bind(2)\nsubprocess.run(['ls'])\nagain.bind(3)\n"
        findings = scan_text("pack/module.py", text)
        self.assertEqual([(f["rule"], f["pattern"], f["lines"]) for f in findings], [
            ("python_environment_manipulation", "$env_read", [1]),
            ("python_network_operations", "$socket3", [2]),
            ("python_network_operations", "$socket4", [3, 5]),
            ("python_command_injection_risk", "$subprocess", [4]),
        ])

    def test_idiomatic_spellings_do_not_match(self):
        clean = "from os import environ\nvalue = environ.get('A')\nfrom aiohttp import ClientSession\nnode.connect?.(1)\nfn.call(api, 1)\n"
        self.assertEqual(scan_text("pack/module.py", clean), [])

    def test_prose_counts_for_network_family_only(self):
        prose = "Use `SubgraphOutput.connect(output, source)` and https://raw.githubusercontent.com/x with os.environ.\n"
        self.assertEqual([f["pattern"] for f in scan_text("docs/note.md", prose)], ["$socket3"])
        self.assertEqual([f["pattern"] for f in scan_text("py/mod.py", prose)], ["$env_read", "$socket3", "$blacklisted_url4"])

    def test_accepted_first_match_does_not_mask_a_later_new_pattern(self):
        baseline = {"accepted": [{"file": "js/bundle.js", "rule": "python_network_operations", "pattern": "$socket4"}]}
        text = "lib.bind(null)\n" * 20 + "ours.connect(1)\n"
        diff = compare_with_baseline(scan_text("js/bundle.js", text), baseline)
        self.assertEqual(diff["new"], [("js/bundle.js", "python_network_operations", "$socket3")])
        self.assertEqual(diff["gone"], [])
        self.assertEqual(compare_with_baseline(scan_text("js/bundle.js", "lib.bind(null)\n"), baseline), {"new": [], "gone": []})

    def test_packaged_files_honours_plain_ignore_patterns(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            for relative in ("keep.py", "tests/a.py", "sub/tests/b.py", "ui/c.ts", ".comfyignore"):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("", encoding="utf-8")
            (root / ".comfyignore").write_text("# dev only\n.comfyignore\ntests/\nui/\n", encoding="utf-8")
            subprocess.run(["git", "add", "-A"], cwd=root, check=True)
            self.assertEqual(packaged_files(root), ["keep.py"])


class RegistryScanBaselineReport(unittest.TestCase):
    """Informative: prints the replica's findings and warns on drift, never fails."""

    def test_report_packaged_set_against_baseline(self):
        files = packaged_files(ROOT)
        if files is None:
            self.skipTest("packaged file set unavailable (git or unsupported .comfyignore pattern)")
        baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
        findings = scan_files(ROOT, files)
        diff = compare_with_baseline(findings, baseline)
        report = format_report(findings, diff)
        print("\n" + report)
        if diff["new"] or diff["gone"]:
            warnings.warn("Registry scan replica drifted from tests/fixtures/registry_scan/baseline.json:\n" + report
                          + "\nUpdate the baseline only with a written reason per finding.", stacklevel=1)


if __name__ == "__main__":
    unittest.main()
