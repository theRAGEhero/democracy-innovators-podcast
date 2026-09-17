/**
 * Reads the assistant's event stream: `citations` arrives first, then `token`
 * repeatedly, and `replace` swaps the whole answer if the model wandered off
 * the archive. Frames are separated by a blank line and can split across reads.
 */
async function readStream(response, container) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  let citations = []
  let node = null

  const paint = () => {
    if (!node) node = addMessage(container, 'assistant', answer, citations)
    else repaintMessage(node, answer, citations)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let split
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      const name = (frame.match(/^event: (.*)$/m) || [])[1]
      const raw = (frame.match(/^data: (.*)$/m) || [])[1]
      if (!name || !raw) continue

      let payload
      try {
        payload = JSON.parse(raw)
      } catch {
        continue
      }

      if (name === 'citations') citations = payload.citations || []
      else if (name === 'token') answer += payload.text || ''
      else if (name === 'replace') answer = payload.answer || ''
      else if (name === 'error') answer = answer || payload.error || 'The archive assistant was interrupted.'
      paint()
    }
  }

  if (!answer) {
    answer = 'No answer returned.'
    paint()
  }
}

function repaintMessage(message, text, citations) {
  message.textContent = ''
  const paragraph = document.createElement('p')
  paragraph.textContent = text
  message.appendChild(paragraph)
  appendCitations(message, citations)
  message.parentElement.scrollTop = message.parentElement.scrollHeight
}

function addMessage(container, role, text, citations = []) {
  const message = document.createElement('div')
  message.className = `chat-message ${role}`

  const paragraph = document.createElement('p')
  paragraph.textContent = text
  message.appendChild(paragraph)

  appendCitations(message, citations)

  container.appendChild(message)
  container.scrollTop = container.scrollHeight
  return message
}

function appendCitations(message, citations) {
  for (const citation of citations || []) {
    if (!citation?.url || !citation?.title) continue
    const link = document.createElement('a')
    // Timestamped where the archive knows the second the words were said.
    link.href = citation.startTime === undefined
      ? citation.url
      : `${citation.url}?t=${Math.floor(citation.startTime)}`
    link.textContent = `${citation.label ? `${citation.label}: ` : ''}${citation.title} →`
    message.appendChild(link)

    if (citation.snippet) {
      const snippet = document.createElement('small')
      snippet.textContent = citation.snippet
      message.appendChild(snippet)
    }
  }
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
      // The route answers two ways: a plain JSON object for every refusal
      // (rate limit, empty question, nothing found), and an event stream for a
      // real answer. This script used to assume JSON always, so it worked only
      // when something had gone wrong.
      const type = response.headers.get('content-type') || ''
      if (!type.includes('text/event-stream')) {
        const result = await response.json()
        addMessage(messages, 'assistant', result.answer || result.error || 'No answer returned.', result.citations)
      } else {
        await readStream(response, messages)
      }
    } catch {
      addMessage(messages, 'assistant', 'The archive assistant is temporarily unavailable.')
    } finally {
      submit.disabled = false
      submit.textContent = 'Ask'
    }
  })
}
