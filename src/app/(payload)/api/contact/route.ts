import config from '@payload-config'
import { getPayload } from 'payload'

import { sendContactEmail, type ContactMessage } from '@/lib/contact-mail'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 3
const requests = new Map<string, { count: number; resetAt: number }>()
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isRateLimited(request: Request) {
  const client = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown'
  const now = Date.now()
  const current = requests.get(client)
  if (!current || current.resetAt <= now) {
    requests.set(client, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > MAX_REQUESTS
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : ''
}

function cleanMessage(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n').slice(0, 3000) : ''
}

function validate(body: Record<string, unknown>): ContactMessage | Response {
  if (clean(body.website, 120)) return Response.json({ ok: true })

  const message = {
    name: clean(body.name, 120),
    email: clean(body.email, 180).toLowerCase(),
    organization: clean(body.organization, 160),
    subject: clean(body.subject, 180),
    message: cleanMessage(body.message),
  }

  if (!message.name || !message.subject || message.message.length < 10 || !EMAIL_RE.test(message.email)) {
    return Response.json({ error: 'Please provide your name, a valid email, a subject, and a message.' }, { status: 400 })
  }

  return message
}

export async function POST(request: Request) {
  if (isRateLimited(request)) return Response.json({ error: 'Too many messages. Please wait a minute.' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const validated = validate(body)
  if (validated instanceof Response) return validated

  const payload = await getPayload({ config })
  let emailSent = false

  try {
    emailSent = await sendContactEmail(validated)
  } catch (error) {
    payload.logger.error({ err: error, message: 'Contact email delivery failed' })
  }

  await payload.create({
    collection: 'contact-submissions',
    data: {
      ...validated,
      status: 'new',
      emailSent,
      userAgent: request.headers.get('user-agent') || undefined,
      ipAddress: request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || undefined,
    },
    overrideAccess: true,
  })

  if (!emailSent) payload.logger.info({ message: 'Contact form submitted without SMTP email delivery', subject: validated.subject, email: validated.email })

  return Response.json({ ok: true })
}
