'use client';

import React, { useState, useEffect } from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { 
  X, 
  Table2, 
  Key, 
  Link2, 
  Activity, 
  HardDrive, 
  Send, 
  Layers, 
  Code, 
  Clock, 
  Database,
  Search,
  ExternalLink
} from 'lucide-react';

export function TableInspectorModal() {
  const { selectedTable, selectTable, startInvestigation } = useQueryPilot();
  const [activeTab, setActiveTab] = useState<'columns' | 'sample' | 'relations'>('columns');

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectTable(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectTable]);

  if (!selectedTable) return null;

  const handleLaunchInvestigationForTable = () => {
    const prompt = `Perform a comprehensive data quality and performance audit on table ${selectedTable.name}.`;
    startInvestigation(prompt);
  };

  return (
    <div 
      onClick={() => selectTable(null)}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#0a0f1d] border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/60 overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-cyan-500/20 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 font-mono">{selectedTable.name}</h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  {selectedTable.category}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  schema: {selectedTable.schema}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">{selectedTable.district}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLaunchInvestigationForTable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold font-mono shadow-md shadow-cyan-500/20 transition-all"
            >
              <Send className="w-3.5 h-3.5 fill-current" />
              <span>Audit Table</span>
            </button>

            <button
              onClick={() => selectTable(null)}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-slate-950/50 border-b border-cyan-500/10 text-xs font-mono">
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase">Row Volume</span>
            <span className="font-bold text-cyan-300">{selectedTable.rowCount.toLocaleString()}</span>
          </div>

          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase">Disk Footprint</span>
            <span className="font-bold text-slate-200">{(selectedTable.sizeBytes / 1048576).toFixed(1)} MB</span>
          </div>

          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase">Total Columns</span>
            <span className="font-bold text-slate-200">{selectedTable.columns.length}</span>
          </div>

          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase">Primary Key</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1">
              <Key className="w-3 h-3" />
              {selectedTable.primaryKey}
            </span>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-4 px-4 border-b border-cyan-500/10 text-xs font-medium bg-slate-900/30">
          <button
            onClick={() => setActiveTab('columns')}
            className={`py-2.5 border-b-2 font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'columns'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Columns ({selectedTable.columns.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('sample')}
            className={`py-2.5 border-b-2 font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'sample'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Sample Row Preview</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {activeTab === 'columns' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                    <th className="pb-2 font-semibold">Column Name</th>
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 font-semibold">Constraints</th>
                    <th className="pb-2 font-semibold">Foreign Key Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {selectedTable.columns.map((col) => (
                    <tr key={col.name} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2.5 font-bold text-slate-200 flex items-center gap-1.5">
                        {col.isPrimaryKey && <Key className="w-3.5 h-3.5 text-amber-400" />}
                        {col.isForeignKey && <Link2 className="w-3.5 h-3.5 text-cyan-400" />}
                        <span>{col.name}</span>
                      </td>

                      <td className="py-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800 text-[10px]">
                          {col.type}
                        </span>
                      </td>

                      <td className="py-2.5 text-slate-400 text-[11px]">
                        {col.isPrimaryKey ? (
                          <span className="text-amber-400 font-semibold">PRIMARY KEY</span>
                        ) : col.isNullable ? (
                          <span>NULLABLE</span>
                        ) : (
                          <span className="text-slate-300">NOT NULL</span>
                        )}
                      </td>

                      <td className="py-2.5 text-cyan-400">
                        {col.referencesTable ? (
                          <span className="flex items-center gap-1 text-[11px] underline cursor-pointer">
                            {col.referencesTable}.{col.referencesColumn}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'sample' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 overflow-x-auto">
                <div className="text-[10px] text-slate-500 uppercase mb-2 font-bold flex items-center justify-between">
                  <span>Synthesized Sample Record (Row 1 of 5,420,000)</span>
                  <span className="text-emerald-400">Validated</span>
                </div>
                <pre className="text-cyan-300 text-[11px] leading-relaxed">
{JSON.stringify(
  selectedTable.columns.reduce((acc, col) => {
    acc[col.name] = col.sampleValues ? col.sampleValues[0] : (col.isPrimaryKey ? '018f92a4-7a31-7b00' : 'sample_value');
    return acc;
  }, {} as Record<string, any>),
  null,
  2
)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
