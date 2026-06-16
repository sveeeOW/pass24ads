const KEY = process.env.BANNER_META_KEY || 'pass24/banner-meta.json';

function emptyOverrides() {
  return { names: {}, meta: {} };
}

function normalizeOverrides(obj) {
  const base = emptyOverrides();
  if (!obj || typeof obj !== 'object') return base;
  const names = obj.names && typeof obj.names === 'object' ? obj.names : {};
  const meta = obj.meta && typeof obj.meta === 'object' ? obj.meta : {};
  base.names = Object.fromEntries(
    Object.entries(names)
      .map(([k, v]) => [String(k), String(v ?? '').trim()])
      .filter(([, v]) => v)
  );
  base.meta = Object.fromEntries(
    Object.entries(meta).map(([k, v]) => {
      const row = v && typeof v === 'object' ? v : {};
      return [String(k), {
        url: row.url ? String(row.url).trim() : null,
        start: row.start ? String(row.start).trim() : null,
        end: row.end ? String(row.end).trim() : null,
      }];
    })
  );
  return base;
}

async function getBlobApi() {
  return import('@vercel/blob');
}

function getBlobOptions(extra = {}) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { ...extra, token } : extra;
}

async function readOverrides() {
  const { list } = await getBlobApi();
  const listed = await list(getBlobOptions({ prefix: KEY, limit: 10 }));
  const exact = (listed.blobs || []).find((b) => b.pathname === KEY) || (listed.blobs || [])[0];
  if (!exact) return emptyOverrides();
  const res = await fetch(exact.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to read shared metadata: ${res.status}`);
  return normalizeOverrides(await res.json());
}

async function writeOverrides(overrides) {
  const { put } = await getBlobApi();
  const clean = normalizeOverrides(overrides);
  await put(KEY, JSON.stringify(clean, null, 2), getBlobOptions({
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  }));
  return clean;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  if (req.method === 'GET') {
    try {
      const overrides = await readOverrides();
      return res.status(200).json({ ok: true, mode: 'shared', overrides });
    } catch (error) {
      return res.status(200).json({ ok: true, mode: 'local', overrides: emptyOverrides(), storageError: error.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || 'upsert');
    let next = normalizeOverrides(await readOverrides());

    if (action === 'replace') {
      next = normalizeOverrides(body.overrides);
    } else {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, message: 'ID is required' });

      if (action === 'delete') {
        delete next.names[id];
        delete next.meta[id];
      } else if (action === 'upsert') {
        if (body.name && String(body.name).trim()) next.names[id] = String(body.name).trim();
        else delete next.names[id];
        next.meta[id] = {
          url: body.url ? String(body.url).trim() : null,
          start: body.start ? String(body.start).trim() : null,
          end: body.end ? String(body.end).trim() : null,
        };
      } else {
        return res.status(400).json({ ok: false, message: 'Unknown action' });
      }
    }

    const saved = await writeOverrides(next);
    return res.status(200).json({ ok: true, mode: 'shared', overrides: saved });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
};
