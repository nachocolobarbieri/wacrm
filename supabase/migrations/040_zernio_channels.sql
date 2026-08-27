-- ============================================================
-- 040_zernio_channels.sql — Instagram/Facebook (and WhatsApp via
-- Zernio) on top of the existing single-channel WhatsApp model.
--
-- The app was built phone-first: `contacts.phone` is NOT NULL and
-- `conversations` enforces one row per (account_id, contact_id)
-- (migration 036). Instagram/Facebook contacts have no phone, and a
-- contact who writes on two channels needs two separate threads — so
-- both of those need to loosen, carefully, without touching the
-- guarantee migration 036 exists for (no duplicate threads for the
-- same contact on the same channel).
--
-- What changes vs. what doesn't:
--   - contacts.phone becomes nullable. Existing rows are untouched;
--     the WhatsApp write path still always sets it. Only
--     Zernio-sourced Instagram/Facebook contacts will have it null.
--   - conversations gets `channel` + `provider`. Every existing row
--     backfills to ('whatsapp', 'meta'), which is exactly what it is
--     today — the direct-Meta integration is untouched and keeps
--     working exactly as before.
--   - The old UNIQUE(account_id, contact_id) is replaced with
--     UNIQUE(account_id, contact_id, channel). This *widens* what's
--     allowed (a contact can now have one thread per channel) without
--     reopening the bug 036 fixed (still at most one thread per
--     contact *per channel*).
--   - New tables (channel_accounts, contact_identities,
--     zernio_webhook_events) are additive and don't touch any
--     existing WhatsApp/Meta code path.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---------------------------------------------------------------
-- contacts.phone: nullable, for identities that have no phone number.
-- ---------------------------------------------------------------
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

-- ---------------------------------------------------------------
-- conversations: channel + provider, and the widened uniqueness.
-- ---------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel  text NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'instagram', 'facebook')),
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta'
    CHECK (provider IN ('meta', 'zernio'));

DROP INDEX IF EXISTS idx_conversations_account_contact;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_channel
  ON conversations (account_id, contact_id, channel);

-- ---------------------------------------------------------------
-- channel_accounts — the Zernio-connected accounts (one per
-- WhatsApp number / Instagram professional account / Facebook Page).
-- external_id is Zernio's accountId; it's what inbound webhooks key
-- routing on, so it's unique regardless of which account connected it.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel       text NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook')),
  provider      text NOT NULL DEFAULT 'zernio' CHECK (provider = 'zernio'),
  external_id   text NOT NULL,             -- Zernio accountId
  profile_id    text NOT NULL,             -- Zernio profileId this account lives under
  username      text,                      -- display phone / @handle
  display_name  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_id)
);

CREATE INDEX IF NOT EXISTS channel_accounts_account_id_idx
  ON channel_accounts (account_id);

ALTER TABLE channel_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_accounts_select ON channel_accounts;
CREATE POLICY channel_accounts_select ON channel_accounts FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS channel_accounts_insert ON channel_accounts;
CREATE POLICY channel_accounts_insert ON channel_accounts FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channel_accounts_update ON channel_accounts;
CREATE POLICY channel_accounts_update ON channel_accounts FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channel_accounts_delete ON channel_accounts;
CREATE POLICY channel_accounts_delete ON channel_accounts FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ---------------------------------------------------------------
-- contact_identities — resolves a Zernio-side sender (platform +
-- external id, e.g. an Instagram-scoped user id) to a `contacts` row.
-- WhatsApp/Meta-direct contacts are unaffected: they keep resolving
-- by phone, exactly as before.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook')),
  external_id text NOT NULL,   -- the sender id as Zernio reports it (message.sender.id)
  handle      text,            -- @username, when the platform has one
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);

CREATE INDEX IF NOT EXISTS contact_identities_contact_id_idx
  ON contact_identities (contact_id);

ALTER TABLE contact_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_identities_select ON contact_identities;
CREATE POLICY contact_identities_select ON contact_identities FOR SELECT
  USING (is_account_member(account_id));

-- Only the (service-role) webhook path writes these; no dashboard UI
-- inserts/updates/deletes them, so no membership-scoped write policy.

-- ---------------------------------------------------------------
-- zernio_webhook_events — idempotency claim for the inbound Zernio
-- webhook. Named separately from the unrelated `webhook_endpoints`
-- table (that one is *outbound*, wacrm -> customer integrations).
-- INSERT ... ON CONFLICT DO NOTHING RETURNING is how the webhook
-- route claims an event id before processing it.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zernio_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- No RLS: only the service-role webhook route ever touches this table.
