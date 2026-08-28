import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/zernio/accounts
 *
 * Lists the caller's connected Zernio channel accounts, straight from
 * our own table (RLS-scoped — any account member can see the roster,
 * same as the WhatsApp config panel).
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('channel_accounts')
    .select('id, channel, external_id, username, display_name, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ accounts: data })
}
