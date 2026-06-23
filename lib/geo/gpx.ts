import type { LngLat } from "@/types";

export function buildGpx(coords: LngLat[], name = "Trace route"): string {
  const points = coords
    .map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trace" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

export function downloadGpx(coords: LngLat[], filename = "trace-route.gpx") {
  const blob = new Blob([buildGpx(coords)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
