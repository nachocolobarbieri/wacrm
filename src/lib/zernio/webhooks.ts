import crypto from 'crypto'

/**
 * Verifies the `X-Zernio-Signature` HMAC-SHA256 header against the RAW
 * request body. Must run before any JSON.parse — re-serializing the
 * parsed body never byte-matches what Zernio signed, so the signature
 * would never validate.
 *
 * Fails closed: no configured secret means reject, not accept.
 */
export function verifyZernioSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(signatureHeader, 'hex')

  if (expectedBuf.length !== receivedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}
