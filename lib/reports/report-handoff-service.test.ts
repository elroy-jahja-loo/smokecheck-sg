import assert from "node:assert/strict";
import { test } from "node:test";

import { PrototypeReportHandoffService } from "./report-handoff-service";
import type { OfficerReportDraft } from "../types";

test("report handoff uses idempotency key to return duplicate on retry", async () => {
  const service = new PrototypeReportHandoffService();
  const draft: OfficerReportDraft = {
    idempotencyKey: "test-report-idempotency-key",
    coordinates: { lat: 1.3048, lng: 103.8318 },
    nearestAddress: "313 Orchard Road, Singapore 238895",
    boundaryStatus: "Outside known designated area in prototype seed layer",
    occurredAt: "2026-07-06T10:42:00+08:00",
    officerDisplay: "Authenticated officer",
    incidentType: "Smoking in prohibited area",
    notes: "Prototype note",
    attachmentPlaceholder: true,
    isPrototype: true,
  };

  const first = await service.submit(draft);
  const second = await service.submit(draft);

  assert.equal(first.status, "accepted");
  assert.equal(second.status, "duplicate");
  assert.equal(first.handoffId, second.handoffId);
  assert.equal(first.eventName, "officer.report.submitted");
  assert.equal(first.auditEventName, "audit.event.created");
});
