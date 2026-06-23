export type SavedRoute = {
  id: string;
  name: string;
  hash: string;
  distanceM: number;
  createdAt: number;
};

const KEY = "trace.savedRoutes.v1";

export function listSavedRoutes(): SavedRoute[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRoute[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

function write(routes: SavedRoute[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(routes));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function saveRoute(name: string, hash: string, distanceM: number): SavedRoute {
  const route: SavedRoute = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled route",
    hash,
    distanceM,
    createdAt: Date.now(),
  };
  write([route, ...listSavedRoutes()]);
  return route;
}

export function deleteRoute(id: string): SavedRoute[] {
  const next = listSavedRoutes().filter((r) => r.id !== id);
  write(next);
  return next;
}
