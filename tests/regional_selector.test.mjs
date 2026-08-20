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

test("detailer dropdown includes only enabled detailer consumers", () => {
    const choices = regionChoices([
        { id: "generation", name: "Main", enabled: true, usage: "generation" },
        { id: "detailer", name: "Face", enabled: true, usage: "detailer" },
        { id: "both", name: "Hands", enabled: true, usage: "both" },
        { id: "disabled", name: "Off", enabled: false, usage: "detailer" },
    ], "detailer");
    assert.deepEqual(choices.map(choice => choice.id), ["detailer", "both"]);
});
