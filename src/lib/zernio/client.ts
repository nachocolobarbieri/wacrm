// Minimal fetch-native client for the Zernio REST API. No SDK — the
// integration uses a handful of endpoints and a dependency adds
// version-coupling for nothing. Every request/response shape here is
// taken from the real spec at https://zernio.com/openapi.yaml, not
// guessed: a wrong field name doesn't fail loudly, it silently drops
// messages (see the connect/webhook routes for why that matters).

const ZERNIO_BASE_URL = 'https://zernio.com/api'

export type ZernioResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: number }

function apiKey(): string {
  const key = process.env.ZERNIO_API_KEY
  if (!key) throw new Error('ZERNIO_API_KEY is not set')
  return key
}

/**
 * Never throws. A channel outage or a malformed response must not take
 * down the caller — every call site gets a typed result to branch on.
 */
export async function zernioFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ZernioResult<T>> {
  try {
    const res = await fetch(`${ZERNIO_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })

    const text = await res.text()
    const body = text ? JSON.parse(text) : null

    if (!res.ok) {
      const message =
        (body && (body.error || body.message)) || `HTTP ${res.status}`
      return { success: false, error: message, status: res.status }
    }

    return { success: true, data: body as T }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      status: 0,
    }
  }
}
