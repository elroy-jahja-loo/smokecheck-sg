import assert from "node:assert/strict";
import test from "node:test";

import { hasOfficerRole, normalizeOfficerRole, officerRoles } from "@/lib/officer/roles";

test("normalizeOfficerRole accepts canonical and legacy data-sync aliases", () => {
  assert.equal(normalizeOfficerRole("data-sync"), officerRoles.dataSync);
  assert.equal(normalizeOfficerRole("data_sync"), officerRoles.dataSync);
  assert.equal(normalizeOfficerRole("DataSync"), officerRoles.dataSync);
});

test("normalizeOfficerRole rejects unknown roles", () => {
  assert.equal(normalizeOfficerRole("demo_officer"), undefined);
  assert.equal(normalizeOfficerRole("superadmin"), undefined);
  assert.equal(normalizeOfficerRole(""), undefined);
});

test("hasOfficerRole checks normalized role membership", () => {
  assert.equal(hasOfficerRole("admin", [officerRoles.admin]), true);
  assert.equal(hasOfficerRole("data_sync", [officerRoles.dataSync]), true);
  assert.equal(hasOfficerRole("analyst", [officerRoles.admin, officerRoles.dataSync]), false);
});
