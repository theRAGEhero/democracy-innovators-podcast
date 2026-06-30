import nodemailer from 'nodemailer'

export type ContactMessage = {
  name: string
  email: string
  organization?: string
  subject: string
  message: string
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.CONTACT_TO_EMAIL)
}

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

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  })

  await transporter.sendMail({
    to: process.env.CONTACT_TO_EMAIL,
    from: process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || process.env.CONTACT_TO_EMAIL,
    replyTo: message.email,
    subject: `[Democracy Innovators] ${message.subject}`,
    text: textBody(message),
  })

  return true
}
