import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../ui/src/regional/DetailerPlanDialogView.tsx",import.meta.url),"utf8");

test("detailer edits do not replace the managed window component and remount the job list",()=>{
  assert.doesNotMatch(source,/const BvManagedWindow\s*=\s*useMemo/);
  assert.match(source,/<BvManagedWindow\s+open/);
});
