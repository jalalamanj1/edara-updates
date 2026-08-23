import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env: any =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env
    : (process.env as any);

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

/**
 * Guard so the app never crashes when the public Supabase env vars are absent.
 * Only the publishable anon key is used here — never a service-role or secret key.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        // The public Dashboard feed is read-only/anonymous, but the News CMS admin
        // flow signs in here too. Persisting the session keeps the admin logged in
        // across app restarts; the dashboard never triggers a sign-in.
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
