
import { getDb } from '../src/vault/schema.ts';

const tables = [
  'commitments',
  'facts',
  'entities',
  'relationships',
  'agent_messages',
  'webapp_templates',
  'conversations',
  'conversation_messages',
  'observations',
  'goals',
  'goal_progress',
  'goal_check_ins',
  'settings',
  'keychain'
];

async function check() {
  console.log('Checking Supabase tables...');
  const supabase = getDb();
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('not find the table') || error.code === '42P01') {
        console.error(`[-] Table missing or inaccessible: ${table} (${error.message})`);
      } else {
        console.error(`[?] Error checking ${table}: ${error.message} (${error.code})`);
      }
    } else {
      console.log(`[+] Table exists: ${table}`);
    }
  }
}

check().catch(console.error);
