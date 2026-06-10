const normalizeKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeText = (value) => String(value ?? "").trim();

const KEY_ALIASES = {
  name: [
    "providername", "displayname", "businessname", "provider", "name",
    "第一部分：基本信息section1generalproviderinformation",
    "第一部分基本信息section1generalproviderinformation",
  ],
  category: ["servicecategory", "category", "service", "servicetype", "typeofserviceprovided服务类型"],
  phone: ["phone", "phonenumber", "contactphone", "mobile", "cell", "primarycontactphonenumber"],
  email: ["email", "emailaddress", "contactemail", "primarycontactemailaddress"],
  description: [
    "notes", "shortdescription", "description", "summary", "about", "publicdescription",
    "第三部分：服务范围与时间section3scopeandavailability",
    "第三部分服务范围与时间section3scopeandavailability",
  ],
};

const pickValue = (record, aliases) => {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (key in record && normalizeText(record[key])) {
      return normalizeText(record[key]);
    }
  }

  return "";
};

const toObjectRecord = (row) => {
  if (Array.isArray(row) || !row || typeof row !== "object") {
    return null;
  }

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
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

  for (const key of ["rows", "data", "items", "providers", "results", "values"]) {
    if (key in payload) {
      return extractRows(payload[key]);
    }
  }

  const singleRecord = toObjectRecord(payload);
  return singleRecord ? [singleRecord] : [];
};

const toAdminProvider = (record, index) => ({
  rowNumber: index + 2,
  providerId: pickValue(record, ["Provider_ID", "Provider ID", "ID"]),
  name: pickValue(record, KEY_ALIASES.name),
  category: pickValue(record, KEY_ALIASES.category),
  phone: pickValue(record, KEY_ALIASES.phone),
  email: pickValue(record, KEY_ALIASES.email),
  description:
    pickValue(record, KEY_ALIASES.description) ||
    pickValue(record, ["Skills"]),
  businessCardUrl: pickValue(record, [
    "Business_Card_URL",
    "Business Card URL",
    "BusinessCardURL",
    "BusinessCardUrl",
    "Card URL",
    "Card_URL",
  ]),
  status: pickValue(record, ["Status"]),
  raw: record,
});

const buildUpstreamPayload = (payload) => ({
  action: "updateProvider",
  rowNumber: payload.rowNumber,
  provider: {
    Provider_ID: normalizeText(payload.providerId),
    Name: normalizeText(payload.name),
    Service_Category: normalizeText(payload.category),
    Phone: normalizeText(payload.phone),
    Email: normalizeText(payload.email),
    Notes: normalizeText(payload.description),
    Business_Card_URL: normalizeText(payload.businessCardUrl),
  },
});

const getEndpoint = () =>
  Netlify.env.get("GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL") || Netlify.env.get("GOOGLE_APPS_SCRIPT_URL");

const handleGet = async () => {
  const endpoint = getEndpoint();

  if (!endpoint) {
    return Response.json({ error: "Missing GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL.", providers: [] }, { status: 500 });
  }

  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `Upstream provider request failed with status ${upstream.status}.`, providers: [] },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return Response.json(
        { error: "Provider source returned non-JSON content.", providers: [] },
        { status: 502 },
      );
    }

    const payload = await upstream.json();
    const providers = extractRows(payload)
      .map((record, index) => toAdminProvider(record, index))
      .filter((provider) => provider.name);

    return Response.json({ providers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load provider admin data.", providers: [] },
      { status: 500 },
    );
  }
};

const handlePost = async (req) => {
  // Server-side admin gate: require a matching token before any write.
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    return Response.json({ error: "Server is missing ADMIN_TOKEN configuration." }, { status: 500 });
  }
  if (req.headers.get("x-admin-token") !== expectedToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const endpoint = getEndpoint();

  if (!endpoint) {
    return Response.json({ error: "Missing GOOGLE_SERVICE_PROVIDERS_SCRIPT_URL." }, { status: 500 });
  }

  try {
    const payload = await req.json();
    const rowNumber = Number(payload?.rowNumber);

    if (!Number.isInteger(rowNumber) || rowNumber < 2) {
      return Response.json({ error: "A valid rowNumber is required." }, { status: 400 });
    }

    if (!normalizeText(payload?.name)) {
      return Response.json({ error: "Provider name is required." }, { status: 400 });
    }

    const upstreamPayload = buildUpstreamPayload({ ...payload, rowNumber });
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamPayload),
    });

    const responseText = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "";
    const missingDoPost = responseText.includes("Script function not found: doPost");
    if (!upstream.ok || missingDoPost || !contentType.includes("application/json")) {
      return Response.json(
        {
          error: missingDoPost
            ? "Provider Apps Script writeback is not enabled yet. Add doPost before saving from the admin editor."
            : "Provider update endpoint did not return a confirmed JSON success response.",
        },
        { status: 502 },
      );
    }

    let upstreamJson = null;
    try {
      upstreamJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      upstreamJson = null;
    }

    if (upstreamJson?.error) {
      return Response.json({ error: upstreamJson.error }, { status: 502 });
    }

    if (!upstreamJson || (upstreamJson.ok !== true && upstreamJson.updated !== true)) {
      return Response.json(
        { error: "Provider update endpoint did not confirm that the sheet was updated." },
        { status: 502 },
      );
    }

    return Response.json({
      ok: true,
      provider: {
        rowNumber,
        providerId: normalizeText(payload.providerId),
        name: normalizeText(payload.name),
        category: normalizeText(payload.category),
        phone: normalizeText(payload.phone),
        email: normalizeText(payload.email),
        description: normalizeText(payload.description),
        businessCardUrl: normalizeText(payload.businessCardUrl),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save provider changes." },
      { status: 500 },
    );
  }
};

export default async (req) => {
  if (req.method === "GET") return handleGet();
  if (req.method === "POST") return handlePost(req);

  return Response.json({ error: "Method not allowed." }, { status: 405 });
};

export const config = {
  path: "/api/admin/providers",
};
