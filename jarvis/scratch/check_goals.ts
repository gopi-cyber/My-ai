import { getDb } from '../src/vault/schema.ts';

async function run() {
  const supabase = getDb();
  const { data, error } = await supabase.from('goals').select('id, tags, health').limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}

run();
