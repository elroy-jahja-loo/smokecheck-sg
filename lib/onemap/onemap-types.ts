export type OneMapSearchCandidate = {
  id: string;
  label: string;
  address: string;
  postal?: string;
  building?: string;
  roadName?: string;
  lat: number;
  lng: number;
  source: "onemap";
};

export type OneMapReverseGeocodeResult = {
  status: "found" | "not_found";
  address?: string;
  building?: string;
  block?: string;
  roadName?: string;
  postal?: string;
  lat: number;
  lng: number;
  source: "onemap";
};

export type OneMapWalkingRoute = {
  status: "found" | "not_found" | "error";
  totalTimeSeconds?: number;
  totalDistanceMeters?: number;
  encodedGeometry?: string;
  instructions: OneMapRouteInstruction[];
  message?: string;
};

export type OneMapRouteInstruction = {
  direction: string;
  distanceText: string;
  instruction: string;
  lat?: number;
  lng?: number;
};

export type OneMapSafeErrorCode = "missing_token" | "token_expired" | "rate_limited" | "upstream_unavailable" | "not_found";

export class OneMapSafeError extends Error {
  constructor(
    readonly code: OneMapSafeErrorCode,
    message: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = "OneMapSafeError";
  }
}

export type SingaporeCoordinate = {
  lat: number;
  lng: number;
};
