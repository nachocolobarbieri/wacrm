import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDefaultZernioProfileId, getZernioConnectUrl } from '@/lib/zernio/connect'
import type { ZernioChannel } from '@/lib/zernio/types'

const VALID_CHANNELS: ZernioChannel[] = ['whatsapp', 'instagram', 'facebook', 'telegram']

/**
 * GET /api/zernio/connect?channel=whatsapp
 *
 * Visited directly (a link/button, not fetched) — it 302s the browser
 * straight to Zernio's hosted connect flow. For WhatsApp this is the
 * coexistence-mode Embedded Signup: the user's number stays usable in
 * the WhatsApp Business app while the API also connects.
 *
 * The redirect target is derived from the request, not an env var —
 * a stale APP_BASE_URL is exactly the silent-failure trap this app
 * already avoids elsewhere (see next.config.ts).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const channel = searchParams.get('channel') as ZernioChannel | null

  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: `channel must be one of ${VALID_CHANNELS.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileResult = await getDefaultZernioProfileId()
  if (!profileResult.success) {
    return NextResponse.json({ error: profileResult.error }, { status: 502 })
  }

  const redirectUrl = `${origin}/api/zernio/callback`
  const connectResult = await getZernioConnectUrl(
    channel,
    profileResult.profileId,
    redirectUrl,
  )
  if (!connectResult.success) {
    return NextResponse.json({ error: connectResult.error }, { status: 502 })
  }

  return NextResponse.redirect(connectResult.authUrl)
}
