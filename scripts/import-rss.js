const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EPISODES_FILE = path.join(ROOT, 'public', 'data', 'episodes.json');
const RSS_URL = process.env.RSS_URL || 'https://democracyinnovators.com/rss/';

function decodeHtml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptFromHtml(html, max = 220) {
  const plain = stripHtml(html);
  if (!plain) return 'Nuovo episodio del Democracy Innovators Podcast.';
  return plain.length <= max ? plain : `${plain.slice(0, max).trim()}...`;
}

function slugFromLink(link) {
  const url = new URL(link);
  return url.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).pop() || '';
}

function getTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeHtml(match[1].trim()) : '';
}

function getSelfClosingMediaUrl(item) {
  const match = item.match(/<media:content[^>]*\surl="([^"]+)"/i);
  return match ? decodeHtml(match[1]) : '';
}

function parseItems(xml) {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  return items
    .map((item, index) => {
      const link = getTag(item, 'link');
      const slug = slugFromLink(link);
      const title = getTag(item, 'title');
      const pubDate = getTag(item, 'pubDate');
      const html = getTag(item, 'content:encoded') || getTag(item, 'description');
      const featureImage = getSelfClosingMediaUrl(item) || '';

      if (!slug || !title || !link || !pubDate || !html) {
        return null;
      }

      return {
        id: `rss-${slug}-${index + 1}`,
        slug,
        title,
        publishedAt: new Date(pubDate).toISOString(),
        featureImage: featureImage || null,
        excerpt: excerptFromHtml(html),
        html
      };
    })
    .filter(Boolean);
}

async function main() {
  if (!fs.existsSync(EPISODES_FILE)) {
    throw new Error(`Missing episodes file: ${EPISODES_FILE}`);
  }

  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'democracy-innovators-platform-importer/1.0' }
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed with status ${res.status}`);
  }

  const xml = await res.text();
  const incoming = parseItems(xml);
  const dataset = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  const existingBySlug = new Set((dataset.episodes || []).map((episode) => episode.slug));

  const added = [];
  for (const episode of incoming) {
    if (existingBySlug.has(episode.slug)) continue;
    dataset.episodes.push(episode);
    existingBySlug.add(episode.slug);
    added.push(episode);
  }

  dataset.episodes.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  dataset.generatedAt = new Date().toISOString();

  fs.writeFileSync(EPISODES_FILE, JSON.stringify(dataset, null, 2));

  console.log(`RSS items parsed: ${incoming.length}`);
  console.log(`Episodes added: ${added.length}`);
  if (added.length) {
    console.log(added.map((episode) => `${episode.publishedAt} | ${episode.slug}`).join('\n'));
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
