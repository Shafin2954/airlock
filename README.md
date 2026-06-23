# Trace

Draw a route by hand on the map and watch it snap to real roads and trails. Designed for runners, hikers, and cyclists planning custom loops where Google Maps' "fastest route" isn't useful.

Two interaction modes:

- **Waypoints** — click points on the map; the route follows the road network between them.
- **Freehand** — press and drag across the map. Your finger-path is sampled, simplified, and snapped to the nearest road/trail network via Mapbox Map Matching.

Live total distance, walk/run/bike activity profiles, undo, close-the-loop, GPX export, and shareable URLs (the route is encoded into the URL hash, no backend).

## Stack

Next.js 15 App Router · TypeScript · Tailwind v4 · Mapbox GL JS v3 · Zustand · Edge route handlers proxying Mapbox Directions & Map Matching APIs.

## Local development

1. `cp .env.example .env.local` and drop in your Mapbox public token in both `MAPBOX_TOKEN` and `NEXT_PUBLIC_MAPBOX_TOKEN`. Get a free one at https://account.mapbox.com/access-tokens.
2. `npm install`
3. `npm run dev` → http://localhost:3000

## Deploy

Push to GitHub, import to Vercel, set the two env vars in the project settings, deploy.

## Layout

```
app/
  api/route/      Mapbox Directions proxy (waypoint mode)
  api/match/      Mapbox Map Matching proxy (freehand mode)
  page.tsx        single-page client shell
components/
  MapShell        composes map + side panel + URL hash sync
  map/            Mapbox canvas + GeoJSON layers + waypoint/freehand controllers
  panel/          side panel UI
lib/
  store.ts        zustand route state
  geo/            haversine, RDP simplify, polyline, GPX, URL hash
  mapbox/         chunk/stitch + client wrappers around /api/* routes
```
