const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const EPISODES_FILE = path.join(ROOT, 'public', 'data', 'episodes.json');
const OUT_FILE = path.join(ROOT, 'data', 'transcript_vectors.json');

loadEnv(path.join(ROOT, '.env'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const MAX_CHUNKS = Number(process.env.EMBEDDINGS_MAX_CHUNKS || 0);

if (!GEMINI_API_KEY || /(^replace[_-]|replace_me|your[_-]?gemini[_-]?api[_-]?key)/i.test(GEMINI_API_KEY)) {
  console.error('Missing valid GEMINI_API_KEY in .env');
  process.exit(1);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitChunks(text, maxLen = 1300, overlap = 220) {
  const safe = String(text || '').trim();
  if (!safe) return [];
  const chunks = [];
  let i = 0;
  while (i < safe.length) {
    let end = Math.min(i + maxLen, safe.length);
    if (end < safe.length) {
      const near = safe.lastIndexOf('. ', end);
      if (near > i + 500) end = near + 1;
    }
    const chunk = safe.slice(i, end).trim();
    if (chunk.length > 40) chunks.push(chunk);
    if (end >= safe.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks;
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(message) {
  const m = String(message || '').match(/retry in\\s+([0-9.]+)s/i);
  if (!m) return 35000;
  return Math.ceil(Number(m[1]) * 1000) + 500;
}

async function batchEmbed(texts) {
  const requests = texts.map((text) => ({
    model: `models/${EMBED_MODEL}`,
    content: { role: 'user', parts: [{ text }] }
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(EMBED_MODEL)}:batchEmbedContents?key=${encodeURIComponent(
      GEMINI_API_KEY
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    }
  );

  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`Embedding failed (${res.status}): ${body.slice(0, 500)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const payload = JSON.parse(body);
  const embeddings = payload.embeddings || [];
  if (!embeddings.length) throw new Error('No embeddings returned');
  return embeddings.map((e) => e.values || []);
}

async function main() {
  if (!fs.existsSync(EPISODES_FILE)) {
    throw new Error(`Missing episodes file: ${EPISODES_FILE}`);
  }

  const dataset = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  const episodes = dataset.episodes || [];
  const rawChunks = [];

  for (const ep of episodes) {
    const text = stripHtml(ep.html || '');
    const chunks = splitChunks(text);
    chunks.forEach((chunkText, idx) => {
      rawChunks.push({
        chunkId: `${ep.slug}::${idx + 1}`,
        slug: ep.slug,
        title: ep.title,
        publishedAt: ep.publishedAt,
        url: `${SITE_URL}/episode/${encodeURIComponent(ep.slug)}`,
        text: chunkText
      });
    });
  }

  const limitedRaw = MAX_CHUNKS > 0 ? rawChunks.slice(0, MAX_CHUNKS) : rawChunks;
  if (MAX_CHUNKS > 0) {
    console.log(`Using EMBEDDINGS_MAX_CHUNKS=${MAX_CHUNKS}`);
  }

  let previous = null;
  if (fs.existsSync(OUT_FILE)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch (_e) {
      previous = null;
    }
  }

  const prevById = new Map();
  if (previous && previous.model === EMBED_MODEL && Array.isArray(previous.chunks)) {
    for (const c of previous.chunks) prevById.set(c.chunkId, c);
  }

  const outChunks = [];
  const batchSize = 64;
  for (let i = 0; i < limitedRaw.length; i += batchSize) {
    const batch = limitedRaw.slice(i, i + batchSize);

    const ready = batch.map((chunk) => {
      const prev = prevById.get(chunk.chunkId);
      if (prev && prev.textHash === hashText(chunk.text) && Array.isArray(prev.vector) && prev.vector.length > 0) {
        return { ...chunk, vector: prev.vector, textHash: prev.textHash, reused: true };
      }
      return { ...chunk, reused: false };
    });

    const needEmbed = ready.filter((c) => !c.reused);
    let vectors = [];

    if (needEmbed.length > 0) {
      let done = false;
      let attempts = 0;
      while (!done && attempts < 8) {
        attempts += 1;
        try {
          vectors = await batchEmbed(needEmbed.map((x) => x.text));
          done = true;
        } catch (err) {
          if (err.status === 429) {
            const waitMs = parseRetryDelayMs(err.body || err.message);
            console.log(`Rate-limited. Waiting ${waitMs}ms before retry...`);
            await sleep(waitMs);
          } else {
            throw err;
          }
        }
      }
      if (!done) {
        throw new Error('Embedding retries exhausted due to quota/rate limits.');
      }
    }

    let vecIdx = 0;
    for (const chunk of ready) {
      if (chunk.reused) {
        outChunks.push({ ...chunk, reused: undefined });
      } else {
        outChunks.push({
          ...chunk,
          vector: vectors[vecIdx] || [],
          textHash: hashText(chunk.text),
          reused: undefined
        });
        vecIdx += 1;
      }
    }

    if ((i / batchSize + 1) % 5 === 0) {
      console.log(`Processed ${Math.min(i + batchSize, limitedRaw.length)} / ${limitedRaw.length}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    model: EMBED_MODEL,
    totalEpisodes: episodes.length,
    totalChunks: outChunks.length,
    chunks: outChunks
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output));
  console.log(`Saved vector index: ${OUT_FILE}`);
  console.log(`Episodes: ${episodes.length}, Chunks: ${outChunks.length}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
