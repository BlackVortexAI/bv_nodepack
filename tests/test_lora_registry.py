import json
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT.parent))

from bv_nodepack.py.util.lora_registry import (
    MAX_SIDECAR_BYTES,
    discover_loras,
    lora_preview_path,
    materialize_lora_registry,
    parse_lora_registry_config,
    serialize_lora_registry_config,
)


REGISTRY_ID = "11111111-1111-4111-8111-111111111111"
STACK_A = "22222222-2222-4222-8222-222222222222"
STACK_B = "33333333-3333-4333-8333-333333333333"
ENTRY_A = "44444444-4444-4444-8444-444444444444"
ENTRY_B = "55555555-5555-4555-8555-555555555555"


class FakeFolderPaths:
    def __init__(self, names, paths):
        self.names = names
        self.paths = paths
        self.calls = []

    def get_filename_list(self, folder):
        self.calls.append(("list", folder))
        return list(self.names)

    def get_full_path(self, folder, name):
        self.calls.append(("full", folder, name))
        return self.paths.get(name)


def config(stacks):
    return {"schema": "bv.lora_registry_config", "version": 1, "registry_id": REGISTRY_ID, "stacks": stacks}


def stack(identifier, name, entries, enabled=True):
    return {"id": identifier, "name": name, "enabled": enabled, "entries": entries}


def entry(identifier, name, enabled=True, model=1.0, clip=1.0):
    return {"id": identifier, "lora_name": name, "enabled": enabled, "model_strength": model, "clip_strength": clip}


class LoraRegistryTests(unittest.TestCase):
    def test_config_roundtrip_preserves_nested_order_and_stable_ids(self):
        value = config([
            stack(STACK_A, "Portrait", [entry(ENTRY_A, "people/portrait.safetensors")]),
            stack(STACK_B, "Style", [entry(ENTRY_B, "styles/ink.safetensors", model=0.75, clip=0.5)]),
        ])
        parsed = parse_lora_registry_config(serialize_lora_registry_config(value))
        self.assertEqual(parsed["registry_id"], REGISTRY_ID)
        self.assertEqual([item["id"] for item in parsed["stacks"]], [STACK_A, STACK_B])
        self.assertEqual(parsed["stacks"][1]["entries"][0]["id"], ENTRY_B)
        self.assertEqual(parsed["stacks"][1]["entries"][0]["model_strength"], 0.75)
        uppercase = config([stack(STACK_A.upper(), "Upper", [entry(ENTRY_A.upper(), "upper.safetensors")])])
        uppercase["registry_id"] = REGISTRY_ID.upper()
        normalized = parse_lora_registry_config(uppercase)
        self.assertEqual(normalized["registry_id"], REGISTRY_ID)
        self.assertEqual(normalized["stacks"][0]["id"], STACK_A)
        self.assertEqual(normalized["stacks"][0]["entries"][0]["id"], ENTRY_A)

    def test_config_rejects_recursive_entries_duplicate_names_and_free_paths(self):
        with self.assertRaisesRegex(ValueError, "must be a LoRA entry"):
            parse_lora_registry_config(config([stack(STACK_A, "One", [{"id": ENTRY_A, "stack_id": STACK_B}])]))
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            parse_lora_registry_config(config([{**stack(STACK_A, "One", []), "stacks": []}]))
        with self.assertRaisesRegex(ValueError, "Duplicate LoRA stack name"):
            parse_lora_registry_config(config([stack(STACK_A, "One", []), stack(STACK_B, "one", [])]))
        with self.assertRaisesRegex(ValueError, "ComfyUI-relative"):
            parse_lora_registry_config(config([stack(STACK_A, "One", [entry(ENTRY_A, "../outside.safetensors")])]))
        with self.assertRaisesRegex(ValueError, "ComfyUI-relative"):
            parse_lora_registry_config(config([stack(STACK_A, "One", [entry(ENTRY_A, "C:/outside.safetensors")])]))
        with self.assertRaisesRegex(ValueError, "must be a UUID"):
            parse_lora_registry_config({**config([]), "registry_id": "not-a-uuid"})
        with self.assertRaisesRegex(ValueError, "safetensors"):
            parse_lora_registry_config(config([stack(STACK_A, "One", [entry(ENTRY_A, "model.ckpt")])]))
        with self.assertRaisesRegex(ValueError, "finite"):
            parse_lora_registry_config(config([stack(STACK_A, "One", [entry(ENTRY_A, "model.safetensors", model=float("nan"))])]))
        with self.assertRaisesRegex(ValueError, "finite"):
            parse_lora_registry_config(config([stack(STACK_A, "One", [entry(ENTRY_A, "model.safetensors", clip=float("inf"))])]))
        invalid_entry = entry(ENTRY_A, "model.safetensors")
        for field, bad_value in (("model_strength", None), ("clip_strength", []), ("lora_name", ["model.safetensors"]), ("id", {"value": ENTRY_A}), ("enabled", "true")):
            malformed = dict(invalid_entry)
            malformed[field] = bad_value
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    parse_lora_registry_config(config([stack(STACK_A, "One", [malformed])]))
        with self.assertRaisesRegex(ValueError, "id and name must be strings"):
            parse_lora_registry_config(config([{**stack(STACK_A, "One", []), "name": {"value": "One"}}]))

    def test_materialization_keeps_disabled_and_empty_stacks_as_named_noops(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            active = root / "active.safetensors"
            active.write_bytes(b"model")
            folders = FakeFolderPaths(["active.safetensors"], {"active.safetensors": str(active)})
            value = config([
                stack(STACK_A, "Comparison off", [entry(ENTRY_A, "missing.safetensors")], enabled=False),
                stack(STACK_B, "Mixed", [
                    entry(ENTRY_A, "missing-too.safetensors", enabled=False),
                    entry(ENTRY_B, "active.safetensors", model=0.8, clip=0.6),
                ]),
            ])
            registry, provider_id = materialize_lora_registry(value, folders)
            self.assertEqual(provider_id, REGISTRY_ID)
            self.assertEqual(registry["stacks"][STACK_A], {"id": STACK_A, "name": "Comparison off", "stack": []})
            self.assertEqual(registry["stacks"][STACK_B]["stack"], [("active.safetensors", 0.8, 0.6)])
            self.assertNotIn(("full", "loras", "missing.safetensors"), folders.calls)
            self.assertNotIn(("full", "loras", "missing-too.safetensors"), folders.calls)

    def test_enabled_missing_lora_fails_closed_through_comfyui_lookup(self):
        folders = FakeFolderPaths([], {})
        with self.assertRaisesRegex(ValueError, "not found through ComfyUI"):
            materialize_lora_registry(config([stack(STACK_A, "Missing", [entry(ENTRY_A, "missing.safetensors")])]), folders)
        self.assertIn(("full", "loras", "missing.safetensors"), folders.calls)

    def test_discovery_uses_only_safetensors_from_comfyui_and_ignores_orphans(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "first" / "style.safetensors"
            second = root / "mapped" / "character.SAFETENSORS"
            first.parent.mkdir()
            second.parent.mkdir()
            first.write_bytes(b"one")
            second.write_bytes(b"two")
            (root / "orphan.metadata.json").write_text('{"model_name":"Orphan"}', encoding="utf-8")
            folders = FakeFolderPaths(
                ["styles/style.safetensors", "mapped/character.SAFETENSORS", "orphan.metadata.json", "notes.txt"],
                {"styles/style.safetensors": str(first), "mapped/character.SAFETENSORS": str(second)},
            )
            catalog = discover_loras(folders)
            self.assertEqual([item["name"] for item in catalog["items"]], ["mapped/character.SAFETENSORS", "styles/style.safetensors"])
            self.assertEqual([item["display_name"] for item in catalog["items"]], ["character", "style"])
            self.assertEqual(catalog["schema"], "bv.lora_catalog")
            self.assertEqual(folders.calls[0], ("list", "loras"))

    def test_sidecars_merge_fieldwise_with_metadata_priority_and_safe_text(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            model = root / "portrait.safetensors"
            model.write_bytes(b"model")
            model.with_name("portrait.metadata.json").write_text(json.dumps({
                "model_name": "Metadata title",
                "preview_nsfw_level": 0,
                "trainedWords": [],
                "civitai": {"trainedWords": ["portrait trigger"], "creator": {"username": "artist"}},
                "tags": ["portrait", "Portrait"],
                "modelDescription": "<p>Hello <strong>world</strong></p>",
            }), encoding="utf-8")
            model.with_name("portrait.cm-info.json").write_text(json.dumps({
                "ModelName": "CM title", "BaseModel": "Anima", "TrainedWords": ["cm trigger"],
            }), encoding="utf-8")
            folders = FakeFolderPaths(["portrait.safetensors"], {"portrait.safetensors": str(model)})
            item = discover_loras(folders)["items"][0]
            self.assertEqual(item["display_name"], "Metadata title")
            self.assertEqual(item["base_model"], "Anima")
            self.assertEqual(item["trigger_words"], ["portrait trigger"])
            self.assertEqual(item["tags"], ["portrait"])
            self.assertEqual(item["author"], "artist")
            self.assertEqual(item["description"], "Hello world")
            self.assertEqual(item["metadata_sources"], ["metadata", "cm-info"])
            self.assertEqual(item["type"], "LoRA")
            self.assertEqual(item["category"], "portrait")
            self.assertEqual(item["directory"], "")
            self.assertTrue(item["preview_safe"])

    def test_catalog_type_category_and_directory_use_local_metadata_then_path_fallback(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            explicit = root / "explicit.safetensors"
            fallback = root / "fallback.safetensors"
            explicit.write_bytes(b"model")
            fallback.write_bytes(b"model")
            explicit.with_name("explicit.metadata.json").write_text(json.dumps({
                "civitai": {"model": {"type": "LyCORIS", "tags": ["Character", "Anime"]}},
            }), encoding="utf-8")
            folders = FakeFolderPaths(
                ["Characters/explicit.safetensors", "Styles/fallback.safetensors"],
                {"Characters/explicit.safetensors": str(explicit), "Styles/fallback.safetensors": str(fallback)},
            )
            items = {item["name"]: item for item in discover_loras(folders)["items"]}
            self.assertEqual(items["Characters/explicit.safetensors"]["type"], "LyCORIS")
            self.assertEqual(items["Characters/explicit.safetensors"]["category"], "Character")
            self.assertEqual(items["Characters/explicit.safetensors"]["directory"], "Characters")
            self.assertEqual(items["Styles/fallback.safetensors"]["type"], "LoRA")
            self.assertEqual(items["Styles/fallback.safetensors"]["category"], "Styles")

    def test_corrupt_and_oversize_sidecars_fall_back_to_filename(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            model = root / "plain.safetensors"
            model.write_bytes(b"model")
            model.with_name("plain.metadata.json").write_text("{broken", encoding="utf-8")
            model.with_name("plain.cm-info.json").write_bytes(b" " * (MAX_SIDECAR_BYTES + 1))
            folders = FakeFolderPaths(["plain.safetensors"], {"plain.safetensors": str(model)})
            item = discover_loras(folders)["items"][0]
            self.assertEqual(item["display_name"], "plain")
            self.assertEqual(item["metadata_sources"], [])

    def test_preview_is_bound_to_resolved_lora_stem_and_fixed_priority(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            model = root / "look.safetensors"
            model.write_bytes(b"model")
            jpg = root / "look.preview.jpg"
            jpeg = root / "look.preview.jpeg"
            jpg.write_bytes(b"jpg")
            jpeg.write_bytes(b"jpeg")
            (root / "orphan.preview.png").write_bytes(b"orphan")
            folders = FakeFolderPaths(["look.safetensors"], {"look.safetensors": str(model)})
            self.assertEqual(lora_preview_path("look.safetensors", folders), jpg.resolve())
            item = discover_loras(folders)["items"][0]
            self.assertEqual(item["preview_url"], "/bv_nodepack/loras/preview?name=look.safetensors")


if __name__ == "__main__":
    unittest.main()
