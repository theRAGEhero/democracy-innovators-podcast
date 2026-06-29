const fs = require('fs');
const path = require('path');

const EXPORT_FILE = path.join(
  __dirname,
  '..',
  'democracy-innovators-podcast.ghost.2026-03-23-22-46-51.json'
);
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'episodes.json');
const GHOST_ORIGIN = (process.env.GHOST_ORIGIN || 'https://democracyinnovators.com').replace(/\/+$/, '');

function normalizeText(value, fallback = '') {
  if (!value || typeof value !== 'string') return fallback;
  return value.replace(/\s+/g, ' ').trim();
}

function buildExcerpt(post) {
  if (post.custom_excerpt) return normalizeText(post.custom_excerpt);
  if (post.plaintext) return normalizeText(post.plaintext).slice(0, 220) + '...';
  return 'Nuovo episodio del Democracy Innovators Podcast.';
}

function normalizeGhostUrl(value) {
  if (!value || typeof value !== 'string') return value || null;

  if (value.startsWith('__GHOST_URL__')) {
    return value.replace('__GHOST_URL__', GHOST_ORIGIN);
  }

  if (value.startsWith('/content/')) {
    return `${GHOST_ORIGIN}${value}`;
  }

  return value;
}

function normalizeGhostHtml(html) {
  if (!html || typeof html !== 'string') return '<p>Contenuto non disponibile.</p>';

  return html
    .replace(/__GHOST_URL__/g, GHOST_ORIGIN)
    .replace(/(?<=["'(])\/content\//g, `${GHOST_ORIGIN}/content/`);
}

function readExistingEpisodes() {
  if (!fs.existsSync(OUTPUT_FILE)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    return Array.isArray(raw?.episodes) ? raw.episodes : [];
  } catch (_error) {
    return [];
  }
}

function main() {
  if (!fs.existsSync(EXPORT_FILE)) {
    throw new Error(`Ghost export file not found: ${EXPORT_FILE}`);
  }

  const raw = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));
  const data = raw.db?.[0]?.data;
  if (!data) {
    throw new Error('Formato export Ghost non valido.');
  }

  const ghostEpisodes = data.posts
    .filter((post) => post.type === 'post' && post.status === 'published')
    .map((post) => ({
      id: post.id,
      slug: post.slug,
      title: normalizeText(post.title),
      publishedAt: post.published_at,
      featureImage: normalizeGhostUrl(post.feature_image || null),
      excerpt: buildExcerpt(post),
      html: normalizeGhostHtml(post.html)
    }));

  const existingEpisodes = readExistingEpisodes();
  const ghostSlugs = new Set(ghostEpisodes.map((episode) => episode.slug));
  const preservedEpisodes = existingEpisodes.filter((episode) => {
    return episode && typeof episode.slug === 'string' && episode.slug && !ghostSlugs.has(episode.slug);
  });

  const episodes = [...ghostEpisodes, ...preservedEpisodes].sort((a, b) => {
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    podcastTitle: 'Democracy Innovators Podcast',
    episodes
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Generated ${ghostEpisodes.length} Ghost episodes into ${OUTPUT_FILE}`);
  console.log(`Preserved ${preservedEpisodes.length} existing non-Ghost episodes`);
  console.log(`Total episodes written: ${episodes.length}`);
}

main();
