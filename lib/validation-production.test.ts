import assert from "node:assert/strict";
import test from "node:test";

import { parseReportDraft } from "@/lib/validation";

const basePayload = {
  coordinates: { lat: 1.3048, lng: 103.8318 },
  nearestAddress: "313 Orchard Road, Singapore 238895",
  boundaryStatus: "Outside known designated area",
  occurredAt: "09 Jul 2026, 10:00 SGT",
  incidentType: "Smoking in prohibited area",
  observationSubject: "Unknown person observed",
  notes: "Observed smoke near walkway.",
};

test("report validation drops NRIC and offender identifiers", () => {
  const draft = parseReportDraft({
    ...basePayload,
    offenderName: "Example Person",
    offenderNric: "S1234567A",
    offenderContact: "99999999",
    photoAttachment: { name: "evidence.jpg", sizeBytes: 1000, type: "image/jpeg", capturedClientSideOnly: true },
  }, "production-boundary-test");

  assert.ok(draft);
  assert.equal("offenderName" in draft, false);
  assert.equal("offenderNric" in draft, false);
  assert.equal("offenderContact" in draft, false);
  assert.equal("photoAttachment" in draft, false);
  assert.equal(draft.observationSubject, "Unknown person observed");
});

test("report validation defaults to non-identifying observation subject", () => {
  const draft = parseReportDraft({ ...basePayload, observationSubject: "S1234567A" }, "observation-subject-test");

  assert.ok(draft);
  assert.equal(draft.observationSubject, "Unknown person observed");
});
