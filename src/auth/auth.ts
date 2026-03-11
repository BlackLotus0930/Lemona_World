import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AuthUser = User | null;
const SAVE_DB_NAME = 'lemona-save-db';

function clearSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('sb-') && key.includes('-auth-token')) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
}

function clearSimulationPersistence(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(SAVE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase auth is not configured.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  });
  if (error) {
    throw error;
  }
}

export async function signInWithGitHub(): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase auth is not configured.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
  });
  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  if (supabase) {
    // Local scope guarantees client-side logout even if network is flaky.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      throw error;
    }
  }
  clearSupabaseAuthStorage();
  await clearSimulationPersistence();
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  if (!supabase) {
    return () => {
      // No-op when auth is disabled by configuration.
    };
  }

  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => {
    data.subscription.unsubscribe();
  };
}
