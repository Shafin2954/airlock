"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapContext } from "./MapContext";
import { useTrace } from "@/lib/store";

const STYLES = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type Props = {
  children?: React.ReactNode;
  initialCenter?: [number, number];
  initialZoom?: number;
};

export default function MapCanvas({
  children,
  initialCenter = [-73.9857, 40.7484],
  initialZoom = 13,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const style = useTrace((s) => s.style);
  const hasToken = TOKEN.length > 0;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasToken) return;
    mapboxgl.accessToken = TOKEN;
    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[style],
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: true,
    });
    mapRef.current = m;
    m.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "bottom-right");
    m.on("load", () => setMap(m));
    return () => {
      m.remove();
      mapRef.current = null;
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  useEffect(() => {
    if (!map) return;
    map.setStyle(STYLES[style]);
  }, [style, map]);

  if (!hasToken) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 p-8">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-xl font-semibold">Mapbox token missing</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Add <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> and{" "}
            <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-xs">MAPBOX_TOKEN</code> to{" "}
            <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-xs">.env.local</code> and restart the dev server.
          </p>
          <p className="text-xs text-zinc-500">
            Get a free token at{" "}
            <a
              href="https://account.mapbox.com/access-tokens"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              mapbox.com
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      {map ? <MapContext.Provider value={map}>{children}</MapContext.Provider> : null}
    </div>
  );
}
