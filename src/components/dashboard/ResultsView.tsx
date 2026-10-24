'use client';

import React from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { BarChart3, TrendingUp, ShieldCheck, Zap, Download, ArrowRight, Code } from 'lucide-react';

export function ResultsView() {
  const { activeMission, missionHistory, setActiveView } = useQueryPilot();

  const latestResult = activeMission?.result || (missionHistory.length > 0 ? missionHistory[0].result : null);
  const latestMission = activeMission || (missionHistory.length > 0 ? missionHistory[0] : null);

  return (
    <div className="absolute inset-0 z-10 pt-20 p-6 bg-[#090d16]/95 backdrop-blur-md overflow-y-auto flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-cyan-500/20">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-cyan-400" />
              <span>Investigation Findings & Analytics Report</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Synthesized conclusions, query execution performance, and automated root cause analysis.
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

        {!latestResult ? (
          <div className="p-12 text-center text-xs font-mono text-slate-500 rounded-2xl bg-slate-900/40 border border-slate-800">
            No investigation results available yet. Run a query in the Mayor&apos;s Command Center.
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Impact Cards */}
            <div className="grid grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Impact Severity</span>
                <div className="text-base font-bold text-amber-400 mt-1 uppercase">
                  {latestResult.impactScore} Severity
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Affected Rows</span>
                <div className="text-base font-bold text-cyan-300 mt-1">
                  {latestResult.metrics.affectedRows.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Queries Analyzed</span>
                <div className="text-base font-bold text-purple-300 mt-1">
                  {latestResult.metrics.queriesAnalyzed} Queries
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Total Scan Latency</span>
                <div className="text-base font-bold text-emerald-400 mt-1">
                  {latestResult.metrics.totalExecutionTimeMs} ms
                </div>
              </div>
            </div>

            {/* Findings Overview */}
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-cyan-500/30">
              <h2 className="text-sm font-bold text-cyan-400 mb-2 font-mono flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Executive Summary & Root Cause</span>
              </h2>
              <p className="text-slate-200 text-sm leading-relaxed mb-4">{latestResult.summary}</p>
              
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
                <span className="text-slate-400 uppercase font-semibold text-[10px]">Identified Root Cause:</span>
                <p className="text-cyan-200 mt-1">{latestResult.rootCause}</p>
              </div>

              <div className="mt-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs font-mono">
                <span className="text-emerald-400 uppercase font-semibold text-[10px]">Recommended Action:</span>
                <p className="text-emerald-200 mt-1">{latestResult.recommendedAction}</p>
              </div>
            </div>

            {/* Chart Preview */}
            {latestResult.chartData && (
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-200 uppercase font-mono mb-4 flex items-center justify-between">
                  <span>Anomaly Distribution by Day</span>
                  <span className="text-cyan-400">Wednesday Peak (4,812 Exceptions)</span>
                </h3>
                <div className="flex items-end gap-6 h-36 pt-4 px-4 border-b border-slate-800 font-mono text-xs">
                  {latestResult.chartData.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-md shadow-cyan-500/30 transition-all duration-500"
                        style={{ height: `${Math.min(100, Math.max(12, (d.value / 4812) * 100))}%` }}
                      />
                      <span className="text-[11px] text-slate-400">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executed Query Preview */}
            {latestMission?.finalSQL && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold mb-2">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Code className="w-3.5 h-3.5" />
                    <span>Validated Investigation Query</span>
                  </span>
                </div>
                <pre className="text-cyan-300 p-2 bg-slate-900/60 rounded-lg overflow-x-auto">
                  {latestMission.finalSQL}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
