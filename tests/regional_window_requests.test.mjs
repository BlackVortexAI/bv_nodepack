import test from "node:test";
import assert from "node:assert/strict";
import {canRequestRegionalWindow,requestRegionalWindow,subscribeRegionalWindow} from "../ui/src/regional/windowRequests.ts";

test("regional window requests deliver the concrete workflow node without global DOM state",()=>{
  const first={id:8},second={id:73},received=[];const stop=subscribeRegionalWindow("regional",node=>received.push(node));
  assert.equal(canRequestRegionalWindow("regional"),true);
  assert.equal(requestRegionalWindow("regional",first),true);assert.equal(requestRegionalWindow("regional",second),true);stop();
  assert.equal(canRequestRegionalWindow("regional"),false);
  assert.equal(requestRegionalWindow("regional",first),false);
  assert.deepEqual(received,[first,second]);
});
