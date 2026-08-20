import assert from "node:assert/strict";
import test from "node:test";

import {
  bottomSheetDirectionFromKey,
  bottomSheetSnapStates,
  isBottomSheetSnapState,
  nextBottomSheetSnapState,
} from "@/lib/ui/bottom-sheet-snap";

test("snap states are stable and ordered", () => {
  assert.deepEqual(bottomSheetSnapStates, ["collapsed", "half", "full"]);
});

test("snap state transition clamps at boundaries", () => {
  assert.equal(nextBottomSheetSnapState("collapsed", "collapse"), "collapsed");
  assert.equal(nextBottomSheetSnapState("collapsed", "expand"), "half");
  assert.equal(nextBottomSheetSnapState("half", "expand"), "full");
  assert.equal(nextBottomSheetSnapState("full", "expand"), "full");
  assert.equal(nextBottomSheetSnapState("full", "collapse"), "half");
});

test("keyboard direction mapping handles allowed keys only", () => {
  assert.equal(bottomSheetDirectionFromKey("ArrowUp"), "expand");
  assert.equal(bottomSheetDirectionFromKey("PageUp"), "expand");
  assert.equal(bottomSheetDirectionFromKey("ArrowDown"), "collapse");
  assert.equal(bottomSheetDirectionFromKey("PageDown"), "collapse");
  assert.equal(bottomSheetDirectionFromKey("Enter"), undefined);
});

test("state guard validates expected values", () => {
  assert.equal(isBottomSheetSnapState("collapsed"), true);
  assert.equal(isBottomSheetSnapState("half"), true);
  assert.equal(isBottomSheetSnapState("full"), true);
  assert.equal(isBottomSheetSnapState("hidden"), false);
});
