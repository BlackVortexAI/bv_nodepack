import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../js/bv_prompt_debug.js", import.meta.url), "utf8");

test("text log preview uses the ComfyUI STRING widget execution channel", () => {
  assert.match(source, /ComfyWidgets/);
  assert.match(source, /message\?\.text/);
  assert.doesNotMatch(source, /message\?\.preview_text/);
});

test("AST debug preview uses the same native ComfyUI STRING widget contract", () => {
  assert.match(source, /ensureReadonlyTextPreview/);
  assert.match(source, /BV Prompt AST Debug preview/);
  assert.doesNotMatch(source, /document\.createElement\("textarea"\)/);
  assert.doesNotMatch(source, /addDOMWidget\(WIDGET_NAME/);
});

test("text log preview is appended only after base widget configuration", () => {
  const writerBranch = source.slice(
    source.indexOf('if (nodeData?.name === "BV Text Log Writer")'),
    source.indexOf('if (nodeData?.name !== "BV Prompt AST Debug")'),
  );

  assert.match(writerBranch, /const result = onConfigure\?\.apply\(this, arguments\);[\s\S]*requestAnimationFrame\(\(\) => ensureTextLogPreview\(this\)\)/);
  assert.match(writerBranch, /setTextLogPreview/);
  assert.match(source, /widget\.serializeValue = \(\) => undefined/);
});

test("corrupted positional values are repaired from connected regional outputs", () => {
  assert.match(source, /typeof mode\.value === "boolean"/);
  assert.match(source, /inferTextLogName\(node\)/);
  assert.match(source, /regional-enhancer-diff\.json/);
  assert.match(source, /regional-enhancer-diagnostics\.txt/);
  assert.match(source, /regional-enhancer-before\.json/);
  assert.match(source, /regional-enhancer-after\.json/);
  assert.match(source, /afterConfigureGraph\(\)/);
});
