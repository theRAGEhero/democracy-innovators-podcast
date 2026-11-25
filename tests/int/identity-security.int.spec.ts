// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let payload: Payload

async function createUser(email: string, password: string) {
  return payload.create({
    collection: 'users',
    data: { email, password },
    overrideAccess: true,
  })
}

async function authenticatedEmail(token: string | undefined) {
  const result = await payload.auth({ headers: new Headers({ authorization: `JWT ${token || ''}` }) })
  return result.user?.email ?? null
}

describe('editor identity lifecycle', () => {
  beforeAll(async () => {
    process.env.PAYLOAD_SECRET = 'integration-test-only-secret'
    const { default: config } = await import('@/payload.config')
    payload = await getPayload({ config })
  }, 60_000)

  it('revokes existing sessions when a password changes', async () => {
    const email = 'password-change@example.test'
    const user = await createUser(email, 'old-password')
    const login = await payload.login({ collection: 'users', data: { email, password: 'old-password' } })
    expect(await authenticatedEmail(login.token)).toBe(email)

    await payload.update({ collection: 'users', id: user.id, data: { password: 'new-password' }, overrideAccess: true })
    expect(await authenticatedEmail(login.token)).toBeNull()
    const fresh = await payload.login({ collection: 'users', data: { email, password: 'new-password' } })
    expect(await authenticatedEmail(fresh.token)).toBe(email)
  }, 120_000)

  it('revokes existing sessions when a password is reset', async () => {
    const email = 'password-reset@example.test'
    await createUser(email, 'old-password')
    const login = await payload.login({ collection: 'users', data: { email, password: 'old-password' } })
    expect(await authenticatedEmail(login.token)).toBe(email)

    const token = await payload.forgotPassword({ collection: 'users', data: { email }, disableEmail: true })
    await payload.resetPassword({ collection: 'users', data: { token, password: 'reset-password' }, overrideAccess: true })
    expect(await authenticatedEmail(login.token)).toBeNull()
    const fresh = await payload.login({ collection: 'users', data: { email, password: 'reset-password' } })
    expect(await authenticatedEmail(fresh.token)).toBe(email)
  }, 120_000)

  it('rejects preview authentication when Payload returns a null user', async () => {
    process.env.PREVIEW_SECRET = 'integration-preview-secret'
    vi.doMock('next/headers', () => ({
      draftMode: async () => ({ disable: vi.fn(), enable: vi.fn() }),
    }))
    vi.resetModules()
    try {
      const { GET } = await import('@/app/(frontend)/next/preview/route')
      const request = new NextRequest('https://example.test/next/preview?path=/episode/draft&previewSecret=integration-preview-secret')
      const response = await GET(request)
      expect(response.status).toBe(403)
    } finally {
      vi.doUnmock('next/headers')
      vi.resetModules()
    }
  })

  it('does not expose the production seed route', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const { POST } = await import('@/app/(frontend)/next/seed/route')
      const response = await POST()
      expect(response.status).toBe(404)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
