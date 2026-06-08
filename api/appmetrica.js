const fs = require('fs');
const path = require('path');

const APP_ID = process.env.APPMETRICA_APP_ID || '4626412';
const RAW_TOKEN = process.env.APPMETRICA_TOKEN || '';
const TOKEN = String(RAW_TOKEN)
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
  .replace(/^\s*OAuth\s+/i, '')
  .replace(/^['"]+|['"]+$/g, '')
  .trim();
const API_BASE = process.env.APPMETRICA_API_BASE || 'https://api.appmetrica.yandex.ru/stat/v1/data';
const FALLBACK_PATH = path.join(process.cwd(), 'data', 'fallback.json');
let fallbackCache = null;

function readFallback() {
  if (fallbackCache) return fallbackCache;
  try {
    const raw = fs.readFileSync(FALLBACK_PATH, 'utf-8');
    fallbackCache = JSON.parse(raw);
    return fallbackCache;
  } catch (error) {
    return { bannerDaily: [], impressionsDaily: [], fallbackError: error.message };
  }
}

function buildUrl(params) {
  const url = new URL(API_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

async function fetchPaged(baseParams) {
  const pageSize = 10000;
  let offset = 1;
  let totalRows = Infinity;
  const data = [];

  while (offset <= totalRows) {
    const url = buildUrl({ ...baseParams, limit: pageSize, offset });
    const res = await fetch(url, {
      headers: { Authorization: `OAuth ${TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AppMetrica ${res.status}: ${text}`);
    }
    const json = await res.json();
    const rows = json.data || [];
    data.push(...rows);
    totalRows = Number(json.total_rows || rows.length || 0);
    offset += pageSize;
    if (!rows.length || data.length >= totalRows) break;
  }
  return data;
}

function dimValue(item) {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  return String(item.name ?? item.id ?? '');
}

function normalizeDate(val) {
  const text = String(val || '');
  const m = text.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function extractCandidateIds(dimTextList) {
  const out = [];
  dimTextList.forEach((text) => {
    const matches = String(text).match(/\b\d+\b/g) || [];
    matches.forEach((m) => {
      const num = Number(m);
      if (num > 0 && num < 300) out.push(num);
    });
  });
  return out;
}

function parseBannerRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const dims = (row.dimensions || []).map(dimValue);
    if (!dims.length) continue;
    const date = normalizeDate(dims[1] || dims[0]);
    if (!date) continue;
    const detailDims = dims.slice(2);
    const joined = detailDims.join(' | ').toLowerCase();
    const candidates = extractCandidateIds(detailDims);
    const bannerId = candidates.find((n) => n !== 7);
    const bannerHint = joined.includes('banner') || joined.includes('баннер');
    const objectHint = joined.includes('object') || joined.includes('объект');
    if (!bannerId) continue;
    if (objectHint && !bannerHint) continue;
    const key = `${date}__${bannerId}`;
    if (!map.has(key)) map.set(key, { date, id: bannerId, clicks: 0, users: 0 });
    const item = map.get(key);
    item.clicks += Number((row.metrics || [])[0] || 0);
    item.users += Number((row.metrics || [])[1] || 0);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function parseImpressionRows(rows) {
  return (rows || []).map((row) => {
    const dims = (row.dimensions || []).map(dimValue);
    const date = normalizeDate(dims[0] || dims[1]);
    return { date, impressions: Number((row.metrics || [])[0] || 0) };
  }).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const date1 = req.query?.date1 || todayIso;
  const date2 = req.query?.date2 || todayIso;

  if (!TOKEN) {
    return res.status(200).json({ ...readFallback(), source: 'fallback', reason: 'APPMETRICA_TOKEN is not configured or empty after sanitization' });
  }

  try {
    const [audienceRows, eventRows] = await Promise.all([
      fetchPaged({ ids: APP_ID, date1, date2, group: 'Day', metrics: 'ym:u:activeUsers', dimensions: 'ym:u:date', accuracy: 'medium', include_undefined: 'true', currency: 'RUB', sort: '-ym:u:date', lang: 'ru', request_domain: 'ru' }),
      fetchPaged({ ids: APP_ID, date1, date2, group: 'Day', metrics: 'ym:ce2:allEvents,ym:ce2:devicesWithEvent', dimensions: 'ym:ce2:eventLabel,ym:ce2:date,ym:ce2:paramsLevel1,ym:ce2:paramsLevel2,ym:ce2:paramsLevel3,ym:ce2:paramsLevel4,ym:ce2:paramsLevel5', accuracy: 'medium', include_undefined: 'true', currency: 'RUB', sort: '-ym:ce2:allEvents', lang: 'ru', request_domain: 'ru' })
    ]);

    return res.status(200).json({ source: 'live', bannerDaily: parseBannerRows(eventRows), impressionsDaily: parseImpressionRows(audienceRows) });
  } catch (error) {
    return res.status(200).json({ ...readFallback(), source: 'fallback', liveError: error.message });
  }
};
