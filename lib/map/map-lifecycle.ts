export function createMapLifecycle(
  map: { stop: () => void },
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (id: number) => void,
) {
  const frames = new Set<number>();
  let disposed = false;

  return {
    isActive: () => !disposed,
    schedule(callback: () => void) {
      if (disposed) return undefined;
      const id = requestFrame(() => {
        if (!frames.delete(id) || disposed) return;
        callback();
      });
      frames.add(id);
      return id;
    },
    cancel(id: number | undefined) {
      if (id === undefined || !frames.delete(id)) return;
      cancelFrame(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of frames) cancelFrame(id);
      frames.clear();
      map.stop();
    },
  };
}
