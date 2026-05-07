const SERVICE_REQUESTS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyYOi0LVLDXZUGVQG94vl0K0zGYKhMaefM16n5NKAKn25-QkQI-1rqdtToBH1AFsc7ZYw/exec";

const KEY_ALIASES = {
  serviceType: [
    "typeofserviceneeded",
    "serviceneeded",
    "servicetype",
    "requesttype",
    "category",
    "您需要的服务类型typeofserviceneeded",
    "type of service needed",
  ],
  area: ["arealocation", "area", "location", "cityarea", "servicearea", "您所在区域yourarea", "yourarea"],
  description: [
    "shortdescription",
    "description",
    "summary",
    "details",
    "publicdescription",
    "您的具体需求说明describewhatyouneed",
    "describewhatyouneed",
    "additionalnotes",
  ],
  contactMethod: ["preferredcontactmethod", "contactmethod", "contactpreference"],
  phone: ["contactphone", "phone", "联系电话contactphone"],
  email: ["email", "emailaddress", "电子邮箱emailaddress"],
  dateSubmitted: ["datesubmitted", "submittedat", "createdat", "timestamp", "date"],
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

  const containerKeys = ["rows", "data", "items", "requests", "results", "values"];
  for (const key of containerKeys) {
    if (key in payload) {
      return extractRows(payload[key]);
    }
  }

  const singleRecord = toObjectRecord(payload);
  return singleRecord ? [singleRecord] : [];
};

const toMaskedContactMethod = (value) => {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "Platform follow-up";
  }

  if (normalized.includes("wechat")) {
    return "WeChat";
  }

  if (normalized.includes("email")) {
    return "Email";
  }

  if (normalized.includes("text") || normalized.includes("sms")) {
    return "Text message";
  }

  if (normalized.includes("phone") || normalized.includes("call")) {
    return "Phone call";
  }

  return "Platform follow-up";
};

const formatSubmittedDate = (value) => {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const toPublicRequest = (record) => {
  const explicitContactMethod = pickValue(record, KEY_ALIASES.contactMethod);
  const phone = pickValue(record, KEY_ALIASES.phone);
  const email = pickValue(record, KEY_ALIASES.email);
  const hasPhone = Boolean(phone);
  const hasEmail = Boolean(email);
  const derivedContactMethod =
    explicitContactMethod || (hasPhone && hasEmail ? "Phone or Email" : hasPhone ? "Phone call" : hasEmail ? "Email" : "");

  return {
    serviceType: pickValue(record, KEY_ALIASES.serviceType),
    area: pickValue(record, KEY_ALIASES.area),
    description: pickValue(record, KEY_ALIASES.description),
    contactMethod: toMaskedContactMethod(derivedContactMethod),
    phone,
    email,
    dateSubmitted: formatSubmittedDate(pickValue(record, KEY_ALIASES.dateSubmitted)),
  };
};

export default async (_req, _context) => {
  try {
    const upstream = await fetch(SERVICE_REQUESTS_SCRIPT_URL, {
      headers: { Accept: "application/json" },
    });

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Upstream request failed with status ${upstream.status}.`,
          requests: [],
        },
        { status: 502 },
      );
    }

    const payload = await upstream.json();
    const requests = extractRows(payload)
      .map(toPublicRequest)
      .filter(Boolean)
      .filter((request) => request.serviceType)
      .sort((a, b) => String(b.dateSubmitted).localeCompare(String(a.dateSubmitted)));

    return Response.json({ requests });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load service request data.",
        requests: [],
      },
      { status: 500 },
    );
  }
};

export const config = {
  path: "/api/service-requests",
};
