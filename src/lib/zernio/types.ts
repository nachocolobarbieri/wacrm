// Types below mirror https://zernio.com/openapi.yaml exactly — field
// names and shapes, not paraphrased. Two schemas share almost no field
// names on purpose: the REST response for an account and the webhook
// envelope's `account` object are genuinely different shapes.

export type ZernioChannel = 'whatsapp' | 'instagram' | 'facebook' | 'telegram'

// ---- GET /v1/connect/{platform} ----------------------------------

export interface ZernioConnectUrlResponse {
  authUrl: string
  state: string
}

// ---- GET /v1/profiles ----------------------------------------------

export interface ZernioProfile {
  _id: string
  name: string
  color?: string
  isDefault: boolean
}

export interface ZernioProfilesListResponse {
  profiles: ZernioProfile[]
}

// ---- POST /v1/inbox/conversations/{conversationId}/messages -------

export interface ZernioSendMessageRequest {
  accountId: string
  message?: string
  attachmentUrl?: string
  attachmentType?: 'image' | 'video' | 'audio' | 'file'
  attachmentName?: string
}

export interface ZernioSendMessageResponse {
  id: string
  conversationId: string
  status: string
}

// ---- GET /v1/inbox/conversations -----------------------------------

export interface ZernioConversationSummary {
  id: string
  accountId: string
  platform: ZernioChannel
  participantId: string
  participantName?: string
  participantUsername?: string
  participantPicture?: string
  lastMessage?: string
  lastMessageAt?: string
  unreadCount?: number
}

// ---- Webhook envelope (POST to our /api/webhooks/zernio) ----------
// Shape: components/schemas/WebhookPayloadMessage. The webhook's
// `account`/`conversation` objects are NOT the same shape as the REST
// list/get responses above — see InboxWebhookAccount /
// InboxWebhookConversation in the spec.

export interface ZernioWebhookAccount {
  id: string
  accountId: string
  profileId?: string
  platform: string
  username: string
  displayName?: string
}

export interface ZernioWebhookConversation {
  id: string
  platformConversationId: string
  participantId?: string
  participantName?: string
  participantUsername?: string
  participantPicture?: string
  status: 'active' | 'archived'
  contactId?: string
}

export interface ZernioWebhookMessageAttachment {
  type: string
  url: string
  payload?: Record<string, unknown>
}

export interface ZernioWebhookMessageSender {
  id: string
  contactId?: string
  name?: string
  username?: string
  picture?: string
  phoneNumber?: string | null
  businessScopedUserId?: string
}

export interface ZernioWebhookMessage {
  id: string
  conversationId: string
  platform: ZernioChannel | 'sms'
  platformMessageId: string
  direction: 'incoming' | 'outgoing'
  text: string | null
  attachments: ZernioWebhookMessageAttachment[]
  sender: ZernioWebhookMessageSender
  sentAt: string
  isRead: boolean
}

export interface ZernioWebhookPayloadMessage {
  id: string // stable webhook event id — the idempotency key
  event: 'message.received'
  message: ZernioWebhookMessage
  conversation: ZernioWebhookConversation
  account: ZernioWebhookAccount
  timestamp: string
}

// Every other event we subscribe to shares the {id, event, timestamp}
// envelope; we only deep-type the ones we act on (message.received)
// and read the rest structurally.
export interface ZernioWebhookEnvelope {
  id: string
  event: string
  timestamp: string
  account?: ZernioWebhookAccount
  [key: string]: unknown
}
