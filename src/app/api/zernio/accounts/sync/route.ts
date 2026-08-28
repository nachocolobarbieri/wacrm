import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getDefaultZernioProfileId } from '@/lib/zernio/connect'
import { listZernioAccounts, KNOWN_CHANNELS } from '@/lib/zernio/accounts'
import { importZernioAccountHistory } from '@/lib/zernio/import'
import type { ZernioChannel } from '@/lib/zernio/types'

function isKnownChannel(platform: string): platform is ZernioChannel {
  return (KNOWN_CHANNELS as string[]).includes(platform)
}

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/zernio/accounts/sync
 *
 * Adopts accounts that are already connected on Zernio's side (e.g.
 * connected through Zernio's own dashboard instead of our
 * /api/zernio/connect flow) into `channel_accounts`, so the inbound
 * webhook — which routes strictly by `external_id` — actually
 * recognises them instead of silently dropping their events.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.account_id) {
    return NextResponse.json({ error: 'no_account' }, { status: 400 })
  }

  const profileResult = await getDefaultZernioProfileId()
  if (!profileResult.success) {
    return NextResponse.json({ error: profileResult.error }, { status: 502 })
  }

  const listResult = await listZernioAccounts(profileResult.profileId)
  if (!listResult.success) {
    return NextResponse.json({ error: listResult.error }, { status: 502 })
  }

  const db = supabaseAdmin()
  let imported = 0
  let conversations = 0
  let messages = 0

  for (const account of listResult.data.accounts) {
    if (!isKnownChannel(account.platform)) continue
    if (!account.isActive) continue

    const { data: channelAccount, error: upsertError } = await db
      .from('channel_accounts')
      .upsert(
        {
          account_id: profile.account_id,
          created_by: user.id,
          channel: account.platform,
          provider: 'zernio',
          external_id: account._id,
          profile_id: profileResult.profileId,
          username: account.username ?? null,
          display_name: account.displayName ?? null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'external_id' },
      )
      .select('id, external_id, channel')
      .single()

    if (upsertError || !channelAccount) continue
    imported++

    // Pull whatever conversation/message history Zernio already
    // replayed for this account — see src/lib/zernio/import.ts for
    // why this doesn't arrive via webhook and is safe to re-run.
    const summary = await importZernioAccountHistory(
      db,
      profile.account_id,
      channelAccount,
    )
    conversations += summary.conversations
    messages += summary.messages
  }

  return NextResponse.json({ ok: true, imported, conversations, messages })
}
