export const defaultCenter = { lat: 1.3048, lng: 103.8318 };

const latSpan = 0.03;
const lngSpan = 0.04;

export type ViewportBbox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

export function buildViewportBbox(center: { lat: number; lng: number }, zoom = 14): ViewportBbox {
  return {
    minLat: clamp(center.lat - latSpan / 2, 1.1, 1.5 - latSpan),
    minLng: clamp(center.lng - lngSpan / 2, 103.5, 104.1 - lngSpan),
    maxLat: clamp(center.lat + latSpan / 2, 1.1 + latSpan, 1.5),
    maxLng: clamp(center.lng + lngSpan / 2, 103.5 + lngSpan, 104.1),
    zoom,
  };
}

export function isSameViewportBbox(left: ViewportBbox, right: ViewportBbox) {
  return left.zoom === right.zoom
    && left.minLat.toFixed(5) === right.minLat.toFixed(5)
    && left.minLng.toFixed(5) === right.minLng.toFixed(5)
    && left.maxLat.toFixed(5) === right.maxLat.toFixed(5)
    && left.maxLng.toFixed(5) === right.maxLng.toFixed(5);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
