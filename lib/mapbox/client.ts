import type { LngLat, Profile } from "@/types";

export type RouteResponse = {
  geometry: LngLat[];
  distance: number;
};

export async function fetchRoute(
  coordinates: LngLat[],
  profile: Profile,
): Promise<RouteResponse> {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coordinates, profile }),
  });
  if (!res.ok) throw new Error(`Route error: ${res.status}`);
  return res.json();
}

export async function fetchMatch(
  coordinates: LngLat[],
  profile: Profile,
): Promise<RouteResponse> {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coordinates, profile }),
  });
  if (!res.ok) throw new Error(`Match error: ${res.status}`);
  return res.json();
}
