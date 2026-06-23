import type { LngLat } from "@/types";

const R = 6371008.8;

export function haversine(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineLength(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

export function formatDistance(meters: number, units: "km" | "mi"): string {
  if (units === "mi") {
    const mi = meters / 1609.344;
    return mi >= 10 ? mi.toFixed(1) : mi.toFixed(2);
  }
  const km = meters / 1000;
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}
