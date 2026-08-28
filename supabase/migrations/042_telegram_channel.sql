-- ============================================================
-- 042_telegram_channel.sql — add Telegram as a fourth channel,
-- alongside WhatsApp/Instagram/Facebook (all via Zernio, same as
-- Instagram/Facebook — see migration 040).
--
-- Widens the three CHECK constraints that enumerate allowed channel
-- values. Postgres has no "ADD VALUE IF NOT EXISTS" for a plain CHECK
-- (that's an enum-type thing), so each is dropped and recreated with
-- 'telegram' added — safe because these are simple allow-list checks,
-- not columns with dependent objects.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'telegram'));

ALTER TABLE channel_accounts DROP CONSTRAINT IF EXISTS channel_accounts_channel_check;
ALTER TABLE channel_accounts ADD CONSTRAINT channel_accounts_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'telegram'));

ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_check;
ALTER TABLE contact_identities ADD CONSTRAINT contact_identities_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'telegram'));
