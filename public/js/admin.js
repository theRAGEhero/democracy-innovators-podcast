const form = document.querySelector('#create-post-form');
const statusEl = document.querySelector('#status');
const logoutBtn = document.querySelector('#logout');

let csrfToken = '';

async function initAdmin() {
  const response = await fetch('/api/admin/me');
  if (!response.ok) {
    window.location.href = '/admin/login';
    return;
  }
  const payload = await response.json();
  csrfToken = payload.csrfToken;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = 'Creating post...';

  const formData = new FormData(form);
  const title = String(formData.get('title') || '').trim();
  const excerpt = String(formData.get('excerpt') || '').trim();
  const youtubeUrl = String(formData.get('youtubeUrl') || '').trim();
  const content = String(formData.get('content') || '').trim();
  const includeDonate = formData.get('includeDonate') === 'on';

  try {
    const response = await fetch('/api/admin/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({ title, excerpt, youtubeUrl, content, includeDonate })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Create failed.');
    }

    statusEl.textContent = `Post created: /episode/${payload.episode.slug}`;
    form.reset();
    document.querySelector('#includeDonate').checked = true;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  if (!csrfToken) return;

  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken
    }
  });

  window.location.href = '/admin/login';
});

initAdmin().catch(() => {
  window.location.href = '/admin/login';
});
