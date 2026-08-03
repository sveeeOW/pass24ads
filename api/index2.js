const baseHandler = require('./index.js');

const patchScript = "<script>\n(function(){\n  const EXTRA_DAILY_IMPRESSIONS = {\"2026-06-01\": 222, \"2026-06-02\": 261, \"2026-06-03\": 371, \"2026-06-04\": 379, \"2026-06-05\": 359, \"2026-06-06\": 269, \"2026-06-07\": 265, \"2026-06-08\": 350, \"2026-06-09\": 417, \"2026-06-10\": 378, \"2026-06-11\": 416, \"2026-06-12\": 429, \"2026-06-13\": 296, \"2026-06-14\": 248, \"2026-06-15\": 451, \"2026-06-16\": 469, \"2026-06-17\": 497, \"2026-06-18\": 417, \"2026-06-19\": 378, \"2026-06-20\": 290, \"2026-06-21\": 255, \"2026-06-22\": 382, \"2026-06-23\": 485, \"2026-06-24\": 429, \"2026-06-25\": 430, \"2026-06-26\": 482, \"2026-06-27\": 259, \"2026-06-28\": 261, \"2026-06-29\": 506, \"2026-06-30\": 459, \"2026-07-01\": 505, \"2026-07-02\": 511, \"2026-07-03\": 452, \"2026-07-04\": 309, \"2026-07-05\": 275, \"2026-07-06\": 396, \"2026-07-07\": 472, \"2026-07-08\": 460, \"2026-07-09\": 620, \"2026-07-10\": 501, \"2026-07-11\": 326, \"2026-07-12\": 299, \"2026-07-13\": 587, \"2026-07-14\": 490, \"2026-07-15\": 554, \"2026-07-16\": 621, \"2026-07-17\": 427, \"2026-07-18\": 274, \"2026-07-19\": 282, \"2026-07-20\": 492, \"2026-07-21\": 472, \"2026-07-22\": 545, \"2026-07-23\": 548, \"2026-07-24\": 387, \"2026-07-25\": 274, \"2026-07-26\": 254, \"2026-07-27\": 515, \"2026-07-28\": 566, \"2026-07-29\": 492, \"2026-07-30\": 542, \"2026-07-31\": 398};\n  function range(){ return getSelectedRange(); }\n  function extraMap(date1,date2){\n    const m = new Map();\n    if (!els.includeExtra || !els.includeExtra.checked) return m;\n    Object.entries(EXTRA_DAILY_IMPRESSIONS).forEach(([d,v])=>{ if(d>=date1 && d<=date2 && Number(v)) m.set(d, Number(v)); });\n    return m;\n  }\n  function mergeImpressions(baseRows,date1,date2,fillAllDays){\n    const m = new Map();\n    (baseRows||[]).forEach(row=>{ if(row.date && row.date>=date1 && row.date<=date2) m.set(row.date,(m.get(row.date)||0)+Number(row.impressions||row.value||0)); });\n    const extra = extraMap(date1,date2);\n    extra.forEach((v,d)=>m.set(d,(m.get(d)||0)+v));\n    const dates = (fillAllDays || extra.size) ? getDateRangeDays(date1,date2) : Array.from(m.keys()).sort();\n    return dates.map(d=>({date:d,impressions:Number(m.get(d)||0)}));\n  }\n  function withMergedImpressions(fn, fillAllDays){\n    const {date1,date2} = range();\n    if (!els.includeExtra || !els.includeExtra.checked) return fn();\n    const backup = lastPayload.impressionsDaily || [];\n    lastPayload.impressionsDaily = mergeImpressions(backup,date1,date2,!!fillAllDays);\n    try { return fn(); } finally { lastPayload.impressionsDaily = backup; }\n  }\n  const baseRender = render;\n  render = function(){\n    withMergedImpressions(()=>baseRender(), false);\n    try {\n      const {date1,date2} = range();\n      const total = Array.from(extraMap(date1,date2).values()).reduce((s,v)=>s+v,0);\n      if (els.includeExtra && els.includeExtra.checked && total && els.extraNote) {\n        const prefix = els.extraNote.textContent && !/выключены|не выбран/i.test(els.extraNote.textContent) ? els.extraNote.textContent.replace(/\\.$/,'') + ' · ' : '';\n        els.extraNote.textContent = `${prefix}Доп. показы по дням за июнь-июль: ${humanNumber(total)}.`;\n      }\n    } catch(e) {}\n  };\n  const baseOpenBannerDetail = openBannerDetail;\n  openBannerDetail = function(id){ return withMergedImpressions(()=>baseOpenBannerDetail(id), true); };\n})();\n</script>";

module.exports = async (req, res) => {
  let body = '';
  const headers = {};
  const capture = {
    statusCode: 200,
    setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; },
    write(chunk) { if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk); },
    end(chunk) { if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk); }
  };
  await Promise.resolve(baseHandler(req, capture));
  if (!body) body = '<!DOCTYPE html><meta charset="utf-8"><p>Dashboard renderer returned empty response</p>';
  if (!body.includes('EXTRA_DAILY_IMPRESSIONS')) body = body.replace('</body>', `${patchScript}
</body>`);
  Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.statusCode = capture.statusCode || 200;
  res.end(body);
};
