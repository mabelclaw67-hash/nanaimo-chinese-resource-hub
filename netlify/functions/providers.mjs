const KEY_ALIASES = {
  name: [
    "providername",
    "displayname",
    "businessname",
    "provider",
    "name",
    "第一部分：基本信息section1generalproviderinformation",
    "第一部分基本信息section1generalproviderinformation",
  ],
  category: [
    "servicecategory",
    "category",
    "service",
    "servicetype",
    "typeofserviceprovided服务类型",
  ],
  city: [
    "cityarea",
    "city",
    "area",
    "location",
    "servicearea",
    "primarygeographicalareasofoperationselectallthatapply",
  ],
  phone: ["phone", "phonenumber", "contactphone", "mobile", "cell", "primarycontactphonenumber"],
  email: ["email", "emailaddress", "contactemail", "primarycontactemailaddress"],
  wechat: ["wechat", "wechatid", "weixin"],
  description: [
    "shortdescription",
    "description",
    "summary",
    "about",
    "publicdescription",
    "第三部分：服务范围与时间section3scopeandavailability",
    "第三部分服务范围与时间section3scopeandavailability",
  ],
};

const normalizeKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeText = (value) => String(value ?? "").trim();

const pickValue = (record, aliases) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (normalizedAlias in record && normalizeText(record[normalizedAlias])) {
      return normalizeText(record[normalizedAlias]);
    }
  }

  return "";
};

const toObjectRecord = (row) => {
  if (Array.isArray(row) || !row || typeof row !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value]),
  );
};

const tableToObjects = (rows) => {
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0])) {
    return null;
  }

  const headers = rows[0].map((header) => normalizeKey(header));
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]])),
  );
};

const extractRows = (payload) => {
  if (Array.isArray(payload)) {
    if (payload.every((row) => !Array.isArray(row))) {
      return payload.map(toObjectRecord).filter(Boolean);
    }

    return tableToObjects(payload) || [];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const containerKeys = ["rows", "data", "items", "providers", "results", "values"];
  for (const key of containerKeys) {
    if (key in payload) {
      return extractRows(payload[key]);
    }
  }

  const singleRecord = toObjectRecord(payload);
  return singleRecord ? [singleRecord] : [];
};

const toPublicProvider = (record) => {
  const email = pickValue(record, KEY_ALIASES.email);
  const wechat = pickValue(record, KEY_ALIASES.wechat);
  const city = pickValue(record, KEY_ALIASES.city).replace(/^Local\s*\(City\/Region\)\s*$/i, "Nanaimo Area");

  return {
    name: pickValue(record, KEY_ALIASES.name),
    category: pickValue(record, KEY_ALIASES.category),
    city,
    phone: pickValue(record, KEY_ALIASES.phone),
    email,
    wechat,
    contactLabel: email ? "Email" : "WeChat",
    contactValue: email || wechat,
    description: pickValue(record, KEY_ALIASES.description),
  };
};

export default async (_req, _context) => {
  const endpoint =
    Netlify.env.get("GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL") || Netlify.env.get("GOOGLE_APPS_SCRIPT_URL");

  if (!endpoint) {
    return Response.json(
      {
        error: "Missing GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL environment variable.",
        providers: [],
      },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Upstream request failed with status ${upstream.status}.`,
          providers: [],
        },
        { status: 502 },
      );
    }

    const upstreamContentType = upstream.headers.get("content-type") || "";
    if (!upstreamContentType.includes("application/json")) {
      return Response.json(
        {
          error:
            "Data source returned non-JSON response. The Google Apps Script may not be published as a web app, or requires authentication.",
          providers: [],
        },
        { status: 502 },
      );
    }

    const payload = await upstream.json();
    const providers = extractRows(payload)
      .map(toPublicProvider)
      .filter(Boolean)
      .filter((provider) => provider.name && provider.category)
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ providers });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load provider data.",
        providers: [],
      },
      { status: 500 },
    );
  }
};

export const config = {
  path: "/api/providers",
};
