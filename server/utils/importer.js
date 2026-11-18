const ExcelJS = require('exceljs');

const pad = (n) => String(n).padStart(2, '0');

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function cellToValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellToValue(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return '';
  }
  return v;
}

function normalizeHeader(h) {
  if (h instanceof Date && !isNaN(h.getTime())) {
    return `${h.getUTCFullYear()}-${pad(h.getUTCMonth() + 1)}-${pad(h.getUTCDate())}`;
  }
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function rowsToObjects(rows, sheetName = 'Sheet1') {
  if (!rows.length) return { sheetName, headers: [], records: [] };
  const headers = rows[0].map(normalizeHeader);
  const records = rows
    .slice(1)
    .map((r) => {
      const o = {};
      headers.forEach((h, i) => {
        if (h) o[h] = r[i] ?? '';
      });
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v !== '' && v !== null && v !== undefined));
  return { sheetName, headers, records };
}

async function readTabularFile(buffer, filename = '') {
  const sheets = await readWorkbookSheets(buffer, filename);
  return sheets[0] || { sheetName: 'Sheet1', headers: [], records: [] };
}

async function readWorkbookSheets(buffer, filename = '') {
  if (/\.csv$/i.test(filename)) {
    return [rowsToObjects(parseCSV(buffer.toString('utf8').replace(/^\uFEFF/, '')), filename)];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const result = [];
  for (const ws of wb.worksheets) {
    if (/huongdan|hướng dẫn|guide/i.test(ws.name)) continue;
    const raw = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      row.values.forEach((v, idx) => {
        if (idx > 0) vals[idx - 1] = cellToValue(v);
      });
      raw.push(Array.from(vals, (v) => (v === undefined ? '' : v)));
    });
    if (raw.length >= 2) {
      result.push(rowsToObjects(raw, ws.name));
    }
  }
  return result;
}

function normalizeGoogleSheetCsvUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.includes('output=csv') || url.includes('format=csv')) return url;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    const gidMatch = url.match(/gid=(\d+)/);
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gidMatch ? gidMatch[1] : '0'}`;
  }
  return url;
}

async function fetchGoogleSheetRecords(sheetUrl) {
  const csvUrl = normalizeGoogleSheetCsvUrl(sheetUrl);
  if (!csvUrl) throw new Error('Chưa cấu hình URL Google Sheet.');
  const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) {
    throw new Error(`Không tải được Google Sheet (HTTP ${resp.status}). Hãy bật chia sẻ "Bất kỳ ai có đường liên kết đều có thể xem".`);
  }
  const text = await resp.text();
  if (/^\s*<(!DOCTYPE|html)/i.test(text)) {
    throw new Error('Google Sheet trả về trang đăng nhập. Vui lòng bật quyền "Anyone with the link can view" hoặc Publish to web (CSV).');
  }
  return rowsToObjects(parseCSV(text.replace(/^\uFEFF/, '')), 'GoogleSheet');
}

function pick(record, aliases) {
  for (const a of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, a)) {
      const v = record[a];
      if (v !== '' && v !== null && v !== undefined) return v;
    }
  }
  return undefined;
}

function hasAnyColumn(headers, aliases) {
  return aliases.some((a) => headers.includes(a));
}

function toISODate(val, fallbackMonth = '') {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return `${val.getUTCFullYear()}-${pad(val.getUTCMonth() + 1)}-${pad(val.getUTCDate())}`;
  }
  if (typeof val === 'number' && isFinite(val) && val > 20000) {
    const d = new Date(Math.round((val - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(val).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    return `${m[3]}-${pad(month)}-${pad(day)}`;
  }
  // Support "DD/MM" or "ngày 1".."31" when fallbackMonth (YYYY-MM) is known
  if (/^\d{4}-\d{2}$/.test(fallbackMonth)) {
    const yr = fallbackMonth.slice(0, 4);
    const dm = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
    if (dm) return `${yr}-${pad(dm[2])}-${pad(dm[1])}`;
    const dayOnly = s.match(/^(?:ngày\s*|ngay\s*|d)?(\d{1,2})$/i);
    if (dayOnly) {
      const dNum = Number(dayOnly[1]);
      if (dNum >= 1 && dNum <= 31) return `${fallbackMonth}-${pad(dNum)}`;
    }
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return toISODate(Number(s));
  return null;
}

function toNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  let s = String(val).trim().replace(/vnd/gi, '').replace(/[\s₫đ]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

module.exports = {
  parseCSV,
  readTabularFile,
  readWorkbookSheets,
  fetchGoogleSheetRecords,
  normalizeGoogleSheetCsvUrl,
  pick,
  hasAnyColumn,
  toISODate,
  toNumber,
};
