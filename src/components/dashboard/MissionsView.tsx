'use client';

import React from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { Compass, Sparkles, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

export function MissionsView() {
  const { missionHistory, activeMission, startInvestigation, setActiveView } = useQueryPilot();

  const samplePrompts = [
    { title: 'Detect Cart Abandonment Anomaly', prompt: 'Analyze orders in pending state older than 24 hours and identify common product category bottlenecks.' },
    { title: 'Payment Gateway SLA Benchmark', prompt: 'Compare transaction failure rates between Stripe and PayPal across currency dimensions.' },
    { title: 'Identify Inactive High-Value Users', prompt: 'Audit users in gold and vip tiers whose last purchase was over 60 days ago.' },
  ];

  return (
    <div className="absolute inset-0 z-10 pt-20 p-6 bg-[#090d16]/95 backdrop-blur-md overflow-y-auto flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-cyan-500/20">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Compass className="w-6 h-6 text-cyan-400" />
              <span>Investigation Mission Registry</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Autonomous multi-agent investigation history, active operations, and suggested audit directives.
            </p>
          </div>

          <button
            onClick={() => setActiveView('city')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-mono transition-colors"
          >
            <span>City View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Suggested Directives */}
        <div className="mb-6">
          <h2 className="text-xs uppercase font-mono font-bold text-cyan-400 mb-3 tracking-wider">
            Ready-to-Dispatch Crew Missions
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {samplePrompts.map((s, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-bold text-xs text-slate-200 mb-1">{s.title}</h3>
                  <p className="text-[11px] text-slate-400 leading-snug">{s.prompt}</p>
                </div>
                <button
                  onClick={() => {
                    startInvestigation(s.prompt);
                    setActiveView('city');
                  }}
                  className="mt-3 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-semibold transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Launch Crew</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Past Missions History */}
        <div>
          <h2 className="text-xs uppercase font-mono font-bold text-slate-400 mb-3 tracking-wider">
            Investigation Archive ({missionHistory.length})
          </h2>

          {missionHistory.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs font-mono text-slate-500">
              No investigations completed yet. Dispatch a crew to record findings.
            </div>
          ) : (
            <div className="space-y-3">
              {missionHistory.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-200 text-sm font-sans">{m.title}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 text-[10px]">
                      COMPLETED
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs font-sans mb-3">{m.prompt}</p>
                  {m.result && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-cyan-500/20 text-cyan-300">
                      <div className="font-bold text-[11px] mb-1">Root Cause Finding:</div>
                      <p className="text-slate-300 font-sans text-xs">{m.result.rootCause}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
