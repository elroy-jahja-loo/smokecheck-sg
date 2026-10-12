type BrowserError = {
  request?: { url?: string };
  contexts?: Record<string, unknown>;
  exception?: { values?: Array<{
    type?: string;
    value?: string;
    stacktrace?: { frames?: Array<{ filename?: string; function?: string }> };
  }> };
};

// The Google iOS in-app browser injects an inline script into this page. Its
// mutually recursive Ok/Qk frames are not present in the application's code.
export function isInjectedStackOverflow(event: BrowserError, userAgent = "") {
  const browser = event.contexts?.browser;
  const browserName = browser && typeof browser === "object" && "name" in browser ? browser.name : undefined;
  if (browserName !== "Google" && !/\bGSA\//i.test(userAgent)) return false;
  if (!event.request?.url?.split("?")[0].endsWith("/singapore-smoking-fines")) return false;
  const error = event.exception?.values?.[0];
  if (error?.type !== "RangeError" || error.value !== "Maximum call stack size exceeded.") return false;
  const frames = error.stacktrace?.frames?.slice(-4) ?? [];
  return frames.length === 4
    && frames.every((frame) => frame.filename === "app:///singapore-smoking-fines" && (frame.function === "Ok" || frame.function === "Qk"))
    && frames.some((frame) => frame.function === "Ok")
    && frames.some((frame) => frame.function === "Qk");
}
