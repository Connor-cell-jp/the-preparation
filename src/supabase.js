import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let _activeUserId = null;
export const setActiveUserId = (id) => { _activeUserId = id; };

export async function fetchAllUserData(userId) {
  const { data, error } = await supabase
    .from('user_data')
    .select('key, value')
    .eq('user_id', userId);
  if (error) throw error;
  for (const row of (data || [])) {
    try { localStorage.setItem(row.key, row.value); } catch {}
  }
}

// rawValue is the exact string to store in localStorage (already JSON.stringify'd or raw string)
export async function upsertUserDataRaw(key, rawValue) {
  if (!_activeUserId) return;
  try {
    await supabase
      .from('user_data')
      .upsert(
        { user_id: _activeUserId, key, value: rawValue, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' }
      );
  } catch {}
}
