const requestsGridNode = document.querySelector("#service-requests-grid");
const requestsEmptyNode = document.querySelector("#service-requests-empty");
const requestsStatusNode = document.querySelector("#service-requests-status");
const feedbackModalNode = document.querySelector("#service-request-feedback-modal");
const feedbackFormNode = document.querySelector("#service-request-feedback-form");
const feedbackMessageNode = document.querySelector("#service-request-feedback-message");
const feedbackTitleNode = document.querySelector("#service-request-feedback-title");
const feedbackSubtitleNode = document.querySelector("#service-request-feedback-subtitle");
const unlistedProviderFieldsNode = document.querySelector("#unlisted-provider-fields");

let allRequests = [];
let storedFeedbackMap = {};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const FEEDBACK_STORAGE_KEY = "nanaimo-service-request-feedback-v1";

const normalizeRequestValue = (value) => String(value ?? "").trim();

const getStableRequestId = (request) => normalizeRequestValue(
  request?.requestId ||
  request?.id ||
  request?.timestamp ||
  request?.Timestamp ||
  request?.submittedAt ||
  request?.dateSubmitted ||
  request?.["Timestamp"] ||
  request?.["Date Submitted"] ||
  ""
);

const escapeRequestHtml = (value) =>
  normalizeRequestValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizePhoneHref = (value) => {
  const cleaned = normalizeRequestValue(value).replace(/[^\d+]/g, "");
  const digitCount = cleaned.replace(/\D/g, "").length;
  return digitCount >= 7 ? cleaned : "";
};

const renderLinkedRequestText = (value) => {
  const text = normalizeRequestValue(value);
  if (!text) {
    return "";
  }

  const tokenPattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+?\d[\d\s().-]{6,}\d)/gi;
  let html = "";
  let lastIndex = 0;

  text.replace(tokenPattern, (match, email, phone, offset) => {
    html += escapeRequestHtml(text.slice(lastIndex, offset));

    if (email) {
      html += `<a class="detail-link" href="mailto:${escapeRequestHtml(email)}">${escapeRequestHtml(email)}</a>`;
    } else {
      const phoneHref = sanitizePhoneHref(phone);
      html += phoneHref
        ? `<a class="detail-link" href="tel:${escapeRequestHtml(phoneHref)}">${escapeRequestHtml(phone)}</a>`
        : escapeRequestHtml(phone);
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (!html) {
    return escapeRequestHtml(text);
  }

  html += escapeRequestHtml(text.slice(lastIndex));
  return html;
};

const renderPublicContactRows = (request) => {
  const phoneValue = request.phone || request.contactPhone || request.contact_number;
  const emailValue = request.email || request.contactEmail || request.contact_email;
  const wechatValue = request.wechat || request.contactWechat || request.contact_wechat;
  const rows = [];

  if (phoneValue && sanitizePhoneHref(phoneValue)) {
    rows.push(
      `<p><strong>Phone / 电话</strong><span><a class="detail-link" href="tel:${escapeRequestHtml(
        sanitizePhoneHref(phoneValue),
      )}">${escapeRequestHtml(phoneValue)}</a></span></p>`,
    );
  }

  if (emailValue && EMAIL_PATTERN.test(normalizeRequestValue(emailValue))) {
    rows.push(
      `<p><strong>Email / 邮箱</strong><span><a class="detail-link" href="mailto:${escapeRequestHtml(
        normalizeRequestValue(emailValue),
      )}">${escapeRequestHtml(emailValue)}</a></span></p>`,
    );
  }

  if (wechatValue) {
    rows.push(
      `<p><strong>WECHAT / 微信</strong><span>${renderLinkedRequestText(wechatValue)}</span></p>`,
    );
  }

  return rows.join("");
};

const getApiErrorMessage = async (response, fallbackMessage) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      return payload.error || fallbackMessage;
    } catch (error) {
      return fallbackMessage;
    }
  }

  return fallbackMessage;
};

const postFeedbackRecord = async (payload) => {
  const response = await fetch("/api/provider-feedback", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(
        response,
        "Unable to save feedback to Provider Feedback / 当前无法写入 Provider Feedback",
      ),
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected feedback response / 反馈接口返回格式异常");
  }

  return response.json();
};

const normalizeFeedbackStatus = (value) => {
  const normalized = normalizeRequestValue(value).toLowerCase();

  if (!normalized) {
    return "Open";
  }

  if (normalized.includes("complete") || normalized.includes("done") || normalized.includes("finished")) {
    return "Completed";
  }

  if (normalized.includes("progress") || normalized.includes("processing")) {
    return "In Progress";
  }

  return "Open";
};

const normalizeBinaryChoice = (value) => {
  const normalized = normalizeRequestValue(value).toLowerCase();

  if (["yes", "y", "true"].includes(normalized)) {
    return "Yes";
  }

  if (["no", "n", "false"].includes(normalized)) {
    return "No";
  }

  return "";
};

const normalizeListedStatus = (value) => {
  const normalized = normalizeRequestValue(value).toLowerCase();

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

const toInputDateValue = (value) => {
  const text = normalizeRequestValue(value);
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (value) => {
  const text = normalizeRequestValue(value);
  if (!text) {
    return "";
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return parsed.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const truncateRequestText = (value, limit = 120) => {
  const text = normalizeRequestValue(value);
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1).trimEnd()}...`;
};

const formatStatusLabel = (value) => {
  const status = normalizeFeedbackStatus(value);

  if (status === "Completed") {
    return "Completed / 已完成";
  }

  if (status === "In Progress") {
    return "In Progress / 处理中";
  }

  return "Open / 公开需求";
};

const formatWouldUseAgainLabel = (value) => {
  const normalized = normalizeBinaryChoice(value);

  if (normalized === "Yes") {
    return "Yes / 是";
  }

  if (normalized === "No") {
    return "No / 否";
  }

  return "";
};

const formatListedStatusLabel = (value) => {
  const normalized = normalizeListedStatus(value);

  if (normalized === "Yes") {
    return "Yes / 是";
  }

  if (normalized === "No") {
    return "No / 否";
  }

  if (normalized === "Not sure") {
    return "Not sure / 不确定";
  }

  return "";
};

const getStatusToneClass = (value) => {
  const status = normalizeFeedbackStatus(value);

  if (status === "Completed") {
    return "is-completed";
  }

  if (status === "In Progress") {
    return "is-in-progress";
  }

  return "is-open";
};

const loadStoredFeedback = () => {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
};

const saveStoredFeedback = () => {
  try {
    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(storedFeedbackMap));
  } catch (error) {
    return;
  }
};

const mergeRequestFeedback = (request) => {
  const stored = request.requestId ? storedFeedbackMap[request.requestId] || {} : {};

  return {
    ...request,
    status: normalizeFeedbackStatus(stored.status || request.status),
    assignedProvider: normalizeRequestValue(stored.assignedProvider || request.assignedProvider),
    completedDate: normalizeRequestValue(stored.completedDate || request.completedDate),
    finalCost: normalizeRequestValue(stored.finalCost || request.finalCost),
    rating: normalizeRequestValue(stored.rating || request.rating),
    feedbackNote: normalizeRequestValue(stored.feedbackNote || request.feedbackNote),
    wouldUseAgain: normalizeBinaryChoice(stored.wouldUseAgain || request.wouldUseAgain),
    providerListedStatus: normalizeListedStatus(stored.providerListedStatus || request.providerListedStatus),
    providerName: normalizeRequestValue(stored.providerName || request.providerName),
    providerPhone: normalizeRequestValue(stored.providerPhone || request.providerPhone),
    providerEmail: normalizeRequestValue(stored.providerEmail || request.providerEmail),
    providerWechat: normalizeRequestValue(stored.providerWechat || request.providerWechat),
    providerServiceCategory: normalizeRequestValue(
      stored.providerServiceCategory || request.providerServiceCategory,
    ),
    recommendationNote: normalizeRequestValue(stored.recommendationNote || request.recommendationNote),
    recommendPublicListing: normalizeBinaryChoice(
      stored.recommendPublicListing || request.recommendPublicListing,
    ),
  };
};

const hasUnlistedProviderFeedback = (request) =>
  normalizeListedStatus(request.providerListedStatus) !== "Yes" &&
  Boolean(
    normalizeRequestValue(request.providerName) ||
      normalizeRequestValue(request.providerPhone) ||
      normalizeRequestValue(request.providerEmail) ||
      normalizeRequestValue(request.providerWechat) ||
      normalizeRequestValue(request.providerServiceCategory) ||
      normalizeRequestValue(request.recommendationNote) ||
      normalizeBinaryChoice(request.recommendPublicListing),
  );

const hasFeedbackSummary = (request) =>
  Boolean(
    normalizeRequestValue(request.assignedProvider) ||
      normalizeRequestValue(request.completedDate) ||
      normalizeRequestValue(request.finalCost) ||
      normalizeRequestValue(request.rating) ||
      normalizeRequestValue(request.feedbackNote) ||
      normalizeBinaryChoice(request.wouldUseAgain) ||
      normalizeListedStatus(request.providerListedStatus) ||
      hasUnlistedProviderFeedback(request) ||
      normalizeFeedbackStatus(request.status) === "Completed",
  );

const buildFeedbackSummaryMarkup = (request) => {
  if (!hasFeedbackSummary(request)) {
    return "";
  }

  const rows = [];

  if (request.assignedProvider) {
    rows.push(
      `<p><strong>Assigned Provider / 指定服务人员</strong><span>${escapeRequestHtml(request.assignedProvider)}</span></p>`,
    );
  }

  if (request.completedDate) {
    rows.push(
      `<p><strong>Completed Date / 完成日期</strong><span>${escapeRequestHtml(formatDisplayDate(request.completedDate))}</span></p>`,
    );
  }

  if (request.finalCost) {
    rows.push(
      `<p><strong>Final Cost / 最终费用</strong><span>${escapeRequestHtml(request.finalCost)}</span></p>`,
    );
  }

  if (request.rating) {
    rows.push(
      `<p><strong>Rating / 评分</strong><span>${escapeRequestHtml(request.rating)} / 5</span></p>`,
    );
  }

  if (request.wouldUseAgain) {
    rows.push(
      `<p><strong>Would Use Again / 是否愿意再次使用</strong><span>${escapeRequestHtml(
        formatWouldUseAgainLabel(request.wouldUseAgain),
      )}</span></p>`,
    );
  }

  if (request.providerListedStatus) {
    rows.push(
      `<p><strong>Already Listed? / 是否已在公开名单中</strong><span>${escapeRequestHtml(
        formatListedStatusLabel(request.providerListedStatus),
      )}</span></p>`,
    );
  }

  const shortNote = truncateRequestText(request.feedbackNote, 96);
  const providerRows = [];

  if (request.providerName) {
    providerRows.push(
      `<p><strong>Provider Name / 服务人员名称</strong><span>${escapeRequestHtml(request.providerName)}</span></p>`,
    );
  }

  if (request.providerPhone) {
    const phoneHref = sanitizePhoneHref(request.providerPhone);
    providerRows.push(
      `<p><strong>Phone / 电话</strong><span>${
        phoneHref
          ? `<a class="detail-link" href="tel:${escapeRequestHtml(phoneHref)}">${escapeRequestHtml(request.providerPhone)}</a>`
          : escapeRequestHtml(request.providerPhone)
      }</span></p>`,
    );
  }

  if (request.providerEmail) {
    providerRows.push(
      `<p><strong>Email / 邮箱</strong><span>${
        EMAIL_PATTERN.test(request.providerEmail)
          ? `<a class="detail-link" href="mailto:${escapeRequestHtml(request.providerEmail)}">${escapeRequestHtml(request.providerEmail)}</a>`
          : escapeRequestHtml(request.providerEmail)
      }</span></p>`,
    );
  }

  if (request.providerWechat) {
    providerRows.push(
      `<p><strong>WECHAT / 微信</strong><span>${renderLinkedRequestText(request.providerWechat)}</span></p>`,
    );
  }

  if (request.providerServiceCategory) {
    providerRows.push(
      `<p><strong>Service Category / 服务分类</strong><span>${escapeRequestHtml(
        request.providerServiceCategory,
      )}</span></p>`,
    );
  }

  if (request.recommendPublicListing) {
    providerRows.push(
      `<p><strong>Recommend Public Listing / 是否建议公开列出</strong><span>${escapeRequestHtml(
        formatWouldUseAgainLabel(request.recommendPublicListing),
      )}</span></p>`,
    );
  }

  const shortRecommendationNote = truncateRequestText(request.recommendationNote, 96);

  return `
    <div class="request-feedback-summary">
      <p class="request-feedback-summary-title">${escapeRequestHtml(formatStatusLabel(request.status))}</p>
      ${rows.length ? `<div class="provider-meta request-feedback-meta">${rows.join("")}</div>` : ""}
      ${
        shortNote
          ? `<p class="secondary-copy request-feedback-note">${renderLinkedRequestText(shortNote)}</p>`
          : ""
      }
      ${
        hasUnlistedProviderFeedback(request)
          ? `
            <div class="request-unlisted-provider-summary">
              <p class="request-subsection-title">Unlisted Provider Feedback / 未列入公开名单的服务反馈</p>
              ${providerRows.length ? `<div class="provider-meta request-feedback-meta">${providerRows.join("")}</div>` : ""}
              ${
                shortRecommendationNote
                  ? `<p class="secondary-copy request-feedback-note">${renderLinkedRequestText(shortRecommendationNote)}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
    </div>
  `;
};

const toggleUnlistedProviderFields = (value) => {
  if (!unlistedProviderFieldsNode || !feedbackFormNode) {
    return;
  }

  const shouldShow = ["No", "Not sure"].includes(normalizeListedStatus(value));
  unlistedProviderFieldsNode.hidden = !shouldShow;

  if (shouldShow) {
    return;
  }

  [
    "providerName",
    "providerPhone",
    "providerEmail",
    "providerWechat",
    "providerServiceCategory",
    "recommendationNote",
    "recommendPublicListing",
  ].forEach((fieldName) => {
    if (feedbackFormNode.elements[fieldName]) {
      feedbackFormNode.elements[fieldName].value = "";
    }
  });
};

const renderRequests = (requests) => {
  requestsGridNode.innerHTML = "";

  requests.forEach((request) => {
    const article = document.createElement("article");
    article.className = "provider-card";
    article.innerHTML = `
      <div class="card-heading request-card-heading">
        <div>
          <h2>${escapeRequestHtml(request.serviceType)}</h2>
          <p class="secondary-heading" lang="zh-Hans">${escapeRequestHtml(request.area)}</p>
        </div>
        <span class="request-status-badge ${getStatusToneClass(request.status)}">${escapeRequestHtml(
          formatStatusLabel(request.status),
        )}</span>
      </div>
      <div class="provider-meta">
        <p><strong>Type of Service Needed / 所需服务</strong><span>${escapeRequestHtml(request.serviceType)}</span></p>
        <p><strong>Area / Location / 地区位置</strong><span>${escapeRequestHtml(request.area || "General Nanaimo area / 纳奈莫地区")}</span></p>
        <p><strong>Status / 状态</strong><span>${escapeRequestHtml(formatStatusLabel(request.status))}</span></p>
        <p><strong>Preferred Contact Method / 联系方式</strong><span>${escapeRequestHtml(request.contactMethod || "Platform follow-up / 平台跟进")}</span></p>
        <p><strong>Date Submitted / 提交日期</strong><span>${escapeRequestHtml(request.dateSubmitted || "Recent / 最近")}</span></p>
        ${renderPublicContactRows(request)}
      </div>
      <p class="primary-copy provider-description">${renderLinkedRequestText(request.description || "No public description provided / 暂无公开说明")}</p>
      ${buildFeedbackSummaryMarkup(request)}
      <div class="request-card-actions">
        <button type="button" class="button button-secondary request-feedback-button" data-request-id="${escapeRequestHtml(
          request.requestId,
        )}">
          Add / Update Feedback
        </button>
      </div>
    `;
    requestsGridNode.append(article);
  });
};

const getRequestById = (requestId) =>
  allRequests.find((request) => getStableRequestId(request) === normalizeRequestValue(requestId));

const closeFeedbackModal = () => {
  if (!feedbackModalNode || !feedbackFormNode) {
    return;
  }

  feedbackModalNode.hidden = true;
  feedbackMessageNode.textContent = "";
  feedbackFormNode.reset();
  document.body.classList.remove("modal-open");
};

const openFeedbackModal = (requestId) => {
  const request = getRequestById(requestId);
  if (!request || !feedbackModalNode || !feedbackFormNode) {
    return;
  }

  feedbackFormNode.elements.requestId.value = getStableRequestId(request);
  feedbackFormNode.elements.status.value = normalizeFeedbackStatus(request.status);
  feedbackFormNode.elements.assignedProvider.value = request.assignedProvider || "";
  feedbackFormNode.elements.providerListedStatus.value = request.providerListedStatus || "";
  feedbackFormNode.elements.completedDate.value = toInputDateValue(request.completedDate);
  feedbackFormNode.elements.finalCost.value = request.finalCost || "";
  feedbackFormNode.elements.rating.value = request.rating || "";
  feedbackFormNode.elements.feedbackNote.value = request.feedbackNote || "";
  feedbackFormNode.elements.wouldUseAgain.value = request.wouldUseAgain || "";
  feedbackFormNode.elements.providerName.value = request.providerName || "";
  feedbackFormNode.elements.providerPhone.value = request.providerPhone || "";
  feedbackFormNode.elements.providerEmail.value = request.providerEmail || "";
  feedbackFormNode.elements.providerWechat.value = request.providerWechat || "";
  feedbackFormNode.elements.providerServiceCategory.value = request.providerServiceCategory || "";
  feedbackFormNode.elements.recommendationNote.value = request.recommendationNote || "";
  feedbackFormNode.elements.recommendPublicListing.value = request.recommendPublicListing || "";
  toggleUnlistedProviderFields(request.providerListedStatus);

  feedbackTitleNode.textContent = request.serviceType || "Update Service Request";
  feedbackSubtitleNode.textContent = request.area || "更新服务需求";
  feedbackMessageNode.textContent =
    "Will save to Provider Feedback / 将保存到 Provider Feedback";
  feedbackModalNode.hidden = false;
  document.body.classList.add("modal-open");
};

const rerenderRequests = () => {
  renderRequests(allRequests);
  requestsEmptyNode.hidden = allRequests.length !== 0;
};

const clearStoredRequestFeedback = (requestId) => {
  delete storedFeedbackMap[requestId];
  saveStoredFeedback();
};

const setStoredRequestFallback = (requestId, nextFeedback) => {
  storedFeedbackMap[requestId] = nextFeedback;
  saveStoredFeedback();
};

const applyRequestFeedback = (requestId, nextFeedback) => {
  allRequests = allRequests.map((request) =>
    request.requestId === requestId ? mergeRequestFeedback({ ...request, ...nextFeedback }) : request,
  );
};

const buildRequestFeedbackPayload = (requestId, request, nextFeedback) => ({
  feedbackType: "service-request",
  requestStatus: nextFeedback.status,
  relatedServiceRequestId: requestId,
  providerListed: nextFeedback.providerListedStatus || (nextFeedback.assignedProvider ? "Yes" : ""),
  providerName: nextFeedback.providerName || nextFeedback.assignedProvider,
  providerPhone: nextFeedback.providerPhone,
  providerEmail: nextFeedback.providerEmail,
  providerWechat: nextFeedback.providerWechat,
  serviceCategory: nextFeedback.providerServiceCategory || request.serviceType,
  completedDate: nextFeedback.completedDate,
  finalCost: nextFeedback.finalCost,
  rating: nextFeedback.rating,
  wouldUseAgain: nextFeedback.wouldUseAgain,
  feedbackNote: nextFeedback.feedbackNote,
  recommendationNote: nextFeedback.recommendationNote,
  recommendAddToPublicList: nextFeedback.recommendPublicListing,
  sourcePage: "service-requests",
});

const handleFeedbackSubmit = async (event) => {
  event.preventDefault();

  const formData = new FormData(feedbackFormNode);
  const requestId = normalizeRequestValue(formData.get("requestId"));
  const request = getRequestById(requestId);

  if (!requestId || !request) {
    feedbackMessageNode.textContent = "Unable to save this request right now / 当前无法保存这条需求";
    return;
  }

  const nextFeedback = {
    status: normalizeFeedbackStatus(formData.get("status")),
    assignedProvider: normalizeRequestValue(formData.get("assignedProvider")),
    providerListedStatus: normalizeListedStatus(formData.get("providerListedStatus")),
    completedDate: normalizeRequestValue(formData.get("completedDate")),
    finalCost: normalizeRequestValue(formData.get("finalCost")),
    rating: normalizeRequestValue(formData.get("rating")),
    feedbackNote: normalizeRequestValue(formData.get("feedbackNote")),
    wouldUseAgain: normalizeBinaryChoice(formData.get("wouldUseAgain")),
    providerName: normalizeRequestValue(formData.get("providerName")),
    providerPhone: normalizeRequestValue(formData.get("providerPhone")),
    providerEmail: normalizeRequestValue(formData.get("providerEmail")),
    providerWechat: normalizeRequestValue(formData.get("providerWechat")),
    providerServiceCategory: normalizeRequestValue(formData.get("providerServiceCategory")),
    recommendationNote: normalizeRequestValue(formData.get("recommendationNote")),
    recommendPublicListing: normalizeBinaryChoice(formData.get("recommendPublicListing")),
  };

  if (!nextFeedback.assignedProvider && !nextFeedback.providerName) {
    feedbackMessageNode.textContent =
      "Assigned Provider or Provider Name is required / 请填写指定服务人员或服务人员名称";
    return;
  }

  try {
    feedbackMessageNode.textContent = "Saving to Provider Feedback... / 正在保存到 Provider Feedback...";
    await postFeedbackRecord(buildRequestFeedbackPayload(requestId, request, nextFeedback));
    clearStoredRequestFeedback(requestId);
    applyRequestFeedback(requestId, nextFeedback);
    rerenderRequests();
    feedbackMessageNode.textContent = "Feedback saved to Provider Feedback / 已保存到 Provider Feedback";
    window.setTimeout(closeFeedbackModal, 250);
  } catch (error) {
    setStoredRequestFallback(requestId, nextFeedback);
    applyRequestFeedback(requestId, nextFeedback);
    rerenderRequests();
    feedbackMessageNode.textContent = `${escapeRequestHtml(
      error instanceof Error ? error.message : "Unable to save feedback online",
    )} / 已改为保存在当前浏览器`;
  }
};

const loadServiceRequests = async () => {
  try {
    const response = await fetch("/api/service-requests", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(
          response,
          "Service request data is not available in local static preview / 本地静态预览不提供服务需求数据",
        ),
      );
    }

    if (!contentType.includes("application/json")) {
      throw new Error(
        "Service request data is not available in local static preview / 本地静态预览不提供服务需求数据",
      );
    }

    const payload = await response.json();

    storedFeedbackMap = loadStoredFeedback();
    allRequests = (payload.requests || []).map(mergeRequestFeedback);
    rerenderRequests();
    requestsStatusNode.textContent =
      allRequests.length === 1
        ? "1 service request found / 已显示 1 条服务需求"
        : `${allRequests.length} service requests found / 已显示 ${allRequests.length} 条服务需求`;
  } catch (error) {
    requestsStatusNode.textContent = "Service request data is not available yet / 服务需求数据暂不可用";
    requestsEmptyNode.hidden = false;
    requestsGridNode.innerHTML = "";
    requestsEmptyNode.innerHTML = `
      <p class="primary-copy">Service request data could not be loaded right now / 目前暂时无法载入服务需求资料。</p>
      <p class="secondary-copy" lang="zh-Hans">Please try again shortly / 请稍后再试。</p>
      <p class="secondary-copy providers-error-detail">${escapeRequestHtml(error.message)}</p>
    `;
  }
};

requestsGridNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-request-id]");
  if (!button) {
    return;
  }

  openFeedbackModal(button.dataset.requestId);
});

feedbackFormNode?.addEventListener("submit", handleFeedbackSubmit);
feedbackFormNode?.elements.providerListedStatus?.addEventListener("change", (event) => {
  toggleUnlistedProviderFields(event.target.value);
});

document.addEventListener("click", (event) => {
  const closeTrigger = event.target.closest("[data-close-feedback='true']");
  if (closeTrigger) {
    closeFeedbackModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && feedbackModalNode && !feedbackModalNode.hidden) {
    closeFeedbackModal();
  }
});

loadServiceRequests();
