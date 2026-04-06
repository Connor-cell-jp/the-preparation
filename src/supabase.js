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

// Upload a photo file to the notes-photos Storage bucket.
// Returns { url, storageKey } on success, throws on error.
export async function uploadNotePhoto(file) {
  if (!_activeUserId) throw new Error('Not authenticated');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const storageKey = `${_activeUserId}/${Date.now()}.${ext || 'jpg'}`;
  const { error } = await supabase.storage
    .from('notes-photos')
    .upload(storageKey, file, { upsert: false });
  if (error) throw error;
  // Use a signed URL (1 year) so photos work with private buckets.
  const { data: signedData } = await supabase.storage
    .from('notes-photos')
    .createSignedUrl(storageKey, 31536000);
  const url = signedData?.signedUrl || '';
  return { url, storageKey };
}

// Generate a fresh signed URL for an existing photo (e.g. to refresh expired URLs).
export async function createSignedPhotoUrl(storageKey, expiresIn = 31536000) {
  if (!storageKey) return null;
  try {
    const { data, error } = await supabase.storage
      .from('notes-photos')
      .createSignedUrl(storageKey, expiresIn);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

// Delete a photo from the notes-photos Storage bucket.
// Fire-and-forget safe — never throws.
export async function deleteNotePhoto(storageKey) {
  if (!storageKey) return;
  try {
    await supabase.storage.from('notes-photos').remove([storageKey]);
  } catch {}
}
