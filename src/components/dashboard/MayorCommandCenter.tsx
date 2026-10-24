'use client';

import React, { useState } from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { 
  Send, 
  Sparkles, 
  Compass, 
  Terminal, 
  AlertTriangle, 
  CheckCircle2, 
  XSquare,
  HelpCircle,
  TrendingDown
} from 'lucide-react';

const PRESET_PROMPTS = [
  { label: 'Q3 Revenue & Refund Spike', query: 'Investigate why Q3 revenue dropped 14% while refund rate tripled across Stripe payments.' },
  { label: 'Trace High-Churn VIPs', query: 'Find customers on VIP tier who have not placed an order in the last 45 days.' },
  { label: 'Inventory Stockout Bottleneck', query: 'Audit inventory logs for high-velocity products that breached safety stock.' },
  { label: 'Payment Gateway Timeout', query: 'Analyze failure rate differences between Stripe, PayPal, and Adyen gateways.' },
];

export function MayorCommandCenter() {
  const { startInvestigation, cancelInvestigation, activeMission } = useQueryPilot();
  const [prompt, setPrompt] = useState('');

  const isRunning = activeMission?.status === 'in_progress';

  const handleLaunch = (queryToRun?: string) => {
    const text = queryToRun || prompt;
    if (!text.trim()) return;
    startInvestigation(text);
  };

  return (
    <div className="absolute bottom-3 left-3 z-20 w-[480px] bg-[#0a0f1d]/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 p-4 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
            <Compass className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>Mayor&apos;s Command Center</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                AI CREW DISPATCH
              </span>
            </h3>
          </div>
        </div>

        {isRunning && (
          <button
            onClick={cancelInvestigation}
            className="flex items-center gap-1 text-[11px] font-mono text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-500/30 transition-colors"
          >
            <XSquare className="w-3 h-3" />
            <span>Abort Crew</span>
          </button>
        )}
      </div>

      {/* Preset Fast-Dispatch Pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESET_PROMPTS.map((preset, idx) => (
          <button
            key={idx}
            disabled={isRunning}
            onClick={() => {
              setPrompt(preset.query);
              handleLaunch(preset.query);
            }}
            className="text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-cyan-950/60 text-slate-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-all flex items-center gap-1 disabled:opacity-50"
          >
            <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      {/* Input & Dispatch Button Bar */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-cyan-400">
          <Terminal className="w-4 h-4" />
        </div>
        <input
          type="text"
          placeholder="Ask your database anything... send a multi-agent crew to investigate"
          value={prompt}
          disabled={isRunning}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLaunch();
          }}
          className="w-full pl-9 pr-28 py-2.5 text-xs bg-slate-950/90 border border-slate-800 focus:border-cyan-400/80 rounded-xl text-slate-100 placeholder-slate-500 outline-none transition-all font-mono"
        />

        <button
          onClick={() => handleLaunch()}
          disabled={isRunning || !prompt.trim()}
          className="absolute right-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/30 disabled:opacity-40 disabled:pointer-events-none transition-all"
        >
          <Send className="w-3 h-3 text-slate-950 fill-current" />
          <span>Send Crew</span>
        </button>
      </div>

      {/* Live Investigation Progress Bar */}
      {isRunning && (
        <div className="mt-3 pt-2.5 border-t border-cyan-500/10">
          <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
            <span className="text-cyan-300 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Crew active: {activeMission?.events[activeMission.events.length - 1]?.description || 'Investigating...'}
            </span>
            <span className="text-cyan-400 font-bold">{activeMission?.progress}%</span>
          </div>

          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-cyan-500/20">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 rounded-full transition-all duration-300 shadow-sm shadow-cyan-400"
              style={{ width: `${activeMission?.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
