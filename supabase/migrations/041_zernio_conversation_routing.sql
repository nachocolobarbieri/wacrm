-- ============================================================
-- 041_zernio_conversation_routing.sql
--
-- Migration 040 let a Zernio-sourced conversation get created, but
-- never stored what's needed to SEND into it: Zernio's own
-- conversation id (its send endpoint is
-- POST /v1/inbox/conversations/{conversationId}/messages — a
-- Zernio-side id, not ours) and which connected account owns it (the
-- accountId that same call requires). Without these two columns the
-- inbox could display Instagram/Facebook messages but never reply to
-- them.
--
-- Both are nullable: existing WhatsApp/Meta-direct conversations
-- (provider = 'meta') never populate them and are unaffected.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel_account_id uuid
    REFERENCES channel_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_conversation_id text;

CREATE INDEX IF NOT EXISTS conversations_channel_account_id_idx
  ON conversations (channel_account_id);
