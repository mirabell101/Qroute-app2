/**
 * Temporary Supabase connection test — safe to delete after use.
 * Tests connectivity only; does not modify any data or auth state.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('❌ VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is not set.');
  process.exit(1);
}

console.log('--- Supabase Connection Test ---');
console.log(`URL set:  ✅ (${url.substring(0, 8)}…${url.slice(-15)})`);
console.log(`Key set:  ✅ (${key.substring(0, 16)}…)`);

const supabase = createClient(url, key);

// Test 1: Auth endpoint — getSession (read-only, no credentials needed)
try {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(`\n❌ Auth endpoint error: ${error.message}`);
  } else {
    console.log(`\n✅ Auth endpoint reachable — session: ${data.session ? 'active' : 'none (expected when not logged in)'}`);
  }
} catch (e) {
  console.error(`\n❌ Auth endpoint unreachable:`, e instanceof Error ? e.message : e);
}

// Test 2: REST (PostgREST) health — query a non-existent table to check connectivity
// A "relation not found" error means PostgREST is reachable.
// A network/fetch error means the project is unreachable.
try {
  const { error } = await supabase.from('__connection_test_nonexistent__').select('*').limit(1);
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('Not Found') || error.code === '42P01' || error.code === 'PGRST204') {
      console.log('✅ REST API (PostgREST) reachable — responded with expected "not found" for dummy table.');
    } else {
      // Any other DB error still confirms the server responded
      console.log(`✅ REST API reachable — response code: ${error.code}, message: ${error.message}`);
    }
  } else {
    console.log('✅ REST API reachable (unexpected success for dummy table — check schema exposure).');
  }
} catch (e) {
  console.error('❌ REST API unreachable:', e instanceof Error ? e.message : e);
}

// Test 3: Raw HTTP ping to the Supabase project root
try {
  const res = await fetch(url);
  console.log(`✅ Project root HTTP status: ${res.status} ${res.statusText}`);
} catch (e) {
  console.error('❌ Project URL unreachable:', e instanceof Error ? e.message : e);
}

console.log('\n--- Test complete ---');
