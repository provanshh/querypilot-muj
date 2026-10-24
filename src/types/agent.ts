/**
 * QueryPilot AI Crew & Investigation Types
 */

export type AgentRole = 
  | 'Lead Architect' 
  | 'SQL Synthesizer' 
  | 'Data Validator' 
  | 'Optimization Specialist';

export type AgentStatus = 'idle' | 'thinking' | 'querying' | 'analyzing' | 'verifying';

export interface AgentCrewMember {
  id: string; // e.g. "agent_nova"
  name: string; // e.g. "Captain Nova"
  callsign: string; // e.g. "NOVA"
  role: AgentRole;
  avatarColor: string; // hex or tailwind color
  status: AgentStatus;
  currentTask: string;
  thoughtLog: string[];
  assignedTableIds: string[];
  queriesExecuted: number;
}

export type MissionCategory = 
  | 'anomaly' 
  | 'performance' 
  | 'revenue' 
  | 'retention' 
  | 'audit' 
  | 'custom';

export type MissionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface InvestigationEvent {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  type: 'hypothesis' | 'sql_exec' | 'join_analysis' | 'anomaly_found' | 'verification' | 'insight';
  description: string;
  sql?: string;
  tableTarget?: string;
  rowsAnalyzed?: number;
  durationMs?: number;
}

export interface InvestigationResult {
  summary: string;
  rootCause: string;
  recommendedAction: string;
  impactScore: 'low' | 'medium' | 'high' | 'critical';
  metrics: {
    affectedRows: number;
    financialImpact?: string;
    queriesAnalyzed: number;
    totalExecutionTimeMs: number;
  };
  chartData?: {
    label: string;
    value: number;
    benchmark: number;
  }[];
}

export interface InvestigationMission {
  id: string;
  title: string;
  prompt: string;
  category: MissionCategory;
  status: MissionStatus;
  progress: number; // 0 - 100
  startTime: string;
  endTime?: string;
  assignedCrewIds: string[];
  activeTableIds: string[];
  events: InvestigationEvent[];
  finalSQL?: string;
  result?: InvestigationResult;
}
