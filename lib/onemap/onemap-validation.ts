import type { SingaporeCoordinate } from "@/lib/onemap/onemap-types";

export function isSingaporeCoordinate(value: SingaporeCoordinate) {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat >= 1.1 && value.lat <= 1.5 && value.lng >= 103.5 && value.lng <= 104.1;
}

function validateSingaporeCoordinate(value: SingaporeCoordinate, label = "coordinate") {
  if (!isSingaporeCoordinate(value)) throw new Error(`${label} must be within Singapore bounds.`);
  return value;
}

function parseCoordinateRecord(value: unknown, label = "coordinate") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is required.`);
  const record = value as Record<string, unknown>;
  const lat = typeof record.lat === "number" ? record.lat : Number(record.lat);
  const lng = typeof record.lng === "number" ? record.lng : Number(record.lng);
  return validateSingaporeCoordinate({ lat, lng }, label);
}

export function roundedCoordinate(value: SingaporeCoordinate) {
  return `${value.lat.toFixed(4)}:${value.lng.toFixed(4)}`;
}

export function parseReverseGeocodeInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reverse geocode payload is required.");
  const record = value as Record<string, unknown>;
  const coordinate = parseCoordinateRecord(record, "coordinate");
  const buffer = record.buffer === undefined ? 40 : Number(record.buffer);
  const addressType = record.addressType === undefined ? "All" : String(record.addressType);
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 500) throw new Error("Reverse geocode buffer must be an integer from 0 to 500 metres.");
  if (addressType !== "All" && addressType !== "HDB") throw new Error("Reverse geocode addressType must be All or HDB.");
  return { ...coordinate, buffer, addressType: addressType as "All" | "HDB" };
}

export function parseWalkingRouteInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Route payload is required.");
  const record = value as Record<string, unknown>;
  const start = parseCoordinateRecord(record.start, "start");
  const end = parseCoordinateRecord(record.end, "end");
  const routeType = record.routeType === undefined ? "walk" : String(record.routeType);
  if (routeType !== "walk") throw new Error("Only walking routes are supported in this pass.");
  return { start, end, routeType: "walk" as const };
}
