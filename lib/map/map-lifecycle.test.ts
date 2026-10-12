import assert from "node:assert/strict";
import { test } from "node:test";

import { createMapLifecycle } from "./map-lifecycle";

test("map teardown stops animations and cancels scheduled map callbacks", () => {
  let stopped = 0;
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  const lifecycle = createMapLifecycle(
    { stop: () => { stopped += 1; } },
    (callback) => { callbacks.set(++nextId, callback); return nextId; },
    (id) => { cancelled.push(id); },
  );
  let invoked = 0;
  const id = lifecycle.schedule(() => { invoked += 1; });

  lifecycle.dispose();
  callbacks.get(id!)?.(0); // A queued callback may still run despite cancellation.
  lifecycle.dispose();

  assert.deepEqual(cancelled, [id]);
  assert.equal(stopped, 1);
  assert.equal(invoked, 0);
  assert.equal(lifecycle.schedule(() => { invoked += 1; }), undefined);
});

test("cancelled frames never run but active frames run once", () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  const lifecycle = createMapLifecycle(
    { stop: () => undefined },
    (callback) => { const id = callbacks.size + 1; callbacks.set(id, callback); return id; },
    () => undefined,
  );
  let invoked = 0;
  const cancelled = lifecycle.schedule(() => { invoked += 1; });
  lifecycle.cancel(cancelled);
  callbacks.get(cancelled!)?.(0);
  const active = lifecycle.schedule(() => { invoked += 1; });
  callbacks.get(active!)?.(0);
  lifecycle.dispose();
  assert.equal(invoked, 1);
});
