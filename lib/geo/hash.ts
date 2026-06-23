import type { Activity, Segment, StyleKey, Units } from "@/types";
import { decodePolyline, encodePolyline } from "./polyline";

type HashPayload = {
  v: 1;
  a: Activity;
  u: Units;
  st: StyleKey;
  s: { m: "w" | "f"; pr: string; e: string; d: number }[];
};

export function toHash(
  segments: Segment[],
  activity: Activity,
  units: Units,
  style: StyleKey,
): string {
  const payload: HashPayload = {
    v: 1,
    a: activity,
    u: units,
    st: style,
    s: segments.map((seg) => ({
      m: seg.mode === "freehand" ? "f" : "w",
      pr: seg.profile,
      e: encodePolyline(seg.snappedCoords),
      d: Math.round(seg.distanceM),
    })),
  };
  const json = JSON.stringify(payload);
  return base64UrlEncode(json);
}

export function fromHash(hash: string): {
  segments: Segment[];
  activity: Activity;
  units: Units;
  style: StyleKey;
} | null {
  try {
    const json = base64UrlDecode(hash);
    const payload = JSON.parse(json) as HashPayload;
    if (payload.v !== 1) return null;
    const segments: Segment[] = payload.s.map((s, i) => {
      const coords = decodePolyline(s.e);
      return {
        id: `r${i}`,
        mode: s.m === "f" ? "freehand" : "waypoint",
        profile: (s.pr as Segment["profile"]) ?? "walking",
        rawCoords: coords,
        snappedCoords: coords,
        distanceM: s.d,
      };
    });
    return {
      segments,
      activity: payload.a ?? "walk",
      units: payload.u ?? "km",
      style: payload.st ?? "light",
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(s: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(s, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  if (typeof window === "undefined") {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  return decodeURIComponent(escape(atob(b64)));
}
