'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useGame } from '@/context/GameContext';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CanvasIsometricGrid } from '@/components/game/CanvasIsometricGrid';
import { MiniMap } from '@/components/game/MiniMap';
import { TopNavigation } from '@/components/dashboard/TopNavigation';
import { DatabaseOverviewPanel } from '@/components/dashboard/DatabaseOverviewPanel';
import { MayorCommandCenter } from '@/components/dashboard/MayorCommandCenter';
import { AgentControlCenter } from '@/components/dashboard/AgentControlCenter';
import { InvestigationTimeline } from '@/components/dashboard/InvestigationTimeline';
import { TableInspectorModal } from '@/components/dashboard/TableInspectorModal';
import { SchemaMapView } from '@/components/dashboard/SchemaMapView';
import { MissionsView } from '@/components/dashboard/MissionsView';
import { ResultsView } from '@/components/dashboard/ResultsView';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { OverlayMode } from '@/components/game/types';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

export default function Game() {
  const { state, loadSchemaCity } = useGame();
  const { 
    activeDatabase, 
    activeView, 
    navigationTarget, 
    selectedTable, 
    selectTable 
  } = useQueryPilot();

  const [overlayMode, setOverlayMode] = useState<OverlayMode>('none');
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<{
    offset: { x: number; y: number };
    zoom: number;
    canvasSize: { width: number; height: number };
  } | null>(null);

  // Sync schema changes to city grid
  useEffect(() => {
    if (loadSchemaCity && activeDatabase) {
      loadSchemaCity(activeDatabase);
    }
  }, [activeDatabase, loadSchemaCity]);

  // When selectedTile is clicked on canvas, find associated table
  useEffect(() => {
    if (selectedTile) {
      const table = activeDatabase.tables.find(
        (t) =>
          selectedTile.x >= t.gridX &&
          selectedTile.x < t.gridX + (t.width || 2) &&
          selectedTile.y >= t.gridY &&
          selectedTile.y < t.gridY + (t.height || 2)
      );
      if (table) {
        selectTable(table);
      }
    }
  }, [selectedTile, activeDatabase.tables, selectTable]);

  return (
    <TooltipProvider>
      <div className="relative w-screen h-screen overflow-hidden bg-[#090d16] select-none">
        {/* Top Navigation */}
        <TopNavigation />

        {/* Dynamic View Layering */}
        {activeView === 'schema' && <SchemaMapView />}
        {activeView === 'missions' && <MissionsView />}
        {activeView === 'results' && <ResultsView />}
        {activeView === 'settings' && <SettingsView />}

        {/* Center: Visually Dominant Isometric Canvas Engine */}
        <div className="w-full h-full relative overflow-hidden">
          <CanvasIsometricGrid
            overlayMode={overlayMode}
            selectedTile={selectedTile}
            setSelectedTile={setSelectedTile}
            navigationTarget={navigationTarget}
            onViewportChange={setViewport}
          />

          {/* Quick HUD Controls: Reset Camera, Minimap */}
          <div className="absolute top-20 right-84 z-20 flex flex-col gap-1.5 bg-[#0a0f1d]/80 backdrop-blur-md border border-cyan-500/30 p-1.5 rounded-xl shadow-lg">
            <button
              onClick={() => setSelectedTile({ x: 28, y: 28 })}
              className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
              title="Center Database City"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Minimap in corner */}
          <MiniMap
            onNavigate={(x, y) => setSelectedTile({ x, y })}
            viewport={viewport}
          />
        </div>

        {/* City View Floating Dashboard Panels */}
        {activeView === 'city' && (
          <>
            {/* Top-Left: Database Overview */}
            <DatabaseOverviewPanel />

            {/* Bottom-Left: Mayor's Command Center (Mission Dispatcher) */}
            <MayorCommandCenter />

            {/* Right Sidebar: AI Agent Control Center */}
            <AgentControlCenter />

            {/* Bottom-Right: Live Investigation Timeline */}
            <InvestigationTimeline />

            {/* Table Schema Inspector Slide-Over / Modal */}
            <TableInspectorModal />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
