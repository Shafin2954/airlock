import { NextResponse } from "next/server";

export const runtime = "edge";

const TOKEN = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Body = {
  coordinates: [number, number][];
  profile: "walking" | "cycling" | "driving";
};

export async function POST(req: Request) {
  if (!TOKEN) {
    return NextResponse.json({ error: "Mapbox token not configured" }, { status: 500 });
  }
  const body = (await req.json()) as Body;
  const { coordinates, profile } = body;
  if (!coordinates || coordinates.length < 2) {
    return NextResponse.json({ error: "need >=2 coordinates" }, { status: 400 });
  }

  const coordsStr = coordinates.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsStr}?geometries=geojson&overview=full&access_token=${TOKEN}`;

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "upstream error", status: upstream.status },
      { status: 502 },
    );
  }
  const data = await upstream.json();
  const route = data.routes?.[0];
  if (!route) {
    return NextResponse.json({ error: "no route" }, { status: 404 });
  }
  return NextResponse.json({
    geometry: route.geometry.coordinates,
    distance: route.distance,
  });
}
