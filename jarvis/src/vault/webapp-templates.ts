/**
 * Webapp Templates — Pre-built browser navigation instructions
 *
 * Stores per-app instructions that get injected into the system prompt
 * when Jarvis detects a relevant webapp in the user's message or URL.
 */

import { getDb, generateId, nowIso } from './schema.ts';

export type WebappTemplate = {
  id: string;
  app_name: string;
  domains: string[];
  keywords: string[];
  description: string;
  instructions: string;
  version: number;
  enabled: boolean;
  created_at: string; // Changed from number to string (ISO)
  updated_at: string; // Changed from number to string (ISO)
};

type WebappRow = {
  id: string;
  app_name: string;
  domains: string;
  keywords: string;
  description: string;
  instructions: string;
  version: number;
  enabled: number;
  created_at: string; // Changed from number to string (ISO)
  updated_at: string; // Changed from number to string (ISO)
};

function rowToTemplate(row: WebappRow): WebappTemplate {
  return {
    ...row,
    domains: typeof row.domains === 'string' ? JSON.parse(row.domains) : (row.domains || []),
    keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (row.keywords || []),
    enabled: row.enabled === 1,
  };
}

/**
 * Upsert a webapp template (insert or update by app_name).
 */
export async function upsertWebappTemplate(template: {
  app_name: string;
  domains: string[];
  keywords?: string[];
  description: string;
  instructions: string;
  version?: number;
  enabled?: boolean;
}): Promise<WebappTemplate> {
  const db = getDb();
  const createdAt = nowIso();
  const updatedAt = nowIso();

  // Check if exists
  const { data: existing } = await db
    .from('webapp_templates')
    .select('id, version')
    .eq('app_name', template.app_name)
    .single();

  if (existing) {
    const { error } = await db
      .from('webapp_templates')
      .update({
        domains: JSON.stringify(template.domains),
        keywords: JSON.stringify(template.keywords ?? []),
        description: template.description,
        instructions: template.instructions,
        version: template.version ?? (existing.version + 1),
        enabled: (template.enabled ?? true) ? 1 : 0,
        updated_at: updatedAt,
      })
      .eq('id', existing.id);

    if (error) throw error;
    return (await getWebappTemplate(existing.id))!;
  }

  const id = generateId();
  const { error } = await db
    .from('webapp_templates')
    .insert({
      id,
      app_name: template.app_name,
      domains: JSON.stringify(template.domains),
      keywords: JSON.stringify(template.keywords ?? []),
      description: template.description,
      instructions: template.instructions,
      version: template.version ?? 1,
      enabled: (template.enabled ?? true) ? 1 : 0,
      created_at: createdAt,
      updated_at: updatedAt,
    });

  if (error) throw error;
  return (await getWebappTemplate(id))!;
}

/**
 * Get a template by ID.
 */
export async function getWebappTemplate(id: string): Promise<WebappTemplate | null> {
  const db = getDb();
  const { data: row } = await db
    .from('webapp_templates')
    .select('*')
    .eq('id', id)
    .single();
    
  return row ? rowToTemplate(row as WebappRow) : null;
}

/**
 * Get a template by app name (case-insensitive).
 */
export async function getWebappTemplateByName(appName: string): Promise<WebappTemplate | null> {
  const db = getDb();
  const { data: row } = await db
    .from('webapp_templates')
    .select('*')
    .ilike('app_name', appName)
    .eq('enabled', 1)
    .single();
    
  return row ? rowToTemplate(row as WebappRow) : null;
}

/**
 * Get a template by domain (e.g. "web.whatsapp.com").
 */
export async function getWebappTemplateByDomain(url: string): Promise<WebappTemplate | null> {
  const db = getDb();
  const { data: rows } = await db
    .from('webapp_templates')
    .select('*')
    .eq('enabled', 1);

  if (!rows) return null;

  // Extract hostname from URL
  let hostname: string;
  try {
    hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    hostname = url.toLowerCase();
  }

  for (const row of (rows as WebappRow[])) {
    const domains: string[] = typeof row.domains === 'string' ? JSON.parse(row.domains) : (row.domains || []);
    for (const domain of domains) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return rowToTemplate(row);
      }
    }
  }

  return null;
}

/**
 * List all webapp templates.
 */
export async function listWebappTemplates(enabledOnly = true): Promise<WebappTemplate[]> {
  const db = getDb();
  let query = db.from('webapp_templates').select('*');
  
  if (enabledOnly) {
    query = query.eq('enabled', 1);
  }
  
  const { data: rows } = await query.order('app_name');
  return (rows as WebappRow[] ?? []).map(rowToTemplate);
}

/**
 * Match webapp templates against a user message.
 * Checks for app name mentions, URL patterns, and keyword triggers.
 * Returns all matching templates (usually 0-1).
 */
export async function matchWebappTemplates(message: string): Promise<WebappTemplate[]> {
  const db = getDb();
  const { data: rows } = await db
    .from('webapp_templates')
    .select('*')
    .eq('enabled', 1);

  if (!rows || rows.length === 0) return [];

  const msgLower = message.toLowerCase();
  const matched: WebappTemplate[] = [];

  for (const row of (rows as WebappRow[])) {
    const appNameLower = row.app_name.toLowerCase();

    // Check if app name appears in message
    if (msgLower.includes(appNameLower)) {
      matched.push(rowToTemplate(row));
      continue;
    }

    // Check if any domain appears in message
    const domains: string[] = typeof row.domains === 'string' ? JSON.parse(row.domains) : (row.domains || []);
    let domainMatch = false;
    for (const domain of domains) {
      if (msgLower.includes(domain)) {
        matched.push(rowToTemplate(row));
        domainMatch = true;
        break;
      }
    }
    if (domainMatch) continue;

    // Check if any keyword triggers match
    const keywords: string[] = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (row.keywords || []);
    for (const keyword of keywords) {
      if (msgLower.includes(keyword.toLowerCase())) {
        matched.push(rowToTemplate(row));
        break;
      }
    }
  }

  return matched;
}

/**
 * Format matched templates into prompt-ready text.
 */
export function formatWebappInstructions(templates: WebappTemplate[]): string {
  if (templates.length === 0) return '';

  const sections: string[] = [];

  for (const t of templates) {
    sections.push(`## ${t.app_name} — Browser Instructions`);
    sections.push(`Domains: ${t.domains.join(', ')}`);
    sections.push('');
    sections.push(t.instructions);
  }

  return sections.join('\n');
}

/**
 * Main entry: get formatted webapp instructions for a user message.
 * Returns empty string if no matching templates found.
 */
export async function getWebappInstructionsForMessage(message: string): Promise<string> {
  try {
    const templates = await matchWebappTemplates(message);
    return formatWebappInstructions(templates);
  } catch (err) {
    console.error('[WebappTemplates] Error matching templates:', err);
    return '';
  }
}
