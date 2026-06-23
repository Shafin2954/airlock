"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mountain, X } from "lucide-react";
import { useTrace, mergedLine } from "@/lib/store";
import { resampleByDistance } from "@/lib/geo/resample";
import { buildProfile, fetchElevations, type ElevationProfile as Profile } from "@/lib/geo/elevation";
import { formatDistance } from "@/lib/geo/distance";

const VW = 1000;
const VH = 220;
const PAD = { top: 16, right: 14, bottom: 22, left: 40 };

export default function ElevationProfile() {
  const segments = useTrace((s) => s.segments);
  const units = useTrace((s) => s.units);
  const setHoverPoint = useTrace((s) => s.setHoverPoint);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Key that only changes when the route geometry meaningfully changes.
  const routeKey = useMemo(
    () => segments.map((s) => `${s.id}:${s.snappedCoords.length}`).join("|"),
    [segments],
  );

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const line = mergedLine(segments);
      if (line.length < 2) {
        if (!cancelled) setProfile(null);
        return;
      }
      setLoading(true);
      try {
        const samples = resampleByDistance(line, 80);
        const eles = await fetchElevations(samples.map((s) => s.coord));
        if (cancelled) return;
        setProfile(buildProfile(samples, eles));
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [routeKey, segments]);

  const geometry = useMemo(() => {
    if (!profile || profile.points.length < 2) return null;
    const pts = profile.points;
    const maxDist = pts[pts.length - 1].dist || 1;
    const lo = profile.min;
    const hi = profile.max;
    const span = hi - lo || 1;
    const innerW = VW - PAD.left - PAD.right;
    const innerH = VH - PAD.top - PAD.bottom;
    const x = (d: number) => PAD.left + (d / maxDist) * innerW;
    const y = (e: number) => PAD.top + innerH - ((e - lo) / span) * innerH;
    const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dist).toFixed(1)},${y(p.ele).toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${x(maxDist).toFixed(1)},${(VH - PAD.bottom).toFixed(1)} L${x(0).toFixed(1)},${(VH - PAD.bottom).toFixed(1)} Z`;
    return { x, y, linePath, areaPath, maxDist, lo, hi };
  }, [profile]);

  function onMove(e: React.PointerEvent) {
    if (!profile || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (profile.points.length - 1));
    setHoverIdx(idx);
    setHoverPoint(profile.points[idx].coord);
  }
  function onLeave() {
    setHoverIdx(null);
    setHoverPoint(null);
  }

  if (mergedLine(segments).length < 2) return null;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-zinc-200/80 bg-white/90 shadow-xl backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/85">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Mountain className="h-3.5 w-3.5 text-cyan-500" />
          Elevation
          {loading && <span className="font-normal text-cyan-600 dark:text-cyan-400">loading…</span>}
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <div className="flex items-center gap-3 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
              <span className="text-emerald-600 dark:text-emerald-400">↑ {Math.round(profile.gain)} m</span>
              <span className="text-rose-600 dark:text-rose-400">↓ {Math.round(profile.loss)} m</span>
              <span className="text-zinc-400">{Math.round(profile.min)}–{Math.round(profile.max)} m</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={open ? "Collapse" : "Expand"}
          >
            <X className={`h-3.5 w-3.5 transition ${open ? "" : "rotate-45"}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-2 pb-2">
          {geometry ? (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              className="h-[150px] w-full touch-none"
              preserveAspectRatio="none"
              onPointerMove={onMove}
              onPointerLeave={onLeave}
            >
              <defs>
                <linearGradient id="ele-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={geometry.areaPath} fill="url(#ele-fill)" />
              <path d={geometry.linePath} fill="none" stroke="#06b6d4" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" className="fill-zinc-400 text-[11px]">
                {Math.round(geometry.hi)}
              </text>
              <text x={PAD.left - 6} y={VH - PAD.bottom} textAnchor="end" className="fill-zinc-400 text-[11px]">
                {Math.round(geometry.lo)}
              </text>
              {hoverIdx !== null && profile && (
                <g>
                  <line
                    x1={geometry.x(profile.points[hoverIdx].dist)}
                    x2={geometry.x(profile.points[hoverIdx].dist)}
                    y1={PAD.top}
                    y2={VH - PAD.bottom}
                    stroke="#06b6d4"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={geometry.x(profile.points[hoverIdx].dist)}
                    cy={geometry.y(profile.points[hoverIdx].ele)}
                    r={4}
                    fill="#06b6d4"
                    stroke="#fff"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
            </svg>
          ) : (
            <div className="flex h-[150px] items-center justify-center text-xs text-zinc-400">
              {loading ? "Fetching elevation…" : "No elevation data"}
            </div>
          )}
          {hoverIdx !== null && profile && (
            <div className="px-3 pb-1 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
              {formatDistance(profile.points[hoverIdx].dist, units)} {units} · {Math.round(profile.points[hoverIdx].ele)} m
            </div>
          )}
        </div>
      )}
    </div>
  );
}
