'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Building, GameState, Tile } from '@/types/game';
import { createInitialGameState, DEFAULT_GRID_SIZE } from '@/lib/simulation';
import { DEFAULT_SPRITE_PACK_ID, getSpritePack, setActiveSpritePack, type SpritePack } from '@/lib/renderConfig';

/**
 * World state for the isometric renderer. The world is built from the database (/api/world) and is
 * read-only: players watch agents work on it, they do not build on it, so the build-tool callbacks the
 * canvas expects are inert.
 */
type GameContextValue = {
  state: GameState;
  latestStateRef: React.RefObject<GameState>;
  currentSpritePack: SpritePack;
  visualHour: number;
  loadWorld: (grid: Tile[][], cityName: string) => void;
  patchTiles: (patches: { x: number; y: number; building: Partial<Building> }[]) => void;
  placeAtTile: (x: number, y: number) => void;
  finishTrackDrag: (pathTiles: { x: number; y: number }[], trackType: 'road' | 'rail') => void;
  connectToCity: (cityId: string) => void;
  checkAndDiscoverCities: (onDiscover?: (city: { id: string; direction: 'north' | 'south' | 'east' | 'west'; name: string }) => void) => void;
};

const GameContext = createContext<GameContextValue | null>(null);
const inert = () => {};

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(() => createInitialGameState(DEFAULT_GRID_SIZE, 'Schema City'));
  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  const [currentSpritePack] = useState<SpritePack>(() => getSpritePack(DEFAULT_SPRITE_PACK_ID));

  useEffect(() => {
    setActiveSpritePack(currentSpritePack);
  }, [currentSpritePack]);

  const loadWorld = useCallback((grid: Tile[][], cityName: string) => {
    setState((prev) => {
      const updated: GameState = {
        ...prev,
        grid,
        gridSize: grid.length,
        cityName,
        speed: 1,
        hour: 12,
        disastersEnabled: false,
        selectedTool: 'select',
        waterBodies: [],
        gameVersion: (prev.gameVersion ?? 0) + 1,
      };
      latestStateRef.current = updated;
      return updated;
    });
  }, []);

  const patchTiles = useCallback((patches: { x: number; y: number; building: Partial<Building> }[]) => {
    if (!patches.length) return;
    setState((prev) => {
      const grid = prev.grid.slice();
      const touchedRows = new Set<number>();
      for (const p of patches) {
        if (!grid[p.y]?.[p.x]) continue;
        if (!touchedRows.has(p.y)) { grid[p.y] = grid[p.y].slice(); touchedRows.add(p.y); }
        const tile = grid[p.y][p.x];
        grid[p.y][p.x] = { ...tile, building: { ...tile.building, ...p.building } };
      }
      const updated: GameState = { ...prev, grid };
      latestStateRef.current = updated;
      return updated;
    });
  }, []);

  const value: GameContextValue = {
    state,
    latestStateRef,
    currentSpritePack,
    visualHour: state.hour,
    loadWorld,
    patchTiles,
    placeAtTile: inert,
    finishTrackDrag: inert,
    connectToCity: inert,
    checkAndDiscoverCities: inert,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
