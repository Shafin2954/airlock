import { NextResponse } from "next/server";

export const runtime = "edge";

type Body = {
  coordinates: [number, number][];
};

// Open-Meteo elevation API — free, keyless, up to 100 coords per request.
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const coords = body.coordinates;
  if (!coords || coords.length === 0) {
    return NextResponse.json({ error: "no coordinates" }, { status: 400 });
  }
  const pts = coords.slice(0, 100);
  const lats = pts.map((c) => c[1].toFixed(6)).join(",");
  const lngs = pts.map((c) => c[0].toFixed(6)).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "upstream error", status: upstream.status },
      { status: 502 },
    );
  }
  const data = await upstream.json();
  return NextResponse.json({ elevation: data.elevation ?? [] });
}
