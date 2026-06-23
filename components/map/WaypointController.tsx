"use client";

import { useEffect } from "react";
import { useMap } from "./MapContext";
import { useTrace, profileFor, lastSnappedPoint } from "@/lib/store";
import { fetchRoute } from "@/lib/mapbox/client";
import { lineLength } from "@/lib/geo/distance";
import type { LngLat } from "@/types";

export default function WaypointController() {
  const map = useMap();
  const mode = useTrace((s) => s.mode);
  const activity = useTrace((s) => s.activity);

  useEffect(() => {
    if (mode !== "waypoint") return;
    map.getCanvas().style.cursor = "crosshair";

    const onClick = async (e: mapboxgl.MapMouseEvent) => {
      const point: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const state = useTrace.getState();
      const last = lastSnappedPoint(state.segments) ?? state.waypoints[state.waypoints.length - 1];

      if (!last) {
        useTrace.setState({ waypoints: [point] });
        return;
      }

      useTrace.setState({ isLoading: true, error: null });
      try {
        const profile = profileFor(activity);
        const result = await fetchRoute([last, point], profile);
        const distance = result.distance || lineLength(result.geometry);
        useTrace.getState().addWaypoint(point, {
          id: `s${Date.now()}`,
          mode: "waypoint",
          profile,
          rawCoords: [last, point],
          snappedCoords: result.geometry,
          distanceM: distance,
        });
      } catch (err) {
        useTrace.setState({ error: (err as Error).message });
      } finally {
        useTrace.setState({ isLoading: false });
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [map, mode, activity]);

  return null;
}
