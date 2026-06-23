"use client";

import { useEffect, useState } from "react";
import {
  Footprints,
  Bike,
  Activity as ActivityIcon,
  MousePointer2,
  Pencil,
  Undo2,
  Trash2,
  Spline,
  Download,
  Link2,
  Sun,
  Moon,
} from "lucide-react";
import ToggleGroup from "./ToggleGroup";
import { useTrace, totalDistance, lastSnappedPoint, firstSnappedPoint, profileFor } from "@/lib/store";
import { formatDistance } from "@/lib/geo/distance";
import { fetchRoute } from "@/lib/mapbox/client";
import { lineLength } from "@/lib/geo/distance";
import { downloadGpx } from "@/lib/geo/gpx";
import { toHash } from "@/lib/geo/hash";
import { mergedLine } from "@/lib/store";
import type { Activity, Mode } from "@/types";

export default function SidePanel() {
  const state = useTrace();
  const segments = state.segments;
  const metersAll = totalDistance(segments);
  const hasRoute = segments.length > 0;
  const [copied, setCopied] = useState(false);

  async function closeLoop() {
    const start = firstSnappedPoint(segments);
    const end = lastSnappedPoint(segments);
    if (!start || !end) return;
    if (start[0] === end[0] && start[1] === end[1]) return;
    useTrace.setState({ isLoading: true, error: null });
    try {
      const profile = profileFor(state.activity);
      const result = await fetchRoute([end, start], profile);
      const distance = result.distance || lineLength(result.geometry);
      useTrace.getState().addSegment({
        id: `c${Date.now()}`,
        mode: "waypoint",
        profile,
        rawCoords: [end, start],
        snappedCoords: result.geometry,
        distanceM: distance,
      });
    } catch (err) {
      useTrace.setState({ error: (err as Error).message });
    } finally {
      useTrace.setState({ isLoading: false });
    }
  }

  function exportGpx() {
    const coords = mergedLine(segments);
    if (coords.length < 2) return;
    downloadGpx(coords);
  }

  async function share() {
    const hash = toHash(segments, state.activity, state.units, state.style);
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    history.replaceState(null, "", `#${hash}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Share URL", url);
    }
  }

  useEffect(() => {
    if (segments.length === 0 && location.hash) {
      history.replaceState(null, "", location.pathname);
    } else if (segments.length > 0) {
      const hash = toHash(segments, state.activity, state.units, state.style);
      history.replaceState(null, "", `#${hash}`);
    }
  }, [segments, state.activity, state.units, state.style]);

  return (
    <aside className="pointer-events-auto absolute left-4 top-4 z-10 flex w-[330px] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/90 p-4 shadow-xl backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/85">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-white">
            <Spline className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Trace</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">freehand route planner</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => state.setStyle(state.style === "light" ? "dark" : "light")}
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label="Toggle theme"
        >
          {state.style === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </header>

      <div className="rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100 p-3.5 dark:from-zinc-800/70 dark:to-zinc-800/40">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Total distance
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {formatDistance(metersAll, state.units)}
          </div>
          <button
            type="button"
            onClick={() => state.setUnits(state.units === "km" ? "mi" : "km")}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {state.units}
          </button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {segments.length} {segments.length === 1 ? "segment" : "segments"}
          {state.isLoading && <span className="ml-2 text-cyan-600 dark:text-cyan-400">routing…</span>}
        </div>
      </div>

      <ToggleGroup<Mode>
        label="Draw mode"
        value={state.mode}
        onChange={(v) => state.setMode(v)}
        options={[
          { value: "waypoint", label: "Waypoints", icon: <MousePointer2 className="h-3.5 w-3.5" /> },
          { value: "freehand", label: "Freehand", icon: <Pencil className="h-3.5 w-3.5" /> },
        ]}
      />

      <ToggleGroup<Activity>
        label="Activity"
        value={state.activity}
        onChange={(v) => state.setActivity(v)}
        options={[
          { value: "walk", label: "Walk", icon: <Footprints className="h-3.5 w-3.5" /> },
          { value: "run", label: "Run", icon: <ActivityIcon className="h-3.5 w-3.5" /> },
          { value: "bike", label: "Bike", icon: <Bike className="h-3.5 w-3.5" /> },
        ]}
      />

      <div className="grid grid-cols-2 gap-2">
        <PanelButton onClick={state.undo} disabled={segments.length === 0}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </PanelButton>
        <PanelButton onClick={state.clear} disabled={segments.length === 0}>
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </PanelButton>
        <PanelButton onClick={closeLoop} disabled={segments.length < 2}>
          <Spline className="h-3.5 w-3.5" /> Close loop
        </PanelButton>
        <PanelButton onClick={exportGpx} disabled={!hasRoute}>
          <Download className="h-3.5 w-3.5" /> Export GPX
        </PanelButton>
      </div>

      <button
        type="button"
        onClick={share}
        disabled={!hasRoute}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
      >
        <Link2 className="h-3.5 w-3.5" /> {copied ? "Link copied" : "Copy share link"}
      </button>

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </div>
      )}

      <footer className="border-t border-zinc-200 pt-3 text-[10.5px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {state.mode === "freehand" ? (
          <>Click and drag on the map to trace a route. It snaps to roads and paths as you go.</>
        ) : (
          <>Click points on the map to drop waypoints. The route follows the road network between them.</>
        )}
      </footer>
    </aside>
  );
}

function PanelButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700/70 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
    >
      {children}
    </button>
  );
}

