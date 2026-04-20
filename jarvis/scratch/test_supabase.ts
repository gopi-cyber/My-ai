
import { getDb } from '../src/vault/schema.ts';
import { getCaptureCountSince } from '../src/vault/awareness.ts';

async function testSupabase() {
  const supabase = getDb();
  console.log('Testing Supabase connection with getCaptureCountSince (NUMBER input)...');
  
  try {
    const ninetyMinAgo = Date.now() - 90 * 60 * 1000;
    const count = await getCaptureCountSince(ninetyMinAgo);
    console.log('Success! Count is:', count);
  } catch (err) {
    console.error('Catch error:', err);
  }
}

testSupabase();
