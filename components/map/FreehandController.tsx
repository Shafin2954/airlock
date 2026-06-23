"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "./MapContext";
import { useTrace, profileFor } from "@/lib/store";
import { fetchMatch } from "@/lib/mapbox/client";
import { chunkWithOverlap, stitchSnapped } from "@/lib/mapbox/chunk";
import { rdpSimplify } from "@/lib/geo/sampling";
import { lineLength } from "@/lib/geo/distance";
import type { LngLat } from "@/types";

const MIN_PX = 8;
const THROTTLE_MS = 33;
const MAX_SAMPLES = 800;

export default function FreehandController({
  onPreviewChange,
}: {
  onPreviewChange: (coords: LngLat[]) => void;
}) {
  const map = useMap();
  const mode = useTrace((s) => s.mode);
  const activity = useTrace((s) => s.activity);
  const [hint, setHint] = useState(false);

  const bufferRef = useRef<LngLat[]>([]);
  const lastPxRef = useRef<{ x: number; y: number } | null>(null);
  const lastSampleAtRef = useRef(0);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (mode !== "freehand") return;
    setHint(true);
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();

    const reset = () => {
      bufferRef.current = [];
      lastPxRef.current = null;
      lastSampleAtRef.current = 0;
      drawingRef.current = false;
      onPreviewChange([]);
    };

    const finish = async () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const samples = bufferRef.current;
      bufferRef.current = [];
      lastPxRef.current = null;
      if (samples.length < 2) {
        onPreviewChange([]);
        return;
      }
      const simplified = rdpSimplify(samples, 5e-5);
      const limited =
        simplified.length > MAX_SAMPLES
          ? simplified.filter((_, i) => i % Math.ceil(simplified.length / MAX_SAMPLES) === 0)
          : simplified;
      const chunks = chunkWithOverlap(limited, 95, 5);
      const profile = profileFor(activity);
      useTrace.setState({ isLoading: true, error: null });
      try {
        const responses = await Promise.all(
          chunks.map((c) => fetchMatch(c, profile)),
        );
        const matchedChunks = responses.map((r) => r.geometry).filter((g) => g.length > 0);
        if (matchedChunks.length === 0) {
          useTrace.setState({ error: "Could not snap that drag to a road" });
          onPreviewChange([]);
          return;
        }
        const snapped = stitchSnapped(matchedChunks, 5);
        const distance = lineLength(snapped);
        useTrace.getState().addSegment({
          id: `f${Date.now()}`,
          mode: "freehand",
          profile,
          rawCoords: samples,
          snappedCoords: snapped,
          distanceM: distance,
        });
        onPreviewChange([]);
      } catch (err) {
        useTrace.setState({ error: (err as Error).message });
        onPreviewChange([]);
      } finally {
        useTrace.setState({ isLoading: false });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      drawingRef.current = true;
      useTrace.setState({ isDrawing: true });
      setHint(false);
      const rect = canvas.getBoundingClientRect();
      const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const lngLat = map.unproject([px.x, px.y]);
      bufferRef.current = [[lngLat.lng, lngLat.lat]];
      lastPxRef.current = px;
      lastSampleAtRef.current = performance.now();
      onPreviewChange(bufferRef.current.slice());
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const now = performance.now();
      if (now - lastSampleAtRef.current < THROTTLE_MS) return;
      const rect = canvas.getBoundingClientRect();
      const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const last = lastPxRef.current;
      if (last) {
        const dx = px.x - last.x;
        const dy = px.y - last.y;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_PX) return;
      }
      const lngLat = map.unproject([px.x, px.y]);
      bufferRef.current.push([lngLat.lng, lngLat.lat]);
      lastPxRef.current = px;
      lastSampleAtRef.current = now;
      onPreviewChange(bufferRef.current.slice());
    };

    const onPointerUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      useTrace.setState({ isDrawing: false });
      void finish();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      useTrace.setState({ isDrawing: false });
      reset();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.style.cursor = "";
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      reset();
      setHint(false);
    };
  }, [map, mode, activity, onPreviewChange]);

  if (mode !== "freehand" || !hint) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-zinc-900/85 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
      Click and drag to trace your route
    </div>
  );
}
