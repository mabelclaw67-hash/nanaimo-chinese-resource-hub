import { randomUUID } from "node:crypto";

const normalizeKey = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const pickRow = (record, aliases) => {
  for (const alias of aliases) {
    const k = normalizeKey(alias);
    if (k in record && String(record[k] ?? "").trim()) return String(record[k]).trim();
  }
  return "";
};

const parseFeedbackPayload = (payload) => {
  let rows = null;
  if (Array.isArray(payload)) {
    if (payload.every((r) => !Array.isArray(r))) {
      rows = payload.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [normalizeKey(k), v])),
      );
    } else if (payload.length >= 2 && Array.isArray(payload[0])) {
      const headers = payload[0].map(normalizeKey);
      rows = payload.slice(1).map((row) =>
        Object.fromEntries(headers.map((h, i) => [h, row[i]])),
      );
    } else {
      rows = [];
    }
  } else if (payload && typeof payload === "object") {
    for (const key of ["rows", "data", "items", "feedback", "results", "values"]) {
      if (key in payload) return parseFeedbackPayload(payload[key]);
    }
    rows = [];
  } else {
    rows = [];
  }

  return rows
    .filter((r) => pickRow(r, ["providername", "provider name"]))
    .map((r) => ({
      timestamp: pickRow(r, ["timestamp"]),
      relatedServiceRequestId: pickRow(r, ["relatedservicerequestid", "related service request id"]),
      sourcePage: pickRow(r, ["sourcepage", "source page"]),
      providerName: pickRow(r, ["providername", "provider name"]),
      serviceCategory: pickRow(r, ["servicecategory", "service category"]),
      completedDate: pickRow(r, ["completeddate", "completed date"]),
      finalCost: pickRow(r, ["finalcost", "final cost"]),
      rating: pickRow(r, ["rating"]),
      wouldUseAgain: pickRow(r, ["woulduseagain", "would use again"]),
      feedbackNote: pickRow(r, ["feedbacknote", "feedback note"]),
    }));
};

const handleGet = async () => {
  const endpoint = Netlify.env.get("GOOGLE_PROVIDER_FEEDBACK_SCRIPT_URL");
  if (!endpoint) return Response.json({ rows: [] });
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!res.ok) return Response.json({ rows: [] });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return Response.json({ rows: [] });
    const payload = await res.json();
    return Response.json({ rows: parseFeedbackPayload(payload) });
  } catch {
    return Response.json({ rows: [] });
  }
};

const SHEET_HEADERS = [
  "Timestamp",
  "Feedback ID",
  "Feedback Type",
  "Related Service Request ID",
  "Provider Listed",
  "Provider Name",
  "Provider Phone",
  "Provider Email",
  "Provider WeChat",
  "Service Category",
  "Completed Date",
  "Final Cost",
  "Rating",
  "Would Use Again",
  "Feedback Note",
  "Recommendation Note",
  "Recommend Add To Public List",
  "Notify Provider By Email",
  "Notification Status",
  "Admin Review Status",
  "Source Page",
];

const normalizeText = (value) => String(value ?? "").trim();

const normalizeBinaryChoice = (value) => {
  const normalized = normalizeText(value).toLowerCase();

  if (["yes", "y", "true"].includes(normalized)) {
    return "Yes";
  }

  if (["no", "n", "false"].includes(normalized)) {
    return "No";
  }

  return "";
};

const normalizeListedStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase();

  if (["yes", "y", "true"].includes(normalized)) {
    return "Yes";
  }

  if (["no", "n", "false"].includes(normalized)) {
    return "No";
  }

  if (normalized === "not sure" || normalized === "unsure" || normalized === "unknown") {
    return "Not sure";
  }

  return "";
};

const normalizeFeedbackType = (value, requestStatus = "") => {
  const normalized = normalizeText(value).toLowerCase();

  if (normalized === "service-request") {
    return `Service Request - ${normalizeText(requestStatus) || "Completed"}`;
  }

  return "Provider Feedback";
};

const buildFeedbackRow = (payload) => {
  const providerName = normalizeText(payload.providerName);

  if (!providerName) {
    throw new Error("Provider Name is required.");
  }

  return {
    Timestamp: new Date().toISOString(),
    "Feedback ID": normalizeText(payload.feedbackId) || `PF-${randomUUID()}`,
    "Feedback Type": normalizeFeedbackType(payload.feedbackType, payload.requestStatus),
    "Related Service Request ID": normalizeText(payload.relatedServiceRequestId),
    "Provider Listed": normalizeListedStatus(payload.providerListed),
    "Provider Name": providerName,
    "Provider Phone": normalizeText(payload.providerPhone),
    "Provider Email": normalizeText(payload.providerEmail),
    "Provider WeChat": normalizeText(payload.providerWechat),
    "Service Category": normalizeText(payload.serviceCategory),
    "Completed Date": normalizeText(payload.completedDate),
    "Final Cost": normalizeText(payload.finalCost),
    Rating: normalizeText(payload.rating),
    "Would Use Again": normalizeBinaryChoice(payload.wouldUseAgain),
    "Feedback Note": normalizeText(payload.feedbackNote),
    "Recommendation Note": normalizeText(payload.recommendationNote),
    "Recommend Add To Public List": normalizeBinaryChoice(payload.recommendAddToPublicList),
    "Notify Provider By Email": "No",
    "Notification Status": "Not Sent",
    "Admin Review Status": "Pending Review",
    "Source Page": normalizeText(payload.sourcePage),
  };
};

const appendViaAppsScript = async (row) => {
  const endpoint = Netlify.env.get("GOOGLE_PROVIDER_FEEDBACK_SCRIPT_URL");

  if (!endpoint) {
    throw new Error("Missing GOOGLE_PROVIDER_FEEDBACK_SCRIPT_URL environment variable.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      row,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apps Script feedback append failed: ${text || response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(payload.error);
    }
  }

  return {
    ok: true,
    forwardedHeaders: SHEET_HEADERS,
  };
};

export default async (req) => {
  if (req.method === "GET") return handleGet();

  if (req.method !== "POST") {
    return Response.json(
      {
        error: "Method not allowed.",
      },
      { status: 405 },
    );
  }

  try {
    const payload = await req.json();
    const row = buildFeedbackRow(payload);
    await appendViaAppsScript(row);

    return Response.json({
      ok: true,
      feedback: row,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to save provider feedback.",
      },
      { status: 500 },
    );
  }
};

export const config = {
  path: "/api/provider-feedback",
};
