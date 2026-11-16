'use client'

import { useState } from 'react'

type Status = 'idle' | 'loading' | 'done' | 'error'

/** The page this sits on is a safe GET, so the removal happens here, on a real
 *  click, rather than when a scanner follows the link. */
export function UnsubscribeButton({ id, token }: { id: string; token: string }) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function unsubscribe() {
    if (status === 'loading' || status === 'done') return
    setStatus('loading')
    setMessage('')
    try {
      const response = await fetch(
        `/api/newsletter/unsubscribe?s=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'We could not unsubscribe you.')
      setStatus('done')
      setMessage('Done. You will not receive the newsletter again.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'We could not unsubscribe you. Please try again.')
    }
  }

  return (
    <div className={`newsletter-form ${status === 'done' ? 'success' : status === 'error' ? 'error' : ''}`}>
      <div className="hero-actions">
        <button
          className="primary-button"
          disabled={status === 'loading' || status === 'done'}
          onClick={unsubscribe}
          type="button"
        >
          {status === 'loading' ? 'Unsubscribing…' : status === 'done' ? 'Unsubscribed' : 'Yes, unsubscribe me'}
        </button>
      </div>
      <p
        aria-live="polite"
        className={`newsletter-state newsletter-${status === 'done' ? 'success' : status}`}
      >
        {message}
      </p>
    </div>
  )
}
