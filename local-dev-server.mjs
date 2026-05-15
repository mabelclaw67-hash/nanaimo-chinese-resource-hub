/**
 * local-dev-server.mjs
 *
 * Local development server for Nanaimo Chinese Services & Resources.
 * Serves static files AND handles /api/providers + /api/service-requests by
 * fetching directly from Google Apps Script — bypassing the Netlify Functions
 * requirement that prevents `npx serve` from loading live data.
 *
 * Usage:  node local-dev-server.mjs
 * Port:   5180  →  http://localhost:5180
 *
 * For /api/providers: set GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL in .env.local
 * For /api/service-requests: URL is hardcoded (matches production function).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5180;

// ─── .env.local loader ────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  const env = {};
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        env[key] = val;
      }
    }
  } catch {
    // .env.local is optional
  }
  return env;
}

// ─── Shared helpers (mirrored from Netlify function files) ────────────────────

const normalizeKey = (value) =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeText = (value) => String(value ?? '').trim();

const pickValue = (record, aliases) => {
  for (const alias of aliases) {
    const k = normalizeKey(alias);
    if (k in record && normalizeText(record[k])) {
      return normalizeText(record[k]);
    }
  }
  return '';
};

const toObjectRecord = (row) => {
  if (Array.isArray(row) || !row || typeof row !== 'object') return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
  );
};

const tableToObjects = (rows) => {
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0])) return null;
  const headers = rows[0].map((h) => normalizeKey(h));
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  );
};

const extractRows = (payload, containerKeys) => {
  if (Array.isArray(payload)) {
    if (payload.every((row) => !Array.isArray(row))) {
      return payload.map(toObjectRecord).filter(Boolean);
    }
    return tableToObjects(payload) || [];
  }
  if (!payload || typeof payload !== 'object') return [];
  for (const key of containerKeys) {
    if (key in payload) return extractRows(payload[key], containerKeys);
  }
  const single = toObjectRecord(payload);
  return single ? [single] : [];
};

// ─── Providers logic (mirrored from netlify/functions/providers.mjs) ──────────

const PROVIDER_KEYS = {
  name: [
    'providername', 'displayname', 'businessname', 'provider', 'name',
    '第一部分：基本信息section1generalproviderinformation',
    '第一部分基本信息section1generalproviderinformation',
  ],
  category: ['servicecategory', 'category', 'service', 'servicetype', 'typeofserviceprovided服务类型'],
  city: ['cityarea', 'city', 'area', 'location', 'servicearea',
    'primarygeographicalareasofoperationselectallthatapply'],
  phone: ['phone', 'phonenumber', 'contactphone', 'mobile', 'cell', 'primarycontactphonenumber'],
  email: ['email', 'emailaddress', 'contactemail', 'primarycontactemailaddress'],
  wechat: ['wechat', 'wechatid', 'weixin'],
  description: [
    'shortdescription', 'description', 'summary', 'about', 'publicdescription',
    '第三部分：服务范围与时间section3scopeandavailability',
    '第三部分服务范围与时间section3scopeandavailability',
  ],
};

const PROVIDER_CONTAINER_KEYS = ['rows', 'data', 'items', 'providers', 'results', 'values'];

function toPublicProvider(record) {
  const email = pickValue(record, PROVIDER_KEYS.email);
  const wechat = pickValue(record, PROVIDER_KEYS.wechat);
  const city = pickValue(record, PROVIDER_KEYS.city)
    .replace(/^Local\s*\(City\/Region\)\s*$/i, 'Nanaimo Area');
  return {
    name: pickValue(record, PROVIDER_KEYS.name),
    category: pickValue(record, PROVIDER_KEYS.category),
    city,
    phone: pickValue(record, PROVIDER_KEYS.phone),
    email,
    wechat,
    contactLabel: email ? 'Email' : 'WeChat',
    contactValue: email || wechat,
    description: pickValue(record, PROVIDER_KEYS.description),
  };
}

async function handleProviders(env) {
  const endpoint =
    env['GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL'] || env['GOOGLE_APPS_SCRIPT_URL'];

  if (!endpoint) {
    return {
      status: 500,
      body: JSON.stringify({
        error:
          'Missing GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL in .env.local. ' +
          'Copy this URL from Netlify dashboard → Site settings → Environment variables.',
        providers: [],
      }),
    };
  }

  try {
    const upstream = await fetch(endpoint, { headers: { Accept: 'application/json' } });

    if (!upstream.ok) {
      return {
        status: 502,
        body: JSON.stringify({
          error: `Upstream failed with status ${upstream.status}.`,
          providers: [],
        }),
      };
    }

    const ct = upstream.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return {
        status: 502,
        body: JSON.stringify({
          error:
            'Google Apps Script returned non-JSON. Check the script is published as a web app.',
          providers: [],
        }),
      };
    }

    const payload = await upstream.json();
    const providers = extractRows(payload, PROVIDER_CONTAINER_KEYS)
      .map(toPublicProvider)
      .filter(Boolean)
      .filter((p) => p.name && p.category)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { status: 200, body: JSON.stringify({ providers }) };
  } catch (err) {
    return {
      status: 500,
      body: JSON.stringify({ error: err.message || 'Unable to load provider data.', providers: [] }),
    };
  }
}

// ─── Service Requests logic (mirrored from netlify/functions/service-requests.mjs) ──

const SERVICE_REQUESTS_URL =
  'https://script.google.com/macros/s/AKfycbyYOi0LVLDXZUGVQG94vl0K0zGYKhMaefM16n5NKAKn25-QkQI-1rqdtToBH1AFsc7ZYw/exec';

const REQUEST_KEYS = {
  requestId: ['timestamp', 'datesubmitted', 'submittedat', 'createdat', 'date'],
  serviceType: [
    'typeofserviceneeded', 'serviceneeded', 'servicetype', 'requesttype', 'category',
    '您需要的服务类型typeofserviceneeded', 'type of service needed',
  ],
  area: ['arealocation', 'area', 'location', 'cityarea', 'servicearea',
    '您所在区域yourarea', 'yourarea'],
  description: [
    'shortdescription', 'description', 'summary', 'details', 'publicdescription',
    '您的具体需求说明describewhatyouneed', 'describewhatyouneed', 'additionalnotes',
  ],
  contactMethod: ['preferredcontactmethod', 'contactmethod', 'contactpreference'],
  phone: ['contactphone', 'phone', '联系电话contactphone'],
  email: ['email', 'emailaddress', '电子邮箱emailaddress'],
  wechat: ['wechat', 'wechatid', 'weixin', '微信wechat'],
  dateSubmitted: ['datesubmitted', 'submittedat', 'createdat', 'timestamp', 'date'],
  status: ['status', 'requeststatus', 'completionstatus', 'feedbackstatus'],
  assignedProvider: ['assignedprovider', 'provider', 'serviceprovider', 'providername'],
  completedDate: ['completeddate', 'datecompleted', 'finishdate'],
  finalCost: ['finalcost', 'cost', 'totalcost', 'amountpaid'],
  rating: ['rating', 'feedbackrating', 'servicerating'],
  feedbackNote: ['feedbacknote', 'feedback', 'completionnote', 'reviewnote'],
  wouldUseAgain: ['woulduseagain', 'useagain', 'hireagain', 'bookagain'],
};

const REQUEST_CONTAINER_KEYS = ['rows', 'data', 'items', 'requests', 'results', 'values'];

function toMaskedContactMethod(value) {
  const n = normalizeText(value).toLowerCase();
  if (!n) return 'Platform follow-up';
  if (n.includes('wechat')) return 'WeChat';
  if (n.includes('email')) return 'Email';
  if (n.includes('text') || n.includes('sms')) return 'Text message';
  if (n.includes('phone') || n.includes('call')) return 'Phone call';
  return 'Platform follow-up';
}

function formatSubmittedDate(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function normalizeStatus(value) {
  const n = normalizeText(value).toLowerCase();
  if (!n) return '';
  if (n.includes('complete') || n.includes('done') || n.includes('finished')) return 'Completed';
  if (n.includes('progress') || n.includes('processing')) return 'In Progress';
  if (n.includes('open') || n.includes('new') || n.includes('pending')) return 'Open';
  return normalizeText(value);
}

function normalizeBinaryChoice(value) {
  const n = normalizeText(value).toLowerCase();
  if (!n) return '';
  if (['yes', 'y', 'true'].includes(n)) return 'Yes';
  if (['no', 'n', 'false'].includes(n)) return 'No';
  return normalizeText(value);
}

function toPublicRequest(record) {
  const requestId = pickValue(record, REQUEST_KEYS.requestId);
  const explicitContactMethod = pickValue(record, REQUEST_KEYS.contactMethod);
  const phone = pickValue(record, REQUEST_KEYS.phone);
  const email = pickValue(record, REQUEST_KEYS.email);
  const wechat = pickValue(record, REQUEST_KEYS.wechat);
  const submittedAt = pickValue(record, REQUEST_KEYS.dateSubmitted);
  const derivedContactMethod =
    explicitContactMethod ||
    (phone && email
      ? 'Phone or Email'
      : phone
      ? 'Phone call'
      : email
      ? 'Email'
      : wechat
      ? 'WeChat'
      : '');
  const sortTime = (() => {
    const parsed = new Date(normalizeText(submittedAt));
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  })();
  return {
    requestId,
    serviceType: pickValue(record, REQUEST_KEYS.serviceType),
    area: pickValue(record, REQUEST_KEYS.area),
    description: pickValue(record, REQUEST_KEYS.description),
    contactMethod: toMaskedContactMethod(derivedContactMethod),
    phone, email, wechat,
    dateSubmitted: formatSubmittedDate(submittedAt),
    status: normalizeStatus(pickValue(record, REQUEST_KEYS.status)),
    assignedProvider: pickValue(record, REQUEST_KEYS.assignedProvider),
    completedDate: pickValue(record, REQUEST_KEYS.completedDate),
    finalCost: pickValue(record, REQUEST_KEYS.finalCost),
    rating: pickValue(record, REQUEST_KEYS.rating),
    feedbackNote: pickValue(record, REQUEST_KEYS.feedbackNote),
    wouldUseAgain: normalizeBinaryChoice(pickValue(record, REQUEST_KEYS.wouldUseAgain)),
    sortTime,
  };
}

async function handleServiceRequests() {
  try {
    const upstream = await fetch(SERVICE_REQUESTS_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!upstream.ok) {
      return {
        status: 502,
        body: JSON.stringify({
          error: `Upstream failed with status ${upstream.status}.`,
          requests: [],
        }),
      };
    }
    const payload = await upstream.json();
    const requests = extractRows(payload, REQUEST_CONTAINER_KEYS)
      .map(toPublicRequest)
      .filter(Boolean)
      .filter((r) => r.serviceType && r.requestId)
      .sort((a, b) => b.sortTime - a.sortTime)
      .map(({ sortTime, ...r }) => r);

    return { status: 200, body: JSON.stringify({ requests }) };
  } catch (err) {
    return {
      status: 500,
      body: JSON.stringify({
        error: err.message || 'Unable to load service request data.',
        requests: [],
      }),
    };
  }
}

// ─── MIME types for static file serving ───────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(urlPath, res) {
  // Sanitize path
  let filePath = path.join(__dirname, decodeURIComponent(urlPath));

  // Don't serve files outside the project root
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Directory → try index.html
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // File not found — try adding .html
    if (!path.extname(filePath)) {
      filePath = filePath + '.html';
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 404 → serve root index.html (SPA-style fallback)
      const rootIndex = path.join(__dirname, 'index.html');
      fs.readFile(rootIndex, (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data2);
        }
      });
      return;
    }
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const env = loadEnvLocal();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS headers for local API calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // ── API routes ──────────────────────────────────────────────────────────────
  if (pathname === '/api/providers') {
    console.log('[API] GET /api/providers');
    const result = await handleProviders(env);
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }

  if (pathname === '/api/service-requests') {
    console.log('[API] GET /api/service-requests');
    const result = await handleServiceRequests();
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }

  // ── Static files ────────────────────────────────────────────────────────────
  serveStatic(pathname, res);
});

server.listen(PORT, () => {
  const providersUrl =
    env['GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL'] || env['GOOGLE_APPS_SCRIPT_URL'];

  console.log('');
  console.log('  Nanaimo Chinese — Local Dev Server');
  console.log('  ────────────────────────────────────────');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  API routes:');
  console.log(`    /api/providers        → Google Apps Script (${providersUrl ? 'URL loaded ✓' : 'MISSING — add to .env.local ✗'})`);
  console.log(`    /api/service-requests → hardcoded script URL ✓`);
  console.log('');
  if (!providersUrl) {
    console.log('  ⚠  GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL not found in .env.local');
    console.log('     Create .env.local and paste the URL from Netlify dashboard.');
    console.log('     See .env.local.example for the format.');
    console.log('');
  }
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
