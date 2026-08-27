import assert from "node:assert/strict";
import test from "node:test";
import { detectorCapabilities, detectorCapabilityText, parseDetectorRegistryConfig, serializeDetectorRegistryConfig } from "../ui/src/regional/detectorRegistryConfig.ts";

test("detector registry config preserves model-backed entries", () => {
    const config = parseDetectorRegistryConfig(JSON.stringify({ detectors: [{
        id: "eyes", provider: "ultralytics", model_name: "bbox/eyes.pt",
        sam_model_name: "sam_vit_b.pth", sam_device_mode: "Prefer GPU",
    }] }));
    assert.deepEqual(config.detectors[0], {
        id: "eyes", provider: "ultralytics", model_name: "bbox/eyes.pt",
        sam_model_name: "sam_vit_b.pth", sam_device_mode: "Prefer GPU",
    });
    assert.equal(JSON.parse(serializeDetectorRegistryConfig(config)).schema, "bv.detector_registry_config");
});

test("detector registry config drops incomplete entries", () => {
    const config = parseDetectorRegistryConfig(JSON.stringify({ detectors: [
        { id: "", provider: "ultralytics", model_name: "bbox/a.pt" },
        { id: "face", provider: "onnx", model_name: "face.onnx" },
    ] }));
    assert.deepEqual(config.detectors.map(entry => entry.id), ["face"]);
});

test("legacy registry config receives a persisted collector identity", () => {
    const migrated = parseDetectorRegistryConfig(JSON.stringify({
        schema: "bv.detector_registry_config", version: 1, detectors: [],
    }));
    assert.equal(migrated.version, 2);
    assert.match(migrated.collector_id, /^[0-9a-f-]{36}$/i);
    assert.equal(
        parseDetectorRegistryConfig(serializeDetectorRegistryConfig(migrated)).collector_id,
        migrated.collector_id,
    );
});

test("detector capabilities distinguish BBOX, native SEGM, and SAM masks", () => {
    const bbox = detectorCapabilities({ provider: "ultralytics", model_name: "bbox/person.pt" });
    const segm = detectorCapabilities({ provider: "ultralytics", model_name: "segm/person-seg.pt" });
    const sam = detectorCapabilities({ provider: "onnx", model_name: "person.onnx", sam_model_name: "sam.pth" });
    assert.deepEqual(bbox, { kind: "bbox", sam: false, pixelMask: false });
    assert.deepEqual(segm, { kind: "segmentation", sam: false, pixelMask: true });
    assert.deepEqual(sam, { kind: "bbox", sam: true, pixelMask: true });
    assert.match(detectorCapabilityText(bbox), /BBOX only/);
    assert.match(detectorCapabilityText(segm), /SEGM pixel masks/);
    assert.match(detectorCapabilityText(sam), /SAM-generated pixel masks/);
});
