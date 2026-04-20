import { getDb, generateId } from './schema.ts';

/** Escape SQL LIKE wildcard characters in user input */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export const CONTENT_STAGES = [
  'idea', 'research', 'outline', 'draft', 'assets', 'review', 'scheduled', 'published',
] as const;

export type ContentStage = typeof CONTENT_STAGES[number];

export const CONTENT_TYPES = [
  'youtube', 'blog', 'twitter', 'instagram', 'tiktok', 'linkedin',
  'podcast', 'newsletter', 'short_form', 'other',
] as const;

export type ContentType = typeof CONTENT_TYPES[number];

export type ContentItem = {
  id: string;
  title: string;
  body: string;
  content_type: ContentType;
  stage: ContentStage;
  tags: string[];
  scheduled_at: number | null;
  published_at: number | null;
  published_url: string | null;
  created_by: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

export type ContentStageNote = {
  id: string;
  content_id: string;
  stage: ContentStage;
  note: string;
  author: string;
  created_at: number;
};

export type ContentAttachment = {
  id: string;
  content_id: string;
  filename: string;
  disk_path: string;
  mime_type: string;
  size_bytes: number;
  label: string | null;
  created_at: number;
};

type ContentRow = Omit<ContentItem, 'tags'> & { tags: string | null };

function parseRow(row: ContentRow): ContentItem {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

// --- Content Items CRUD ---

export async function createContent(title: string, opts?: {
  body?: string;
  content_type?: ContentType;
  stage?: ContentStage;
  tags?: string[];
  created_by?: string;
}): Promise<ContentItem> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('content_items').insert({
    id,
    title,
    body: opts?.body ?? '',
    content_type: opts?.content_type ?? 'blog',
    stage: opts?.stage ?? 'idea',
    tags: opts?.tags ? JSON.stringify(opts.tags) : null,
    created_by: opts?.created_by ?? 'user',
    created_at: now,
    updated_at: now,
    sort_order: 0,
  });

  if (error) throw new Error(`Failed to create content: ${error.message}`);

  return {
    id, title,
    body: opts?.body ?? '',
    content_type: (opts?.content_type ?? 'blog') as ContentType,
    stage: (opts?.stage ?? 'idea') as ContentStage,
    tags: opts?.tags ?? [],
    scheduled_at: null,
    published_at: null,
    published_url: null,
    created_by: opts?.created_by ?? 'user',
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function getContent(id: string): Promise<ContentItem | null> {
  const db = getDb();
  const { data: row, error } = await db.from('content_items').select('*').eq('id', id).maybeSingle();
  if (error || !row) return null;
  return parseRow(row as ContentRow);
}

export async function findContent(query: {
  stage?: ContentStage;
  content_type?: ContentType;
  tag?: string;
}): Promise<ContentItem[]> {
  const db = getDb();
  let q = db.from('content_items').select('*');

  if (query.stage) {
    q = q.eq('stage', query.stage);
  }
  if (query.content_type) {
    q = q.eq('content_type', query.content_type);
  }
  if (query.tag) {
    q = q.like('tags', `%"${escapeLike(query.tag)}"%`);
  }

  const { data: rows, error } = await q.order('sort_order', { ascending: true }).order('updated_at', { ascending: false });

  if (error || !rows) return [];
  return (rows as ContentRow[]).map(parseRow);
}

export async function updateContent(id: string, updates: {
  title?: string;
  body?: string;
  content_type?: ContentType;
  stage?: ContentStage;
  tags?: string[];
  scheduled_at?: number | null;
  published_at?: number | null;
  published_url?: string | null;
  sort_order?: number;
}): Promise<ContentItem | null> {
  const db = getDb();
  
  const payload: any = { updated_at: Date.now() };
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.body !== undefined) payload.body = updates.body;
  if (updates.content_type !== undefined) payload.content_type = updates.content_type;
  if (updates.stage !== undefined) payload.stage = updates.stage;
  if (updates.tags !== undefined) payload.tags = JSON.stringify(updates.tags);
  if (updates.scheduled_at !== undefined) payload.scheduled_at = updates.scheduled_at;
  if (updates.published_at !== undefined) payload.published_at = updates.published_at;
  if (updates.published_url !== undefined) payload.published_url = updates.published_url;
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

  const { error } = await db.from('content_items').update(payload).eq('id', id);
  if (error) return null;

  return getContent(id);
}

export async function deleteContent(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('content_items').delete().eq('id', id);
  return !error;
}

export async function advanceStage(id: string): Promise<ContentItem | null> {
  const item = await getContent(id);
  if (!item) return null;
  const idx = CONTENT_STAGES.indexOf(item.stage);
  if (idx >= CONTENT_STAGES.length - 1) return null;
  return updateContent(id, { stage: CONTENT_STAGES[idx + 1] });
}

export async function regressStage(id: string): Promise<ContentItem | null> {
  const item = await getContent(id);
  if (!item) return null;
  const idx = CONTENT_STAGES.indexOf(item.stage);
  if (idx <= 0) return null;
  return updateContent(id, { stage: CONTENT_STAGES[idx - 1] });
}

// --- Stage Notes ---

export async function addStageNote(
  contentId: string,
  stage: ContentStage,
  note: string,
  author: string = 'user'
): Promise<ContentStageNote> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('content_stage_notes').insert({
    id,
    content_id: contentId,
    stage,
    note,
    author,
    created_at: now,
  });

  if (error) throw new Error(`Failed to add stage note: ${error.message}`);

  return { id, content_id: contentId, stage, note, author, created_at: now };
}

export async function getStageNotes(contentId: string, stage?: ContentStage): Promise<ContentStageNote[]> {
  const db = getDb();
  let q = db.from('content_stage_notes').select('*').eq('content_id', contentId);
  
  if (stage) {
    q = q.eq('stage', stage);
  }
  
  const { data: rows, error } = await q.order('created_at', { ascending: true });
  if (error || !rows) return [];
  return rows as ContentStageNote[];
}

// --- Attachments ---

export async function addAttachment(
  contentId: string,
  filename: string,
  diskPath: string,
  mimeType: string,
  sizeBytes: number,
  label?: string
): Promise<ContentAttachment> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('content_attachments').insert({
    id,
    content_id: contentId,
    filename,
    disk_path: diskPath,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    label: label ?? null,
    created_at: now,
  });

  if (error) throw new Error(`Failed to add attachment: ${error.message}`);

  return { id, content_id: contentId, filename, disk_path: diskPath, mime_type: mimeType, size_bytes: sizeBytes, label: label ?? null, created_at: now };
}

export async function getAttachment(id: string): Promise<ContentAttachment | null> {
  const db = getDb();
  const { data: row, error } = await db.from('content_attachments').select('*').eq('id', id).maybeSingle();
  return (row && !error) ? row as ContentAttachment : null;
}

export async function getAttachments(contentId: string): Promise<ContentAttachment[]> {
  const db = getDb();
  const { data: rows, error } = await db
    .from('content_attachments')
    .select('*')
    .eq('content_id', contentId)
    .order('created_at', { ascending: true });
  
  if (error || !rows) return [];
  return rows as ContentAttachment[];
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('content_attachments').delete().eq('id', id);
  return !error;
}
