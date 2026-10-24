import { Pool, types, type PoolClient } from 'pg';

// NUMERIC and BIGINT come back as strings by default; the agents compare numbers.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// DATE as a JS Date is local midnight, which shifts a day when serialized from a UTC+ zone.
types.setTypeParser(1082, (v) => v);

export type Row = Record<string, unknown>;

function baseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Add your Neon connection string to .env.local.');
  return url.split('?')[0];
}

/** Pooled endpoint for queries; the direct endpoint is needed for LISTEN. */
export function directUrl() {
  return baseUrl().replace('-pooler.', '.');
}

const g = globalThis as unknown as { __qpPool?: Pool; __qpRoPool?: Pool };

function makePool(connectionString: string) {
  const p = new Pool({ connectionString, ssl: true, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  p.on('error', () => { /* idle client dropped by Neon; the pool reconnects */ });
  return p;
}

export function pool(): Pool {
  if (!g.__qpPool) g.__qpPool = makePool(baseUrl());
  return g.__qpPool;
}

/** Agent queries use a SELECT-only role when DATABASE_URL_READONLY is set (db/readonly_role.sql). */
function agentPool(): Pool {
  const ro = process.env.DATABASE_URL_READONLY?.trim();
  if (!ro) return pool();
  if (!g.__qpRoPool) g.__qpRoPool = makePool(ro.split('?')[0]);
  return g.__qpRoPool;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

export interface RoQuery {
  <T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  arrays(sql: string, params?: unknown[]): Promise<{ columns: string[]; rows: unknown[][] }>;
}

/**
 * Runs `fn` inside a READ ONLY transaction scoped to one island schema.
 * Writes are rejected by Postgres itself, independent of any SQL guard.
 */
export async function withReadOnly<T>(schema: string, fn: (q: RoQuery) => Promise<T>, timeoutMs = 8000): Promise<T> {
  if (!IDENT.test(schema)) throw new Error('Bad schema name');
  const client: PoolClient = await agentPool().connect();
  try {
    await client.query(`BEGIN READ ONLY; SET LOCAL search_path TO ${schema}; SET LOCAL statement_timeout = ${Math.round(timeoutMs)}`);
    const q = (async (sql: string, params?: unknown[]) => (await client.query(sql, params)).rows) as RoQuery;
    q.arrays = async (sql: string, params?: unknown[]) => {
      const r = await client.query({ text: sql, values: params, rowMode: 'array' });
      return { columns: r.fields.map((f) => f.name), rows: r.rows as unknown[][] };
    };
    const out = await fn(q);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
