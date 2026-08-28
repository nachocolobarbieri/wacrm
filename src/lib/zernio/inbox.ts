import { zernioFetch } from './client'
import type {
  ZernioListConversationsResponse,
  ZernioListMessagesResponse,
  ZernioSendMessageRequest,
  ZernioSendMessageResponse,
} from './types'

export async function sendZernioMessage(
  conversationId: string,
  body: ZernioSendMessageRequest,
) {
  return zernioFetch<ZernioSendMessageResponse>(
    `/v1/inbox/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export async function listZernioConversations(
  accountId: string,
  cursor?: string,
) {
  const params = new URLSearchParams({ accountId, limit: '100' })
  if (cursor) params.set('cursor', cursor)
  return zernioFetch<ZernioListConversationsResponse>(
    `/v1/inbox/conversations?${params.toString()}`,
  )
}

export async function listZernioMessages(
  conversationId: string,
  accountId: string,
  cursor?: string,
) {
  const params = new URLSearchParams({ accountId, limit: '100' })
  if (cursor) params.set('cursor', cursor)
  return zernioFetch<ZernioListMessagesResponse>(
    `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  )
}
