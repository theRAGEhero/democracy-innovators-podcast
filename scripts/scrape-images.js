const fs = require('fs');
const path = require('path');

const EPISODES_FILE = path.join(__dirname, '..', 'public', 'data', 'episodes.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images');
const SITE_ORIGIN = 'https://democracyinnovators.com';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function toSourceUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  if (inputUrl.startsWith('__GHOST_URL__')) {
    return inputUrl.replace('__GHOST_URL__', SITE_ORIGIN);
  }
  if (inputUrl.startsWith('/content/images/')) {
    return `${SITE_ORIGIN}${inputUrl}`;
  }
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
    return inputUrl;
  }
  return null;
}

function toLocalPath(sourceUrl) {
  const url = new URL(sourceUrl);
  if (!url.pathname.startsWith('/content/images/')) return null;
  const rel = url.pathname.replace('/content/images/', '');
  return {
    diskPath: path.join(OUTPUT_DIR, rel),
    publicPath: `/images/${rel}`
  };
}

function collectImageUrls(episodes) {
  const urls = new Set();
  const re = /(?:__GHOST_URL__|https?:\/\/democracyinnovators\.com)?(\/content\/images\/[^"]+\.(?:png|jpg|jpeg|webp|gif))/gi;

  for (const ep of episodes) {
    const feature = toSourceUrl(ep.featureImage);
    if (feature) urls.add(feature);

    const html = typeof ep.html === 'string' ? ep.html : '';
    let match;
    while ((match = re.exec(html)) !== null) {
      const raw = match[0].startsWith('/content/images/')
        ? `${SITE_ORIGIN}${match[0]}`
        : match[0].replace('__GHOST_URL__', SITE_ORIGIN);
      urls.add(raw);
    }
  }

  return [...urls];
}

async function downloadOne(url) {
  const local = toLocalPath(url);
  if (!local) return null;

  ensureDir(path.dirname(local.diskPath));

  if (!fs.existsSync(local.diskPath)) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed ${res.status} for ${url}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(local.diskPath, buffer);
  }

  return local;
}

function replaceToLocal(content, mapping) {
  let out = content;
  for (const [source, local] of mapping.entries()) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), local);

    const sourceAsPlaceholder = source.replace(SITE_ORIGIN, '__GHOST_URL__');
    const escapedPlaceholder = sourceAsPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escapedPlaceholder, 'g'), local);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(EPISODES_FILE)) {
    throw new Error('episodes.json non trovato. Esegui prima: npm run build:content');
  }

  const dataset = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  const episodes = dataset.episodes || [];
  const urls = collectImageUrls(episodes);

  const mapping = new Map();
  let ok = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const local = await downloadOne(url);
      if (local) {
        mapping.set(url, local.publicPath);
        ok += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(err.message);
    }
  }

  for (const ep of episodes) {
    const src = toSourceUrl(ep.featureImage);
    if (src && mapping.has(src)) {
      ep.featureImage = mapping.get(src);
    }
    if (typeof ep.html === 'string') {
      ep.html = replaceToLocal(ep.html, mapping);
    }
  }

  fs.writeFileSync(EPISODES_FILE, JSON.stringify(dataset, null, 2));
  console.log(`Downloaded: ${ok}, failed: ${failed}`);
  console.log(`Updated file: ${EPISODES_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
