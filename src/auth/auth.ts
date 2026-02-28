import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AuthUser = User | null;

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
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
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
