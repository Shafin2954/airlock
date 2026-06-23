import type { LngLat } from "@/types";
import { haversine } from "./distance";

// Returns up to `n` points spaced evenly by distance along the polyline,
// each paired with its cumulative distance (meters) from the start.
export function resampleByDistance(
  coords: LngLat[],
  n: number,
): { coord: LngLat; dist: number }[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) return [{ coord: coords[0], dist: 0 }];

  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [{ coord: coords[0], dist: 0 }];

  const count = Math.max(2, Math.min(n, 100));
  const out: { coord: LngLat; dist: number }[] = [];
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    let j = 1;
    while (j < cum.length && cum[j] < target) j++;
    if (j >= cum.length) {
      out.push({ coord: coords[coords.length - 1], dist: total });
      continue;
    }
    const segLen = cum[j] - cum[j - 1];
    const t = segLen === 0 ? 0 : (target - cum[j - 1]) / segLen;
    const a = coords[j - 1];
    const b = coords[j];
    out.push({
      coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      dist: target,
    });
  }
  return out;
}
