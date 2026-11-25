'use server';

import { createClient } from '@/utils/supabase/server';

/**
 * Returns the total count of registered user accounts in Supabase Auth.
 * Uses the database RPC function `get_total_users_count`.
 */
export async function getTotalUsersCount(): Promise<{ count: number | null; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_total_users_count');

    if (error) {
      console.error('Failed to get total users count:', error);
      return { count: null, error: error.message };
    }

    return { count: typeof data === 'number' ? data : Number(data) || 0 };
  } catch (err) {
    console.error('Unexpected error fetching user count:', err);
    return { count: null, error: 'Unexpected error' };
  }
}
