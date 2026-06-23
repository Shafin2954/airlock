"use client";

import dynamic from "next/dynamic";

const MapShell = dynamic(() => import("@/components/MapShell"), { ssr: false });

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapShell />
    </main>
  );
}
