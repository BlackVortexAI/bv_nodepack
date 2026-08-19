from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from threading import RLock
from typing import Any


LEGACY_CATEGORIES = {
    "0": "general",
    "1": "artist",
    "3": "copyright",
    "4": "character",
    "5": "meta",
}


def _normalized(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "_")


class CompletionDataset:
    """Lazy, dependency-free CSV index for BV completion providers."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._lock = RLock()
        self._loaded = False
        self._bigrams: dict[str, list[dict[str, Any]]] = {}

    def search(self, term: str, limit: int = 20) -> list[dict[str, Any]]:
        query = _normalized(term)
        if len(query) < 2 or limit <= 0:
            return []
        self._ensure_loaded()
        candidates = self._bigrams.get(query[:2], ())
        matches = [item for item in candidates if query in item["search_term"]]
        matches.sort(
            key=lambda item: (
                item["search_term"] != query,
                not item["search_term"].startswith(query),
                -int(item.get("score") or 0),
                item["label"].casefold(),
            )
        )
        return [{key: value for key, value in item.items() if key != "search_term"} for item in matches[:limit]]

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            if not self.path.is_file():
                raise FileNotFoundError(f"Completion dataset does not exist: {self.path}")
            bigrams: dict[str, list[dict[str, Any]]] = {}
            for candidate in self._read_candidates():
                search_term = candidate["search_term"]
                if len(search_term) >= 2:
                    for bigram in {search_term[index:index + 2] for index in range(len(search_term) - 1)}:
                        bigrams.setdefault(bigram, []).append(candidate)
            self._bigrams = bigrams
            self._loaded = True

    def _read_candidates(self):
        with self.path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.reader(source, delimiter="\t" if self.path.suffix.lower() == ".tsv" else ",")
            first = next(reader, None)
            if first is None:
                return
            if first and _normalized(first[0]) in {"tag", "term"}:
                headers = [str(value).strip() for value in first]
                for row in reader:
                    yield from self._extended_candidates(dict(zip(headers, row)))
                return
            yield from self._legacy_candidates(first)
            for row in reader:
                yield from self._legacy_candidates(row)

    def _legacy_candidates(self, row: list[str]):
        if len(row) < 4:
            return
        tag, category_id, count, aliases = row[:4]
        metadata = {"usage_count": int(count) if count.isdecimal() else None}
        yield self._candidate(tag, tag, tag, LEGACY_CATEGORIES.get(category_id, category_id), count, metadata)
        for alias in aliases.split(","):
            alias = alias.strip()
            if alias:
                alias_metadata = {**metadata, "is_alias": True, "canonical_tag": tag}
                yield self._candidate(alias, tag, f"{alias} → {tag}", LEGACY_CATEGORIES.get(category_id, category_id), count, alias_metadata)

    def _extended_candidates(self, row: dict[str, str]):
        tag = str(row.get("tag") or row.get("term") or "").strip()
        if not tag:
            return
        category = str(row.get("category") or "").strip() or None
        count = str(row.get("post_count") or row.get("usage_count") or "").strip()
        description = str(row.get("description") or "").strip() or None
        known = {"tag", "term", "category", "post_count", "usage_count", "aliases", "description"}
        metadata = {key: value for key, value in row.items() if key not in known and value not in (None, "")}
        if count.isdecimal():
            metadata["usage_count"] = int(count)
        yield self._candidate(tag, tag, tag, category, count, metadata, description)
        for alias in str(row.get("aliases") or "").split(","):
            alias = alias.strip()
            if alias:
                alias_metadata = {**metadata, "is_alias": True, "canonical_tag": tag}
                yield self._candidate(alias, tag, f"{alias} → {tag}", category, count, alias_metadata, description)

    @staticmethod
    def _candidate(search_term, insert_text, label, category, count, metadata, detail=None):
        identity = hashlib.sha1(f"{search_term}\0{insert_text}".encode("utf-8")).hexdigest()[:16]
        canonical = str(insert_text).strip()
        display_label = str(label).strip().replace("_", " ")
        return {
            "id": f"local:{identity}",
            "search_term": _normalized(search_term),
            "insert_text": canonical.replace("_", " "),
            "label": display_label,
            "source": "BV Local Tags",
            "detail": detail,
            "category": category,
            "score": int(count) if str(count).isdecimal() else 0,
            "metadata": {"canonical_tag": canonical, **metadata},
        }
