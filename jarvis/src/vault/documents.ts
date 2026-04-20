/**
 * Vault Documents — CRUD for vault-stored documents
 *
 * Documents are files JARVIS creates (reports, plans, analyses, etc.)
 * stored in the vault SQLite database instead of on disk.
 * Refactored to use async Supabase client.
 */

import { getDb, generateId } from './schema.ts';

export type DocumentFormat = 'markdown' | 'plain' | 'html' | 'json' | 'csv' | 'code';

export type Document = {
  id: string;
  title: string;
  body: string;
  format: DocumentFormat;
  tags: string[];
  created_at: number;
  updated_at: number;
};

type DocumentRow = Omit<Document, 'tags'> & { tags: string | null };

function parseRow(row: DocumentRow): Document {
  return {
    ...row,
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
  };
}

export async function createDocument(title: string, body: string, opts?: {
  format?: DocumentFormat;
  tags?: string[];
}): Promise<Document> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const payload = {
    id,
    title,
    body,
    format: opts?.format ?? 'markdown',
    tags: opts?.tags ? JSON.stringify(opts.tags) : null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await db.from('documents').insert(payload);
  if (error) throw new Error(`Failed to create document: ${error.message}`);

  return {
    id, title, body,
    format: opts?.format ?? 'markdown',
    tags: opts?.tags ?? [],
    created_at: now,
    updated_at: now,
  };
}

export async function getDocument(id: string): Promise<Document | null> {
  const db = getDb();
  const { data, error } = await db.from('documents').select('*').eq('id', id).single();
  return (data && !error) ? parseRow(data as DocumentRow) : null;
}

export async function findDocuments(query?: {
  format?: DocumentFormat;
  tag?: string;
  search?: string;
}): Promise<Document[]> {
  const db = getDb();
  let q = db.from('documents').select('*');

  if (query?.format) {
    q = q.eq('format', query.format);
  }
  if (query?.tag) {
    q = q.like('tags', `%"${query.tag}"%`);
  }
  if (query?.search) {
    q = q.or(`title.ilike.%${query.search}%,body.ilike.%${query.search}%`);
  }

  const { data, error } = await q.order('updated_at', { ascending: false });

  if (error || !data) return [];
  return (data as DocumentRow[]).map(parseRow);
}

export async function updateDocument(id: string, updates: {
  title?: string;
  body?: string;
  format?: DocumentFormat;
  tags?: string[];
}): Promise<Document | null> {
  const db = getDb();
  const existing = await getDocument(id);
  if (!existing) return null;

  const payload: any = { updated_at: Date.now() };

  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.body !== undefined) payload.body = updates.body;
  if (updates.format !== undefined) payload.format = updates.format;
  if (updates.tags !== undefined) payload.tags = JSON.stringify(updates.tags);

  const { error } = await db.from('documents').update(payload).eq('id', id);
  if (error) throw new Error(`Failed to update document: ${error.message}`);

  return getDocument(id);
}

export async function deleteDocument(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('documents').delete().eq('id', id);
  return !error;
}
