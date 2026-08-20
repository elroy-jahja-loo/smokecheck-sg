import assert from "node:assert/strict";
import { test } from "node:test";

import { searchAdapter } from "./search-adapter";

test("search adapter propagates source metadata for public candidates", async () => {
  const result = await searchAdapter.search("orchard");

  assert.ok(result.candidates.length > 0);
  assert.ok(result.sources.length > 0);
  assert.ok(result.candidates.every((candidate) => candidate.sourceIds.length > 0));
  assert.ok(result.sources.every((source) => source.id && source.name && source.retrievedAt));
});
