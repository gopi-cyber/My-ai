
import { getDb } from '../src/vault/schema.ts';

async function checkSchema() {
  const supabase = getDb();
  
  // We can't run raw SQL via the client easily unless we use an RPC.
  // But we can try to inspect a row from each table to guess the types,
  // or better, use the Postgres meta-data if available via some clever trick?
  // Actually, Supabase JS client doesn't expose a 'query' method for raw SQL.
  
  // Let's try to fetch one row from 'goals' and see what the ID looks like.
  const { data, error } = await supabase.from('goals').select('*').limit(1);
  if (error) {
    console.error('Error fetching from goals:', error.message);
  } else if (data && data.length > 0) {
    console.log('Sample Goal:', JSON.stringify(data[0], null, 2));
    console.log('Type of goals.id:', typeof data[0].id);
  } else {
    console.log('Goals table exists but is empty.');
  }
  
  const tables = ['commitments', 'entities', 'facts', 'relationships'];
  for (const t of tables) {
    const { data: d, error: e } = await supabase.from(t).select('*').limit(1);
    if (!e && d && d.length > 0) {
      console.log(`Sample from ${t}:`, JSON.stringify(d[0].id));
    }
  }
}

checkSchema().catch(console.error);
