'use client';

import React from 'react';
import { Tile } from '@/types/game';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { Table2, Key, HardDrive, Activity, ExternalLink, Send, X } from 'lucide-react';

interface TileInfoPanelProps {
  tile: Tile;
  services?: any;
  onClose: () => void;
  isMobile?: boolean;
}

export function TileInfoPanel({ 
  tile, 
  onClose,
  isMobile = false
}: TileInfoPanelProps) {
  const { activeDatabase, selectTable, startInvestigation } = useQueryPilot();
  
  // Find associated database table
  const tableMetadata = (tile as any).tableMetadata || activeDatabase.tables.find(
    (t) => t.id === tile.building?.cityId || 
    (tile.x >= t.gridX && tile.x < t.gridX + (t.width || 2) && tile.y >= t.gridY && tile.y < t.gridY + (t.height || 2))
  );

  const handleOpenInspector = () => {
    if (tableMetadata) {
      selectTable(tableMetadata);
    }
  };

  const handleAudit = () => {
    if (tableMetadata) {
      startInvestigation(`Audit table ${tableMetadata.name} for referential anomalies and performance bottlenecks.`);
    }
  };

  return (
    <div className="absolute top-20 left-84 z-20 w-72 bg-[#0a0f1d]/95 backdrop-blur-md border border-cyan-400/50 rounded-xl shadow-2xl shadow-cyan-950/50 p-3.5 text-xs font-mono text-slate-200 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-slate-100">
            {tableMetadata ? tableMetadata.name : `Tile [${tile.x}, ${tile.y}]`}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 p-0.5 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {tableMetadata ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Category:</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold uppercase text-[9px] border border-cyan-500/30">
              {tableMetadata.category}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Rows:</span>
            <span className="font-bold text-cyan-300">{tableMetadata.rowCount.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Storage:</span>
            <span className="text-slate-200">{(tableMetadata.sizeBytes / 1048576).toFixed(1)} MB</span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Primary Key:</span>
            <span className="text-amber-400 flex items-center gap-1">
              <Key className="w-3 h-3" />
              {tableMetadata.primaryKey}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Columns:</span>
            <span className="text-slate-200">{tableMetadata.columns.length} attributes</span>
          </div>

          <div className="pt-2 border-t border-slate-800 flex gap-2">
            <button
              onClick={handleOpenInspector}
              className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Inspect</span>
            </button>

            <button
              onClick={handleAudit}
              className="flex-1 py-1.5 px-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-all shadow-md shadow-cyan-500/20"
            >
              <Send className="w-3 h-3 fill-current" />
              <span>Audit</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-[11px] text-slate-400">
          <div>Infrastructure: <span className="text-slate-200 capitalize">{tile.building?.type || tile.zone || 'Terrain'}</span></div>
          <div>Coordinates: <span className="text-cyan-400">({tile.x}, {tile.y})</span></div>
          <p className="text-[10px] text-slate-500 mt-2">Click on any table building to inspect schema columns, row metrics, and foreign key relationships.</p>
        </div>
      )}
    </div>
  );
}
