from __future__ import annotations

import os
from pathlib import Path
from threading import RLock

from .dataset import CompletionDataset


ROOT = Path(__file__).resolve().parents[3]
LOCAL_DATA_DIR = ROOT / "data" / "completion"
ENVIRONMENT_KEY = "BV_COMPLETION_DATASET"


class CompletionService:
    def __init__(self, data_dir: str | Path = LOCAL_DATA_DIR):
        self.data_dir = Path(data_dir)
        self._lock = RLock()
        self._datasets: dict[Path, CompletionDataset] = {}

    def status(self):
        datasets = self.available_datasets()
        return {
            "available": bool(datasets),
            "datasets": datasets,
            "format_version": 1,
        }

    def search(self, term: str, limit: int = 20, selected: list[str] | None = None):
        safe_limit = max(1, min(int(limit), 100))
        paths = self.resolve_paths(selected)
        merged = {}
        for path in paths:
            for item in self._get_dataset(path).search(term, safe_limit):
                key = item["insert_text"].casefold()
                if key not in merged:
                    merged[key] = item
        return sorted(merged.values(), key=lambda item: (-item.get("score", 0), item["label"].casefold()))[:safe_limit]

    def available_datasets(self):
        return [
            {"id": path.name, "name": path.stem, "bytes": path.stat().st_size, "path": str(path)}
            for path in self.resolve_paths(None)
        ]

    def resolve_paths(self, selected: list[str] | None) -> list[Path]:
        configured = os.environ.get(ENVIRONMENT_KEY)
        if configured:
            candidate = Path(configured).expanduser()
            if candidate.is_file() and candidate.suffix.lower() in {".csv", ".tsv"}:
                return [candidate.resolve()]

        candidates = sorted((*self.data_dir.glob("*.csv"), *self.data_dir.glob("*.tsv")))
        if selected is None:
            return [candidate.resolve() for candidate in candidates]
        by_name = {candidate.name: candidate.resolve() for candidate in candidates}
        return [by_name[name] for name in selected if name in by_name]

    def _get_dataset(self, path: Path):
        with self._lock:
            if path not in self._datasets:
                self._datasets[path] = CompletionDataset(path)
            return self._datasets[path]


completion_service = CompletionService()
