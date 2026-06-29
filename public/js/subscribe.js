const buttons = document.querySelectorAll('[data-copy-target]');

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'absolute';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(input);
  return ok;
}

buttons.forEach((button) => {
  button.addEventListener('click', async () => {
    const targetId = button.dataset.copyTarget;
    const target = document.getElementById(targetId);
    if (!target) return;

    const original = button.textContent;
    try {
      await copyText(target.textContent || '');
      button.textContent = 'Copied';
    } catch (_error) {
      button.textContent = 'Failed';
    }

    window.setTimeout(() => {
      button.textContent = original;
    }, 1800);
  });
});
