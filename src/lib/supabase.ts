import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const createNoopSupabaseClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => undefined,
        },
      },
    }),
    signInWithOAuth: async () => ({ data: {}, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
      }),
    }),
    insert: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
    update: () => ({
      eq: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
    }),
    delete: () => ({
      eq: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
    }),
  }),
  storage: {
    from: () => ({
      download: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
      upload: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
      remove: async () => ({ data: null, error: new Error('Supabase is disabled.') }),
    }),
  },
});

export const supabase: SupabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : createNoopSupabaseClient() as unknown as SupabaseClient;
