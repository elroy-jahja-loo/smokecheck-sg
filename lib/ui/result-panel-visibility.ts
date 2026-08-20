import type { BottomSheetSnapState } from "@/lib/ui/bottom-sheet-snap";

export function getResultPanelVisibility(mode: "desktop" | "mobile", snapState: BottomSheetSnapState) {
  const isMobile = mode === "mobile";
  return {
    showCollapsedSection: isMobile && snapState === "collapsed",
    showHalfSection: isMobile && snapState === "half",
    showFullSection: !isMobile || snapState === "full",
  };
}
