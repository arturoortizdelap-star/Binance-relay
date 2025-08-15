// server.cjs — npm start → node server.cjs
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const TEXT_DIR = path.resolve('./texts');
const OUT_FILE = path.resolve('./index.json');
const ALLOWED_EXT = new Set(['.txt', '.md']);
const MAX_BYTES = 5 * 1024 * 1024;
const CONCURRENCY = Math.max(2, Math.min(os.cpus().length, 8));

function isAllowedFile(file) { return ALLOWED_EXT.has(path.extname(file).toLowerCase()); }
async function safeReadJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }
function normalizeText(str){ return str.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd(); }
function fileKey(st) {
  return ${st.size}-${st.mtimeMs};
}

async function listFilesRecursive(dir) {
  const out = [];
  async function walk(cur) {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) await walk(p); else out.push(p);
    }
  }
  await walk(dir);
  return out;
}

async function buildIndex() {
  if (!fssync.existsSync(TEXT_DIR)) await fs.mkdir(TEXT_DIR, { recursive: true });

  const previous = (await safeReadJson(OUT_FILE)) ?? { version: 1, generatedAt: '', items: [], stats: {} };
  const prevMap = new Map(previous.items.map(it => [it.relPath, it]));

  let files = [];
  try { files = (await listFilesRecursive(TEXT_DIR)).filter(isAllowedFile); } catch {}

  const items = [];
  const errors = [];
  let reused = 0;

  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, () => (async function worker() {
    while (queue.length) {
      const abs = queue.pop();
      const rel = path.relative(process.cwd(), abs);
      try {
        const st = await fs.stat(abs);
        if (st.size > MAX_BYTES) { errors.push({ relPath: rel, reason: excede ${MAX_BYTES} bytes }); continue; }
        const key = fileKey(st);
        const prev = prevMap.get(rel);
        if (prev && prev.validation && prev.validation.fileKey === key) { items.push(prev); reused++; continue; }
        const buf = await fs.readFile(abs);
        const hash = sha1(buf);
        const content = normalizeText(buf.toString('utf8'));
        items.push({
          id: hash, name: path.basename(abs), relPath: rel, size: st.size,
          mtime: new Date(st.mtimeMs).toISOString(),
          content, validation: { sha1: hash, fileKey: key, length: content.length }
        });
      } catch (err) { errors.push({ relPath: rel, reason: err?.message ?? String(err) }); }
    }
  })());
  await Promise.all(workers);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseDir: path.relative(process.cwd(), TEXT_DIR),
    items: items.sort((a, b) => a.relPath.localeCompare(b.relPath)),
    stats: { totalFilesSeen: files.length, indexed: items.length, reused, failed: errors.length, maxBytes: MAX_BYTES, concurrency: CONCURRENCY },
    errors
  };
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

const app = express();
app.use(cors());

app.get('/', (_req, res) => res.send('OK ✅ Usa /index para ver el índice y /reindex para regenerarlo.'));
app.get('/index', async (_req, res) => {
  const data = await safeReadJson(OUT_FILE);
  if (!data) return res.status(404).json({ error: 'index.json no existe aún. Visita /reindex.' });
  res.json(data);
});
app.get('/reindex', async (_req, res) => { const d = await buildIndex(); res.json({ ok: true, stats: d.stats, generatedAt: d.generatedAt }); });
app.post('/reindex', async (_req, res) => { const d = await buildIndex(); res.json({ ok: true, stats: d.stats, generatedAt: d.generatedAt }); });

buildIndex().catch(() => {});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(✅ Server listo en puerto ${PORT}));
