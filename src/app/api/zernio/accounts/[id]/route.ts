import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectZernioAccount } from '@/lib/zernio/accounts'

/**
 * DELETE /api/zernio/accounts/[id]
 *
 * `id` is our internal channel_accounts.id (not Zernio's accountId).
 * Disconnects on Zernio's side first, then removes the local row — in
 * that order, so a Zernio-side failure doesn't leave us thinking a
 * still-live account is gone (inbound messages would keep arriving
 * with nowhere to route).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: account, error: fetchError } = await supabase
    .from('channel_accounts')
    .select('id, external_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !account) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const disconnectResult = await disconnectZernioAccount(account.external_id)
  if (!disconnectResult.success && disconnectResult.status !== 404) {
    // 404 from Zernio means it's already gone there — fine to clean up
    // our side. Any other failure: don't delete our record, so the
    // panel keeps showing it as connected rather than silently
    // dropping a still-live account.
    return NextResponse.json(
      { error: disconnectResult.error },
      { status: 502 },
    )
  }

  // RLS restricts this delete to account admins (migration 040).
  const { error: deleteError } = await supabase
    .from('channel_accounts')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
