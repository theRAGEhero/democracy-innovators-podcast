'use client'

import { useState } from 'react'

import Link from 'next/link'

type Status = 'idle' | 'loading' | 'success' | 'error'

// Replaces the Ghost Portal form that used to live on /listen and had been
// posting to a host that was never set up, so every visitor who tried to
// subscribe got an error and nothing was stored.
//
// The status word goes on the form's own class, which is what the existing
// stylesheet keys the message colours off, so this needs no new CSS. Unlike the
// markup it replaces it uses one live region rather than three paragraphs with
// CSS hiding two of them — a screen reader was being told about all three.
export function NewsletterForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'loading') return

    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    setStatus('loading')
    setMessage('Sending confirmation…')

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, consent: Boolean(data.consent) }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'We could not start the subscription.')
      form.reset()
      setStatus('success')
      setMessage(
        result.mailed === false
          ? 'Your address is saved, but we could not send the confirmation email. Please try again later.'
          : 'Check your inbox to confirm your subscription.',
      )
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error ? error.message : 'We could not start the subscription. Please try again.',
      )
    }
  }

  return (
    <form className={`newsletter-form linktree-newsletter ${status}`} onSubmit={submit}>
      <label htmlFor="newsletter-email">Email address</label>
      <div className="newsletter-fields">
        <input
          autoComplete="email"
          id="newsletter-email"
          maxLength={180}
          name="email"
          placeholder="you@example.org"
          required
          type="email"
        />
        <button disabled={status === 'loading'} type="submit">
          {status === 'loading' ? 'Sending…' : 'Subscribe'}
        </button>
      </div>
      <label className="newsletter-consent">
        <input name="consent" required type="checkbox" value="yes" />
        <span>
          I want to receive the Democracy Innovators newsletter by email. I can unsubscribe at any time.
        </span>
      </label>
      <input aria-hidden="true" autoComplete="off" className="contact-honeypot" name="website" tabIndex={-1} />
      <p className="newsletter-fineprint">
        One email per episode, with the opening of its transcript. See the{' '}
        <Link href="/privacy">privacy notice</Link>.
      </p>
      <p aria-live="polite" className={`newsletter-state newsletter-${status}`}>{message}</p>
    </form>
  )
}
