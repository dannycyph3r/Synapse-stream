import type { Metadata } from "next";
import { Suspense } from "react";
import { GameScreen } from "@/components/game/GameScreen";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <GameScreen />
    </Suspense>
  );
}
