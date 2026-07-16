export function Chatbot() {
  return (
    <details className="chatbot" data-chatbot>
      <summary className="chatbot-toggle">Ask the archive</summary>
      <section className="chatbot-panel">
        <header>
          <strong>Archive assistant</strong>
          <button aria-label="Close" data-chatbot-close type="button">×</button>
        </header>
        <div className="chatbot-messages" data-chatbot-messages>
          <div className="chat-message assistant">
            <p>Ask about people, projects or ideas in the podcast archive.</p>
          </div>
        </div>
        <form data-chatbot-form>
          <input aria-label="Question" maxLength={500} name="question" placeholder="What did guests say about…" required />
          <button type="submit">Ask</button>
        </form>
      </section>
    </details>
  )
}
