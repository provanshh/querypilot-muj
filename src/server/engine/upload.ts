import { randomBytes } from 'node:crypto';
import { pool } from '@/server/db/pg';
import { db } from '@/server/db/prisma';
import { encodeComment } from '@/server/db/comments';

const lit = (s: string) => `'${s.replace(/\0/g, '').replace(/'/g, "''")}'`;

export const UPLOAD_LIMITS = { bytes: 2 * 1024 * 1024, rows: 5000, cols: 50, keep: 20 };

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF; delimiter sniffed from the header. */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) out.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) out.push(row); }
  const [header = [], ...rows] = out;
  return { header, rows };
}

const RESERVED = /^(select|from|where|group|order|by|table|user|limit|offset|join|on|as|and|or|not|null|true|false|case|when|then|else|end|in|is|like|desc|asc|all|any|union|having|distinct|default|check|primary|foreign|references|column|constraint|row_id|qp_rn|qp_row)$/;

function sanitizeHeaders(header: string[]) {
  const seen = new Set<string>();
  return header.map((h, i) => {
    let s = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `col_${i + 1}`;
    if (/^\d/.test(s)) s = `c_${s}`;
    if (RESERVED.test(s) || /^(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|do|vacuum|analyze|lock|set|reset|execute|security)$/.test(s)) s = `${s}_col`;
    s = s.slice(0, 50);
    let u = s;
    let k = 2;
    while (seen.has(u)) { u = `${s}_${k}`; k += 1; }
    seen.add(u);
    return u;
  });
}

function tableNameFor(fileName: string) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const t = /^[a-z]/.test(base) ? base : `t_${base || 'data'}`;
  return (RESERVED.test(t) ? `${t}_data` : t).slice(0, 40);
}

/**
 * Stores an uploaded CSV as an all-TEXT table in its own schema (up_<hex>), exactly as written, so the
 * agents see the same mess a real export would contain. Writes touch only that schema and qp_meta.uploads.
 */
export async function storeUpload(name: string, csv: string) {
  if (Buffer.byteLength(csv, 'utf8') > UPLOAD_LIMITS.bytes) throw new Error('File is larger than 2 MB.');
  const { header, rows } = parseCsv(csv);
  if (header.length < 2) throw new Error('Need a header row with at least two columns.');
  if (header.length > UPLOAD_LIMITS.cols) throw new Error(`At most ${UPLOAD_LIMITS.cols} columns.`);
  if (!rows.length) throw new Error('No data rows found.');
  if (rows.length > UPLOAD_LIMITS.rows) throw new Error(`At most ${UPLOAD_LIMITS.rows.toLocaleString()} rows.`);
  const cols = sanitizeHeaders(header);
  const table = tableNameFor(name);
  const id = `up_${randomBytes(5).toString('hex')}`;
  const schema = id;
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.${table} (row_id SERIAL PRIMARY KEY, ${cols.map((c) => `"${c}" TEXT`).join(', ')})`);
    const chunk = Math.max(1, Math.floor(30000 / cols.length));
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const params: (string | null)[] = [];
      const tuples = part.map((r) => `(${cols.map((_, j) => { params.push(r[j] ?? null); return `$${params.length}`; }).join(', ')})`);
      await client.query(`INSERT INTO ${schema}.${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')}`, params);
    }
    const original = name.replace(/\.[a-z0-9]+$/i, '').trim();
    if (original && original.toLowerCase() !== table) {
      await client.query(`COMMENT ON TABLE ${schema}.${table} IS ${lit(encodeComment({ synonyms: [original] }))}`);
    }
    for (const [j, c] of cols.entries()) {
      const h = header[j].trim();
      if (h && h.toLowerCase() !== c) await client.query(`COMMENT ON COLUMN ${schema}.${table}."${c}" IS ${lit(encodeComment({ synonyms: [h] }))}`);
    }
    await client.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qp_agent') THEN
      GRANT USAGE ON SCHEMA ${schema} TO qp_agent; GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO qp_agent; END IF; END $$`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await db().upload.create({ data: { id, name: name.slice(0, 80), schemaName: schema, tableName: table, rowCount: rows.length, colCount: cols.length } });
  await pruneUploads();
  return { id, table, rows: rows.length, cols: cols.length, renamed: header.map((h, i) => ({ from: h, to: cols[i] })).filter((x) => x.from !== x.to) };
}

async function pruneUploads() {
  const old = await db().upload.findMany({ orderBy: { createdAt: 'desc' }, skip: UPLOAD_LIMITS.keep, select: { id: true, schemaName: true } });
  for (const u of old) {
    if (!/^up_[a-f0-9]{10}$/.test(u.schemaName)) continue;
    await pool().query(`DROP SCHEMA IF EXISTS ${u.schemaName} CASCADE`);
    await db().upload.delete({ where: { id: u.id } });
  }
}
