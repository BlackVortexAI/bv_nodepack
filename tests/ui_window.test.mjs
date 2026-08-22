import assert from "node:assert/strict";
import test from "node:test";
import { mergeChangedInitialGeometry, resizeFloatingWindow, windowShelfPosition } from "../ui/src/ui/workspaceGeometry.ts";

const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

test("window shelf starts inside the visible ComfyUI canvas beside its overlay navigation", () => {
    const canvas = rect(0, 16, 2560, 1221);
    assert.deepEqual(windowShelfPosition(canvas, [rect(0, 54, 59, 1221)], { width: 2560, height: 1221 }), { left: 140, bottom: 12 });
    assert.deepEqual(windowShelfPosition(canvas, [rect(0, 54, 59, 1221), rect(59, 54, 557, 1221)], { width: 2560, height: 1221 }), { left: 569, bottom: 12 });
});

test("window shelf ignores short toolbars and falls back safely without a canvas", () => {
    const canvas = rect(0, 16, 1200, 800);
    assert.deepEqual(windowShelfPosition(canvas, [rect(0, 0, 1200, 52)], { width: 1200, height: 900 }), { left: 140, bottom: 112 });
    assert.deepEqual(windowShelfPosition(null, [], { width: 1000, height: 700 }), { left: 140, bottom: 12 });
});

test("floating windows resize from every edge and corner", () => {
    const start={x:100,y:100,width:400,height:300},minimum={width:280,height:220};
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"e",minimum),{x:100,y:100,width:450,height:300});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"s",minimum),{x:100,y:100,width:400,height:340});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"w",minimum),{x:150,y:100,width:350,height:300});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"n",minimum),{x:100,y:140,width:400,height:260});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"nw",minimum),{x:150,y:140,width:350,height:260});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"ne",minimum),{x:100,y:140,width:450,height:260});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"sw",minimum),{x:150,y:100,width:350,height:340});
    assert.deepEqual(resizeFloatingWindow(start,{x:50,y:40},"se",minimum),{x:100,y:100,width:450,height:340});
});

test("top and left resizing preserve the opposite edge at minimum size", () => {
    const start={x:100,y:100,width:400,height:300};
    assert.deepEqual(resizeFloatingWindow(start,{x:500,y:500},"nw",{width:280,height:220}),{x:220,y:180,width:280,height:220});
});

test("persisting a moved left edge does not restore the initial window width", () => {
    const resized={x:1087,y:84,width:620,height:640};
    const previousInitial={x:1187,y:84,width:520,height:640};
    const nextInitial={x:1087,y:84,width:520,height:640};
    assert.deepEqual(mergeChangedInitialGeometry(resized,previousInitial,nextInitial),resized);
});
