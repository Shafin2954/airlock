import polyline from "@mapbox/polyline";
import type { LngLat } from "@/types";

export function encodePolyline(coords: LngLat[], precision = 5): string {
  const latlngs = coords.map((c) => [c[1], c[0]] as [number, number]);
  return polyline.encode(latlngs, precision);
}

export function decodePolyline(str: string, precision = 5): LngLat[] {
  const latlngs = polyline.decode(str, precision);
  return latlngs.map(([lat, lng]) => [lng, lat] as LngLat);
}
