import config from '@payload-config'
import { getPayload } from 'payload'

import { sendContactEmail, type ContactMessage } from '@/lib/contact-mail'
import { isRateLimited } from '@/lib/rate-limit'

const RATE_LIMIT = { scope: 'contact', limit: 3, windowMs: 60_000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  if (isRateLimited(request, RATE_LIMIT)) return Response.json({ error: 'Too many messages. Please wait a minute.' }, { status: 429 })

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
