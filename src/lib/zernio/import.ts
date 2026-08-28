// Backfill for conversations/messages Zernio already had before the
// account was connected to wacrm (Instagram/Facebook DM history Zernio
// replays on connect — see the `listInboxConversations` description in
// the OpenAPI spec). None of this arrives via webhook, and Zernio's own
// docs say to re-run the sweep rather than trust a single pass, so this
// is written to be safe to call repeatedly: every write is an upsert
// keyed on the same external ids the live webhook path uses.
//
// Field names here come from the REST list endpoints, which do NOT
// match the webhook envelope (see src/lib/zernio/types.ts) — this file
// has its own resolution logic rather than reusing the webhook route's,
// on purpose.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

import { listZernioConversations, listZernioMessages } from './inbox'
import type { ZernioChannel } from './types'

const ATTACHMENT_TYPE_TO_CONTENT_TYPE: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'document',
  sticker: 'image',
  share: 'document',
}

export interface ImportSummary {
  conversations: number
  messages: number
}

/**
 * Pulls every conversation + message Zernio has for one connected
 * account and mirrors it into our tables. Never triggers AI
 * auto-reply or any automation — this is catch-up, not a live event.
 */
export async function importZernioAccountHistory(
  db: Db,
  accountId: string,
  channelAccount: { id: string; external_id: string; channel: ZernioChannel },
): Promise<ImportSummary> {
  const summary: ImportSummary = { conversations: 0, messages: 0 }

  let cursor: string | undefined
  do {
    const listResult = await listZernioConversations(
      channelAccount.external_id,
      cursor,
    )
    if (!listResult.success) break

    for (const conv of listResult.data.data) {
      const contactId = await resolveContact(
        db,
        accountId,
        channelAccount.channel,
        conv.participantId,
        conv.participantName ?? null,
      )
      if (!contactId) continue

      const { data: conversation, error: convError } = await db
        .from('conversations')
        .upsert(
          {
            account_id: accountId,
            contact_id: contactId,
            channel: channelAccount.channel,
            provider: 'zernio',
            channel_account_id: channelAccount.id,
            external_conversation_id: conv.id,
            last_message_text: conv.lastMessage ?? null,
            last_message_at: conv.updatedTime,
            unread_count: conv.unreadCount ?? 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,contact_id,channel' },
        )
        .select('id')
        .single()

      if (convError || !conversation) continue
      summary.conversations++

      summary.messages += await importMessages(
        db,
        conversation.id,
        conv.id,
        channelAccount.external_id,
      )
    }

    cursor = listResult.data.pagination.hasMore
      ? (listResult.data.pagination.nextCursor ?? undefined)
      : undefined
  } while (cursor)

  return summary
}

async function importMessages(
  db: Db,
  ourConversationId: string,
  externalConversationId: string,
  externalAccountId: string,
): Promise<number> {
  let imported = 0
  let cursor: string | undefined
  do {
    const result = await listZernioMessages(
      externalConversationId,
      externalAccountId,
      cursor,
    )
    if (!result.success) return imported

    for (const msg of result.data.messages) {
      const firstAttachment = msg.attachments[0]
      const contentType = firstAttachment
        ? (ATTACHMENT_TYPE_TO_CONTENT_TYPE[firstAttachment.type] ?? 'document')
        : 'text'

      const { error } = await db.from('messages').upsert(
        {
          conversation_id: ourConversationId,
          sender_type: msg.direction === 'outgoing' ? 'agent' : 'customer',
          content_type: contentType,
          content_text: msg.message || null,
          media_url: firstAttachment?.url ?? null,
          message_id: msg.id,
          status: 'delivered',
          created_at: msg.createdAt,
        },
        { onConflict: 'conversation_id,message_id' },
      )
      if (!error) imported++
    }

    cursor = result.data.pagination.hasMore
      ? (result.data.pagination.nextCursor ?? undefined)
      : undefined
  } while (cursor)

  return imported
}

async function resolveContact(
  db: Db,
  accountId: string,
  channel: ZernioChannel,
  externalId: string,
  name: string | null,
): Promise<string | null> {
  const { data: identity } = await db
    .from('contact_identities')
    .select('contact_id')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle()

  if (identity) return identity.contact_id as string

  const { data: newContact, error: contactError } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      phone: null,
      name: name ?? externalId,
    })
    .select('id')
    .single()

  if (contactError || !newContact) return null

  await db.from('contact_identities').insert({
    account_id: accountId,
    contact_id: newContact.id,
    channel,
    external_id: externalId,
    handle: null,
  })

  return newContact.id as string
}
