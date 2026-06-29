const shareButtons = [...document.querySelectorAll('[data-share-button]')];

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const input = document.createElement('input');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'absolute';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  return copied;
}

async function handleShare(button) {
  const shareData = {
    title: document.title,
    text: 'Democracy Innovators Podcast',
    url: window.location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await copyToClipboard(window.location.href);
    const label = button.querySelector('span');
    const previous = label?.textContent || 'Share';
    if (label) label.textContent = 'Copied';
    button.classList.add('is-copied');
    window.setTimeout(() => {
      if (label) label.textContent = previous;
      button.classList.remove('is-copied');
    }, 1800);
  } catch (_error) {
    // Ignore share cancellations and clipboard failures.
  }
}

shareButtons.forEach((button) => {
  button.addEventListener('click', () => {
    handleShare(button);
  });
});
