const SERVICE_REQUESTS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyYOi0LVLDXZUGVQG94vl0K0zGYKhMaefM16n5NKAKn25-QkQI-1rqdtToBH1AFsc7ZYw/exec";

const KEY_ALIASES = {
  requestId: ["timestamp", "datesubmitted", "submittedat", "createdat", "date"],
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
  wechat: ["wechat", "wechatid", "weixin", "微信wechat"],
  dateSubmitted: ["datesubmitted", "submittedat", "createdat", "timestamp", "date"],
  status: ["status", "requeststatus", "completionstatus", "feedbackstatus"],
  assignedProvider: ["assignedprovider", "provider", "serviceprovider", "providername"],
  completedDate: ["completeddate", "datecompleted", "finishdate"],
  finalCost: ["finalcost", "cost", "totalcost", "amountpaid"],
  rating: ["rating", "feedbackrating", "servicerating"],
  feedbackNote: ["feedbacknote", "feedback", "completionnote", "reviewnote"],
  wouldUseAgain: ["woulduseagain", "useagain", "hireagain", "bookagain"],
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

const normalizeStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("complete") || normalized.includes("done") || normalized.includes("finished")) {
    return "Completed";
  }

  if (normalized.includes("progress") || normalized.includes("processing")) {
    return "In Progress";
  }

  if (normalized.includes("open") || normalized.includes("new") || normalized.includes("pending")) {
    return "Open";
  }

  return normalizeText(value);
};

const normalizeBinaryChoice = (value) => {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (["yes", "y", "true"].includes(normalized)) {
    return "Yes";
  }

  if (["no", "n", "false"].includes(normalized)) {
    return "No";
  }

  return normalizeText(value);
};

const toSortTime = (value) => {
  const parsed = new Date(normalizeText(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toPublicRequest = (record) => {
  const requestId = pickValue(record, KEY_ALIASES.requestId);
  const explicitContactMethod = pickValue(record, KEY_ALIASES.contactMethod);
  const phone = pickValue(record, KEY_ALIASES.phone);
  const email = pickValue(record, KEY_ALIASES.email);
  const wechat = pickValue(record, KEY_ALIASES.wechat);
  const submittedAt = pickValue(record, KEY_ALIASES.dateSubmitted);
  const hasPhone = Boolean(phone);
  const hasEmail = Boolean(email);
  const hasWechat = Boolean(wechat);
  const derivedContactMethod =
    explicitContactMethod ||
    (hasPhone && hasEmail
      ? "Phone or Email"
      : hasPhone
        ? "Phone call"
        : hasEmail
          ? "Email"
          : hasWechat
            ? "WeChat"
            : "");

  return {
    requestId,
    serviceType: pickValue(record, KEY_ALIASES.serviceType),
    area: pickValue(record, KEY_ALIASES.area),
    description: pickValue(record, KEY_ALIASES.description),
    contactMethod: toMaskedContactMethod(derivedContactMethod),
    phone,
    email,
    wechat,
    dateSubmitted: formatSubmittedDate(submittedAt),
    status: normalizeStatus(pickValue(record, KEY_ALIASES.status)),
    assignedProvider: pickValue(record, KEY_ALIASES.assignedProvider),
    completedDate: pickValue(record, KEY_ALIASES.completedDate),
    finalCost: pickValue(record, KEY_ALIASES.finalCost),
    rating: pickValue(record, KEY_ALIASES.rating),
    feedbackNote: pickValue(record, KEY_ALIASES.feedbackNote),
    wouldUseAgain: normalizeBinaryChoice(pickValue(record, KEY_ALIASES.wouldUseAgain)),
    sortTime: toSortTime(submittedAt),
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
      .filter((request) => request.serviceType && request.requestId)
      .sort((a, b) => b.sortTime - a.sortTime)
      .map(({ sortTime, ...request }) => request);

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
