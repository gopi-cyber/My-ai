/**
 * Vault Sidecars — CRUD for enrolled sidecar processes
 */

import { getDb } from './schema.ts';
import type { SidecarRecord, SidecarStatus } from '../sidecar/types.ts';

export async function createSidecar(id: string, name: string, tokenId: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from('sidecars').insert({
    id,
    name,
    token_id: tokenId,
    enrolled_at: new Date().toISOString(),
    status: 'enrolled',
  });

  if (error) throw new Error(`Failed to create sidecar: ${error.message}`);
}

export async function getSidecar(id: string): Promise<SidecarRecord | null> {
  const db = getDb();
  const { data, error } = await db.from('sidecars').select('*').eq('id', id).single();
  return (data && !error) ? data as SidecarRecord : null;
}

export async function findSidecars(status: SidecarStatus = 'enrolled'): Promise<SidecarRecord[]> {
  const db = getDb();
  const { data, error } = await db
    .from('sidecars')
    .select('*')
    .eq('status', status)
    .order('enrolled_at', { ascending: false });

  if (error || !data) return [];
  return data as SidecarRecord[];
}

export async function updateSidecar(id: string, updates: Partial<SidecarRecord>): Promise<void> {
  const db = getDb();
  const { error } = await db.from('sidecars').update(updates).eq('id', id);
  if (error) throw new Error(`Failed to update sidecar: ${error.message}`);
}

export async function deleteSidecar(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('sidecars').delete().eq('id', id);
  return !error;
}

export async function touchSidecar(id: string): Promise<void> {
  const db = getDb();
  await db.from('sidecars').update({
    last_seen_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function isEnrolled(id: string): Promise<boolean> {
  const db = getDb();
  const { data, error } = await db
    .from('sidecars')
    .select('id')
    .eq('id', id)
    .eq('status', 'enrolled')
    .maybeSingle();
    
  return !!data && !error;
}

export async function getSidecarByName(name: string, status: SidecarStatus = 'enrolled'): Promise<SidecarRecord | null> {
  const db = getDb();
  const { data, error } = await db
    .from('sidecars')
    .select('*')
    .eq('name', name)
    .eq('status', status)
    .maybeSingle();

  return (data && !error) ? data as SidecarRecord : null;
}
