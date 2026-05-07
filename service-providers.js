const gridNode = document.querySelector("#providers-grid");
const emptyNode = document.querySelector("#providers-empty");
const statusNode = document.querySelector("#providers-status");
const searchNode = document.querySelector("#provider-search");
const categoryNode = document.querySelector("#provider-category");

let allProviders = [];

const normalizeValue = (value) => String(value ?? "").trim();

const normalizeSearch = (value) => normalizeValue(value).toLowerCase();

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/;

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

const buildSearchIndex = (provider) =>
  [
    provider.name,
    provider.category,
    provider.city,
    provider.phone,
    provider.contactValue,
    provider.contactLabel,
    provider.description,
  ]
    .map(normalizeSearch)
    .join(" ");

const renderProviders = (providers) => {
  gridNode.innerHTML = "";

  providers.forEach((provider) => {
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
        <p><strong>Phone / 电话</strong><span>${renderContactValue(provider.phone, "phone")}</span></p>
        <p><strong>${escapeHtml(provider.contactLabel)}</strong><span>${renderContactValue(provider.contactValue, provider.contactLabel)}</span></p>
      </div>
      <p class="primary-copy provider-description">${renderLinkedText(provider.description || "No description provided / 暂无说明")}</p>
    `;
    gridNode.append(article);
  });
};

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

    allProviders = (payload.providers || []).map((provider) => ({
      ...provider,
      searchIndex: buildSearchIndex(provider),
    }));

    updateCategoryOptions(allProviders);
    applyFilters();
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

searchNode.addEventListener("input", applyFilters);
categoryNode.addEventListener("change", applyFilters);

loadProviders();
