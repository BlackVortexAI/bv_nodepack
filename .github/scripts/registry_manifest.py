"""Manifest of the files ``comfy node publish`` packs, and a check of the uploaded archive.

``--write`` lists every git-tracked file that ``.comfyignore`` keeps, with its size and
SHA-256, and fails when a file that must never ship is present (development trees,
key material, environment files). This is the pre-upload input manifest; it is not
proof of the archive the Registry stored.

``--compare-cdn`` downloads the published archive from the Registry CDN and compares
its members with the manifest after normalising line endings, so the report shows
whether the uploaded archive equals the validated commit. Both results are written as
JSON for the workflow's run artifacts.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NODE_ID = "bv_nodepack"
PUBLISHER_ID = "blackvortex"
FORBIDDEN_PREFIXES = ("tests/", "ui/", ".github/", ".tmp/", "user/", "node_modules/", "__pycache__/")
FORBIDDEN_SUFFIXES = (".pem", ".key", ".p12", ".pfx", ".env", ".pyc", ".d.ts", ".ts", ".tsx", ".mjs")
FORBIDDEN_NAMES = {".comfyignore", ".gitignore", "remote_llm_secrets.json", "admin_settings.json"}
REQUIRED = {"__init__.py", "pyproject.toml", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "node_list.json",
            "js/bv_nodepack.core.js"}


def packaged_files() -> list[str]:
    import pathspec

    listed = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    files = [entry.decode("utf-8") for entry in listed.split(b"\0") if entry]
    patterns = [line.strip() for line in (ROOT / ".comfyignore").read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.lstrip().startswith("#")]
    spec = pathspec.PathSpec.from_lines("gitwildmatch", patterns)
    return sorted(name for name in files if not spec.match_file(name))


def normalised_digest(data: bytes) -> str:
    """SHA-256 after CRLF -> LF, so a checkout's line-ending policy does not hide equality."""
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def write_manifest(target: Path) -> int:
    files = packaged_files()
    problems = [name for name in files
                if name.startswith(FORBIDDEN_PREFIXES) or name.endswith(FORBIDDEN_SUFFIXES)
                or Path(name).name in FORBIDDEN_NAMES]
    missing = sorted(REQUIRED - set(files))
    entries = []
    for name in files:
        data = (ROOT / name).read_bytes()
        entries.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                        "sha256_normalised": normalised_digest(data)})
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, check=True, text=True).stdout.strip()
    # The manifest hashes working-tree bytes. They equal the commit only when no packaged
    # file is modified, so a dirty tree is refused instead of being labelled with HEAD.
    dirty = subprocess.run(["git", "status", "--porcelain", "--", *files], cwd=ROOT, capture_output=True,
                           check=True, text=True).stdout.strip().splitlines()
    manifest = {"node_id": NODE_ID, "commit": commit, "file_count": len(entries), "files": entries,
                "forbidden_present": problems, "required_missing": missing, "modified_since_commit": dirty,
                "note": "Input manifest of the checkout's git-tracked files minus .comfyignore, verified unmodified "
                        "against the named commit; not the uploaded archive."}
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"manifest: {len(entries)} files at {commit}")
    if problems or missing or dirty:
        print("refusing to publish:", json.dumps({"forbidden_present": problems, "required_missing": missing,
                                                  "modified_since_commit": dirty}))
        return 1
    return 0


def compare_cdn(version: str, manifest_path: Path, report_path: Path) -> int:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    url = f"https://cdn.comfy.org/{PUBLISHER_ID}/{NODE_ID}/{version}/node.zip"
    archive = None
    for attempt in range(12):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:  # fixed CDN host, no user input
                archive = response.read()
            break
        except OSError as error:
            print(f"attempt {attempt + 1}: archive not available yet ({error})")
            time.sleep(15)
    report = {"version": version, "url": url, "commit": manifest["commit"]}
    if archive is None:
        report["result"] = "archive not retrievable"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return 1
    report["archive_sha256"] = hashlib.sha256(archive).hexdigest()
    report["archive_bytes"] = len(archive)
    return compare_archive_bytes(archive, manifest, report, report_path)


TEXT_SUFFIXES = (".py", ".js", ".json", ".md", ".txt", ".toml", ".csv", ".yaml", ".yml", ".cube", ".css", ".html")


def compare_archive_bytes(archive: bytes, manifest: dict, report: dict, report_path: Path) -> int:
    """Compare the archive members with the manifest by raw SHA-256.

    The raw hash is the gate: any byte difference, in text or binary files, means
    the archive is not the validated commit. For text files a line-ending-normalised
    comparison is recorded separately as a diagnostic, so a CRLF checkout can be
    told apart from a real content change; it never turns a mismatch into a match.
    Duplicate member names are rejected because a reader could pick either copy.
    """
    expected_raw = {entry["path"]: (entry["sha256"], entry["bytes"]) for entry in manifest["files"]}
    expected_normalised = {entry["path"]: entry["sha256_normalised"] for entry in manifest["files"]}
    actual_raw: dict[str, tuple[str, int]] = {}
    actual_normalised: dict[str, str] = {}
    duplicates = []
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        for info in zipped.infolist():
            if info.is_dir():
                continue
            if info.filename in actual_raw:
                duplicates.append(info.filename)
                continue
            data = zipped.read(info)
            actual_raw[info.filename] = (hashlib.sha256(data).hexdigest(), len(data))
            actual_normalised[info.filename] = normalised_digest(data)
    common = set(expected_raw) & set(actual_raw)
    report["only_in_manifest"] = sorted(set(expected_raw) - set(actual_raw))
    report["only_in_archive"] = sorted(set(actual_raw) - set(expected_raw))
    report["duplicate_members"] = sorted(duplicates)
    report["content_differs"] = sorted(name for name in common if expected_raw[name] != actual_raw[name])
    report["differs_only_in_line_endings"] = sorted(
        name for name in report["content_differs"]
        if name.lower().endswith(TEXT_SUFFIXES) and expected_normalised[name] == actual_normalised[name])
    report["member_count"] = len(actual_raw)
    identical = not (report["only_in_manifest"] or report["only_in_archive"] or report["duplicate_members"]
                     or report["content_differs"])
    commit = manifest.get("commit", "unknown")
    report["result"] = (f"uploaded archive is byte-identical to the validated checkout (input manifest at commit {commit})"
                        if identical else f"uploaded archive differs from the validated checkout (input manifest at commit {commit})")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report["result"], f"({len(actual_raw)} members)")
    return 0 if identical else 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", type=Path, help="write the input manifest to this JSON file")
    parser.add_argument("--compare-cdn", metavar="VERSION", help="compare the published archive of VERSION")
    parser.add_argument("--manifest", type=Path, help="manifest to compare against")
    parser.add_argument("--report", type=Path, help="where to write the comparison report")
    args = parser.parse_args(argv)
    if args.write:
        return write_manifest(args.write)
    if args.compare_cdn:
        if not (args.manifest and args.report):
            parser.error("--compare-cdn needs --manifest and --report")
        return compare_cdn(args.compare_cdn, args.manifest, args.report)
    parser.error("choose --write or --compare-cdn")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
