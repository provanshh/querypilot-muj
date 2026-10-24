/**
 * QueryPilot Database Schema & Metadata Types
 */

import { BuildingType } from '@/games/isocity/types/buildings';

export type DatabaseEngine = 'postgresql' | 'mysql' | 'snowflake' | 'sqlite' | 'bigquery';

export type TableCategory = 'fact' | 'entity' | 'dimension' | 'log' | 'view';

export type ColumnDataType = 
  | 'UUID' 
  | 'VARCHAR' 
  | 'TEXT' 
  | 'INTEGER' 
  | 'BIGINT' 
  | 'DECIMAL' 
  | 'BOOLEAN' 
  | 'TIMESTAMP' 
  | 'JSONB' 
  | 'ARRAY';

export interface ColumnMetadata {
  name: string;
  type: ColumnDataType;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesTable?: string;
  referencesColumn?: string;
  isNullable: boolean;
  description?: string;
  sampleValues?: (string | number | boolean)[];
}

export interface TableMetadata {
  id: string; // e.g. "tbl_orders"
  name: string; // e.g. "orders"
  schema: string; // e.g. "public"
  category: TableCategory;
  rowCount: number;
  sizeBytes: number;
  buildingType: BuildingType;
  gridX: number;
  gridY: number;
  width: number;
  height: number;
  columns: ColumnMetadata[];
  primaryKey: string;
  indexes: string[];
  lastQueriedAt?: string;
  queryFrequencyScore: number; // 0 - 100
  status: 'healthy' | 'querying' | 'analyzing' | 'indexed' | 'anomaly';
  district: string; // e.g. "Order Processing Hub"
}

export type RelationshipType = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface Relationship {
  id: string;
  fromTable: string; // "orders"
  fromColumn: string; // "user_id"
  toTable: string; // "users"
  toColumn: string; // "id"
  type: RelationshipType;
  roadPath?: Array<{ x: number; y: number }>;
  trafficLoad?: number; // 0 - 100% active joins
}

export interface DatabaseSchema {
  id: string;
  name: string; // e.g. "production_ecommerce"
  displayName: string;
  engine: DatabaseEngine;
  version: string;
  totalTables: number;
  totalRelationships: number;
  totalRows: number;
  totalSizeBytes: number;
  healthScore: number; // 0 - 100
  tables: TableMetadata[];
  relationships: Relationship[];
  seed: number;
}
