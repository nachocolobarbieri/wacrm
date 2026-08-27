import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { ZernioChannel } from '@/lib/zernio/types'

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/zernio/callback
 *
 * Where Zernio's hosted connect flow (GET /api/zernio/connect) sends
 * the browser back to. On success the query string carries
 * `connected={platform}&profileId=X&accountId=Y&username=Z` (see
 * GET /v1/connect/{platform} in the Zernio spec).
 *
 * A WABA with 2+ phone numbers needs a second manual step
 * (select-phone-number) that isn't wired up here yet — that case is
 * detected and surfaced instead of silently mis-connecting.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const settingsUrl = new URL('/settings', origin)

  const step = searchParams.get('step')
  if (step === 'select_phone_number') {
    settingsUrl.searchParams.set(
      'zernio_error',
      'multiple_numbers_not_supported',
    )
    return NextResponse.redirect(settingsUrl)
  }

  const connected = searchParams.get('connected') as ZernioChannel | null
  const profileId = searchParams.get('profileId')
  const accountId = searchParams.get('accountId')
  const username = searchParams.get('username')

  if (!connected || !profileId || !accountId) {
    settingsUrl.searchParams.set('zernio_error', 'connect_failed')
    return NextResponse.redirect(settingsUrl)
  }

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
    settingsUrl.searchParams.set('zernio_error', 'no_account')
    return NextResponse.redirect(settingsUrl)
  }

  const { error: upsertError } = await supabaseAdmin()
    .from('channel_accounts')
    .upsert(
      {
        account_id: profile.account_id,
        created_by: user.id,
        channel: connected,
        provider: 'zernio',
        external_id: accountId,
        profile_id: profileId,
        username,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'external_id' },
    )

  if (upsertError) {
    console.error('[zernio callback] upsert failed:', upsertError.message)
    settingsUrl.searchParams.set('zernio_error', 'save_failed')
    return NextResponse.redirect(settingsUrl)
  }

  settingsUrl.searchParams.set('zernio_connected', connected)
  return NextResponse.redirect(settingsUrl)
}
