'use client';

import React from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { gridToScreen } from '@/components/game/utils';
import { TableMetadata } from '@/types/database';
import { 
  Table2, 
  Activity, 
  Layers, 
  Database, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Search,
  Key
} from 'lucide-react';

interface CityHolographicOverlayProps {
  viewport: {
    offset: { x: number; y: number };
    zoom: number;
    canvasSize: { width: number; height: number };
  } | null;
}

export function CityHolographicOverlay({ viewport }: CityHolographicOverlayProps) {
  const { 
    activeDatabase, 
    selectedTable, 
    focusTable, 
    activeMission, 
    showHolographicLabels 
  } = useQueryPilot();

  if (!viewport || !showHolographicLabels) return null;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getCategoryColor = (category: TableMetadata['category']) => {
    switch (category) {
      case 'fact':
        return {
          border: 'border-cyan-400/60',
          bg: 'bg-cyan-950/80 hover:bg-cyan-900/90',
          badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
          glow: 'shadow-[0_0_20px_rgba(6,182,212,0.35)]',
        };
      case 'entity':
        return {
          border: 'border-emerald-400/60',
          bg: 'bg-emerald-950/80 hover:bg-emerald-900/90',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
          glow: 'shadow-[0_0_20px_rgba(16,185,129,0.35)]',
        };
      case 'dimension':
        return {
          border: 'border-purple-400/60',
          bg: 'bg-purple-950/80 hover:bg-purple-900/90',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
          glow: 'shadow-[0_0_20px_rgba(168,85,247,0.35)]',
        };
      case 'log':
        return {
          border: 'border-amber-400/60',
          bg: 'bg-amber-950/80 hover:bg-amber-900/90',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
          glow: 'shadow-[0_0_20px_rgba(245,158,11,0.35)]',
        };
      default:
        return {
          border: 'border-slate-500/60',
          bg: 'bg-slate-900/80 hover:bg-slate-850',
          badge: 'bg-slate-700/40 text-slate-300 border-slate-600/30',
          glow: 'shadow-[0_0_15px_rgba(100,116,139,0.2)]',
        };
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden">
      {activeDatabase.tables.map((table) => {
        const isSelected = selectedTable?.id === table.id;
        const isMissionActive = activeMission?.activeTableIds?.includes(table.id);

        // Center calculation
        const cx = table.gridX + (table.width || 2) / 2;
        const cy = table.gridY + (table.height || 2) / 2;

        const { screenX, screenY } = gridToScreen(cx, cy, 0, 0);

        // Scale and shift into screen DOM coordinates
        const domX = screenX * viewport.zoom + viewport.offset.x;
        // Float label above building height (higher for bigger row counts)
        const buildingElevation = (table.rowCount > 1000000 ? 70 : 48) * viewport.zoom;
        const domY = screenY * viewport.zoom + viewport.offset.y - buildingElevation;

        // Cull tags out of screen view
        if (
          domX < -150 ||
          domX > viewport.canvasSize.width + 150 ||
          domY < -100 ||
          domY > viewport.canvasSize.height + 100
        ) {
          return null;
        }

        const colors = getCategoryColor(table.category);

        return (
          <div
            key={table.id}
            className="absolute transition-all duration-150 ease-out"
            style={{
              left: `${domX}px`,
              top: `${domY}px`,
              transform: `translate(-50%, -100%) scale(${Math.max(0.72, Math.min(1.15, viewport.zoom))})`,
              transformOrigin: 'bottom center',
            }}
          >
            {/* Holographic Projection Stem / Anchor */}
            <div className="relative flex flex-col items-center">
              {/* Active Mission Holographic Beacon Beam */}
              {isMissionActive && (
                <div className="absolute -top-16 flex flex-col items-center pointer-events-none">
                  {/* Glowing vertical beam */}
                  <div className="w-1 h-16 bg-gradient-to-t from-cyan-400 to-transparent animate-pulse" />
                  {/* Expanding radar rings */}
                  <div className="absolute -top-3 w-8 h-8 rounded-full border border-cyan-400 animate-ping opacity-75" />
                  <div className="absolute -top-5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-400 text-cyan-300 text-[9px] font-mono whitespace-nowrap shadow-lg shadow-cyan-500/50">
                    <Zap className="w-2.5 h-2.5 text-cyan-400 animate-bounce" />
                    <span>QUERY EXECUTION</span>
                  </div>
                </div>
              )}

              {/* Main Table Holographic Pill */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  focusTable(table);
                }}
                className={`pointer-events-auto cursor-pointer flex items-center gap-2 px-2.5 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-200 select-none ${colors.bg} ${
                  isSelected
                    ? 'border-cyan-300 ring-2 ring-cyan-400/80 shadow-[0_0_30px_rgba(6,182,212,0.6)] scale-105'
                    : isMissionActive
                    ? `${colors.border} ring-1 ring-cyan-400/50 ${colors.glow} animate-pulse`
                    : `${colors.border} ${colors.glow} hover:scale-105 hover:border-cyan-300`
                }`}
              >
                {/* Table Icon / Category Indicator */}
                <div className="flex items-center gap-1.5">
                  <Table2 className="w-3.5 h-3.5 text-slate-200" />
                  <span className="font-mono font-bold text-xs text-white tracking-wide">
                    {table.name}
                  </span>
                </div>

                {/* Category Badge */}
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${colors.badge}`}
                >
                  {table.category}
                </span>

                {/* Row Count Pill */}
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-[10px] font-mono text-slate-300">
                  <Activity className="w-2.5 h-2.5 text-cyan-400" />
                  <span>{formatNumber(table.rowCount)}</span>
                </div>

                {/* Primary Key indicator */}
                {table.primaryKey && (
                  <span title={`Primary Key: ${table.primaryKey}`}>
                    <Key className="w-2.5 h-2.5 text-amber-400" />
                  </span>
                )}
              </div>

              {/* Downward indicator triangle */}
              <div
                className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] ${
                  isSelected ? 'border-t-cyan-300' : 'border-t-cyan-500/40'
                }`}
              />

              {/* Pulsing Base Ring */}
              <div
                className={`w-2.5 h-1 rounded-full mt-0.5 ${
                  isSelected ? 'bg-cyan-400 animate-ping' : 'bg-cyan-500/30'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}