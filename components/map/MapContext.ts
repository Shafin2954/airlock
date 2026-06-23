"use client";
import { createContext, useContext } from "react";
import type mapboxgl from "mapbox-gl";

export const MapContext = createContext<mapboxgl.Map | null>(null);

export function useMap(): mapboxgl.Map {
  const m = useContext(MapContext);
  if (!m) throw new Error("MapContext not ready");
  return m;
}
