"use client";

import { useCallback, useEffect, useState } from "react";
import MapCanvas from "./map/MapCanvas";
import RouteLayers from "./map/RouteLayers";
import WaypointController from "./map/WaypointController";
import FreehandController from "./map/FreehandController";
import SidePanel from "./panel/SidePanel";
import ElevationProfile from "./panel/ElevationProfile";
import { useTrace } from "@/lib/store";
import { fromHash } from "@/lib/geo/hash";
import type { LngLat } from "@/types";

export default function MapShell() {
  const [rawPreview, setRawPreview] = useState<LngLat[]>([]);
  const setStateBulk = useTrace((s) => s.hydrate);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const restored = fromHash(hash);
    if (!restored) return;
    setStateBulk({
      segments: restored.segments,
      activity: restored.activity,
      units: restored.units,
      style: restored.style,
    });
  }, [setStateBulk]);

  const handlePreview = useCallback((c: LngLat[]) => {
    setRawPreview(c);
  }, []);

  return (
    <div className="relative h-full w-full">
      <MapCanvas>
        <RouteLayers rawPreview={rawPreview} />
        <WaypointController />
        <FreehandController onPreviewChange={handlePreview} />
      </MapCanvas>
      <SidePanel />
      <ElevationProfile />
    </div>
  );
}
