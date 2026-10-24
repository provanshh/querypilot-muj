'use client';

import React, { useState } from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { TableMetadata } from '@/types/database';
import { 
  Database, 
  Table2, 
  GitFork, 
  HardDrive, 
  Activity, 
  Search,
  Focus,
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';

export function DatabaseOverviewPanel() {
  const { activeDatabase, selectedTable, focusTable } = useQueryPilot();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const filteredTables = activeDatabase.tables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.district.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const getCategoryBadge = (category: TableMetadata['category']) => {
    switch (category) {
      case 'fact':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-500/30">FACT</span>;
      case 'entity':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">ENTITY</span>;
      case 'dimension':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-400 border border-purple-500/30">DIM</span>;
      case 'log':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/30">LOG</span>;
      default:
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">VIEW</span>;
    }
  };

  return (
    <aside className="absolute top-18 left-3 z-20 w-80 max-h-[calc(100vh-140px)] flex flex-col bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden transition-all duration-300">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-cyan-500/20 bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-400">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-100 tracking-wide">Database Overview</h2>
            <p className="text-[10px] font-mono text-cyan-400/80">{activeDatabase.version}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono">
          <ShieldCheck className="w-3 h-3" />
          <span>{activeDatabase.healthScore}% HEALTH</span>
        </div>
      </div>

      {/* Database KPI Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 p-3 border-b border-cyan-500/10 bg-slate-950/30 text-xs font-mono">
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Table2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px]">Tables</span>
          </div>
          <span className="font-bold text-slate-100">{activeDatabase.totalTables}</span>
        </div>

        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <GitFork className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px]">Relations</span>
          </div>
          <span className="font-bold text-slate-100">{activeDatabase.totalRelationships}</span>
        </div>

        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px]">Rows</span>
          </div>
          <span className="font-bold text-slate-100">{formatNumber(activeDatabase.totalRows)}</span>
        </div>

        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px]">Storage</span>
          </div>
          <span className="font-bold text-slate-100">{formatBytes(activeDatabase.totalSizeBytes)}</span>
        </div>
      </div>

      {/* Table Search Input */}
      <div className="p-2.5 border-b border-cyan-500/10">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search schema tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/80 border border-slate-800 focus:border-cyan-500/60 rounded-lg text-slate-200 placeholder-slate-500 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Table List (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
        <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 flex justify-between">
          <span>Table Entities</span>
          <span>Row Count</span>
        </div>

        {filteredTables.map((table) => {
          const isSelected = selectedTable?.id === table.id;
          return (
            <div
              key={table.id}
              onClick={() => focusTable(table)}
              className={`group flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all duration-150 ${
                isSelected
                  ? 'bg-cyan-950/60 border border-cyan-400/60 text-cyan-200 shadow-md shadow-cyan-950/30'
                  : 'hover:bg-slate-800/50 border border-transparent text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Focus className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400 transition-colors'}`} />
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold">{table.name}</span>
                    {getCategoryBadge(table.category)}
                  </div>
                  <span className="text-[10px] text-slate-500">{table.columns.length} columns • {table.district}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-slate-400 font-medium">
                  {formatNumber(table.rowCount)}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
