const form = document.querySelector('#login-form');
const statusEl = document.querySelector('#status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = 'Signing in...';

  const formData = new FormData(form);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Login failed.');
    }

    statusEl.textContent = 'Signed in successfully.';
    window.location.href = '/admin';
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
