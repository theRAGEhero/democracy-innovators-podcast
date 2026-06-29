const episodesEl = document.querySelector('#episodes');
const searchEl = document.querySelector('#search');
const countEl = document.querySelector('#count');

const dateFmt = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

let episodes = [];

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

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function normalizeEpisode(raw) {
  return {
    slug: typeof raw?.slug === 'string' ? raw.slug : '',
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled episode',
    excerpt: typeof raw?.excerpt === 'string' ? raw.excerpt : '',
    featureImage: typeof raw?.featureImage === 'string' ? raw.featureImage : '',
    publishedAt: isValidDate(raw?.publishedAt) ? raw.publishedAt : null
  };
}

function formatEpisodeDate(value) {
  if (!isValidDate(value)) {
    return 'Publication date unavailable';
  }
  return dateFmt.format(new Date(value));
}

function render(list) {
  countEl.textContent = `${list.length} episodes available`;

  if (list.length === 0) {
    episodesEl.innerHTML = '<li>No episodes found.</li>';
    return;
  }

  episodesEl.innerHTML = list
    .map((episode) => {
      const media = episode.featureImage
        ? `<img class="card-image" src="${episode.featureImage}" alt="Cover ${sanitize(episode.title)}" loading="lazy" />`
        : '<div class="card-image" aria-hidden="true"></div>';

      return `
        <li class="episode-card">
          <article class="post-row">
            <a class="post-media-link" href="/episode/${episode.slug}">
              ${media}
            </a>
            <div class="card-body">
              <p class="card-meta">${formatEpisodeDate(episode.publishedAt)}</p>
              <h2 class="card-title"><a href="/episode/${episode.slug}">${sanitize(episode.title)}</a></h2>
              <p class="card-excerpt">${sanitize(episode.excerpt)}</p>
              <a class="card-open-link" href="/episode/${episode.slug}">Continue reading</a>
            </div>
          </article>
        </li>
      `;
    })
    .join('');
}

function onSearch() {
  const term = searchEl.value.trim().toLowerCase();
  if (!term) {
    render(episodes);
    return;
  }

  const filtered = episodes.filter((episode) => {
    return (
      episode.title.toLowerCase().includes(term) ||
      episode.excerpt.toLowerCase().includes(term)
    );
  });

  render(filtered);
}

async function init() {
  const data = await fetchEpisodes();
  episodes = Array.isArray(data.episodes) ? data.episodes.map(normalizeEpisode).filter((episode) => episode.slug) : [];

  try {
    render(episodes);
  } catch (error) {
    await logClientEvent('episodes.render.failed', {
      message: String(error?.message || error || 'Unknown render error'),
      stack: error?.stack ? String(error.stack).slice(0, 1600) : null,
      episodeCount: episodes.length
    });
    throw error;
  }

  searchEl.addEventListener('input', onSearch);
}

async function fetchEpisodes() {
  const urls = [
    '/api/episodes',
    `/api/episodes?ts=${Date.now()}`,
    `/data/episodes.json?ts=${Date.now()}`
  ];
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Episodes request failed with status ${response.status}`);
      }
      const payload = await response.json();
      await logClientEvent('episodes.load.success', {
        source: url,
        episodeCount: Array.isArray(payload.episodes) ? payload.episodes.length : null,
        payloadBytes: response.headers.get('content-length')
      });
      return payload;
    } catch (error) {
      lastError = error;
      await logClientEvent('episodes.load.attempt_failed', {
        source: url,
        message: String(error.message || error),
        stack: error.stack ? String(error.stack).slice(0, 1200) : null
      });
    }
  }

  throw lastError || new Error('Unable to load episodes.');
}

init().catch(async (error) => {
  console.error('Failed to initialize episodes view.', error);
  await logClientEvent('episodes.load.failed', {
    message: String(error?.message || error || 'Unknown error'),
    stack: error?.stack ? String(error.stack).slice(0, 1600) : null
  });
  episodesEl.innerHTML = '<li>Error loading episodes.</li>';
});
