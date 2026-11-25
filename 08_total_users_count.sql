-- Migration 08: Function to fetch total registered user count
-- Exposes an aggregate count of auth.users without exposing any sensitive user data.

CREATE OR REPLACE FUNCTION public.get_total_users_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM auth.users;
$$;

-- Allow anonymous and authenticated visitors to call this function
GRANT EXECUTE ON FUNCTION public.get_total_users_count() TO anon, authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
