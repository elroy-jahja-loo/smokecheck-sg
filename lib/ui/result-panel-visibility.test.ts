import assert from "node:assert/strict";
import test from "node:test";

import { getResultPanelVisibility } from "@/lib/ui/result-panel-visibility";

test("desktop always shows full section only", () => {
  assert.deepEqual(getResultPanelVisibility("desktop", "collapsed"), {
    showCollapsedSection: false,
    showHalfSection: false,
    showFullSection: true,
  });
  assert.deepEqual(getResultPanelVisibility("desktop", "half"), {
    showCollapsedSection: false,
    showHalfSection: false,
    showFullSection: true,
  });
  assert.deepEqual(getResultPanelVisibility("desktop", "full"), {
    showCollapsedSection: false,
    showHalfSection: false,
    showFullSection: true,
  });
});

test("mobile collapsed shows summary only", () => {
  assert.deepEqual(getResultPanelVisibility("mobile", "collapsed"), {
    showCollapsedSection: true,
    showHalfSection: false,
    showFullSection: false,
  });
});

test("mobile half shows nearby only", () => {
  assert.deepEqual(getResultPanelVisibility("mobile", "half"), {
    showCollapsedSection: false,
    showHalfSection: true,
    showFullSection: false,
  });
});

test("mobile full shows details only", () => {
  assert.deepEqual(getResultPanelVisibility("mobile", "full"), {
    showCollapsedSection: false,
    showHalfSection: false,
    showFullSection: true,
  });
});
