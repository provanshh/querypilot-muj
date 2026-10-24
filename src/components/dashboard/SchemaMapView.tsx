'use client';

import React from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { Network, Table2, Key, Link2, Sparkles, ArrowRight } from 'lucide-react';

export function SchemaMapView() {
  const { activeDatabase, focusTable, setActiveView } = useQueryPilot();

  return (
    <div className="absolute inset-0 z-10 pt-20 p-6 bg-[#090d16]/95 backdrop-blur-md overflow-y-auto flex flex-col items-center">
      <div className="w-full max-w-5xl">
        {/* Title */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-cyan-500/20">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Network className="w-6 h-6 text-cyan-400" />
              <span>Entity-Relationship Schema Topology</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Topological relationship map for {activeDatabase.displayName} ({activeDatabase.totalTables} tables, {activeDatabase.totalRelationships} foreign keys)
            </p>
          </div>

          <button
            onClick={() => setActiveView('city')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-mono transition-colors"
          >
            <span>Return to 3D City View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tables Grid Map */}
        <div className="grid grid-cols-3 gap-4">
          {activeDatabase.tables.map((table) => {
            const relatedOutgoing = activeDatabase.relationships.filter((r) => r.fromTable === table.name);
            const relatedIncoming = activeDatabase.relationships.filter((r) => r.toTable === table.name);

            return (
              <div
                key={table.id}
                onClick={() => {
                  focusTable(table);
                  setActiveView('city');
                }}
                className="group p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-400/60 shadow-lg hover:shadow-cyan-950/40 cursor-pointer transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-sm text-slate-100 font-mono group-hover:text-cyan-300 transition-colors">
                      {table.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {table.rowCount.toLocaleString()} rows
                  </span>
                </div>

                <p className="text-xs text-slate-400 mb-3">{table.district}</p>

                {/* Primary Key */}
                <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5 mb-2">
                  <Key className="w-3 h-3" />
                  <span>PK: {table.primaryKey}</span>
                </div>

                {/* Connected Relationships */}
                <div className="space-y-1 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                  <div className="text-slate-500 uppercase font-semibold">Foreign Key Joins:</div>
                  {relatedOutgoing.length === 0 && relatedIncoming.length === 0 && (
                    <span className="text-slate-600">No external keys</span>
                  )}
                  {relatedOutgoing.map((rel) => (
                    <div key={rel.id} className="text-cyan-400 flex items-center gap-1">
                      <Link2 className="w-3 h-3 text-cyan-500" />
                      <span>{rel.fromColumn} &rarr; {rel.toTable}.{rel.toColumn}</span>
                    </div>
                  ))}
                  {relatedIncoming.map((rel) => (
                    <div key={rel.id} className="text-blue-400 flex items-center gap-1">
                      <Link2 className="w-3 h-3 text-blue-500" />
                      <span>{rel.fromTable}.{rel.fromColumn} &rarr; {rel.toColumn}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
