// Send core for Zernio-provider conversations (Instagram, Facebook,
// and coexistence WhatsApp connected via Zernio) — the equivalent of
// src/lib/whatsapp/send-message.ts for the direct-Meta path. Kept
// separate rather than branching inside that file: each conversation
// has exactly one provider for its whole life, so there's no risk of
// the two paths racing on the same row: they never touch the same
// conversation.
//
// v1 scope: text and a single attachment. Templates/interactive
// messages are a WhatsApp-Cloud-API-specific concept that doesn't map
// onto Zernio's unified send — callers get a clear 400 instead of a
// silent mis-send.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendZernioMessage } from './inbox'

export class ZernioSendError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ZernioSendError'
    this.code = code
    this.status = status
  }
}

export interface ZernioSendParams {
  conversationId: string
  messageType: string
  contentText?: string | null
  mediaUrl?: string | null
  replyToMessageId?: string | null
}

export interface ZernioSendResult {
  messageId: string
}

const SUPPORTED_TYPES = new Set([
  'text',
  'image',
  'video',
  'document',
  'audio',
])

/**
 * `db` may be an RLS-scoped user client or the service-role client —
 * every query is filtered by `accountId` either way.
 */
export async function sendZernioMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  params: ZernioSendParams,
): Promise<ZernioSendResult> {
  const { conversationId, messageType, contentText, mediaUrl } = params

  if (!SUPPORTED_TYPES.has(messageType)) {
    throw new ZernioSendError(
      'unsupported_message_type',
      `"${messageType}" isn't supported on Instagram/Facebook/Zernio-connected conversations yet. Only text and media attachments are.`,
      400,
    )
  }
  if (messageType === 'text' && !contentText) {
    throw new ZernioSendError(
      'bad_request',
      'content_text is required for text messages',
      400,
    )
  }
  if (messageType !== 'text' && !mediaUrl) {
    throw new ZernioSendError('bad_request', 'media_url is required', 400)
  }

  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('id, channel_account_id, external_conversation_id, contact_id')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (convError || !conversation) {
    throw new ZernioSendError('not_found', 'Conversation not found', 404)
  }
  if (!conversation.channel_account_id || !conversation.external_conversation_id) {
    throw new ZernioSendError(
      'not_connected',
      'This conversation has no linked Zernio account — it may predate the connection or the account was disconnected.',
      409,
    )
  }

  const { data: channelAccount, error: accountError } = await db
    .from('channel_accounts')
    .select('external_id')
    .eq('id', conversation.channel_account_id)
    .maybeSingle()

  if (accountError || !channelAccount) {
    throw new ZernioSendError(
      'not_connected',
      'The connected account for this conversation is missing.',
      409,
    )
  }

  const sendResult = await sendZernioMessage(
    conversation.external_conversation_id,
    {
      accountId: channelAccount.external_id,
      message: messageType === 'text' ? (contentText ?? undefined) : undefined,
      attachmentUrl: mediaUrl ?? undefined,
      attachmentType:
        messageType === 'text'
          ? undefined
          : (messageType as 'image' | 'video' | 'audio' | 'file'),
    },
  )

  if (!sendResult.success) {
    throw new ZernioSendError('zernio_error', sendResult.error, 502)
  }

  const { data: messageRecord, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: messageType,
      content_text: contentText || null,
      media_url: mediaUrl || null,
      message_id: sendResult.data.id,
      status: 'sent',
      reply_to_message_id: params.replyToMessageId || null,
    })
    .select()
    .single()

  if (msgError || !messageRecord) {
    throw new ZernioSendError(
      'db_error',
      `Message sent but failed to save to DB: ${msgError?.message}`,
      500,
    )
  }

  await db
    .from('conversations')
    .update({
      last_message_text: contentText || `[${messageType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  return { messageId: messageRecord.id }
}
