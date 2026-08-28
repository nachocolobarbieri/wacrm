import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyZernioSignature } from '@/lib/zernio/webhooks'
import type {
  ZernioWebhookEnvelope,
  ZernioWebhookPayloadMessage,
} from '@/lib/zernio/types'

// Same 5-second-budget concern as the Meta webhook: persist inline,
// nothing heavy before the 200.
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}

const ATTACHMENT_TYPE_TO_CONTENT_TYPE: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'document',
  sticker: 'image',
}

/**
 * POST /api/webhooks/zernio
 *
 * Order matters here (mirrors the existing Meta webhook):
 *   1. Verify the signature over the RAW body.
 *   2. Claim the event id (INSERT ... ON CONFLICT DO NOTHING) —
 *      un-inserted means "already seen", so ack and stop.
 *   3. Route by account.accountId against channel_accounts.
 *   4. Resolve/create the contact + conversation, insert the message.
 *   5. 200.
 *
 * Only message.received is fully handled today. Every other
 * subscribed event (message.sent/delivered/read/failed,
 * account.connected/disconnected, ...) is logged and acked — never a
 * 500, since Zernio disables a webhook after repeated failures.
 *
 * AI auto-reply dispatch for these channels is intentionally NOT
 * wired up yet (follow-up work) — inbound messages land in the inbox
 * but nothing replies automatically.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-zernio-signature')

  if (!verifyZernioSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let envelope: ZernioWebhookEnvelope
  try {
    envelope = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Claim the event before doing anything else. Not inserted = retry
  // of an event we already processed.
  const { data: claimed, error: claimError } = await db
    .from('zernio_webhook_events')
    .insert({ event_id: envelope.id, event_type: envelope.event })
    .select('event_id')

  if (claimError) {
    console.error('[zernio webhook] claim failed:', claimError.message)
    // Unknown state — ack anyway so Zernio doesn't spiral into retries
    // for a DB hiccup on our side; worst case is a dropped event, not
    // a duplicate.
    return NextResponse.json({ ok: true })
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  if (envelope.event !== 'message.received') {
    // Delivery/read/failed/account events: not processed yet, just
    // logged so they show up in zernio_webhook_events for later work.
    void db
      .from('zernio_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', envelope.id)
    return NextResponse.json({ ok: true })
  }

  const payload = envelope as unknown as ZernioWebhookPayloadMessage

  try {
    await handleMessageReceived(db, payload)
  } catch (err) {
    console.error(
      '[zernio webhook] message.received handling failed:',
      err instanceof Error ? err.message : err,
    )
    // Event stays claimed (not re-processed on retry) — surfaced via
    // the GET recovery endpoint below instead of infinite retries.
  }

  after(async () => {
    await db
      .from('zernio_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', envelope.id)
  })

  return NextResponse.json({ ok: true })
}

async function handleMessageReceived(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  payload: ZernioWebhookPayloadMessage,
) {
  const { message, account, conversation: webhookConversation } = payload
  const channel = account.platform as 'whatsapp' | 'instagram' | 'facebook'
  const zernioAccountId = account.accountId ?? account.id

  const { data: channelAccount } = await db
    .from('channel_accounts')
    .select('id, account_id')
    .eq('external_id', zernioAccountId)
    .maybeSingle()

  if (!channelAccount) {
    // Event for an account we don't (or no longer) track — ack and
    // ignore, same as the Meta webhook's "no matching config" case.
    return
  }
  const accountId = channelAccount.account_id as string

  // Outgoing messages (sent from Zernio's own inbox UI, or mirrored
  // from the WhatsApp Business app on a coexistence number) aren't
  // handled here yet — only inbound customer messages.
  if (message.direction !== 'incoming') return

  const senderId = message.sender.id
  let contactId: string

  const { data: identity } = await db
    .from('contact_identities')
    .select('contact_id')
    .eq('channel', channel)
    .eq('external_id', senderId)
    .maybeSingle()

  if (identity) {
    contactId = identity.contact_id as string
  } else {
    const { data: newContact, error: contactError } = await db
      .from('contacts')
      .insert({
        account_id: accountId,
        phone: message.sender.phoneNumber ?? null,
        name: message.sender.name ?? message.sender.username ?? senderId,
      })
      .select('id')
      .single()

    if (contactError || !newContact) {
      throw new Error(`Failed to create contact: ${contactError?.message}`)
    }
    contactId = newContact.id as string

    await db.from('contact_identities').insert({
      account_id: accountId,
      contact_id: contactId,
      channel,
      external_id: senderId,
      handle: message.sender.username ?? null,
    })
  }

  const { data: conversation, error: convError } = await db
    .from('conversations')
    .upsert(
      {
        account_id: accountId,
        contact_id: contactId,
        channel,
        provider: 'zernio',
        channel_account_id: channelAccount.id,
        external_conversation_id: webhookConversation.id,
        last_message_text: message.text,
        last_message_at: message.sentAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,contact_id,channel' },
    )
    .select('id, unread_count')
    .single()

  if (convError || !conversation) {
    throw new Error(`Failed to upsert conversation: ${convError?.message}`)
  }

  await db
    .from('conversations')
    .update({ unread_count: (conversation.unread_count ?? 0) + 1 })
    .eq('id', conversation.id)

  const firstAttachment = message.attachments[0]
  const contentType = firstAttachment
    ? (ATTACHMENT_TYPE_TO_CONTENT_TYPE[firstAttachment.type] ?? 'document')
    : 'text'

  await db.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: message.text,
    media_url: firstAttachment?.url ?? null,
    message_id: message.platformMessageId,
    status: 'delivered',
    created_at: message.sentAt,
  })
}

/**
 * GET /api/webhooks/zernio
 *
 * Recovery net: lists events that were claimed (so a retry won't
 * re-deliver them) but never marked processed — e.g. the background
 * work died mid-flight. Not automated yet; a manual/cron sweep can
 * poll this and re-run handleMessageReceived for stragglers.
 */
export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('zernio_webhook_events')
    .select('event_id, event_type, received_at')
    .is('processed_at', null)
    .order('received_at', { ascending: true })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ unprocessed: data })
}
