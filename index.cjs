// index.cjs — Ejecuta con: node index.cjs
// Construye un index.json con todos los .txt y .md dentro de la carpeta actual (y subcarpetas)

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const TEXT_DIR = path.resolve('.');            // indexea la carpeta actual
const OUT_FILE = path.resolve('./index.json'); // salida en la misma carpeta
const ALLOWED_EXT = new Set(['.txt', '.md']);  // extensiones permitidas
const MAX_BYTES = 5 * 1024 * 1024;             // 5 MB por archivo
const CONCURRENCY = Math.max(2, Math.min(os.cpus().length, 8));

// ── utilidades ────────────────────────────────────────────────────────────────
function isAllowedFile(file) {
  return ALLOWED_EXT.has(path.e…
[4:33 p.m., 14/8/2025] Arturo Ortiz de la Peña: // index.cjs — Ejecuta con: node index.cjs
// Construye un index.json con todos los .txt y .md dentro de la carpeta actual (y subcarpetas)

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const TEXT_DIR = path.resolve('.');            // indexea la carpeta actual
const OUT_FILE = path.resolve('./index.json'); // salida en la misma carpeta
const ALLOWED_EXT = new Set(['.txt', '.md']);  // extensiones permitidas
const MAX_BYTES = 5 * 1024 * 1024;             // 5 MB por archivo
const CONCURRENCY = Math.max(2, Math.min(os.cpus().length, 8));

// ── utilidades ────────────────────────────────────────────────────────────────
function isAllowedFile(file) {
  return ALLOWED_EXT.has(path.extname(file).toLowerCase());
}

async function safeReadJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function normalizeText(str) {
  return str.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
}

function fileKey(stats) {
  return ${stats.size}-${stats.mtimeMs};
}

async function listFilesRecursive(dir) {
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(p);
    }
  }
  await walk(dir);
  return out;
}

// ── indexador ─────────────────────────────────────────────────────────────────
async function buildIndex() {
  const previous =
    (await safeReadJson(OUT_FILE)) ?? { version: 1, generatedAt: '', items: [], stats: {} };
  const prevMap = new Map(previous.items.map((it) => [it.relPath, it]));

  let files = await listFilesRecursive(TEXT_DIR);
  files = files.filter(isAllowedFile);

  const items = [];
  const errors = [];
  let reused = 0;

  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, () =>
    (async function worker() {
      while (queue.length) {
        const absPath = queue.pop();
        const relPath = path.relative(process.cwd(), absPath);
        try {
          const stats = await fs.stat(absPath);
          if (stats.size > MAX_BYTES) {
            errors.push({ relPath, reason: excede ${MAX_BYTES} bytes });
            continue;
          }

          const key = fileKey(stats);
          const prev = prevMap.get(relPath);
          if (prev && prev.validation && prev.validation.fileKey === key) {
            items.push(prev);
            reused++;
            continue;
          }

          const buf = await fs.readFile(absPath);
          const hash = sha1(buf);
          const content = normalizeText(buf.toString('utf8'));

          items.push({
            id: hash,
            name: path.basename(absPath),
            relPath,
            size: stats.size,
            mtime: new Date(stats.mtimeMs).toISOString(),
            content,
            validation: { sha1: hash, fileKey: key, length: content.length },
          });
        } catch (err) {
          errors.push({ relPath, reason: err && err.message ? err.message : String(err) });
        }
      }
    })()
  );

  await Promise.all(workers);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseDir: path.relative(process.cwd(), TEXT_DIR),
    items: items.sort((a, b) => a.relPath.localeCompare(b.relPath)),
    stats: {
      totalFilesSeen: files.length,
      indexed: items.length,
      reused,
      failed: errors.length,
      maxBytes: MAX_BYTES,
      concurrency: CONCURRENCY,
    },
    errors,
  };

  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const result = await buildIndex();
    const { indexed, reused, failed } = result.stats;
    console.log(✅ Index listo: ${path.basename(OUT_FILE)});
    console.log(`   Indexados: ${indexed} | Reusados: ${reused} | Fallidos: ${failed}`);
    if (failed > 0) console.log('   Revisa "errors" dentro de index.json para detalles.');
  } catch (e) {
    console.error('❌ Error al construir el índice:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
