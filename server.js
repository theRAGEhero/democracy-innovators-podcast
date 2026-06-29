const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '.env'));

const app = express();
const PORT = Number(process.env.PORT || 3000);

const COMMENTS_FILE = path.join(__dirname, 'data', 'comments.json');
const EPISODES_FILE = path.join(__dirname, 'public', 'data', 'episodes.json');
const ADMIN_DIR = path.join(__dirname, 'admin');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LOGS_DIR = path.join(__dirname, 'logs');
const APP_LOG_FILE = path.join(LOGS_DIR, 'app.log');
const VECTOR_INDEX_FILE = path.join(__dirname, 'data', 'transcript_vectors.json');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const GEMINI_ENABLED =
  Boolean(GEMINI_API_KEY) && !/(^replace[_-]|replace_me|your[_-]?gemini[_-]?api[_-]?key)/i.test(GEMINI_API_KEY);

const sessions = new Map();
const loginAttempts = new Map();

if (!ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
  console.warn('Missing ADMIN_PASSWORD_HASH or SESSION_SECRET. Admin login is disabled.');
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(attachRequestId);
app.use(attachSession);
app.use(express.static(path.join(__dirname, 'public')));

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
    if (!process.env[key]) process.env[key] = stripQuotes(value);
  }
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logEvent(level, event, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...meta
  };
  const line = JSON.stringify(payload);
  console.log(line);
  try {
    ensureLogsDir();
    fs.appendFileSync(APP_LOG_FILE, `${line}\n`);
  } catch (_error) {
    // Keep request flow even if file logging fails.
  }
}

function attachRequestId(req, res, next) {
  req.requestId = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const out = {};
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function sessionCookieOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`;
}

function expiredSessionCookieOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

function createSession(username) {
  const sid = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessions.set(sid, {
    sid,
    username,
    csrfToken,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return sid;
}

function attachSession(req, _res, next) {
  const raw = parseCookies(req).sid;
  if (!raw) {
    req.session = null;
    return next();
  }

  const [sid, signature] = String(raw).split('.');
  if (!sid || !signature || !SESSION_SECRET) {
    req.session = null;
    return next();
  }

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(sid).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    req.session = null;
    return next();
  }

  const session = sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sid);
    req.session = null;
    return next();
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.session = session;
  req.sessionId = sid;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function requireCsrf(req, res, next) {
  const token = String(req.headers['x-csrf-token'] || '');
  if (!req.session || !token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  return next();
}

function isLoginRateLimited(ip) {
  const now = Date.now();
  const state = loginAttempts.get(ip);
  if (!state) return { blocked: false };
  if (state.blockedUntil && state.blockedUntil > now) {
    return { blocked: true, retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000) };
  }
  return { blocked: false };
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 8;
  const blockMs = 20 * 60 * 1000;

  const current = loginAttempts.get(ip) || { count: 0, windowStart: now, blockedUntil: 0 };
  if (now - current.windowStart > windowMs) {
    current.count = 0;
    current.windowStart = now;
    current.blockedUntil = 0;
  }

  current.count += 1;
  if (current.count >= maxAttempts) {
    current.blockedUntil = now + blockMs;
    current.count = 0;
    current.windowStart = now;
  }

  loginAttempts.set(ip, current);
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;

  const hashBuffer = Buffer.from(hashHex, 'hex');
  const candidate = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), hashBuffer.length);
  if (candidate.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(candidate, hashBuffer);
}

function ensureCommentsFile() {
  const dir = path.dirname(COMMENTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(COMMENTS_FILE)) {
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2));
  }
}

function readComments() {
  ensureCommentsFile();
  const raw = fs.readFileSync(COMMENTS_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeComments(data) {
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(data, null, 2));
}

function readEpisodes() {
  if (!fs.existsSync(EPISODES_FILE)) {
    return { generatedAt: new Date().toISOString(), podcastTitle: 'Democracy Innovators Podcast', episodes: [] };
  }
  return JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
}

function writeEpisodes(data) {
  fs.writeFileSync(EPISODES_FILE, JSON.stringify(data, null, 2));
}

function buildEpisodeSummaries(dataset) {
  const episodes = Array.isArray(dataset?.episodes) ? dataset.episodes : [];
  return episodes.map((episode) => ({
    id: episode.id || '',
    slug: episode.slug || '',
    title: episode.title || 'Untitled episode',
    publishedAt: episode.publishedAt || null,
    featureImage: episode.featureImage || '',
    excerpt: episode.excerpt || ''
  }));
}

function buildEpisodeDetail(episode) {
  if (!episode || typeof episode !== 'object') return null;
  return {
    id: episode.id || '',
    slug: episode.slug || '',
    title: episode.title || 'Untitled episode',
    publishedAt: episode.publishedAt || null,
    featureImage: episode.featureImage || '',
    excerpt: episode.excerpt || '',
    html: episode.html || ''
  };
}

function sanitize(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (char) => {
    const map = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    };
    return map[char] || char;
  });
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readVectorIndex() {
  if (!fs.existsSync(VECTOR_INDEX_FILE)) {
    return { generatedAt: null, model: null, chunks: [] };
  }
  return JSON.parse(fs.readFileSync(VECTOR_INDEX_FILE, 'utf8'));
}

function dot(a, b) {
  let out = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) out += a[i] * b[i];
  return out;
}

function norm(a) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * a[i];
  return Math.sqrt(s);
}

function cosineSimilarity(a, b) {
  const denom = norm(a) * norm(b);
  if (!denom) return 0;
  return dot(a, b) / denom;
}

async function embedText(text, model) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(
      GEMINI_API_KEY
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { role: 'user', parts: [{ text }] }
      })
    }
  );
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Embed API ${res.status}: ${bodyText.slice(0, 400)}`);
  }
  const payload = JSON.parse(bodyText);
  const values = payload?.embedding?.values;
  if (!Array.isArray(values) || !values.length) {
    throw new Error('Embedding response missing values.');
  }
  return values;
}

function sanitizeMultiline(value, max = 12000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r/g, '').trim().slice(0, max);
}

function sanitizeTelemetryValue(value, max = 1600) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r/g, ' ').replace(/\n/g, ' ').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[char] || char;
  });
}

function toSlug(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function uniqueSlug(base, existing) {
  let slug = base || `episode-${Date.now()}`;
  let n = 2;
  while (existing.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function extractYoutubeId(url) {
  if (!url) return null;
  const value = String(url).trim();
  let match = value.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/i);
  if (match) return match[1];
  match = value.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i);
  if (match) return match[1];
  match = value.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (match) return match[1];
  return null;
}

function buildEpisodeHtml({ youtubeId, content, includeDonate }) {
  const blocks = [];

  if (youtubeId) {
    blocks.push(
      `<figure class="kg-card kg-embed-card"><iframe width="200" height="113" src="https://www.youtube.com/embed/${youtubeId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="Episode video"></iframe></figure>`
    );
  }

  if (includeDonate) {
    blocks.push(
      '<div class="kg-card kg-button-card kg-align-center"><a href="https://www.paypal.com/ncp/payment/7KCR9XBSCQVMG" class="kg-btn kg-btn-accent">Donate on PayPal</a></div>'
    );
  }

  const paragraphs = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`);

  blocks.push(...paragraphs);
  return blocks.join('');
}

function validateEpisodeSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  if (!fs.existsSync(EPISODES_FILE)) return false;
  const dataset = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  return dataset.episodes.some((episode) => episode.slug === slug);
}

app.get('/api/health', (_req, res) => {
  setSecurityHeaders(res);
  res.json({ status: 'ok' });
});

app.get('/api/episodes', (req, res) => {
  setSecurityHeaders(res);

  try {
    const dataset = readEpisodes();
    return res.json({
      generatedAt: dataset.generatedAt || null,
      podcastTitle: dataset.podcastTitle || 'Democracy Innovators Podcast',
      episodes: buildEpisodeSummaries(dataset)
    });
  } catch (error) {
    logEvent('error', 'episodes.summary.failed', {
      requestId: req.requestId,
      error: String(error.message || error)
    });
    return res.status(500).json({ error: 'Failed to load episode summaries.' });
  }
});

app.get('/api/episodes/:slug', (req, res) => {
  setSecurityHeaders(res);

  try {
    const dataset = readEpisodes();
    const episode = (Array.isArray(dataset.episodes) ? dataset.episodes : []).find((item) => item.slug === req.params.slug);
    if (!episode) {
      return res.status(404).json({ error: 'Episode not found.' });
    }
    return res.json(buildEpisodeDetail(episode));
  } catch (error) {
    logEvent('error', 'episodes.detail.failed', {
      requestId: req.requestId,
      slug: sanitizeTelemetryValue(req.params.slug, 180),
      error: String(error.message || error)
    });
    return res.status(500).json({ error: 'Failed to load episode.' });
  }
});

app.post('/api/client-log', (req, res) => {
  setSecurityHeaders(res);

  logEvent('warn', 'client.telemetry', {
    requestId: req.requestId,
    clientEvent: sanitizeTelemetryValue(req.body.event, 120),
    page: sanitizeTelemetryValue(req.body.page, 240),
    href: sanitizeTelemetryValue(req.body.href, 600),
    message: sanitizeTelemetryValue(req.body.message, 800),
    stack: sanitizeTelemetryValue(req.body.stack, 1600),
    source: sanitizeTelemetryValue(req.body.source, 240),
    episodeCount: Number.isFinite(req.body.episodeCount) ? req.body.episodeCount : null,
    userAgent: sanitizeTelemetryValue(req.body.userAgent, 400)
  });

  return res.status(204).end();
});

app.get('/api/chatbot/status', (_req, res) => {
  setSecurityHeaders(res);
  return res.json({ enabled: GEMINI_ENABLED, model: GEMINI_MODEL });
});

app.get('/api/chatbot/models', async (req, res) => {
  setSecurityHeaders(res);

  if (!GEMINI_ENABLED) {
    logEvent('warn', 'chatbot.models.disabled', { requestId: req.requestId });
    return res.status(503).json({ error: 'Chatbot not configured.' });
  }

  try {
    const modelsRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`
    );
    const text = await modelsRes.text();
    if (!modelsRes.ok) {
      logEvent('error', 'chatbot.models.fetch_failed', {
        requestId: req.requestId,
        status: modelsRes.status,
        body: text.slice(0, 600)
      });
      return res.status(502).json({ error: 'Gemini models fetch failed.', details: text.slice(0, 600) });
    }
    const payload = JSON.parse(text);
    const names = (payload.models || []).map((m) => m.name);
    return res.json({
      currentModel: GEMINI_MODEL,
      currentModelExists: names.includes(`models/${GEMINI_MODEL}`) || names.includes(GEMINI_MODEL),
      models: names
    });
  } catch (error) {
    logEvent('error', 'chatbot.models.exception', { requestId: req.requestId, error: String(error.message || error) });
    return res.status(500).json({ error: 'Error retrieving models.', details: String(error.message || error) });
  }
});

app.get('/api/chatbot/index-status', (req, res) => {
  setSecurityHeaders(res);
  const index = readVectorIndex();
  return res.json({
    exists: fs.existsSync(VECTOR_INDEX_FILE),
    model: index.model || null,
    generatedAt: index.generatedAt || null,
    chunks: Array.isArray(index.chunks) ? index.chunks.length : 0
  });
});

app.post('/api/chatbot/search', async (req, res) => {
  setSecurityHeaders(res);

  if (!GEMINI_ENABLED) {
    logEvent('warn', 'chatbot.search.disabled', { requestId: req.requestId });
    return res.status(503).json({ error: 'Chatbot not configured: missing GEMINI_API_KEY.' });
  }

  const question = sanitize(req.body.question, 1000);
  if (!question) {
    logEvent('warn', 'chatbot.search.invalid_question', { requestId: req.requestId });
    return res.status(400).json({ error: 'Question is required.' });
  }

  const index = readVectorIndex();
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  if (!chunks.length) {
    logEvent('warn', 'chatbot.search.no_index', { requestId: req.requestId });
    return res.status(503).json({
      error: 'Local search index is not available. Run: npm run embeddings:build'
    });
  }

  try {
    logEvent('info', 'chatbot.search.start', {
      requestId: req.requestId,
      model: GEMINI_MODEL,
      embedModel: index.model || GEMINI_EMBED_MODEL,
      questionLength: question.length,
      chunks: chunks.length
    });

    const queryVector = await embedText(question, index.model || GEMINI_EMBED_MODEL);
    const ranked = chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryVector, chunk.vector || [])
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const citations = ranked.map((item, idx) => {
      const ref = `S${idx + 1}`;
      return {
        ref,
        score: Number(item.score.toFixed(4)),
        title: item.chunk.title,
        slug: item.chunk.slug,
        url: `${SITE_URL}/episode/${encodeURIComponent(item.chunk.slug)}`,
        snippet: item.chunk.text,
        chunkId: item.chunk.chunkId
      };
    });

    const context = citations
      .map(
        (c) =>
          `[${c.ref}] title=${c.title}\nslug=${c.slug}\nurl=${c.url}\nchunk=${c.chunkId}\ntext=${c.snippet}`
      )
      .join('\n\n');

    const prompt = [
      'You are a retrieval assistant for a podcast website.',
      'Answer ONLY from the provided sources.',
      'Every factual statement must include citation markers like [S1], [S2].',
      'If information is missing, say it clearly.',
      '',
      `QUESTION: ${question}`,
      '',
      'SOURCES:',
      context
    ].join('\n');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 }
        })
      }
    );

    const resText = await geminiRes.text();
    if (!geminiRes.ok) {
      logEvent('error', 'chatbot.search.gemini_non_ok', {
        requestId: req.requestId,
        status: geminiRes.status,
        model: GEMINI_MODEL,
        body: resText.slice(0, 800)
      });
      return res.status(502).json({ error: 'Gemini API error', details: resText.slice(0, 600) });
    }

    const payload = JSON.parse(resText);
    const answer =
      payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim() || '';
    if (!answer) {
      logEvent('error', 'chatbot.search.empty_answer', { requestId: req.requestId, model: GEMINI_MODEL });
      return res.status(502).json({ error: 'Empty Gemini response.' });
    }

    logEvent('info', 'chatbot.search.success', {
      requestId: req.requestId,
      model: GEMINI_MODEL,
      citations: citations.length,
      answerLength: answer.length
    });
    return res.json({ answer, citations });
  } catch (error) {
    logEvent('error', 'chatbot.search.exception', {
      requestId: req.requestId,
      error: String(error.message || error)
    });
    return res.status(500).json({ error: 'Chatbot search error.', details: String(error.message || error) });
  }
});

app.post('/api/chatbot/ask', async (req, res) => {
  setSecurityHeaders(res);

  if (!GEMINI_ENABLED) {
    logEvent('warn', 'chatbot.ask.disabled', { requestId: req.requestId });
    return res.status(503).json({ error: 'Chatbot not configured: missing GEMINI_API_KEY.' });
  }

  const question = sanitize(req.body.question, 1000);
  const pageTitle = sanitize(req.body.pageTitle, 200);
  const pageUrl = sanitize(req.body.pageUrl, 500);
  const pageContent = sanitizeMultiline(req.body.pageContent, 18000);

  if (!question) {
    logEvent('warn', 'chatbot.ask.invalid_question', { requestId: req.requestId });
    return res.status(400).json({ error: 'Question is required.' });
  }
  if (!pageContent || pageContent.length < 30) {
    logEvent('warn', 'chatbot.ask.invalid_context', { requestId: req.requestId, contextLength: pageContent.length });
    return res.status(400).json({ error: 'Not enough page content to answer.' });
  }

  logEvent('info', 'chatbot.ask.start', {
    requestId: req.requestId,
    model: GEMINI_MODEL,
    pageTitle,
    pageUrl,
    questionLength: question.length,
    contextLength: pageContent.length
  });

  const prompt = [
    'You are a helpful assistant for a podcast website.',
    'Answer ONLY using the provided page content context.',
    'If the answer is not present in the context, clearly say it is not available in this page/article.',
    'Keep responses concise and factual.',
    '',
    `PAGE TITLE: ${pageTitle}`,
    `PAGE URL: ${pageUrl}`,
    '',
    'PAGE CONTENT CONTEXT:',
    pageContent,
    '',
    `USER QUESTION: ${question}`
  ].join('\n');

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      logEvent('error', 'chatbot.ask.gemini_non_ok', {
        requestId: req.requestId,
        model: GEMINI_MODEL,
        status: geminiRes.status,
        body: errText.slice(0, 800)
      });
      return res.status(502).json({ error: 'Gemini API error', details: errText.slice(0, 600) });
    }

    const payload = await geminiRes.json();
    const answer =
      payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim() || '';

    if (!answer) {
      logEvent('error', 'chatbot.ask.empty_answer', { requestId: req.requestId, model: GEMINI_MODEL });
      return res.status(502).json({ error: 'Empty Gemini response.' });
    }

    logEvent('info', 'chatbot.ask.success', {
      requestId: req.requestId,
      model: GEMINI_MODEL,
      answerLength: answer.length
    });
    return res.json({ answer });
  } catch (error) {
    logEvent('error', 'chatbot.ask.exception', {
      requestId: req.requestId,
      model: GEMINI_MODEL,
      error: String(error.message || error)
    });
    return res.status(500).json({ error: 'Chatbot error.', details: String(error.message || error) });
  }
});

app.get('/rss.xml', (_req, res) => {
  setSecurityHeaders(res);
  const dataset = readEpisodes();
  const episodes = (dataset.episodes || [])
    .slice()
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const items = episodes
    .map((episode) => {
      const title = escapeXml(episode.title || 'Untitled');
      const link = `${SITE_URL}/episode/${encodeURIComponent(episode.slug || '')}`;
      const pubDate = new Date(episode.publishedAt || Date.now()).toUTCString();
      const guid = link;
      const plain = (episode.excerpt && String(episode.excerpt).trim()) || stripHtml(episode.html).slice(0, 360);
      const description = escapeXml(plain);
      const content = String(episode.html || '').replace(/]]>/g, ']]]]><![CDATA[>');
      return `<item>\n<title>${title}</title>\n<link>${escapeXml(link)}</link>\n<guid isPermaLink="true">${escapeXml(guid)}</guid>\n<pubDate>${escapeXml(pubDate)}</pubDate>\n<description>${description}</description>\n<content:encoded><![CDATA[${content}]]></content:encoded>\n</item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n<channel>\n<title>Democracy Innovators Podcast</title>\n<link>${escapeXml(SITE_URL)}</link>\n<description>Podcast posts feed generated from local published episodes.</description>\n<language>en</language>\n<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${items}\n</channel>\n</rss>\n`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  return res.status(200).send(xml);
});

app.get('/api/comments/:slug', (req, res) => {
  setSecurityHeaders(res);
  const { slug } = req.params;
  const store = readComments();
  const comments = store.comments
    .filter((c) => c.slug === slug && c.status === 'approved')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  res.json({ comments });
});

app.post('/api/comments/:slug', (req, res) => {
  setSecurityHeaders(res);
  const { slug } = req.params;

  if (!validateEpisodeSlug(slug)) {
    return res.status(404).json({ error: 'Episode not found.' });
  }

  const name = sanitize(req.body.name, 80);
  const message = sanitize(req.body.message, 1200);

  if (!name || !message) {
    return res.status(400).json({ error: 'Name and comment are required.' });
  }

  if (message.length < 8) {
    return res.status(400).json({ error: 'The comment must be at least 8 characters.' });
  }

  const store = readComments();
  const comment = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    slug,
    name,
    message,
    createdAt: new Date().toISOString(),
    status: 'approved'
  };

  store.comments.push(comment);
  writeComments(store);

  return res.status(201).json({ comment });
});

app.get('/admin/login', (_req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
  setSecurityHeaders(res);
  res.sendFile(path.join(ADMIN_DIR, 'login.html'));
});

app.post('/api/admin/login', (req, res) => {
  setSecurityHeaders(res);

  if (!ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
    return res.status(503).json({ error: 'Admin disabled: configure .env first.' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limit = isLoginRateLimited(ip);
  if (limit.blocked) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const username = sanitize(req.body.username, 80);
  const password = String(req.body.password || '');

  const userOk = username === ADMIN_USERNAME;
  const passOk = userOk && verifyPassword(password, ADMIN_PASSWORD_HASH);
  if (!passOk) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  clearLoginFailures(ip);

  const sid = createSession(username);
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sid)
    .digest('hex');

  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(`${sid}.${signature}`)}; ${sessionCookieOptions()}`);
  return res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, requireCsrf, (req, res) => {
  setSecurityHeaders(res);
  if (req.sessionId) {
    sessions.delete(req.sessionId);
  }
  res.setHeader('Set-Cookie', `sid=; ${expiredSessionCookieOptions()}`);
  return res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  setSecurityHeaders(res);
  return res.json({ username: req.session.username, csrfToken: req.session.csrfToken });
});

app.post('/api/admin/posts', requireAdmin, requireCsrf, (req, res) => {
  setSecurityHeaders(res);

  const title = sanitize(req.body.title, 180);
  const excerpt = sanitize(req.body.excerpt, 320);
  const content = sanitizeMultiline(req.body.content, 15000);
  const youtubeUrl = sanitize(req.body.youtubeUrl, 250);
  const includeDonate = req.body.includeDonate === true || req.body.includeDonate === 'true';

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }

  if (content.length < 20) {
    return res.status(400).json({ error: 'Content is too short (minimum 20 characters).' });
  }

  const dataset = readEpisodes();
  const existingSlugs = new Set(dataset.episodes.map((e) => e.slug));
  const base = toSlug(title);
  const slug = uniqueSlug(base, existingSlugs);

  const youtubeId = extractYoutubeId(youtubeUrl);
  const html = buildEpisodeHtml({
    youtubeId,
    content,
    includeDonate
  });

  const episode = {
    id: Date.now(),
    slug,
    title,
    publishedAt: new Date().toISOString(),
    featureImage: null,
    excerpt: excerpt || `${title} - new episode published`,
    html
  };

  dataset.episodes.unshift(episode);
  dataset.generatedAt = new Date().toISOString();
  writeEpisodes(dataset);

  return res.status(201).json({ episode });
});

app.get('/admin', (req, res) => {
  if (!req.session || req.session.username !== ADMIN_USERNAME) {
    return res.redirect('/admin/login');
  }

  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
  setSecurityHeaders(res);
  return res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

app.get('/episode/:slug', (_req, res) => {
  setSecurityHeaders(res);
  res.sendFile(path.join(__dirname, 'public', 'episode.html'));
});

app.listen(PORT, () => {
  ensureCommentsFile();
  console.log(`Server running on http://localhost:${PORT}`);
});
