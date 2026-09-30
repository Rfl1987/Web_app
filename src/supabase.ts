import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://vbetvulcdhqogaialnfm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZXR2dWxjZGhxb2dhaWFsbmZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTY1NTcsImV4cCI6MjEwNjM3MjU1N30.p37M6gx7iIpUlrA57x-3tPeRjaGHtenglqNCTaIGCp4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
