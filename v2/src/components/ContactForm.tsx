'use client'

import { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'loading') return

    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'We could not send your message.')
      form.reset()
      setStatus('success')
      setMessage('Message received. We will get back to you by email.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'We could not send your message. Please try again.')
    }
  }

  return (
    <form className={`contact-form ${status}`} onSubmit={submit}>
      <label htmlFor="contact-name">Name</label>
      <input autoComplete="name" id="contact-name" maxLength={120} name="name" required />

      <label htmlFor="contact-email">Email</label>
      <input autoComplete="email" id="contact-email" maxLength={180} name="email" required type="email" />

      <label htmlFor="contact-organization">Organization</label>
      <input autoComplete="organization" id="contact-organization" maxLength={160} name="organization" />

      <label htmlFor="contact-subject">Subject</label>
      <input id="contact-subject" maxLength={180} name="subject" required />

      <label htmlFor="contact-message">Message</label>
      <textarea id="contact-message" maxLength={3000} minLength={10} name="message" required rows={8} />

      <input aria-hidden="true" autoComplete="off" className="contact-honeypot" name="website" tabIndex={-1} />

      <button disabled={status === 'loading'} type="submit">{status === 'loading' ? 'Sending...' : 'Send message'}</button>
      <p aria-live="polite">{message}</p>
    </form>
  )
}
