import type { Upload } from '@/generated/prisma/client';
import { db } from '@/server/db/prisma';
import { readDictionary } from '@/server/db/comments';

interface ColumnMeta { desc?: string; synonyms?: string[] }
export interface TableMeta { desc?: string; synonyms?: string[]; columns: Record<string, ColumnMeta> }

/** A dataset is a CSV the user uploaded; its rows live in their own schema. */
export interface DatasetDef {
  id: string;
  name: string;
  messySchema: string;
  /** Data dictionary, read from the COMMENTs of the schema. */
  tables: Record<string, TableMeta>;
  rules: string[];
  /** Code values with a business meaning (from "values:" in a column comment). */
  valueLabels?: Record<string, Record<string, string>>;
  createdAt?: string;
}

async function fromUpload(r: Upload): Promise<DatasetDef> {
  const dict = await readDictionary(r.schemaName).catch(() => ({ tables: {}, valueLabels: {}, rules: [] as string[] }));
  return {
    id: r.id, name: r.name, messySchema: r.schemaName, rules: dict.rules, createdAt: r.createdAt?.toISOString(),
    tables: dict.tables, valueLabels: dict.valueLabels,
  };
}

/** Uploaded datasets, newest first. */
export async function listDatasets(): Promise<DatasetDef[]> {
  return Promise.all((await db().upload.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })).map(fromUpload));
}

export async function getDataset(id: string): Promise<DatasetDef | null> {
  if (!/^[a-z0-9_]{2,40}$/.test(id)) return null;
  const up = await db().upload.findUnique({ where: { id } });
  return up ? fromUpload(up) : null;
}
