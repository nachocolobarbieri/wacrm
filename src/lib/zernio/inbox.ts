import { zernioFetch } from './client'
import type {
  ZernioConversationSummary,
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

export async function listZernioConversations(accountId: string) {
  const params = new URLSearchParams({ accountId })
  return zernioFetch<{ conversations: ZernioConversationSummary[] }>(
    `/v1/inbox/conversations?${params.toString()}`,
  )
}
