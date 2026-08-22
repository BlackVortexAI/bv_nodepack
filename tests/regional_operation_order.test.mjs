import assert from "node:assert/strict";
import test from "node:test";
import { canRemoveGeometry, hasAdditiveOperationBases } from "../ui/src/regional/operationOrder.ts";

const geometry = (id, operation, group="layer") => ({ id, layer_id:"layer", mask_group_id:group, type:"rect", operation, x:0, y:0, width:.2, height:.2 });

test("operation groups are evaluated top to bottom from an additive base", () => {
    assert.equal(hasAdditiveOperationBases([geometry("base","add"),geometry("cut","subtract")]),true);
    assert.equal(hasAdditiveOperationBases([geometry("cut","subtract"),geometry("base","add")]),false);
});

test("the additive base cannot be deleted while dependent subtract operations remain", () => {
    const operations=[geometry("base","add"),geometry("cut","subtract")];
    assert.equal(canRemoveGeometry(operations,"base"),false);
    assert.equal(canRemoveGeometry(operations,"cut"),true);
});

test("each retained mask group needs its own additive base", () => {
    assert.equal(hasAdditiveOperationBases([geometry("base-a","add","a"),geometry("cut-b","subtract","b")]),false);
});
