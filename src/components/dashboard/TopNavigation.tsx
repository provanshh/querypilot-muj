'use client';

import React from 'react';
import { useQueryPilot, DashboardView } from '@/context/QueryPilotContext';
import { 
  Building2, 
  Network, 
  Compass, 
  BarChart3, 
  Settings, 
  Database, 
  Radio, 
  ChevronDown,
  Sparkles,
  Layers
} from 'lucide-react';

export function TopNavigation() {
  const { 
    activeDatabase, 
    availableDatabases, 
    selectDatabase, 
    activeView, 
    setActiveView,
    isConnected, 
    latencyMs 
  } = useQueryPilot();

  const navItems: Array<{ id: DashboardView; label: string; icon: React.ReactNode }> = [
    { id: 'city', label: 'City View', icon: <Building2 className="w-4 h-4" /> },
    { id: 'schema', label: 'Schema Map', icon: <Network className="w-4 h-4" /> },
    { id: 'missions', label: 'Missions', icon: <Compass className="w-4 h-4" /> },
    { id: 'results', label: 'Results', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <header className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
      {/* Brand & Tagline Pill */}
      <div className="pointer-events-auto flex items-center gap-3 bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 px-4 py-2 rounded-xl shadow-2xl shadow-cyan-950/40">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-md shadow-cyan-500/50">
            <Layers className="w-5 h-5 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0f1d] animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400">
                QUERYPILOT
              </span>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40">
                v1.0
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-tight">
              Don&apos;t Just Ask Your Database. Send a Crew.
            </span>
          </div>
        </div>
      </div>

      {/* Center View Selector Tabs */}
      <nav className="pointer-events-auto flex items-center gap-1 bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 p-1.5 rounded-xl shadow-2xl shadow-cyan-950/30">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/30 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Connection & Database Selector Pill */}
      <div className="pointer-events-auto flex items-center gap-2 bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 px-3 py-1.5 rounded-xl shadow-2xl">
        {/* Active Database Dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:border-cyan-500/50 text-xs font-mono text-cyan-200 transition-colors">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold">{activeDatabase.displayName}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform" />
          </button>

          {/* Database Switcher Menu */}
          <div className="absolute right-0 top-full mt-1.5 w-60 py-1.5 bg-[#0b1324] border border-cyan-500/40 rounded-xl shadow-2xl opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-150 z-50">
            <div className="px-3 py-1 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
              Connected Databases
            </div>
            {availableDatabases.map((db) => (
              <button
                key={db.id}
                onClick={() => selectDatabase(db.id)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-cyan-950/40 transition-colors ${
                  db.id === activeDatabase.id ? 'text-cyan-300 font-semibold bg-cyan-950/30' : 'text-slate-300'
                }`}
              >
                <div className="flex flex-col">
                  <span>{db.displayName}</span>
                  <span className="text-[10px] font-mono text-slate-400">{db.engine} • {db.totalTables} tables</span>
                </div>
                {db.id === activeDatabase.id && (
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Live Latency Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] font-mono text-emerald-400">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>{latencyMs}ms</span>
        </div>
      </div>
    </header>
  );
}
