import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MailPermanentError,
  MailTransientError,
  newsletterMailConfigured,
  sendNewsletterEmail,
} from '@/lib/newsletter-mail'

// Response bodies are the ones in Mailjet's own documentation. The classifier is
// the part worth testing: it decides whether a stalled mailing waits and tries
// again or stops, and getting it backwards either loses a send or hammers a
// provider that is already refusing.

const EMAIL = {
  to: 'reader@example.org',
  subject: 'Episode 70 is out',
  html: '<p>Hello</p>',
  text: 'Hello',
  headers: { 'List-Unsubscribe': '<https://example.org/u?s=1&t=x>' },
}

const SUCCESS = {
  Messages: [
    {
      Status: 'success',
      CustomID: '',
      To: [
        {
          Email: 'reader@example.org',
          MessageUUID: 'cb927469-36fd-4c02-bce4-0d199929a207',
          MessageID: 20547681647433000,
          MessageHref: 'https://api.mailjet.com/v3/REST/message/20547681647433000',
        },
      ],
    },
  ],
}

// The parameters are declared so mock.calls is typed as [url, init] rather than
// an empty tuple, which is what lets the assertions below read the payload.
function reply(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

function payloadOf(call: [string, RequestInit]) {
  return JSON.parse(String(call[1].body))
}

let env: NodeJS.ProcessEnv

beforeEach(() => {
  env = { ...process.env }
  process.env.MAILJET_API_KEY = 'key'
  process.env.MAILJET_SECRET_KEY = 'secret'
  process.env.NEWSLETTER_FROM_EMAIL = 'newsletter@democracyinnovators.com'
  process.env.NEWSLETTER_FROM_NAME = 'Democracy Innovators Podcast'
  delete process.env.NEWSLETTER_REPLY_TO
})

afterEach(() => {
  process.env = env
  vi.unstubAllGlobals()
})

describe('configuration', () => {
  it('needs both credentials and a From address', () => {
    expect(newsletterMailConfigured()).toBe(true)
    delete process.env.NEWSLETTER_FROM_EMAIL
    expect(newsletterMailConfigured()).toBe(false)
  })

  it('refuses to send when unconfigured, rather than reporting success', async () => {
    delete process.env.MAILJET_API_KEY
    const fetchMock = reply(201, SUCCESS)
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailPermanentError)
    // The worst outcome would be a mailing marked sent having called nothing.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the request Mailjet receives', () => {
  it('sends one recipient, both body parts, and the headers as a map', async () => {
    const fetchMock = reply(201, SUCCESS)
    vi.stubGlobal('fetch', fetchMock)
    await sendNewsletterEmail(EMAIL)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.mailjet.com/v3.1/send')
    expect(init.headers).toMatchObject({ Authorization: `Basic ${Buffer.from('key:secret').toString('base64')}` })

    const body = payloadOf(fetchMock.mock.calls[0])
    expect(body.Messages).toHaveLength(1)
    const message = body.Messages[0]
    expect(message.To).toEqual([{ Email: 'reader@example.org' }])
    expect(message.TextPart).toBe('Hello')
    expect(message.HTMLPart).toBe('<p>Hello</p>')
    expect(message.Headers).toEqual({ 'List-Unsubscribe': '<https://example.org/u?s=1&t=x>' })
    expect(body.AdvanceErrorHandling).toBe(true)
    expect(body.SandboxMode).toBeUndefined()
  })

  it('turns tracking off explicitly, because the account default may have it on', async () => {
    const fetchMock = reply(201, SUCCESS)
    vi.stubGlobal('fetch', fetchMock)
    await sendNewsletterEmail(EMAIL)
    const message = payloadOf(fetchMock.mock.calls[0]).Messages[0]
    // /privacy promises no open or click tracking. Mailjet's default is
    // "account_default", so saying nothing here would make that promise a guess.
    expect(message.TrackOpens).toBe('disabled')
    expect(message.TrackClicks).toBe('disabled')
  })

  it('includes ReplyTo as an object only when one is configured', async () => {
    const fetchMock = reply(201, SUCCESS)
    vi.stubGlobal('fetch', fetchMock)
    await sendNewsletterEmail(EMAIL)
    let message = payloadOf(fetchMock.mock.calls[0]).Messages[0]
    expect(message.ReplyTo).toBeUndefined()

    process.env.NEWSLETTER_REPLY_TO = 'ale@9minuti.it'
    await sendNewsletterEmail(EMAIL)
    message = payloadOf(fetchMock.mock.calls[1]).Messages[0]
    expect(message.ReplyTo).toEqual({ Email: 'ale@9minuti.it' })
  })

  it('truncates a CustomID to the documented 64 characters', async () => {
    const fetchMock = reply(201, SUCCESS)
    vi.stubGlobal('fetch', fetchMock)
    await sendNewsletterEmail({ ...EMAIL, customId: 'x'.repeat(100) })
    const message = payloadOf(fetchMock.mock.calls[0]).Messages[0]
    expect(message.CustomID).toHaveLength(64)
  })

  it('passes SandboxMode through, for validating a payload without delivering', async () => {
    const fetchMock = reply(201, { Messages: [{ Status: 'success', To: [{ Email: 'reader@example.org' }] }] })
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendNewsletterEmail(EMAIL, { sandbox: true })
    expect(payloadOf(fetchMock.mock.calls[0]).SandboxMode).toBe(true)
    // Sandbox responses carry no MessageUUID, by design.
    expect(result.messageUuid).toBeNull()
  })
})

describe('reading the result', () => {
  it('accepts 201 and keeps the MessageUUID, not the MessageID', async () => {
    vi.stubGlobal('fetch', reply(201, SUCCESS))
    const result = await sendNewsletterEmail(EMAIL)
    // MessageID in Mailjet's own example is 20547681647433000, past the safe
    // integer limit, so JSON.parse corrupts it. The UUID is a string.
    expect(result.messageUuid).toBe('cb927469-36fd-4c02-bce4-0d199929a207')
  })

  it('treats a per-message error inside a 2xx as a failure', async () => {
    // Mailjet keeps processing a batch and reports outcomes per message, so a
    // 200 does not mean the message was accepted. Reading only the HTTP status
    // would record this as delivered.
    vi.stubGlobal('fetch', reply(200, {
      Messages: [
        {
          Status: 'error',
          Errors: [
            {
              ErrorIdentifier: '88b5ca9f-5f1f-42e7-a45e-9ecbad0c285e',
              ErrorCode: 'send-0011',
              StatusCode: 400,
              ErrorMessage: 'One of the headers is forbidden.',
              ErrorRelatedTo: ['Headers["List-Unsubscribe"]'],
            },
          ],
        },
      ],
    }))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toThrow(/send-0011.*forbidden.*List-Unsubscribe/s)
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailPermanentError)
  })

  it('retries a 429, which is the one case Mailjet documents backoff for', async () => {
    vi.stubGlobal('fetch', reply(429, { Messages: [] }))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailTransientError)
  })

  it('retries a 5xx rather than throwing a mailing away over a blip', async () => {
    vi.stubGlobal('fetch', reply(503, 'upstream unavailable'))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailTransientError)
  })

  it('gives up on bad credentials', async () => {
    vi.stubGlobal('fetch', reply(401, {
      Messages: [{ Status: 'error', Errors: [{ ErrorCode: 'mj-0015', StatusCode: 401, ErrorMessage: 'Invalid credentials' }] }],
    }))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailPermanentError)
  })

  it('gives up on an unauthorised sender address', async () => {
    vi.stubGlobal('fetch', reply(403, {
      Messages: [{ Status: 'error', Errors: [{ ErrorCode: 'send-0008', StatusCode: 403, ErrorMessage: 'From address not authorized' }] }],
    }))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toThrow(/send-0008/)
  })

  it('retries a timeout or socket failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('The operation was aborted due to timeout') }))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailTransientError)
  })

  it('retries an empty or unreadable body on a 2xx', async () => {
    vi.stubGlobal('fetch', reply(201, 'not json'))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailTransientError)
    vi.stubGlobal('fetch', reply(201, { Messages: [] }))
    await expect(sendNewsletterEmail(EMAIL)).rejects.toBeInstanceOf(MailTransientError)
  })
})
