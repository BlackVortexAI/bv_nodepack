import test from "node:test";
import assert from "node:assert/strict";
import {requestRegionalWindow,subscribeRegionalWindow} from "../ui/src/regional/windowRequests.ts";

test("regional window requests deliver the concrete workflow node without global DOM state",()=>{
  const first={id:8},second={id:73},received=[];const stop=subscribeRegionalWindow("regional",node=>received.push(node));
  requestRegionalWindow("regional",first);requestRegionalWindow("regional",second);stop();requestRegionalWindow("regional",first);
  assert.deepEqual(received,[first,second]);
});
