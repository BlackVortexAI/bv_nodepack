import assert from "node:assert/strict";
import test from "node:test";
import { parseDetectorRegistryConfig, serializeDetectorRegistryConfig } from "../ui/src/regional/detectorRegistryConfig.ts";

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
