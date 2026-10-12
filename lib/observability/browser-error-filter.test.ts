import assert from "node:assert/strict";
import { test } from "node:test";

import { isInjectedStackOverflow } from "./browser-error-filter";

const suspectedInjectedError = {
  request: { url: "https://smokecheck-sg.vercel.app/singapore-smoking-fines" },
  contexts: { browser: { name: "Google" } },
  exception: { values: [{
    type: "RangeError", value: "Maximum call stack size exceeded.",
    stacktrace: { frames: Array.from({ length: 6 }, (_, index) => ({
      filename: "app:///singapore-smoking-fines", function: index % 2 ? "Ok" : "Qk",
    })) },
  }] },
};

test("only the observed Google-app inline recursion is classified as injected", () => {
  assert.equal(isInjectedStackOverflow(suspectedInjectedError), true);
  assert.equal(isInjectedStackOverflow({ ...suspectedInjectedError, contexts: { browser: { name: "Mobile Safari" } } }), false);
  assert.equal(isInjectedStackOverflow({ ...suspectedInjectedError, request: { url: "https://smokecheck-sg.vercel.app/search" } }), false);
  assert.equal(isInjectedStackOverflow({ ...suspectedInjectedError, exception: { values: [{ type: "RangeError", value: "Maximum call stack size exceeded.", stacktrace: { frames: [{ filename: "app:///_next/static/chunks/app.js", function: "render" }] } }] } }), false);
});
