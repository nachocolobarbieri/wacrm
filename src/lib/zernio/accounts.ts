import { zernioFetch } from './client'

export async function disconnectZernioAccount(zernioAccountId: string) {
  return zernioFetch<{ message: string }>(
    `/v1/accounts/${zernioAccountId}`,
    { method: 'DELETE' },
  )
}
