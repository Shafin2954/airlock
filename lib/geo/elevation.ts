import type { LngLat } from "@/types";

export type ElevationPoint = { dist: number; ele: number; coord: LngLat };

export type ElevationProfile = {
  points: ElevationPoint[];
  gain: number;
  loss: number;
  min: number;
  max: number;
};

export async function fetchElevations(coords: LngLat[]): Promise<number[]> {
  const res = await fetch("/api/elevation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coordinates: coords }),
  });
  if (!res.ok) throw new Error(`Elevation error: ${res.status}`);
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation ?? [];
}

// Build a profile, smoothing out small noise (<1m) when summing gain/loss.
export function buildProfile(
  samples: { coord: LngLat; dist: number }[],
  elevations: number[],
): ElevationProfile {
  const points: ElevationPoint[] = samples.map((s, i) => ({
    dist: s.dist,
    ele: typeof elevations[i] === "number" ? elevations[i] : 0,
    coord: s.coord,
  }));
  let gain = 0;
  let loss = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const e = points[i].ele;
    if (e < min) min = e;
    if (e > max) max = e;
    if (i > 0) {
      const delta = e - points[i - 1].ele;
      if (delta > 1) gain += delta;
      else if (delta < -1) loss += -delta;
    }
  }
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 0;
  return { points, gain, loss, min, max };
}
