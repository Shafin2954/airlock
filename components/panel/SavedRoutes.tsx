"use client";

import { useState } from "react";
import { Bookmark, ChevronDown, Trash2 } from "lucide-react";
import { useTrace, totalDistance } from "@/lib/store";
import { toHash, fromHash } from "@/lib/geo/hash";
import { formatDistance } from "@/lib/geo/distance";
import { listSavedRoutes, saveRoute, deleteRoute, type SavedRoute } from "@/lib/storage";

export default function SavedRoutes() {
  const state = useTrace();
  const segments = state.segments;
  const [routes, setRoutes] = useState<SavedRoute[]>(() => listSavedRoutes());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function handleSave() {
    if (segments.length === 0) return;
    const hash = toHash(segments, state.activity, state.units, state.style);
    saveRoute(name, hash, totalDistance(segments));
    setRoutes(listSavedRoutes());
    setName("");
  }

  function handleLoad(route: SavedRoute) {
    const restored = fromHash(route.hash);
    if (!restored) return;
    state.hydrate({
      segments: restored.segments,
      activity: restored.activity,
      units: restored.units,
      style: restored.style,
      hoverPoint: null,
    });
  }

  function handleDelete(id: string) {
    setRoutes(deleteRoute(id));
  }

  return (
    <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
      >
        <span className="inline-flex items-center gap-1.5">
          <Bookmark className="h-3 w-3" /> Saved routes
          {routes.length > 0 && (
            <span className="rounded-full bg-zinc-200 px-1.5 text-[9px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {routes.length}
            </span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2.5 space-y-2">
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Name this route"
              disabled={segments.length === 0}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none placeholder:text-zinc-400 focus:border-cyan-400 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800/60"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={segments.length === 0}
              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>

          {routes.length === 0 ? (
            <div className="py-1 text-[11px] text-zinc-400">No saved routes yet.</div>
          ) : (
            <ul className="space-y-1">
              {routes.map((r) => (
                <li
                  key={r.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(r)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium">{r.name}</span>
                    <span className="text-[10px] tabular-nums text-zinc-500">
                      {formatDistance(r.distanceM, state.units)} {state.units}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    className="rounded p-1 text-zinc-400 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                    aria-label="Delete route"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
