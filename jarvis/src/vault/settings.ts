/**
 * Key-value settings store backed by Supabase.
 *
 * Used for persistent configuration that can be edited from the dashboard
 * (e.g., LLM provider/model preferences).
 */

import { getDb } from './schema.ts';

/**
 * Get a setting value by key
 */
export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) return null;
  return data.value;
}

/**
 * Set a setting value, creating it if it doesn't exist
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  
  const { error } = await db.from('settings').upsert({
    key,
    value,
    updated_at: now,
  }, { onConflict: 'key' });

  if (error) throw new Error(`Failed to set setting ${key}: ${error.message}`);
}

/**
 * Delete a setting by key
 */
export async function deleteSetting(key: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from('settings').delete().eq('key', key);
  
  if (error) throw new Error(`Failed to delete setting ${key}: ${error.message}`);
}

/**
 * Get all settings starting with a given prefix
 */
export async function getSettingsByPrefix(prefix: string): Promise<Record<string, string>> {
  const db = getDb();
  const { data, error } = await db
    .from('settings')
    .select('key, value')
    .like('key', `${prefix}%`);

  if (error || !data) return {};

  const result: Record<string, string> = {};
  for (const row of data) {
    result[row.key] = row.value;
  }
  return result;
}
