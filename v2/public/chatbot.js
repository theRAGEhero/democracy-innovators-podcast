function addMessage(container, role, text, citations = []) {
  const message = document.createElement('div')
  message.className = `chat-message ${role}`

  const paragraph = document.createElement('p')
  paragraph.textContent = text
  message.appendChild(paragraph)

  for (const citation of citations) {
    if (!citation?.url || !citation?.title) continue
    const link = document.createElement('a')
    link.href = citation.url
    link.textContent = `${citation.label ? `${citation.label}: ` : ''}${citation.title} →`
    message.appendChild(link)

    if (citation.snippet) {
      const snippet = document.createElement('small')
      snippet.textContent = citation.snippet
      message.appendChild(snippet)
    }
  }

  container.appendChild(message)
  container.scrollTop = container.scrollHeight
}

for (const chatbot of document.querySelectorAll('[data-chatbot]')) {
  const close = chatbot.querySelector('[data-chatbot-close]')
  const form = chatbot.querySelector('[data-chatbot-form]')
  const messages = chatbot.querySelector('[data-chatbot-messages]')
  const submit = form?.querySelector('button[type="submit"]')

  close?.addEventListener('click', () => chatbot.removeAttribute('open'))
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!messages || !submit || submit.disabled) return

    const data = new FormData(form)
    const question = String(data.get('question') || '').trim()
    if (!question) return

    form.reset()
    addMessage(messages, 'user', question)
    submit.disabled = true
    submit.textContent = 'Thinking…'

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const result = await response.json()
      addMessage(messages, 'assistant', result.answer || result.error || 'No answer returned.', result.citations)
    } catch {
      addMessage(messages, 'assistant', 'The archive assistant is temporarily unavailable.')
    } finally {
      submit.disabled = false
      submit.textContent = 'Ask'
    }
  })
}
