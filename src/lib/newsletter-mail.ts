// Bulk delivery, over Mailjet's Send API v3.1.
//
// Deliberately separate from contact-mail.ts, which keeps its own SMTP
// transport: a different file, a different env prefix, a different library. The
// contact form and the comment notifications go on sending through the
// self-hosted box exactly as before, and nothing a newsletter send does can
// change that.
//
// HTTP rather than Mailjet's SMTP relay, for three reasons that matter here: the
// response carries a per-recipient MessageUUID, so "did this address actually
// get it?" has an answer; an HTTP status plus a JSON body separates "try again"
// from "stop" cleanly, which the send worker depends on; and 443 is open
// everywhere, where 587 is often filtered.

const ENDPOINT = 'https://api.mailjet.com/v3.1/send'
const TIMEOUT_MS = 20_000

export type NewsletterEmail = {
  to: string
  toName?: string
  subject: string
  html: string
  text: string
  /** Set as a {name: value} map. Max 50, per Mailjet's mj-0008. */
  headers?: Record<string, string>
  /** Echoed back in the response. Mailjet caps it at 64 characters. */
  customId?: string
}

export type SendResult = {
  /** Mailjet's own id for the message, and the one worth storing.
   *
   *  Not MessageID: the documented examples show values like
   *  20547681647433000, past JavaScript's safe-integer limit, so JSON.parse
   *  silently corrupts it. MessageUUID is a string and cannot be mangled. */
  messageUuid: string | null
}

/** Worth another attempt: a timeout, a 429, a 5xx. */
export class MailTransientError extends Error {}

/** Will fail the same way next time: bad credentials, an unverified sender, a
 *  rejected payload. */
export class MailPermanentError extends Error {}

function credentials() {
  const key = process.env.MAILJET_API_KEY
  const secret = process.env.MAILJET_SECRET_KEY
  return key && secret ? { key, secret } : null
}

export function newsletterFrom(): { Email: string; Name: string } | null {
  const email = process.env.NEWSLETTER_FROM_EMAIL
  if (!email) return null
  return { Email: email, Name: process.env.NEWSLETTER_FROM_NAME || 'Democracy Innovators Podcast' }
}

export function newsletterMailConfigured(): boolean {
  return Boolean(credentials() && newsletterFrom())
}

type MailjetError = {
  ErrorIdentifier?: string
  ErrorCode?: string
  StatusCode?: number
  ErrorMessage?: string
  /** The field reference calls this an object; every documented example shows an
   *  array of field names. The examples win. */
  ErrorRelatedTo?: string[]
}

function describe(errors: MailjetError[]): string {
  return errors
    .map((error) => {
      const where = error.ErrorRelatedTo?.length ? ` (${error.ErrorRelatedTo.join(', ')})` : ''
      return `${error.ErrorCode || 'unknown'}: ${error.ErrorMessage || 'no message'}${where}`
    })
    .join('; ')
}

/** 429 carries explicit backoff guidance in Mailjet's docs; 5xx is unclassified
 *  there, and treating a server fault as permanent would throw away a mailing
 *  over a blip. Everything else is a validation or authorisation failure that
 *  will fail identically on a retry. */
function classify(status: number, detail: string): Error {
  if (status === 429 || status >= 500) return new MailTransientError(`Mailjet ${status}: ${detail}`)
  return new MailPermanentError(`Mailjet ${status}: ${detail}`)
}

/**
 * Send one message to one recipient.
 *
 * One recipient per call on purpose. Mailjet puts every address in `To` on the
 * same message, visible to each other — and each of ours needs its own
 * unsubscribe link and header anyway, so a batch would buy nothing.
 *
 * `sandbox` runs Mailjet's full validation without delivering anything, which
 * is how the payload gets checked before a real subscriber is involved. The
 * response then omits MessageUUID.
 */
export async function sendNewsletterEmail(
  email: NewsletterEmail,
  options: { sandbox?: boolean } = {},
): Promise<SendResult> {
  const auth = credentials()
  const from = newsletterFrom()
  // Refusing loudly, where contact-mail.ts returns false and shrugs. The worst
  // outcome in this system is a mailing marked sent that nobody received, so an
  // unconfigured transport must stop the send rather than quietly succeed.
  if (!auth || !from) {
    throw new MailPermanentError(
      'Newsletter mail is not configured: MAILJET_API_KEY, MAILJET_SECRET_KEY and NEWSLETTER_FROM_EMAIL are all required',
    )
  }

  const message: Record<string, unknown> = {
    From: from,
    To: [{ Email: email.to, ...(email.toName ? { Name: email.toName } : {}) }],
    Subject: email.subject,
    TextPart: email.text,
    HTMLPart: email.html,
    // Mailjet's default is the account setting, which may well have tracking on.
    // /privacy states there is no open or click tracking, so this is what keeps
    // that sentence true rather than hopeful.
    TrackOpens: 'disabled',
    TrackClicks: 'disabled',
  }
  const replyTo = process.env.NEWSLETTER_REPLY_TO
  if (replyTo) message.ReplyTo = { Email: replyTo }
  if (email.headers && Object.keys(email.headers).length) message.Headers = email.headers
  if (email.customId) message.CustomID = email.customId.slice(0, 64)

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${auth.key}:${auth.secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(options.sandbox ? { SandboxMode: true } : {}),
        // Opts into Mailjet's extra payload checks. For a sender that must not
        // half-work, more validation up front is strictly better.
        AdvanceErrorHandling: true,
        Messages: [message],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // A timeout or a DNS/socket failure says nothing about the payload.
    throw new MailTransientError(
      `Mailjet request failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const raw = await response.text().catch(() => '')
  let body: { Messages?: { Status?: string; Errors?: MailjetError[]; To?: { MessageUUID?: string }[] }[] } = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    if (!response.ok) throw classify(response.status, raw.slice(0, 300) || 'no body')
    throw new MailTransientError(`Mailjet returned unparseable JSON (${response.status})`)
  }

  if (!response.ok) {
    const errors = body.Messages?.[0]?.Errors
    throw classify(response.status, errors?.length ? describe(errors) : raw.slice(0, 300) || 'no body')
  }

  // Success is 201, and a 2xx is not the end of it: Mailjet reports per-message
  // outcomes in the body and keeps processing the rest of a batch, so a message
  // can fail inside an otherwise fine response. Reading the HTTP status alone
  // would mark failed sends as delivered.
  const result = body.Messages?.[0]
  if (!result) throw new MailTransientError(`Mailjet returned no message result (${response.status})`)

  if (result.Status !== 'success') {
    const errors = result.Errors || []
    // Per-message errors carry their own StatusCode, which is the one that says
    // whether another attempt could work.
    throw classify(errors[0]?.StatusCode ?? 400, errors.length ? describe(errors) : `status "${result.Status}"`)
  }

  return { messageUuid: result.To?.[0]?.MessageUUID ?? null }
}
