"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./MapContext";
import { useTrace, mergedLine, firstSnappedPoint, lastSnappedPoint } from "@/lib/store";
import type { LngLat } from "@/types";

const RAW_SRC = "trace-raw";
const SNAP_SRC = "trace-snap";
const PIN_SRC = "trace-pins";
const HOVER_SRC = "trace-hover";

function emptyLine() {
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: [] as LngLat[] },
    properties: {},
  };
}
function emptyPoints() {
  return { type: "FeatureCollection" as const, features: [] as GeoJSON.Feature[] };
}

function addLayers(map: mapboxgl.Map) {
  if (!map.getSource(RAW_SRC)) {
    map.addSource(RAW_SRC, { type: "geojson", data: emptyLine() });
  }
  if (!map.getSource(SNAP_SRC)) {
    map.addSource(SNAP_SRC, { type: "geojson", data: emptyLine() });
  }
  if (!map.getSource(PIN_SRC)) {
    map.addSource(PIN_SRC, { type: "geojson", data: emptyPoints() });
  }
  if (!map.getSource(HOVER_SRC)) {
    map.addSource(HOVER_SRC, { type: "geojson", data: emptyPoints() });
  }
  if (!map.getLayer("snap-casing")) {
    map.addLayer({
      id: "snap-casing",
      type: "line",
      source: SNAP_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1d1d1f", "line-width": 7, "line-opacity": 0.9 },
    });
  }
  if (!map.getLayer("snap-line")) {
    map.addLayer({
      id: "snap-line",
      type: "line",
      source: SNAP_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#22d3ee", "line-width": 4 },
    });
  }
  if (!map.getLayer("raw-line")) {
    map.addLayer({
      id: "raw-line",
      type: "line",
      source: RAW_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#22d3ee",
        "line-width": 3,
        "line-opacity": 0.65,
        "line-dasharray": [1.5, 1.5],
      },
    });
  }
  if (!map.getLayer("pin-outer")) {
    map.addLayer({
      id: "pin-outer",
      type: "circle",
      source: PIN_SRC,
      paint: {
        "circle-radius": 9,
        "circle-color": "#fff",
        "circle-stroke-color": "#1d1d1f",
        "circle-stroke-width": 2,
      },
    });
  }
  if (!map.getLayer("pin-inner")) {
    map.addLayer({
      id: "pin-inner",
      type: "circle",
      source: PIN_SRC,
      paint: {
        "circle-radius": 4,
        "circle-color": ["case", ["==", ["get", "kind"], "start"], "#16a34a", ["==", ["get", "kind"], "end"], "#dc2626", "#1d1d1f"],
      },
    });
  }
  if (!map.getLayer("hover-halo")) {
    map.addLayer({
      id: "hover-halo",
      type: "circle",
      source: HOVER_SRC,
      paint: {
        "circle-radius": 11,
        "circle-color": "#22d3ee",
        "circle-opacity": 0.25,
      },
    });
  }
  if (!map.getLayer("hover-dot")) {
    map.addLayer({
      id: "hover-dot",
      type: "circle",
      source: HOVER_SRC,
      paint: {
        "circle-radius": 5,
        "circle-color": "#22d3ee",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
  }
}

export default function RouteLayers({ rawPreview }: { rawPreview: LngLat[] }) {
  const map = useMap();
  const segments = useTrace((s) => s.segments);
  const stylekey = useTrace((s) => s.style);
  const hoverPoint = useTrace((s) => s.hoverPoint);
  const installed = useRef(false);

  // Install layers (and reinstall when style changes)
  useEffect(() => {
    installed.current = false;
    const tryInstall = () => {
      if (!map.isStyleLoaded()) return;
      addLayers(map);
      installed.current = true;
      paint();
    };
    const onStyleData = () => {
      if (!installed.current && map.isStyleLoaded()) tryInstall();
    };
    tryInstall();
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, stylekey]);

  // Paint snap source
  function paint() {
    const snapSrc = map.getSource(SNAP_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (snapSrc) {
      const coords = mergedLine(segments);
      snapSrc.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      });
    }
    const pinSrc = map.getSource(PIN_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (pinSrc) {
      const features: GeoJSON.Feature[] = [];
      const start = firstSnappedPoint(segments);
      const end = lastSnappedPoint(segments);
      if (start) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: start },
          properties: { kind: "start" },
        });
      }
      if (end && (!start || end[0] !== start[0] || end[1] !== start[1])) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: end },
          properties: { kind: "end" },
        });
      }
      pinSrc.setData({ type: "FeatureCollection", features });
    }
  }

  useEffect(() => {
    if (!installed.current) return;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  useEffect(() => {
    if (!installed.current) return;
    const hoverSrc = map.getSource(HOVER_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (!hoverSrc) return;
    hoverSrc.setData({
      type: "FeatureCollection",
      features: hoverPoint
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: hoverPoint },
              properties: {},
            },
          ]
        : [],
    });
  }, [hoverPoint, map]);

  useEffect(() => {
    if (!installed.current) return;
    const rawSrc = map.getSource(RAW_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (!rawSrc) return;
    rawSrc.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: rawPreview },
      properties: {},
    });
  }, [rawPreview, map]);

  return null;
}
