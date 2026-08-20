export const bottomSheetSnapStates = ["collapsed", "half", "full"] as const;

export type BottomSheetSnapState = typeof bottomSheetSnapStates[number];
export type BottomSheetSnapDirection = "expand" | "collapse";

const snapIndex = new Map<BottomSheetSnapState, number>(
  bottomSheetSnapStates.map((state, index) => [state, index]),
);

export function isBottomSheetSnapState(value: string): value is BottomSheetSnapState {
  return bottomSheetSnapStates.includes(value as BottomSheetSnapState);
}

export function nextBottomSheetSnapState(current: BottomSheetSnapState, direction: BottomSheetSnapDirection): BottomSheetSnapState {
  const index = snapIndex.get(current) ?? 0;
  const delta = direction === "expand" ? 1 : -1;
  const next = Math.min(bottomSheetSnapStates.length - 1, Math.max(0, index + delta));
  return bottomSheetSnapStates[next] ?? current;
}

export function bottomSheetDirectionFromKey(key: string): BottomSheetSnapDirection | undefined {
  if (key === "ArrowUp" || key === "PageUp") return "expand";
  if (key === "ArrowDown" || key === "PageDown") return "collapse";
  return undefined;
}
