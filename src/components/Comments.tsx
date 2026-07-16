'use client'

import { FormEvent, useEffect, useState } from 'react'

type Comment = { id: number; name: string; message: string; createdAt: string }

export function Comments({ episodeId }: { episodeId: number }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch(`/api/comments/${episodeId}`)
      .then((response) => response.json())
      .then((result) => setComments(result.comments || []))
      .catch(() => setStatus('Comments are temporarily unavailable.'))
  }, [episodeId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Submitting…')
    const form = event.currentTarget
    const data = new FormData(form)
    const response = await fetch(`/api/comments/${episodeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.get('name'), message: data.get('message'), website: data.get('website') }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return setStatus(result.error || 'Unable to submit comment.')
    form.reset()
    setStatus('Thank you. Your comment is awaiting moderation.')
  }

  return <section className="comments-section"><div><p className="section-label">Discussion</p><h2>Continue the conversation</h2>{comments.length ? <ul>{comments.map((comment) => <li key={comment.id}><strong>{comment.name}</strong><time>{new Date(comment.createdAt).toLocaleDateString('en')}</time><p>{comment.message}</p></li>)}</ul> : <p className="empty-comments">No approved comments yet.</p>}</div><form onSubmit={submit}><label htmlFor="comment-name">Name</label><input id="comment-name" maxLength={80} name="name" required/><label htmlFor="comment-message">Comment</label><textarea id="comment-message" maxLength={1200} minLength={8} name="message" required rows={6}/><input aria-hidden="true" autoComplete="off" className="comment-honeypot" name="website" tabIndex={-1}/><button type="submit">Submit for review</button><p aria-live="polite">{status}</p></form></section>
}
