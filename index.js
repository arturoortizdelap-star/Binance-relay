import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';   // usamos node-fetch para máxima compatibilidad

const app = express();
app.use(cors());
app.use(express.json());

const BINANCE = 'https://api.binance.com';

// helper de reenvío con timeout
async function fwd(url) {
  try {
    const r = await fetch(url, { timeout: 15000 });
    const txt = await r.text();
    if (!r.ok) return { ok: false, status: r.status, body: txt };
    try { return { ok: true, json: JSON.parse(txt) }; }
    catch { return { ok: false, status: 500, body: 'Invalid JSON from upstream: ' + txt.slice(0,200) }; }
  } catch (e) {
    return { ok: false, status: 502, body: String(e) };
  }
}

/* ---- Rutas tipo Binance ---- */

// /api/v3/ticker/24hr (un símbolo o batch ?symbols=["BTCUSDT","ETHUSDT"])
app.get('/api/v3/ticker/24hr', async (req, res) => {
  const { symbol, symbols } = req.query;

  if (symbol) {
    const out = await fwd(${BINANCE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)});
    return out.ok ? res.json(out.json) : res.status(out.status).send(out.body);
  }

  if (symbols) {
    let arr = [];
    try { arr = JSON.parse(symbols); } catch {}
    if (!Array.isArray(arr) || arr.length === 0) return res.json([]);
    const results = await Promise.all(arr.map(async s => {
      const out = await fwd(${BINANCE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(s)});
      return out.ok ? out.json : { symbol: s, error: true };
    }));
    return res.json(results);
  }

  res.status(400).json({ error: 'Missing symbol or symbols' });
});

// /api/v3/ticker/bookTicker (un símbolo o batch)
app.get('/api/v3/ticker/bookTicker', async (req, res) => {
  const { symbol, symbols } = req.query;

  if (symbol) {
    const out = await fwd(${BINANCE}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)});
    return out.ok ? res.json(out.json) : res.status(out.status).send(out.body);
  }

  if (symbols) {
    let arr = [];
    try { arr = JSON.parse(symbols); } catch {}
    if (!Array.isArray(arr) || arr.length === 0) return res.json([]);
    const results = await Promise.all(arr.map(async s => {
      const out = await fwd(${BINANCE}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(s)});
      return out.ok ? out.json : { symbol: s, error: true };
    }));
    return res.json(results);
  }

  res.status(400).json({ error: 'Missing symbol or symbols' });
});

/* ---- Salud y raíz ---- */
app.get('/', (_req, res) => res.type('text').send('OK - binance relay'));
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---- Arranque ---- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log('Relay escuchando en', PORT));
