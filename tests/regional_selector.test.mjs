import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRegionId, regionChoices } from "../ui/src/regional/regionSelector.ts";

test("region dropdown displays names while retaining stable IDs", () => {
    const choices = regionChoices([{ id: "aaaaaaaa-0000", name: "Face" }, { id: "bbbbbbbb-0000", name: "Body" }]);
    assert.deepEqual(choices.map(choice => choice.label), ["Face", "Body"]);
    assert.equal(normalizeRegionId("bbbbbbbb-0000", choices), "bbbbbbbb-0000");
});

test("duplicate region names receive short unambiguous labels", () => {
    const choices = regionChoices([{ id: "aaaaaaaa-0000", name: "Face" }, { id: "bbbbbbbb-0000", name: "Face" }]);
    assert.deepEqual(choices.map(choice => choice.label), ["Face · aaaaaaaa", "Face · bbbbbbbb"]);
});

test("removed selection falls back to the first region", () => {
    const choices = regionChoices([{ id: "aaaaaaaa-0000", name: "Face" }]);
    assert.equal(normalizeRegionId("removed", choices), "aaaaaaaa-0000");
    assert.equal(normalizeRegionId("removed", []), "");
});
