import type { LngLat } from "@/types";

export function chunkWithOverlap(
  points: LngLat[],
  size = 95,
  overlap = 5,
): LngLat[][] {
  if (points.length <= size) return [points];
  const out: LngLat[][] = [];
  let start = 0;
  while (start < points.length) {
    const end = Math.min(start + size, points.length);
    out.push(points.slice(start, end));
    if (end === points.length) break;
    start = end - overlap;
  }
  return out;
}

export function stitchSnapped(chunks: LngLat[][], overlap = 5): LngLat[] {
  if (chunks.length === 0) return [];
  if (chunks.length === 1) return chunks[0];
  const out: LngLat[] = chunks[0].slice();
  for (let i = 1; i < chunks.length; i++) {
    const piece = chunks[i].slice(overlap);
    out.push(...piece);
  }
  return out;
}
