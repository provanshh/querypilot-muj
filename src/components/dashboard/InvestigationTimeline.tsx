'use client';

import React, { useState } from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { 
  History, 
  Terminal, 
  AlertCircle, 
  CheckCircle2, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Zap,
  Download,
  Share2,
  TrendingUp
} from 'lucide-react';

export function InvestigationTimeline() {
  const { activeMission } = useQueryPilot();
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!activeMission) {
    return (
      <div className="absolute bottom-3 right-3 z-20 w-[420px] bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 p-3.5 text-center text-xs font-mono text-slate-400">
        <div className="flex items-center justify-center gap-2 text-cyan-400 mb-1">
          <History className="w-4 h-4" />
          <span className="font-bold">Investigation Timeline</span>
        </div>
        <p className="text-[11px] text-slate-500">No active investigation. Dispatch a crew from the Mayor&apos;s Command Center to view live SQL execution steps.</p>
      </div>
    );
  }

  const handleCopySql = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(sql);
    setTimeout(() => setCopiedSql(null), 2000);
  };

  return (
    <div className="absolute bottom-3 right-3 z-20 w-[440px] max-h-[460px] flex flex-col bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-cyan-500/20 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
            <History className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>Live Investigation Timeline</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                activeMission.status === 'completed'
                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30'
                  : 'bg-cyan-950/70 text-cyan-300 border-cyan-500/30 animate-pulse'
              }`}>
                {activeMission.status.toUpperCase()}
              </span>
            </h3>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-200 p-1 rounded transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin text-xs font-mono">
          {/* Mission Prompt Summary */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px]">
            <div className="text-[9px] uppercase text-cyan-400 font-semibold mb-1">Target Directive</div>
            <p className="text-slate-200">{activeMission.prompt}</p>
          </div>

          {/* Chronological Event Stream */}
          <div className="space-y-2 border-l-2 border-cyan-500/30 ml-2 pl-3">
            {activeMission.events.map((event) => (
              <div key={event.id} className="relative group">
                {/* Event bullet */}
                <div className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 rounded-full bg-cyan-400 border-2 border-[#0a0f1d] shadow-sm shadow-cyan-400" />

                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span className="font-bold text-cyan-300">{event.agentName}</span>
                  <span>{event.timestamp}</span>
                </div>

                <p className="text-slate-300 text-[11px] leading-relaxed mb-1">
                  {event.description}
                </p>

                {/* SQL Code Block Preview */}
                {event.sql && (
                  <div className="relative mt-1.5 rounded-lg bg-slate-950 border border-slate-800 p-2 overflow-x-auto text-[10px] font-mono text-cyan-300">
                    <button
                      onClick={() => handleCopySql(event.sql!)}
                      className="absolute top-1.5 right-1.5 p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Copy SQL"
                    >
                      {copiedSql === event.sql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <pre className="pr-6">{event.sql}</pre>
                    {event.rowsAnalyzed && (
                      <div className="mt-1.5 pt-1 border-t border-slate-800/60 text-[9px] text-slate-400 flex items-center justify-between">
                        <span>Rows scanned: <strong className="text-slate-200">{event.rowsAnalyzed.toLocaleString()}</strong></span>
                        {event.durationMs && <span>Execution: <strong className="text-cyan-400">{event.durationMs}ms</strong></span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Final Completed Result Card */}
          {activeMission.result && (
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-cyan-950/50 to-blue-950/40 border border-cyan-400/50 shadow-lg shadow-cyan-950/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Synthesis & Root Cause
                </span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40">
                  {activeMission.result.impactScore} IMPACT
                </span>
              </div>

              <p className="text-[11px] text-slate-200 leading-relaxed mb-2 font-sans font-medium">
                {activeMission.result.summary}
              </p>

              <div className="p-2 rounded-lg bg-slate-900/80 border border-cyan-500/20 text-[10px] mb-2 font-mono">
                <div className="text-cyan-400 font-semibold mb-0.5">Recommended Remedy:</div>
                <p className="text-slate-300">{activeMission.result.recommendedAction}</p>
              </div>

              {activeMission.result.metrics.financialImpact && (
                <div className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{activeMission.result.metrics.financialImpact}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
