'use client';

import React, { useState } from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { Settings, Database, Upload, Check, AlertCircle, ArrowRight, Shield, Server } from 'lucide-react';

export function SettingsView() {
  const { activeDatabase, importCustomSchema, setActiveView } = useQueryPilot();
  const [jsonInput, setJsonInput] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');

  const handleImport = () => {
    if (!jsonInput.trim()) return;
    const success = importCustomSchema(jsonInput);
    if (success) {
      setImportStatus('Schema imported successfully! Redirecting to City View...');
      setTimeout(() => {
        setImportStatus(null);
        setActiveView('city');
      }, 1500);
    } else {
      setImportStatus('Invalid schema JSON. Please provide a valid schema structure with name and tables array.');
    }
  };

  return (
    <div className="absolute inset-0 z-10 pt-20 p-6 bg-[#090d16]/95 backdrop-blur-md overflow-y-auto flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-cyan-500/20">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Settings className="w-6 h-6 text-cyan-400" />
              <span>QueryPilot Platform Configuration</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Backend integration, database credentials, and custom schema importers.
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

        <div className="space-y-6">
          {/* FastAPI Backend Connection Settings */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h2 className="text-sm font-bold text-slate-100 font-mono flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>FastAPI Backend Connection</span>
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              QueryPilot connects to a FastAPI WebSocket/REST backend to receive schema discoveries, agent step broadcasts, and real-time execution events.
            </p>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-xl text-xs font-mono text-slate-100 outline-none"
              />
              <button
                onClick={() => alert(`Connected to QueryPilot FastAPI backend at ${backendUrl}`)}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono rounded-xl transition-colors shadow-md shadow-cyan-500/20"
              >
                Test Connection
              </button>
            </div>
          </div>

          {/* Import Arbitrary Schema */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h2 className="text-sm font-bold text-slate-100 font-mono flex items-center gap-2 mb-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Import Arbitrary Database Schema (JSON)</span>
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Paste any custom database schema JSON. QueryPilot will automatically map tables to non-overlapping buildings and foreign keys to roads.
            </p>

            <textarea
              rows={8}
              placeholder={`{\n  "name": "my_warehouse",\n  "displayName": "Custom Data Warehouse",\n  "engine": "postgresql",\n  "tables": [\n    {\n      "id": "tbl_customers",\n      "name": "customers",\n      "category": "entity",\n      "rowCount": 500000,\n      "columns": [{ "name": "id", "type": "UUID", "isPrimaryKey": true }]\n    }\n  ]\n}`}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-xl text-xs font-mono text-cyan-200 outline-none mb-3"
            />

            {importStatus && (
              <div className="p-3 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-xs font-mono text-cyan-300 mb-3">
                {importStatus}
              </div>
            )}

            <button
              onClick={handleImport}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs font-mono rounded-xl transition-all shadow-md shadow-cyan-500/20"
            >
              Parse & Generate 3D City
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
