import { zernioFetch } from './client'
import type {
  ZernioChannel,
  ZernioConnectUrlResponse,
  ZernioProfilesListResponse,
} from './types'

/**
 * Every wacrm account maps to exactly one Zernio profile (Zernio's
 * "workspace" concept). Resolved lazily via the default profile
 * Zernio creates for every user — this app doesn't create additional
 * profiles.
 */
export async function getDefaultZernioProfileId(): Promise<
  { success: true; profileId: string } | { success: false; error: string }
> {
  const result = await zernioFetch<ZernioProfilesListResponse>('/v1/profiles')
  if (!result.success) return { success: false, error: result.error }
  const profile =
    result.data.profiles.find((p) => p.isDefault) ?? result.data.profiles[0]
  if (!profile) return { success: false, error: 'No Zernio profile found' }
  return { success: true, profileId: profile._id }
}

/**
 * Builds the URL to send the user to in order to connect a channel.
 * `onboarding=business_app` is WhatsApp's coexistence mode — the
 * number stays usable in the WhatsApp Business app on the phone while
 * also connecting to the API. It's the default when omitted, but
 * passed explicitly here so the intent isn't relying on a default
 * that could change.
 */
export async function getZernioConnectUrl(
  channel: ZernioChannel,
  profileId: string,
  redirectUrl: string,
): Promise<
  { success: true; authUrl: string } | { success: false; error: string }
> {
  const params = new URLSearchParams({
    profileId,
    redirect_url: redirectUrl,
  })
  if (channel === 'whatsapp') {
    params.set('onboarding', 'business_app')
  }

  const result = await zernioFetch<ZernioConnectUrlResponse>(
    `/v1/connect/${channel}?${params.toString()}`,
  )
  if (!result.success) return { success: false, error: result.error }
  return { success: true, authUrl: result.data.authUrl }
}
