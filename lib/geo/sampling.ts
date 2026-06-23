import type { LngLat } from "@/types";

export function rdpSimplify(points: LngLat[], epsilon = 5e-5): LngLat[] {
  if (points.length < 3) return points.slice();
  const stack: [number, number][] = [[0, points.length - 1]];
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i], points[s], points[e]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxDist > epsilon) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpDistance(p: LngLat, a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    const ddx = p[0] - a[0];
    const ddy = p[1] - a[1];
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  const num = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]);
  const den = Math.sqrt(dy * dy + dx * dx);
  return num / den;
}
