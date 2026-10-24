'use client';

import React from 'react';
import { GameProvider } from '@/context/GameContext';
import { QueryPilotProvider } from '@/context/QueryPilotContext';
import Game from '@/components/Game';

export default function HomePage() {
  return (
    <GameProvider startFresh={true}>
      <QueryPilotProvider>
        <main className="w-screen h-screen overflow-hidden bg-[#090d16]">
          <Game />
        </main>
      </QueryPilotProvider>
    </GameProvider>
  );
}
