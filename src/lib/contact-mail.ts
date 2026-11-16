import nodemailer from 'nodemailer'

export type ContactMessage = {
  name: string
  email: string
  organization?: string
  subject: string
  message: string
}

export type ConfirmationEmail = {
  to: string
  confirmUrl: string
}

export type CommentNotification = {
  name: string
  email: string
  message: string
  episodeTitle: string
  episodeSlug: string
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.CONTACT_TO_EMAIL)
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
}

const fromAddress = () =>
  process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || process.env.CONTACT_TO_EMAIL

function textBody(message: ContactMessage) {
  return [
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    message.organization ? `Organization: ${message.organization}` : '',
    `Subject: ${message.subject}`,
    '',
    message.message,
  ].filter(Boolean).join('\n')
}

export async function sendContactEmail(message: ContactMessage) {
  if (!smtpConfigured()) return false

  await createTransporter().sendMail({
    to: process.env.CONTACT_TO_EMAIL,
    from: fromAddress(),
    replyTo: message.email,
    subject: `[Democracy Innovators] ${message.subject}`,
    text: textBody(message),
  })

  return true
}

// Notify the editor that a new comment is awaiting moderation.
export async function sendCommentNotification(comment: CommentNotification) {
  if (!smtpConfigured()) return false

  const origin = process.env.NEXT_PUBLIC_SERVER_URL || ''
  await createTransporter().sendMail({
    to: process.env.CONTACT_TO_EMAIL,
    from: fromAddress(),
    replyTo: comment.email,
    subject: `[Democracy Innovators] New comment on “${comment.episodeTitle}”`,
    text: [
      'A new comment is awaiting moderation.',
      '',
      `Episode: ${comment.episodeTitle}`,
      `${origin}/episode/${comment.episodeSlug}`,
      '',
      `Name: ${comment.name}`,
      `Email: ${comment.email}`,
      '',
      comment.message,
      '',
      `Approve or reject: ${origin}/admin/collections/comments`,
    ].join('\n'),
  })

  return true
}

/** The newsletter's own identity, falling back to the contact sender so the
 *  feature works before any newsletter configuration exists. */
function newsletterFrom() {
  const email = process.env.NEWSLETTER_FROM_EMAIL || fromAddress()
  if (!email) return undefined
  return `${process.env.NEWSLETTER_FROM_NAME || 'Democracy Innovators Podcast'} <${email}>`
}

/** A different gate from smtpConfigured(): this mail goes to the subscriber, so
 *  CONTACT_TO_EMAIL is irrelevant to whether it can be sent. */
export function confirmationMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && newsletterFrom())
}

/**
 * The double opt-in confirmation.
 *
 * This stays on the contact SMTP transport rather than the bulk provider the
 * mailings use, and not as a stopgap: it is one message, to one person, because
 * they just asked for it. That is a transactional email in the only sense the
 * word has, and routing it through a newsletter sender would mix the two
 * reputations for no gain.
 */
export async function sendNewsletterConfirmation({ to, confirmUrl }: ConfirmationEmail) {
  if (!confirmationMailConfigured()) return false

  await createTransporter().sendMail({
    to,
    from: newsletterFrom(),
    replyTo: process.env.NEWSLETTER_REPLY_TO || undefined,
    subject: 'Confirm your Democracy Innovators subscription',
    text: [
      'Someone — we hope you — asked to receive the Democracy Innovators Podcast',
      'newsletter at this address.',
      '',
      'Confirm it here, and we will send you each new episode with the opening of',
      'its transcript:',
      '',
      confirmUrl,
      '',
      'If this was not you, simply ignore this email. Nothing happens until you',
      'confirm, and the link stops working in 48 hours.',
      '',
      '—',
      'Democracy Innovators Podcast',
      process.env.NEXT_PUBLIC_SERVER_URL || 'https://democracyinnovators.com',
    ].join('\n'),
  })

  return true
}
