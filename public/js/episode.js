const container = document.querySelector('#episode');
const form = document.querySelector('#comment-form');
const list = document.querySelector('#comments-list');
const status = document.querySelector('#form-status');

const slug = window.location.pathname.split('/').filter(Boolean).pop();
const dateFmt = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const ARTICLE_REACTION_SELECTOR = 'p, h2, h3, blockquote, li';

async function logClientEvent(event, meta = {}) {
  const payload = {
    event,
    page: window.location.pathname,
    href: window.location.href,
    userAgent: navigator.userAgent,
    ...meta
  };

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/client-log', blob);
      return;
    }

    await fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (_error) {
    // Avoid cascading UI failures when telemetry cannot be sent.
  }
}

function sanitize(text) {
  return (text || '').replace(/[&<>\"]/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return map[char] || char;
  });
}

function getYoutubeEmbedUrl(html) {
  if (!html || typeof html !== 'string') return null;
  const embedMatch = html.match(/https?:\/\/www\.youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i);
  if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;

  const watchMatch = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/i);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;

  const shortMatch = html.match(/https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;

  return null;
}

function stripYoutubeEmbedsFromHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let cleaned = html;

  // Remove Ghost embed cards that contain a YouTube iframe.
  cleaned = cleaned.replace(
    /<figure[^>]*class="[^"]*kg-embed-card[^"]*"[^>]*>[\s\S]*?<iframe[^>]*src="https?:\/\/(?:www\.)?youtube\.com\/embed\/[^"]+"[^>]*>[\s\S]*?<\/iframe>[\s\S]*?<\/figure>/gi,
    ''
  );

  // Remove standalone YouTube iframes if present outside figure cards.
  cleaned = cleaned.replace(
    /<iframe[^>]*src="https?:\/\/(?:www\.)?(?:youtube\.com\/embed|youtu\.be)\/[^"]+"[^>]*>[\s\S]*?<\/iframe>/gi,
    ''
  );

  // Clean up empty paragraph leftovers around removed embeds.
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');

  return cleaned;
}

function stripDuplicateCoverImage(html, episode) {
  if (!html || typeof html !== 'string') return '';

  const doc = document.createElement('div');
  doc.innerHTML = html;

  const firstImage = doc.querySelector('img');
  if (!firstImage) return html;

  const episodeFeature = String(episode?.featureImage || '').trim();
  const imageSrc = String(firstImage.getAttribute('src') || '').trim();

  if (!episodeFeature || !imageSrc) return html;

  let sameImage = false;
  try {
    sameImage = new URL(imageSrc, window.location.origin).href === new URL(episodeFeature, window.location.origin).href;
  } catch (_error) {
    sameImage = imageSrc === episodeFeature;
  }

  if (!sameImage) return html;

  const removableParent = firstImage.closest('figure, p');
  if (removableParent && removableParent.textContent.trim() === '') {
    removableParent.remove();
  } else {
    firstImage.remove();
  }

  return doc.innerHTML.replace(/<p>\s*<\/p>/gi, '');
}

function replaceExternalEmbeds(html) {
  if (!html || typeof html !== 'string') return '';
  return html;
}

function reactionStorageKey() {
  return `episode-reactions:${slug}`;
}

function readReactionState() {
  try {
    return JSON.parse(window.localStorage.getItem(reactionStorageKey()) || '{}');
  } catch (_error) {
    return {};
  }
}

function writeReactionState(state) {
  try {
    window.localStorage.setItem(reactionStorageKey(), JSON.stringify(state));
  } catch (_error) {
    // Ignore storage failures so article reading still works.
  }
}

function reactionIcon(type) {
  if (type === 'agree') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.2 21H5.5A1.5 1.5 0 0 1 4 19.5v-7A1.5 1.5 0 0 1 5.5 11h3.7v10Z"></path>
        <path d="M11 21h5.2a2.5 2.5 0 0 0 2.4-1.8l1.2-4.5a2.5 2.5 0 0 0-2.4-3.2H14l.5-3.3c.1-.9-.2-1.7-.8-2.3l-1-.9-4 4V21Z"></path>
      </svg>
    `;
  }
  if (type === 'disagree') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.8 3H18.5A1.5 1.5 0 0 1 20 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-3.7V3Z"></path>
        <path d="M13 3H7.8a2.5 2.5 0 0 0-2.4 1.8L4.2 9.3a2.5 2.5 0 0 0 2.4 3.2H10l-.5 3.3c-.1.9.2 1.7.8 2.3l1 .9 4-4V3Z"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7"></circle>
    </svg>
  `;
}

function reactionButtonMarkup(type, label, isActive) {
  return `
    <button
      class="reaction-chip${isActive ? ' is-active' : ''}"
      type="button"
      data-reaction-value="${type}"
      aria-pressed="${isActive ? 'true' : 'false'}"
      title="${label}"
    >
      <span class="reaction-icon reaction-icon-${type}">${reactionIcon(type)}</span>
      <span class="reaction-label">${label}</span>
    </button>
  `;
}

function createReactionRail(segmentId, selectedValue) {
  const rail = document.createElement('aside');
  rail.className = 'reaction-rail';
  rail.setAttribute('aria-label', 'Reader sentiment');
  rail.dataset.segmentId = segmentId;
  rail.innerHTML = `
    <div class="reaction-rail-inner">
      <div class="reaction-group" role="group" aria-label="Respond to this passage">
        ${reactionButtonMarkup('agree', 'Agree', selectedValue === 'agree')}
        ${reactionButtonMarkup('neutral', 'Neutral', selectedValue === 'neutral')}
        ${reactionButtonMarkup('disagree', 'Disagree', selectedValue === 'disagree')}
      </div>
    </div>
  `;
  return rail;
}

function mountArticleReactions() {
  const body = container.querySelector('.episode-body');
  if (!body) return;

  const state = readReactionState();
  const segments = [...body.querySelectorAll(ARTICLE_REACTION_SELECTOR)].filter((node) => {
    if (node.closest('.reaction-segment')) return false;
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length >= 40;
  });

  segments.forEach((node, index) => {
    const segmentId = `${slug}:${index + 1}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'reaction-segment';
    wrapper.dataset.segmentId = segmentId;

    node.parentNode.insertBefore(wrapper, node);
    wrapper.appendChild(node);
    wrapper.appendChild(createReactionRail(segmentId, state[segmentId] || ''));
  });

  body.addEventListener('click', (event) => {
    const button = event.target.closest('.reaction-chip');
    if (!button) return;

    const segment = button.closest('.reaction-segment');
    if (!segment) return;

    const segmentId = segment.dataset.segmentId;
    const nextValue = button.dataset.reactionValue;
    const currentState = readReactionState();
    const currentValue = currentState[segmentId] || '';
    const selectedValue = currentValue === nextValue ? '' : nextValue;

    if (selectedValue) {
      currentState[segmentId] = selectedValue;
    } else {
      delete currentState[segmentId];
    }
    writeReactionState(currentState);

    segment.querySelectorAll('.reaction-chip').forEach((chip) => {
      const isActive = chip.dataset.reactionValue === selectedValue;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    document.dispatchEvent(
      new CustomEvent('episode-reaction-change', {
        detail: {
          slug,
          segmentId,
          reaction: selectedValue || null,
          text: segment.querySelector(':scope > p, :scope > h2, :scope > h3, :scope > blockquote, :scope > li')?.textContent?.trim() || ''
        }
      })
    );
  });
}

function renderComments(comments) {
  if (!comments.length) {
    list.innerHTML = '<li>No comments yet. Be the first to post one.</li>';
    return;
  }

  list.innerHTML = comments
    .map((comment) => {
      return `
      <li class="comment-item">
        <strong>${sanitize(comment.name)}</strong>
        <small> • ${dateFmt.format(new Date(comment.createdAt))}</small>
        <p>${sanitize(comment.message)}</p>
      </li>
    `;
    })
    .join('');
}

async function loadComments() {
  const response = await fetch(`/api/comments/${slug}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Comments request failed with status ${response.status}`);
  }
  const payload = await response.json();
  renderComments(payload.comments || []);
}

async function loadEpisode() {
  const urls = [
    `/api/episodes/${encodeURIComponent(slug)}`,
    `/api/episodes/${encodeURIComponent(slug)}?ts=${Date.now()}`,
    `/data/episodes.json?ts=${Date.now()}`
  ];
  let episode = null;
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Episode request failed with status ${response.status}`);
      }
      const payload = await response.json();
      episode = Array.isArray(payload?.episodes)
        ? (payload.episodes || []).find((item) => item.slug === slug)
        : payload;
      await logClientEvent('episode.load.success', {
        source: url,
        payloadBytes: response.headers.get('content-length')
      });
      if (episode) break;
    } catch (error) {
      lastError = error;
      await logClientEvent('episode.load.attempt_failed', {
        source: url,
        message: String(error?.message || error || 'Unknown error'),
        stack: error?.stack ? String(error.stack).slice(0, 1200) : null
      });
    }
  }

  if (!episode) {
    if (lastError) {
      throw lastError;
    }
    container.innerHTML = '<h1>Episode not found</h1>';
    form.style.display = 'none';
    return;
  }

  document.title = `${episode.title} | Democracy Innovators Podcast`;

  const youtubeEmbed = getYoutubeEmbedUrl(episode.html);
  const articleHtml = replaceExternalEmbeds(stripDuplicateCoverImage(stripYoutubeEmbedsFromHtml(episode.html), episode));
  const video = youtubeEmbed
    ? `
        <div class="episode-video-wrap">
          <iframe
            class="episode-video"
            src="${youtubeEmbed}"
            title="YouTube video: ${sanitize(episode.title)}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        </div>
      `
    : '';

  container.innerHTML = `
    <header class="episode-header">
      <p class="eyebrow">Podcast episode</p>
      <h1>${sanitize(episode.title)}</h1>
      <p class="card-meta">Published on ${dateFmt.format(new Date(episode.publishedAt))}</p>
      ${video}
    </header>
    <section class="episode-body">${articleHtml}</section>
  `;

  mountArticleReactions();
}

async function initEpisodeView() {
  try {
    await loadEpisode();
  } catch (error) {
    console.error('Failed to initialize episode view.', error);
    await logClientEvent('episode.load.failed', {
      message: String(error?.message || error || 'Unknown error'),
      stack: error?.stack ? String(error.stack).slice(0, 1600) : null
    });
    container.innerHTML = '<h1>Error loading episode.</h1>';
    if (form) form.style.display = 'none';
    return;
  }

  try {
    await loadComments();
  } catch (error) {
    console.error('Failed to load comments.', error);
    await logClientEvent('episode.comments.load.failed', {
      message: String(error?.message || error || 'Unknown error'),
      stack: error?.stack ? String(error.stack).slice(0, 1600) : null
    });
    if (list) {
      list.innerHTML = '<li>Comments are temporarily unavailable.</li>';
    }
  }
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'Submitting...';

    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const message = String(formData.get('message') || '').trim();

    try {
      const response = await fetch(`/api/comments/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Error while submitting the comment.');
      }

      form.reset();
      status.textContent = 'Comment posted.';
      await loadComments();
    } catch (error) {
      await logClientEvent('episode.comments.submit.failed', {
        message: String(error?.message || error || 'Unknown error'),
        stack: error?.stack ? String(error.stack).slice(0, 1600) : null
      });
      status.textContent = error.message;
    }
  });
}

initEpisodeView();
