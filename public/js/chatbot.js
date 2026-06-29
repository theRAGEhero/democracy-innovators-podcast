const chatbotRoot = document.createElement('div');
chatbotRoot.className = 'chatbot-root';
chatbotRoot.innerHTML = `
  <button class="chatbot-toggle" type="button" aria-expanded="false" aria-controls="chatbot-panel">Chat</button>
  <section id="chatbot-panel" class="chatbot-panel" hidden>
    <header class="chatbot-header">
      <strong>Article Chat</strong>
      <button class="chatbot-close" type="button" aria-label="Close chat">×</button>
    </header>
    <div class="chatbot-messages" aria-live="polite"></div>
    <form class="chatbot-form" novalidate>
      <input class="chatbot-input" type="text" maxlength="500" placeholder="Ask about this page..." required />
      <button class="chatbot-send" type="submit">Send</button>
    </form>
    <p class="chatbot-note">Answers are based on current page content.</p>
  </section>
`;

document.body.appendChild(chatbotRoot);

const toggleBtn = chatbotRoot.querySelector('.chatbot-toggle');
const panel = chatbotRoot.querySelector('.chatbot-panel');
const closeBtn = chatbotRoot.querySelector('.chatbot-close');
const form = chatbotRoot.querySelector('.chatbot-form');
const input = chatbotRoot.querySelector('.chatbot-input');
const messages = chatbotRoot.querySelector('.chatbot-messages');
const isHome = window.location.pathname === '/' || window.location.pathname === '/index.html';

let enabled = false;

function addMessage(role, text) {
  const item = document.createElement('div');
  item.className = `chatbot-msg chatbot-msg-${role}`;
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function addCitations(citations) {
  if (!Array.isArray(citations) || !citations.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'chatbot-citations';
  const title = document.createElement('div');
  title.className = 'chatbot-citations-title';
  title.textContent = 'Sources';
  wrap.appendChild(title);

  citations.forEach((c) => {
    const a = document.createElement('a');
    a.className = 'chatbot-citation-link';
    a.href = c.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `[${c.ref}] ${c.title}`;
    wrap.appendChild(a);
  });

  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

function pageContext() {
  const main = document.querySelector('main');
  const episode = document.querySelector('#episode .episode-body');
  const source = episode || main || document.body;
  const text = (source.innerText || '').replace(/\s+/g, ' ').trim();

  return {
    pageTitle: document.title || 'Untitled',
    pageUrl: window.location.href,
    pageContent: text.slice(0, 16000)
  };
}

function setOpen(open) {
  panel.hidden = !open;
  toggleBtn.setAttribute('aria-expanded', String(open));
  if (open) input.focus();
}

toggleBtn.addEventListener('click', () => setOpen(panel.hidden));
closeBtn.addEventListener('click', () => setOpen(false));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!enabled) {
    addMessage('bot', 'Chatbot not configured yet. Set GEMINI_API_KEY in .env.');
    return;
  }

  const question = input.value.trim();
  if (!question) return;

  addMessage('user', question);
  input.value = '';
  addMessage('bot', 'Thinking...');

  try {
    const context = pageContext();
    const endpoint = isHome ? '/api/chatbot/search' : '/api/chatbot/ask';
    const body = isHome ? { question } : { question, ...context };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    messages.lastElementChild?.remove();

    if (!response.ok) {
      addMessage('bot', payload.error || 'Chatbot error.');
      return;
    }

    addMessage('bot', payload.answer || 'No answer returned.');
    if (isHome && payload.citations) {
      addCitations(payload.citations);
    }
  } catch (_error) {
    messages.lastElementChild?.remove();
    addMessage('bot', 'Network error while contacting chatbot.');
  }
});

(async function init() {
  try {
    const res = await fetch('/api/chatbot/status');
    const payload = await res.json();
    enabled = Boolean(payload.enabled);
    if (!enabled) {
      addMessage('bot', 'Chatbot is disabled. Configure GEMINI_API_KEY in .env.');
    } else {
      addMessage(
        'bot',
        isHome
          ? 'Ask about all podcast conversations. I will answer with citations.'
          : 'Ask me anything about this page.'
      );
    }
  } catch (_e) {
    addMessage('bot', 'Unable to check chatbot status.');
  }
})();
