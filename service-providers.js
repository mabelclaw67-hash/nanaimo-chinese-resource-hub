const gridNode = document.querySelector("#providers-grid");
const emptyNode = document.querySelector("#providers-empty");
const statusNode = document.querySelector("#providers-status");
const searchNode = document.querySelector("#provider-search");
const categoryNode = document.querySelector("#provider-category");
const openFeedbackButtonNode = document.querySelector("#open-provider-feedback");
const feedbackRecordsNode = document.querySelector("#provider-feedback-records");
const feedbackRecordsGridNode = document.querySelector("#provider-feedback-records-grid");
const providerFeedbackModalNode = document.querySelector("#provider-feedback-modal");
const providerFeedbackFormNode = document.querySelector("#provider-feedback-form");
const providerFeedbackMessageNode = document.querySelector("#provider-feedback-message");
const providerFeedbackTitleNode = document.querySelector("#provider-feedback-title");
const providerFeedbackSubtitleNode = document.querySelector("#provider-feedback-subtitle");

let allProviders = [];
let providerFeedbackMap = {};
let sheetFeedbackByName = {};

const normalizeValue = (value) => String(value ?? "").trim();

const normalizeSearch = (value) => normalizeValue(value).toLowerCase();

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/;
const PROVIDER_FEEDBACK_STORAGE_KEY = "nanaimo-provider-feedback-v1";

const escapeHtml = (value) =>
  normalizeValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizePhoneHref = (value) => {
  const cleaned = normalizeValue(value).replace(/[^\d+]/g, "");
  const digitCount = cleaned.replace(/\D/g, "").length;
  return digitCount >= 7 ? cleaned : "";
};

const renderLinkedText = (value) => {
  const text = normalizeValue(value);
  if (!text) {
    return "";
  }

  const tokenPattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+?\d[\d\s().-]{6,}\d)/gi;
  let html = "";
  let lastIndex = 0;

  text.replace(tokenPattern, (match, email, phone, offset) => {
    html += escapeHtml(text.slice(lastIndex, offset));

    if (email) {
      html += `<a class="detail-link" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`;
    } else {
      const phoneHref = sanitizePhoneHref(phone);
      html += phoneHref
        ? `<a class="detail-link" href="tel:${escapeHtml(phoneHref)}">${escapeHtml(phone)}</a>`
        : escapeHtml(phone);
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (!html) {
    return escapeHtml(text);
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
};

const renderContactValue = (value, hint = "") => {
  const text = normalizeValue(value);
  if (!text) {
    return escapeHtml("Not provided / 未提供");
  }

  const hintValue = normalizeSearch(hint);

  if (hintValue.includes("email") || EMAIL_PATTERN.test(text)) {
    return `<a class="detail-link" href="mailto:${escapeHtml(text)}">${escapeHtml(text)}</a>`;
  }

  if (hintValue.includes("phone") || hintValue.includes("call") || PHONE_PATTERN.test(text)) {
    const phoneHref = sanitizePhoneHref(text);
    if (phoneHref) {
      return `<a class="detail-link" href="tel:${escapeHtml(phoneHref)}">${escapeHtml(text)}</a>`;
    }
  }

  return renderLinkedText(text);
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

const postProviderFeedbackRecord = async (payload) => {
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
        "Unable to save provider feedback to Google Sheet / 当前无法写入 Google Sheet",
      ),
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected provider feedback response / 服务评价接口返回格式异常");
  }

  return response.json();
};

const buildContactRows = (contactSet) => {
  const rows = [];

  if (normalizeValue(contactSet.phone) && sanitizePhoneHref(contactSet.phone)) {
    rows.push(
      `<p><strong>Phone / 电话</strong><span><a class="detail-link" href="tel:${escapeHtml(
        sanitizePhoneHref(contactSet.phone),
      )}">${escapeHtml(contactSet.phone)}</a></span></p>`,
    );
  }

  if (normalizeValue(contactSet.email) && EMAIL_PATTERN.test(normalizeValue(contactSet.email))) {
    rows.push(
      `<p><strong>Email / 邮箱</strong><span><a class="detail-link" href="mailto:${escapeHtml(
        normalizeValue(contactSet.email),
      )}">${escapeHtml(contactSet.email)}</a></span></p>`,
    );
  }

  if (normalizeValue(contactSet.wechat)) {
    rows.push(
      `<p><strong>WECHAT / 微信</strong><span>${renderLinkedText(contactSet.wechat)}</span></p>`,
    );
  }

  return rows.join("");
};

const normalizeBinaryChoice = (value) => {
  const normalized = normalizeValue(value).toLowerCase();

  if (["yes", "y", "true"].includes(normalized)) {
    return "Yes";
  }

  if (["no", "n", "false"].includes(normalized)) {
    return "No";
  }

  return "";
};

const normalizeListedStatus = (value) => {
  const normalized = normalizeValue(value).toLowerCase();

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

const formatBinaryChoiceLabel = (value) => {
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

const buildProviderKey = (provider) =>
  normalizeSearch(
    [
      provider.name,
      provider.category,
      provider.city,
      provider.phone,
      provider.email,
      provider.wechat,
      provider.contactValue,
    ].join("|"),
  );

const loadStoredProviderFeedback = () => {
  try {
    const raw = window.localStorage.getItem(PROVIDER_FEEDBACK_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
};

const saveStoredProviderFeedback = () => {
  try {
    window.localStorage.setItem(PROVIDER_FEEDBACK_STORAGE_KEY, JSON.stringify(providerFeedbackMap));
  } catch (error) {
    return;
  }
};

const deleteStoredProviderFeedbackEntry = (entryKey) => {
  delete providerFeedbackMap[entryKey];
  saveStoredProviderFeedback();
};

const getProviderFeedback = (providerKey) => providerFeedbackMap[providerKey] || null;

const buildProviderFeedbackSummaryMarkup = (feedback) => {
  if (!feedback) {
    return "";
  }

  const rows = [];

  if (feedback.rating) {
    rows.push(`<p><strong>Rating / 评分</strong><span>${escapeHtml(feedback.rating)} / 5</span></p>`);
  }

  if (feedback.wouldUseAgain) {
    rows.push(
      `<p><strong>Would Use Again / 是否愿意再次使用</strong><span>${escapeHtml(
        formatBinaryChoiceLabel(feedback.wouldUseAgain),
      )}</span></p>`,
    );
  }

  if (feedback.providerListedStatus) {
    rows.push(
      `<p><strong>Already Listed? / 是否已在公开名单中</strong><span>${escapeHtml(
        formatListedStatusLabel(feedback.providerListedStatus),
      )}</span></p>`,
    );
  }

  if (feedback.recommendPublicListing) {
    rows.push(
      `<p><strong>Recommend Public Listing / 是否建议公开列出</strong><span>${escapeHtml(
        formatBinaryChoiceLabel(feedback.recommendPublicListing),
      )}</span></p>`,
    );
  }

  return `
    <div class="provider-feedback-summary">
      <p class="provider-feedback-summary-title">Provider Feedback / 服务评价</p>
      ${rows.length ? `<div class="provider-meta request-feedback-meta">${rows.join("")}</div>` : ""}
      ${
        feedback.feedbackNote
          ? `<p class="secondary-copy request-feedback-note">${renderLinkedText(feedback.feedbackNote)}</p>`
          : ""
      }
    </div>
  `;
};

const renderFeedbackRecords = () => {
  if (!feedbackRecordsNode || !feedbackRecordsGridNode) {
    return;
  }

  const listedProviderKeys = new Set(allProviders.map((provider) => provider.providerKey));
  const listedProviderNames = new Set(allProviders.map((provider) => normalizeSearch(provider.name)));
  const standaloneEntries = Object.values(providerFeedbackMap)
    .filter((entry) => {
      if (entry.providerKey && listedProviderKeys.has(entry.providerKey)) return false;
      if (entry.providerName && listedProviderNames.has(normalizeSearch(entry.providerName))) return false;
      return true;
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  feedbackRecordsNode.hidden = standaloneEntries.length === 0;
  feedbackRecordsGridNode.innerHTML = "";

  standaloneEntries.forEach((entry) => {
    const article = document.createElement("article");
    article.className = "provider-card";
    article.innerHTML = `
      <div class="card-heading">
        <h2>${escapeHtml(entry.providerName || "Provider Feedback / 服务评价")}</h2>
        <p class="secondary-heading" lang="zh-Hans">${escapeHtml(
          entry.serviceCategory || "独立记录 / Standalone record",
        )}</p>
      </div>
      <div class="provider-meta">
        <p><strong>Service Category / 服务分类</strong><span>${escapeHtml(
          entry.serviceCategory || "Not provided / 未提供",
        )}</span></p>
        <p><strong>City / Area / 城市或区域</strong><span>${escapeHtml(
          entry.cityArea || "Not provided / 未提供",
        )}</span></p>
        ${buildContactRows(entry)}
      </div>
      ${buildProviderFeedbackSummaryMarkup(entry)}
      <div class="provider-card-actions">
        <button
          type="button"
          class="button button-secondary provider-feedback-button"
          data-provider-feedback-entry="${escapeHtml(entry.entryKey)}"
        >
          Update Provider Feedback / 更新服务评价
        </button>
      </div>
    `;
    feedbackRecordsGridNode.append(article);
  });
};

const buildSearchIndex = (provider) =>
  [
    provider.name,
    provider.category,
    provider.city,
    provider.phone,
    provider.email,
    provider.wechat,
    provider.contactValue,
    provider.contactLabel,
    provider.description,
  ]
    .map(normalizeSearch)
    .join(" ");

const renderProviders = (providers) => {
  gridNode.innerHTML = "";

  providers.forEach((provider) => {
    const localFeedback = getProviderFeedback(provider.providerKey);
    const sheetFeedbacks = sheetFeedbackByName[normalizeSearch(provider.name)] || [];
    const article = document.createElement("article");
    article.className = "provider-card";
    article.innerHTML = `
      <div class="card-heading">
        <h2>${escapeHtml(provider.name)}</h2>
        <p class="secondary-heading" lang="zh-Hans">${escapeHtml(provider.category)}</p>
      </div>
      <div class="provider-meta">
        <p><strong>Service Category / 服务分类</strong><span>${escapeHtml(provider.category)}</span></p>
        <p><strong>City / Area / 城市或区域</strong><span>${escapeHtml(provider.city)}</span></p>
        ${buildContactRows(provider)}
      </div>
      <p class="primary-copy provider-description">${renderLinkedText(provider.description || "No description provided / 暂无说明")}</p>
      ${buildSheetFeedbackMarkup(sheetFeedbacks)}
      ${sheetFeedbacks.length === 0 ? buildProviderFeedbackSummaryMarkup(localFeedback) : ""}
      <div class="provider-card-actions">
        <button
          type="button"
          class="button button-secondary provider-feedback-button"
          data-provider-feedback="${escapeHtml(provider.providerKey)}"
        >
          Add / Update Feedback
        </button>
      </div>
    `;
    gridNode.append(article);
  });
};

const rerenderProvidersView = () => {
  applyFilters();
  renderFeedbackRecords();
};

const closeProviderFeedbackModal = () => {
  if (!providerFeedbackModalNode || !providerFeedbackFormNode) {
    return;
  }

  providerFeedbackModalNode.hidden = true;
  providerFeedbackMessageNode.textContent = "";
  providerFeedbackFormNode.reset();
  document.body.classList.remove("modal-open");
};

const fillProviderFeedbackForm = (entry = {}) => {
  providerFeedbackFormNode.elements.entryKey.value = entry.entryKey || "";
  providerFeedbackFormNode.elements.providerKey.value = entry.providerKey || "";
  providerFeedbackFormNode.elements.providerName.value = entry.providerName || "";
  providerFeedbackFormNode.elements.providerListedStatus.value = entry.providerListedStatus || "";
  providerFeedbackFormNode.elements.serviceCategory.value = entry.serviceCategory || "";
  providerFeedbackFormNode.elements.cityArea.value = entry.cityArea || "";
  providerFeedbackFormNode.elements.phone.value = entry.phone || "";
  providerFeedbackFormNode.elements.email.value = entry.email || "";
  providerFeedbackFormNode.elements.wechat.value = entry.wechat || "";
  providerFeedbackFormNode.elements.rating.value = entry.rating || "";
  providerFeedbackFormNode.elements.wouldUseAgain.value = entry.wouldUseAgain || "";
  providerFeedbackFormNode.elements.recommendPublicListing.value = entry.recommendPublicListing || "";
  providerFeedbackFormNode.elements.feedbackNote.value = entry.feedbackNote || "";
};

const openProviderFeedbackModal = (providerKey = "") => {
  if (!providerFeedbackModalNode || !providerFeedbackFormNode) {
    return;
  }

  const matchedProvider = allProviders.find((provider) => provider.providerKey === providerKey);
  const storedEntry = providerKey ? getProviderFeedback(providerKey) : null;
  const entry = storedEntry || {};
  fillProviderFeedbackForm({
    entryKey: entry.entryKey || "",
    providerKey: providerKey || entry.providerKey || "",
    providerName: entry.providerName || matchedProvider?.name || "",
    providerListedStatus: entry.providerListedStatus || (matchedProvider ? "Yes" : ""),
    serviceCategory: entry.serviceCategory || matchedProvider?.category || "",
    cityArea: entry.cityArea || matchedProvider?.city || "",
    phone: entry.phone || matchedProvider?.phone || "",
    email: entry.email || matchedProvider?.email || "",
    wechat: entry.wechat || matchedProvider?.wechat || "",
    rating: entry.rating || "",
    wouldUseAgain: entry.wouldUseAgain || "",
    recommendPublicListing: entry.recommendPublicListing || "",
    feedbackNote: entry.feedbackNote || "",
  });

  providerFeedbackTitleNode.textContent = matchedProvider?.name || "Add Provider Feedback";
  providerFeedbackSubtitleNode.textContent = matchedProvider?.category || "添加服务评价";
  providerFeedbackMessageNode.textContent =
    "Will save to Provider Feedback / 将保存到 Provider Feedback";
  providerFeedbackModalNode.hidden = false;
  document.body.classList.add("modal-open");
};

const openStandaloneProviderFeedbackModal = (entryKey = "") => {
  if (!providerFeedbackModalNode || !providerFeedbackFormNode) {
    console.warn("[provider-feedback] modal or form element missing in DOM");
    return;
  }

  const entry = entryKey ? providerFeedbackMap[entryKey] || {} : {};
  fillProviderFeedbackForm(entry);
  providerFeedbackTitleNode.textContent = entry.providerName || "Add Provider Feedback";
  providerFeedbackSubtitleNode.textContent = "独立服务评价";
  providerFeedbackMessageNode.textContent =
    "Will save to Provider Feedback / 将保存到 Provider Feedback";
  providerFeedbackModalNode.hidden = false;
  document.body.classList.add("modal-open");
};

const buildProviderFeedbackPayload = (feedback) => ({
  feedbackType: "provider-feedback",
  relatedServiceRequestId: "",
  providerListed: feedback.providerListedStatus,
  providerName: feedback.providerName,
  providerPhone: feedback.phone,
  providerEmail: feedback.email,
  providerWechat: feedback.wechat,
  serviceCategory: feedback.serviceCategory,
  completedDate: "",
  finalCost: "",
  rating: feedback.rating,
  wouldUseAgain: feedback.wouldUseAgain,
  feedbackNote: feedback.feedbackNote,
  recommendationNote: "",
  recommendAddToPublicList: feedback.recommendPublicListing,
  sourcePage: "service-providers",
});

const updateCategoryOptions = (providers) => {
  const currentValue = categoryNode.value;
  const categories = [...new Set(providers.map((provider) => provider.category).filter(Boolean))].sort();
  categoryNode.innerHTML = '<option value="">All categories / 全部分类</option>';

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryNode.append(option);
  });

  categoryNode.value = categories.includes(currentValue) ? currentValue : "";
};

const applyFilters = () => {
  const query = normalizeSearch(searchNode.value);
  const category = normalizeValue(categoryNode.value);

  const filtered = allProviders.filter((provider) => {
    const matchesCategory = !category || provider.category === category;
    const matchesQuery = !query || provider.searchIndex.includes(query);
    return matchesCategory && matchesQuery;
  });

  emptyNode.hidden = filtered.length !== 0;
  renderProviders(filtered);
  statusNode.textContent =
    filtered.length === 1
      ? "1 approved provider found / 已显示 1 条服务提供者"
      : `${filtered.length} approved providers found / 已显示 ${filtered.length} 条服务提供者`;
};

const loadSheetFeedback = async () => {
  try {
    const response = await fetch("/api/provider-feedback", { cache: "no-store" });
    if (!response.ok) return;
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return;
    const payload = await response.json();
    const rows = payload.rows || [];
    sheetFeedbackByName = {};
    rows.forEach((row) => {
      const key = normalizeSearch(row.providerName);
      if (!key) return;
      if (!sheetFeedbackByName[key]) sheetFeedbackByName[key] = [];
      sheetFeedbackByName[key].push(row);
    });
  } catch {
    // silently fail — sheet feedback is supplemental
  }
};

const buildSheetFeedbackMarkup = (feedbackRows) => {
  if (!feedbackRows || feedbackRows.length === 0) return "";
  const items = feedbackRows
    .map((row) => {
      const parts = [];
      if (row.rating) {
        parts.push(
          `<p><strong>Rating / 评分</strong><span>${escapeHtml(row.rating)} / 5</span></p>`,
        );
      }
      if (row.wouldUseAgain) {
        parts.push(
          `<p><strong>Would Use Again / 是否愿意再次使用</strong><span>${escapeHtml(
            formatBinaryChoiceLabel(row.wouldUseAgain),
          )}</span></p>`,
        );
      }
      const dateStr = row.timestamp
        ? (() => {
            try {
              return new Date(row.timestamp).toLocaleDateString();
            } catch {
              return row.timestamp;
            }
          })()
        : "";
      if (dateStr) {
        parts.push(`<p><strong>Date / 日期</strong><span>${escapeHtml(dateStr)}</span></p>`);
      }
      return `
        <div class="provider-feedback-summary">
          <p class="provider-feedback-summary-title">Service Feedback / 服务评价</p>
          ${parts.length ? `<div class="provider-meta request-feedback-meta">${parts.join("")}</div>` : ""}
          ${
            row.feedbackNote
              ? `<p class="secondary-copy request-feedback-note">${escapeHtml(row.feedbackNote)}</p>`
              : ""
          }
        </div>`;
    })
    .join("");
  return `<div class="sheet-feedback-list">${items}</div>`;
};

const loadProviders = async () => {
  try {
    const response = await fetch("/api/providers", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(
          response,
          "Provider data is not available in local static preview / 本地静态预览不提供服务提供者数据",
        ),
      );
    }

    if (!contentType.includes("application/json")) {
      throw new Error(
        "Provider data is not available in local static preview / 本地静态预览不提供服务提供者数据",
      );
    }

    const payload = await response.json();

    providerFeedbackMap = loadStoredProviderFeedback();
    allProviders = (payload.providers || []).map((provider) => ({
      ...provider,
      providerKey: buildProviderKey(provider),
      searchIndex: buildSearchIndex(provider),
    }));

    updateCategoryOptions(allProviders);
    rerenderProvidersView();
    // Load sheet feedback separately so providers display immediately,
    // then re-render once feedback rows arrive
    loadSheetFeedback().then(() => rerenderProvidersView());
  } catch (error) {
    statusNode.textContent = "Provider data is not available yet / 服务提供者数据暂不可用";
    emptyNode.hidden = false;
    gridNode.innerHTML = "";
    emptyNode.innerHTML = `
      <p class="primary-copy">Provider data could not be loaded right now / 目前暂时无法载入服务提供者资料。</p>
      <p class="secondary-copy" lang="zh-Hans">Please try again shortly / 请稍后再试。</p>
      <p class="secondary-copy providers-error-detail">${escapeHtml(error.message)}</p>
    `;
  }
};

const handleProviderFeedbackSubmit = async (event) => {
  event.preventDefault();

  const formData = new FormData(providerFeedbackFormNode);
  const providerName = normalizeValue(formData.get("providerName"));
  const providerKey = normalizeValue(formData.get("providerKey"));
  const existingEntryKey = normalizeValue(formData.get("entryKey"));
  const entryKey = existingEntryKey || providerKey || `manual:${Date.now()}`;

  if (!providerName) {
    providerFeedbackMessageNode.textContent = "Provider name is required / 请填写服务人员名称";
    return;
  }

  const nextFeedback = {
    entryKey,
    providerKey,
    providerName,
    providerListedStatus: normalizeListedStatus(formData.get("providerListedStatus")),
    serviceCategory: normalizeValue(formData.get("serviceCategory")),
    cityArea: normalizeValue(formData.get("cityArea")),
    phone: normalizeValue(formData.get("phone")),
    email: normalizeValue(formData.get("email")),
    wechat: normalizeValue(formData.get("wechat")),
    rating: normalizeValue(formData.get("rating")),
    wouldUseAgain: normalizeBinaryChoice(formData.get("wouldUseAgain")),
    recommendPublicListing: normalizeBinaryChoice(formData.get("recommendPublicListing")),
    feedbackNote: normalizeValue(formData.get("feedbackNote")),
    updatedAt: new Date().toISOString(),
  };

  try {
    providerFeedbackMessageNode.textContent =
      "Saving to Provider Feedback... / 正在保存到 Provider Feedback...";
    await postProviderFeedbackRecord(buildProviderFeedbackPayload(nextFeedback));
    deleteStoredProviderFeedbackEntry(entryKey);
    providerFeedbackMap[entryKey] = nextFeedback;
    rerenderProvidersView();
    providerFeedbackMessageNode.textContent =
      "Provider feedback saved to Provider Feedback / 服务评价已保存到 Provider Feedback";
    window.setTimeout(closeProviderFeedbackModal, 250);
  } catch (error) {
    providerFeedbackMap[entryKey] = nextFeedback;
    saveStoredProviderFeedback();
    rerenderProvidersView();
    providerFeedbackMessageNode.textContent = `${escapeHtml(
      error instanceof Error ? error.message : "Unable to save provider feedback online",
    )} / 已改为保存在当前浏览器`;
  }
};

searchNode.addEventListener("input", applyFilters);
categoryNode.addEventListener("change", applyFilters);
if (openFeedbackButtonNode) {
  openFeedbackButtonNode.addEventListener("click", () => {
    try {
      openStandaloneProviderFeedbackModal();
    } catch (err) {
      console.error("[provider-feedback] failed to open modal:", err);
    }
  });
} else {
  console.warn("[provider-feedback] #open-provider-feedback not found");
}
gridNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider-feedback]");
  if (!button) {
    return;
  }

  openProviderFeedbackModal(button.dataset.providerFeedback);
});

feedbackRecordsGridNode?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider-feedback-entry]");
  if (!button) {
    return;
  }

  openStandaloneProviderFeedbackModal(button.dataset.providerFeedbackEntry);
});

providerFeedbackFormNode?.addEventListener("submit", handleProviderFeedbackSubmit);

document.addEventListener("click", (event) => {
  const closeTrigger = event.target.closest("[data-close-provider-feedback='true']");
  if (closeTrigger) {
    closeProviderFeedbackModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && providerFeedbackModalNode && !providerFeedbackModalNode.hidden) {
    closeProviderFeedbackModal();
  }
});

loadProviders();
