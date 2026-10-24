/**
 * QueryPilot Typed Backend Event Bus
 * 
 * Handles real-time events streamed from the FastAPI backend via WebSockets / SSE.
 */

import { DatabaseSchema, TableMetadata, Relationship } from '@/types/database';

export type BackendEventType = 
  | 'schema:discovered'
  | 'table:inspected'
  | 'relationship:updated'
  | 'agent:task_started'
  | 'agent:step'
  | 'sql:executing'
  | 'sql:executed'
  | 'verification:passed'
  | 'verification:failed'
  | 'investigation:completed';

export interface SchemaDiscoveredEvent {
  type: 'schema:discovered';
  schema: DatabaseSchema;
}

export interface TableInspectedEvent {
  type: 'table:inspected';
  table: TableMetadata;
}

export interface AgentStepEvent {
  type: 'agent:step';
  agentId: string;
  agentName: string;
  task: string;
  thought: string;
  progress: number;
}

export interface SqlExecutingEvent {
  type: 'sql:executing';
  queryId: string;
  agentId: string;
  sql: string;
  targetTables: string[];
}

export interface SqlExecutedEvent {
  type: 'sql:executed';
  queryId: string;
  sql: string;
  rowsAffected: number;
  durationMs: number;
}

export interface VerificationEvent {
  type: 'verification:passed' | 'verification:failed';
  assertion: string;
  details: string;
}

export interface InvestigationCompletedEvent {
  type: 'investigation:completed';
  missionId: string;
  summary: string;
  rootCause: string;
  remedy: string;
}

export type QueryPilotBackendEvent = 
  | SchemaDiscoveredEvent
  | TableInspectedEvent
  | AgentStepEvent
  | SqlExecutingEvent
  | SqlExecutedEvent
  | VerificationEvent
  | InvestigationCompletedEvent;

type EventHandler = (event: QueryPilotBackendEvent) => void;

class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  public subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }

  public emit(event: QueryPilotBackendEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
    // Also emit to wildcard '*' listeners
    const wildcards = this.listeners.get('*');
    if (wildcards) {
      wildcards.forEach((h) => h(event));
    }
  }
}

export const queryPilotEventBus = new EventBus();
