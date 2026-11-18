// =============================================================
//  config.js — collegamento al server (Supabase)
// =============================================================
//  Project URL e chiave "publishable" (o "anon public") del progetto Supabase:
//  Supabase → Project Settings → API Keys.
//  Sono pensate per stare nell'app: i dati sono protetti dalle regole del database
//  (vedi supabase/schema.sql). NON mettere mai qui la chiave "secret" / "service_role".
//
//  Se restano vuote l'app funziona come prima, solo su questo dispositivo.

export const SUPABASE_URL = 'https://lmwzzwtvzimqjmzjakso.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_OZoth4PR3iAoryC1WwBM9Q_nRTrxB1B';
