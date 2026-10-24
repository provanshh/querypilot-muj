'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { DatabaseSchema, TableMetadata } from '@/types/database';
import { AgentCrewMember, InvestigationMission, InvestigationEvent, MissionCategory } from '@/types/agent';
import { ECOMMERCE_SCHEMA, AVAILABLE_SCHEMAS } from '@/lib/mockSchemas';

export type DashboardView = 'city' | 'schema' | 'missions' | 'results' | 'settings';

interface QueryPilotContextType {
  activeDatabase: DatabaseSchema;
  availableDatabases: DatabaseSchema[];
  selectedTable: TableMetadata | null;
  activeView: DashboardView;
  navigationTarget: { x: number; y: number } | null;
  crew: AgentCrewMember[];
  activeMission: InvestigationMission | null;
  missionHistory: InvestigationMission[];
  isConnected: boolean;
  latencyMs: number;
  highlightedRoads: Array<{ x: number; y: number }>;
  
  // Actions
  setActiveView: (view: DashboardView) => void;
  selectDatabase: (id: string) => void;
  selectTable: (table: TableMetadata | null) => void;
  focusTable: (table: TableMetadata) => void;
  startInvestigation: (prompt: string, category?: MissionCategory) => void;
  cancelInvestigation: () => void;
  importCustomSchema: (schemaJson: string) => boolean;
}

const DEFAULT_CREW: AgentCrewMember[] = [
  {
    id: 'agent_nova',
    name: 'Captain Nova',
    callsign: 'NOVA',
    role: 'Lead Architect',
    avatarColor: '#00f0ff',
    status: 'idle',
    currentTask: 'Monitoring schema relationships & anomalies',
    thoughtLog: [
      'Standing by for investigation directive.',
      'Schema topology verified: 9 tables, 11 foreign-key roads active.'
    ],
    assignedTableIds: [],
    queriesExecuted: 14,
  },
  {
    id: 'agent_cipher',
    name: 'Cipher',
    callsign: 'CIPHER',
    role: 'SQL Synthesizer',
    avatarColor: '#818cf8',
    status: 'idle',
    currentTask: 'Query generator buffer armed',
    thoughtLog: [
      'Indexed paths loaded for fast table scans.',
      'SQL engine ready for zero-latency execution.'
    ],
    assignedTableIds: [],
    queriesExecuted: 42,
  },
  {
    id: 'agent_aegis',
    name: 'Aegis',
    callsign: 'AEGIS',
    role: 'Data Validator',
    avatarColor: '#34d399',
    status: 'idle',
    currentTask: 'Integrity constraints active',
    thoughtLog: [
      'Cross-referencing foreign keys and non-null constraints.',
      'Data sanity checks: 100% nominal.'
    ],
    assignedTableIds: [],
    queriesExecuted: 28,
  },
  {
    id: 'agent_vektor',
    name: 'Vektor',
    callsign: 'VEKTOR',
    role: 'Optimization Specialist',
    avatarColor: '#f472b6',
    status: 'idle',
    currentTask: 'Profiling query execution cost',
    thoughtLog: [
      'B-Tree index cache hit ratio at 99.4%.',
      'Ready to inspect slow table joins.'
    ],
    assignedTableIds: [],
    queriesExecuted: 19,
  },
];

const QueryPilotContext = createContext<QueryPilotContextType | null>(null);

export function QueryPilotProvider({ children }: { children: React.ReactNode }) {
  const [availableDatabases, setAvailableDatabases] = useState<DatabaseSchema[]>(AVAILABLE_SCHEMAS);
  const [activeDatabase, setActiveDatabase] = useState<DatabaseSchema>(ECOMMERCE_SCHEMA);
  const [selectedTable, setSelectedTable] = useState<TableMetadata | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>('city');
  const [navigationTarget, setNavigationTarget] = useState<{ x: number; y: number } | null>(null);
  const [crew, setCrew] = useState<AgentCrewMember[]>(DEFAULT_CREW);
  const [activeMission, setActiveMission] = useState<InvestigationMission | null>(null);
  const [missionHistory, setMissionHistory] = useState<InvestigationMission[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [highlightedRoads, setHighlightedRoads] = useState<Array<{ x: number; y: number }>>([]);

  const missionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ping latency simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setLatencyMs(Math.floor(10 + Math.random() * 8));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const selectDatabase = useCallback((id: string) => {
    const found = availableDatabases.find((db) => db.id === id);
    if (found) {
      setActiveDatabase(found);
      setSelectedTable(null);
      setNavigationTarget({ x: 28, y: 28 }); // Center view
    }
  }, [availableDatabases]);

  const selectTable = useCallback((table: TableMetadata | null) => {
    setSelectedTable(table);
  }, []);

  const focusTable = useCallback((table: TableMetadata) => {
    setSelectedTable(table);
    setNavigationTarget({ x: table.gridX, y: table.gridY });
  }, []);

  const cancelInvestigation = useCallback(() => {
    if (missionTimerRef.current) {
      clearTimeout(missionTimerRef.current);
    }
    setActiveMission(null);
    setCrew((prev) =>
      prev.map((agent) => ({
        ...agent,
        status: 'idle',
        currentTask: 'Standing by for new mission',
      }))
    );
    setHighlightedRoads([]);
  }, []);

  // Multi-agent autonomous investigation simulation workflow
  const startInvestigation = useCallback((prompt: string, category: MissionCategory = 'anomaly') => {
    cancelInvestigation();

    const missionId = `mission_${Date.now()}`;
    const initialMission: InvestigationMission = {
      id: missionId,
      title: prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt,
      prompt,
      category,
      status: 'in_progress',
      progress: 5,
      startTime: new Date().toLocaleTimeString(),
      assignedCrewIds: ['agent_nova', 'agent_cipher', 'agent_aegis', 'agent_vektor'],
      activeTableIds: ['tbl_orders', 'tbl_payments', 'tbl_users'],
      events: [
        {
          id: `ev_1`,
          timestamp: new Date().toLocaleTimeString(),
          agentId: 'agent_nova',
          agentName: 'Captain Nova',
          type: 'hypothesis',
          description: `Dispatched crew to investigate: "${prompt}". Formulating initial schema hypothesis across orders and payments.`,
        }
      ],
    };

    setActiveMission(initialMission);

    // Animate crew statuses
    setCrew((prev) =>
      prev.map((agent) => {
        if (agent.id === 'agent_nova') return { ...agent, status: 'thinking', currentTask: 'Analyzing query intent & table dependencies' };
        if (agent.id === 'agent_cipher') return { ...agent, status: 'thinking', currentTask: 'Preparing multi-table JOIN AST' };
        return { ...agent, status: 'thinking', currentTask: 'Awaiting intermediate result sets' };
      })
    );

    // Step 2: Cipher executes SQL
    missionTimerRef.current = setTimeout(() => {
      const sqlQuery = `SELECT o.status, COUNT(o.id) as total_orders, SUM(o.total_amount) as volume,\n       p.gateway, AVG(p.amount) as avg_payment\nFROM orders o\nLEFT JOIN payments p ON o.id = p.order_id\nWHERE o.created_at >= NOW() - INTERVAL '7 days'\nGROUP BY o.status, p.gateway\nHAVING o.status = 'failed';`;

      setActiveMission((m) => {
        if (!m) return null;
        return {
          ...m,
          progress: 35,
          finalSQL: sqlQuery,
          events: [
            ...m.events,
            {
              id: 'ev_2',
              timestamp: new Date().toLocaleTimeString(),
              agentId: 'agent_cipher',
              agentName: 'Cipher',
              type: 'sql_exec',
              description: 'Executed targeted join between orders and payments on foreign key order_id.',
              sql: sqlQuery,
              rowsAnalyzed: 142000,
              durationMs: 38,
            }
          ]
        };
      });

      setCrew((prev) =>
        prev.map((agent) => {
          if (agent.id === 'agent_cipher') return { ...agent, status: 'querying', currentTask: 'Scanning 142,000 order rows in Transaction District' };
          if (agent.id === 'agent_aegis') return { ...agent, status: 'analyzing', currentTask: 'Validating payment gateway response codes' };
          return agent;
        })
      );

      // Step 3: Aegis identifies anomaly
      missionTimerRef.current = setTimeout(() => {
        setActiveMission((m) => {
          if (!m) return null;
          return {
            ...m,
            progress: 70,
            events: [
              ...m.events,
              {
                id: 'ev_3',
                timestamp: new Date().toLocaleTimeString(),
                agentId: 'agent_aegis',
                agentName: 'Aegis',
                type: 'anomaly_found',
                description: 'Detected 4,812 timeout exceptions from legacy payment gateway webhook.',
                rowsAnalyzed: 4812,
                durationMs: 14,
              }
            ]
          };
        });

        // Step 4: Vektor & Nova synthesize final insight
        missionTimerRef.current = setTimeout(() => {
          const completedMission: InvestigationMission = {
            ...initialMission,
            progress: 100,
            status: 'completed',
            endTime: new Date().toLocaleTimeString(),
            finalSQL: sqlQuery,
            events: [
              ...initialMission.events,
              {
                id: 'ev_2',
                timestamp: new Date().toLocaleTimeString(),
                agentId: 'agent_cipher',
                agentName: 'Cipher',
                type: 'sql_exec',
                description: 'Executed high-speed join between orders and payments.',
                sql: sqlQuery,
                rowsAnalyzed: 142000,
                durationMs: 38,
              },
              {
                id: 'ev_3',
                timestamp: new Date().toLocaleTimeString(),
                agentId: 'agent_aegis',
                agentName: 'Aegis',
                type: 'anomaly_found',
                description: 'Identified 4,812 timeout exceptions from legacy payment gateway webhook.',
                rowsAnalyzed: 4812,
                durationMs: 14,
              },
              {
                id: 'ev_4',
                timestamp: new Date().toLocaleTimeString(),
                agentId: 'agent_nova',
                agentName: 'Captain Nova',
                type: 'insight',
                description: 'Investigation complete: Root cause isolated to Stripe webhook timeout during traffic peak.',
              }
            ],
            result: {
              summary: 'Orders marked failed due to gateway timeout during 14:00 - 15:30 UTC peak traffic window.',
              rootCause: 'Connection pooling bottleneck in payments table foreign key constraint under high concurrency.',
              recommendedAction: 'Add composite index on (order_id, gateway, status) and increase webhook worker pool size from 16 to 64.',
              impactScore: 'high',
              metrics: {
                affectedRows: 4812,
                financialImpact: '$412,850 recovered potential GMV',
                queriesAnalyzed: 4,
                totalExecutionTimeMs: 52,
              },
              chartData: [
                { label: 'Mon', value: 120, benchmark: 110 },
                { label: 'Tue', value: 140, benchmark: 115 },
                { label: 'Wed', value: 4812, benchmark: 120 }, // Spike!
                { label: 'Thu', value: 210, benchmark: 125 },
                { label: 'Fri', value: 160, benchmark: 130 },
              ]
            }
          };

          setActiveMission(completedMission);
          setMissionHistory((prev) => [completedMission, ...prev.slice(0, 10)]);

          setCrew((prev) =>
            prev.map((agent) => ({
              ...agent,
              status: 'idle',
              currentTask: 'Investigation completed successfully. Standing by.',
              queriesExecuted: agent.queriesExecuted + 1,
            }))
          );
        }, 2200);
      }, 2000);
    }, 1800);
  }, [cancelInvestigation]);

  const importCustomSchema = useCallback((schemaJson: string): boolean => {
    try {
      const parsed = JSON.parse(schemaJson) as DatabaseSchema;
      if (!parsed.name || !Array.isArray(parsed.tables)) {
        return false;
      }
      parsed.id = parsed.id || `custom_${Date.now()}`;
      parsed.displayName = parsed.displayName || parsed.name;
      parsed.engine = parsed.engine || 'postgresql';
      parsed.healthScore = parsed.healthScore || 100;
      parsed.totalTables = parsed.tables.length;
      parsed.relationships = parsed.relationships || [];
      parsed.seed = parsed.seed || Math.floor(Math.random() * 1000);

      setAvailableDatabases((prev) => [...prev, parsed]);
      setActiveDatabase(parsed);
      setSelectedTable(null);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <QueryPilotContext.Provider
      value={{
        activeDatabase,
        availableDatabases,
        selectedTable,
        activeView,
        navigationTarget,
        crew,
        activeMission,
        missionHistory,
        isConnected,
        latencyMs,
        highlightedRoads,
        setActiveView,
        selectDatabase,
        selectTable,
        focusTable,
        startInvestigation,
        cancelInvestigation,
        importCustomSchema,
      }}
    >
      {children}
    </QueryPilotContext.Provider>
  );
}

export function useQueryPilot() {
  const context = useContext(QueryPilotContext);
  if (!context) {
    throw new Error('useQueryPilot must be used within a QueryPilotProvider');
  }
  return context;
}
