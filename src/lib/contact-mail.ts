import nodemailer from 'nodemailer'

export type ContactMessage = {
  name: string
  email: string
  organization?: string
  subject: string
  message: string
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
