import { create } from "zustand";
import type { Activity, LngLat, Mode, Segment, StyleKey, Units } from "@/types";
import { ACTIVITY_TO_PROFILE } from "@/types";
import { lineLength } from "@/lib/geo/distance";

type State = {
  segments: Segment[];
  waypoints: LngLat[];
  mode: Mode;
  activity: Activity;
  units: Units;
  style: StyleKey;
  isDrawing: boolean;
  isLoading: boolean;
  error: string | null;
};

type Actions = {
  setMode: (m: Mode) => void;
  setActivity: (a: Activity) => void;
  setUnits: (u: Units) => void;
  setStyle: (s: StyleKey) => void;
  setDrawing: (d: boolean) => void;
  setError: (e: string | null) => void;
  setLoading: (l: boolean) => void;
  addSegment: (seg: Segment) => void;
  addWaypoint: (p: LngLat, seg: Segment | null) => void;
  undo: () => void;
  clear: () => void;
  hydrate: (s: Partial<State>) => void;
};

export const useTrace = create<State & Actions>((set) => ({
  segments: [],
  waypoints: [],
  mode: "waypoint",
  activity: "walk",
  units: "km",
  style: "light",
  isDrawing: false,
  isLoading: false,
  error: null,

  setMode: (mode) => set({ mode }),
  setActivity: (activity) => set({ activity }),
  setUnits: (units) => set({ units }),
  setStyle: (style) => set({ style }),
  setDrawing: (isDrawing) => set({ isDrawing }),
  setError: (error) => set({ error }),
  setLoading: (isLoading) => set({ isLoading }),

  addSegment: (seg) =>
    set((s) => ({ segments: [...s.segments, seg] })),

  addWaypoint: (p, seg) =>
    set((s) => {
      const waypoints = [...s.waypoints, p];
      const segments = seg ? [...s.segments, seg] : s.segments;
      return { waypoints, segments };
    }),

  undo: () =>
    set((s) => {
      if (s.segments.length === 0 && s.waypoints.length === 0) return s;
      const segments = s.segments.slice(0, -1);
      const lastSeg = s.segments[s.segments.length - 1];
      let waypoints = s.waypoints;
      if (lastSeg?.mode === "waypoint") waypoints = waypoints.slice(0, -1);
      if (segments.length === 0) waypoints = [];
      return { segments, waypoints };
    }),

  clear: () => set({ segments: [], waypoints: [], error: null }),

  hydrate: (s) => set(s),
}));

export function profileFor(activity: Activity) {
  return ACTIVITY_TO_PROFILE[activity];
}

export function mergedLine(segments: Segment[]): LngLat[] {
  const out: LngLat[] = [];
  segments.forEach((seg, i) => {
    if (i === 0) out.push(...seg.snappedCoords);
    else out.push(...seg.snappedCoords.slice(1));
  });
  return out;
}

export function totalDistance(segments: Segment[]): number {
  if (segments.length === 0) return 0;
  const line = mergedLine(segments);
  if (line.length < 2) return segments.reduce((a, s) => a + s.distanceM, 0);
  return lineLength(line);
}

export function lastSnappedPoint(segments: Segment[]): LngLat | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const c = segments[i].snappedCoords;
    if (c.length) return c[c.length - 1];
  }
  return null;
}

export function firstSnappedPoint(segments: Segment[]): LngLat | null {
  for (const seg of segments) {
    if (seg.snappedCoords.length) return seg.snappedCoords[0];
  }
  return null;
}
