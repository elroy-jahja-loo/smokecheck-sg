"use client";

import { track } from "@vercel/analytics";

type AnalyticsValue = string | number | boolean | null;

type AnalyticsEvent =
  | "community_mode_selected"
  | "community_overlay_opened"
  | "community_polygon_completed"
  | "community_submission_attempted"
  | "community_submission_failed"
  | "designated_area_selected"
  | "directions_completed"
  | "directions_requested"
  | "geolocation_failed"
  | "geolocation_requested"
  | "geolocation_resolved"
  | "location_search_completed"
  | "location_share_cancelled"
  | "location_share_completed"
  | "map_point_selected"
  | "search_result_selected"
  | "status_check_completed";

/**
 * Product analytics must never receive addresses, coordinates, route geometry,
 * search terms, or community-submission shapes.
 */
export function trackEvent(name: AnalyticsEvent, data?: Record<string, AnalyticsValue>) {
  track(name, data);
}
