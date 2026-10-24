'use client';

import React from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { AgentCrewMember } from '@/types/agent';
import { 
  Bot, 
  Cpu, 
  Sparkles, 
  Terminal, 
  Activity, 
  CheckCircle, 
  Clock, 
  Layers, 
  Search,
  Zap,
  Flame
} from 'lucide-react';

export function AgentControlCenter() {
  const { crew, activeMission } = useQueryPilot();

  const getStatusBadge = (status: AgentCrewMember['status']) => {
    switch (status) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 animate-pulse">
            <Sparkles className="w-2.5 h-2.5" />
            <span>THINKING</span>
          </span>
        );
      case 'querying':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-400/50 text-cyan-300 shadow-sm shadow-cyan-500/40">
            <Zap className="w-2.5 h-2.5 animate-bounce" />
            <span>QUERYING</span>
          </span>
        );
      case 'analyzing':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/40 text-purple-300">
            <Cpu className="w-2.5 h-2.5 animate-spin-slow" />
            <span>ANALYZING</span>
          </span>
        );
      case 'verifying':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
            <CheckCircle className="w-2.5 h-2.5" />
            <span>VERIFYING</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-slate-400">
            <Clock className="w-2.5 h-2.5" />
            <span>STANDBY</span>
          </span>
        );
    }
  };

  return (
    <aside className="absolute top-18 right-3 z-20 w-80 max-h-[calc(100vh-230px)] flex flex-col bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-cyan-500/20 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-100 tracking-wide">AI Agent Control Center</h2>
            <p className="text-[10px] font-mono text-cyan-400/80">Autonomous Investigation Crew</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-500/30">
          <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
          <span>4 AGENTS ACTIVE</span>
        </div>
      </div>

      {/* Agents Roster List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 scrollbar-thin">
        {crew.map((agent) => (
          <div
            key={agent.id}
            className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/40 transition-all duration-200"
          >
            {/* Agent Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-slate-950 shadow-md font-mono"
                  style={{ backgroundColor: agent.avatarColor }}
                >
                  {agent.callsign[0]}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-100">{agent.name}</span>
                    <span className="text-[9px] font-mono text-slate-400">[{agent.callsign}]</span>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-mono">{agent.role}</span>
                </div>
              </div>

              {getStatusBadge(agent.status)}
            </div>

            {/* Current Agent Activity / Task */}
            <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/70 text-[11px] font-mono text-slate-300 mb-2">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Current Directive</div>
              <p className="text-cyan-200 leading-snug">{agent.currentTask}</p>
            </div>

            {/* Agent Stats Footer */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/50">
              <span>Queries: <strong className="text-slate-200">{agent.queriesExecuted}</strong></span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active Link
              </span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
