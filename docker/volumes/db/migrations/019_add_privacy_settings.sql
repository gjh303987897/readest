-- End-to-end encrypted privacy-mode settings, one authoritative row per user.
-- The server stores only an opaque AES-GCM envelope and resolves concurrent
-- device writes atomically by the client event timestamp.

CREATE TABLE IF NOT EXISTS public.privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  envelope jsonb NULL,
  updated_at timestamp with time zone NOT NULL,
  CONSTRAINT privacy_settings_envelope_size CHECK (pg_column_size(envelope) <= 1048576)
);

ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_settings_select ON public.privacy_settings
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY privacy_settings_insert ON public.privacy_settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY privacy_settings_update ON public.privacy_settings
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE ON public.privacy_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.privacy_settings_lww_upsert(
  p_envelope jsonb,
  p_updated_at timestamp with time zone
)
RETURNS public.privacy_settings
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.privacy_settings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'privacy_settings_lww_upsert called without an authenticated user';
  END IF;

  INSERT INTO public.privacy_settings AS current (user_id, envelope, updated_at)
  VALUES (auth.uid(), p_envelope, p_updated_at)
  ON CONFLICT (user_id) DO UPDATE
  SET envelope = EXCLUDED.envelope,
      updated_at = EXCLUDED.updated_at
  WHERE EXCLUDED.updated_at > current.updated_at;

  SELECT * INTO result
  FROM public.privacy_settings
  WHERE user_id = auth.uid();

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.privacy_settings_lww_upsert(jsonb, timestamp with time zone)
  TO authenticated;
