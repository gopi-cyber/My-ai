
import { getDb } from '../src/vault/schema.ts';

async function checkStatus() {
  console.log('=== AETHER System Verification ===');
  
  // 1. Check API Health
  try {
    const healthRes = await fetch('http://localhost:3142/health');
    const health = await healthRes.json();
    console.log('✓ Daemon Health:', health.status);
    console.log('  Services:', Object.keys(health.services).join(', '));
  } catch (e) {
    console.log('✗ Daemon Health Check Failed');
  }

  // 2. Check Database Tables
  const supabase = getDb();
  const tablesToCheck = ['content_items', 'content_stage_notes', 'content_attachments', 'conversations', 'conversation_messages'];
  
  console.log('\n--- Database Schema Verification ---');
  for (const table of tablesToCheck) {
    const { data, error } = await supabase.from(table).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`✗ Table '${table}': Missing or inaccessible (${error.message})`);
    } else {
      console.log(`✓ Table '${table}': OK (Rows: ${data?.length ?? 0})`);
    }
  }

  // 3. Check LLM Config
  try {
    const { data: config } = await supabase.from('jarvis_settings').select('*').eq('key', 'default_model').single();
    console.log('\n--- LLM Configuration ---');
    console.log(`Current Model: ${config?.value || 'Default'}`);
  } catch (e) {}

  process.exit(0);
}

checkStatus();
