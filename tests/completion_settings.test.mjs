import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../ui/src/index.tsx", import.meta.url), "utf8");

test("completion settings use distinct three-part ComfyUI category paths", () => {
    const paths = [...source.matchAll(/category:\s*\["BV Node Pack",\s*"Prompting"(?:,\s*"([^"]+)")?\]/g)]
        .map(match => match[1] ?? null);
    assert.deepEqual(paths, ["Enable autocomplete", "Popup position", "Completion datasets"]);
});
