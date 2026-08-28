import { zernioFetch } from './client'
import type { ZernioChannel } from './types'

export async function disconnectZernioAccount(zernioAccountId: string) {
  return zernioFetch<{ message: string }>(
    `/v1/accounts/${zernioAccountId}`,
    { method: 'DELETE' },
  )
}

export interface ZernioListedAccount {
  _id: string
  platform: string
  profileId?: { _id: string } | string
  username?: string
  displayName?: string
  isActive: boolean
}

/**
 * Every account connected under this profile, straight from Zernio —
 * including ones connected through Zernio's own dashboard rather than
 * through our /api/zernio/connect flow, which is exactly the gap
 * `sync` (below) closes.
 */
export async function listZernioAccounts(profileId: string) {
  return zernioFetch<{ accounts: ZernioListedAccount[] }>(
    `/v1/accounts?profileId=${encodeURIComponent(profileId)}`,
  )
}

export const KNOWN_CHANNELS: ZernioChannel[] = [
  'whatsapp',
  'instagram',
  'facebook',
  'telegram',
]
