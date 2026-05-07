const requestsGridNode = document.querySelector("#service-requests-grid");
const requestsEmptyNode = document.querySelector("#service-requests-empty");
const requestsStatusNode = document.querySelector("#service-requests-status");

let allRequests = [];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const normalizeRequestValue = (value) => String(value ?? "").trim();

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

const renderRequests = (requests) => {
  requestsGridNode.innerHTML = "";

  requests.forEach((request) => {
    const article = document.createElement("article");
    article.className = "provider-card";
    article.innerHTML = `
      <div class="card-heading">
        <h2>${escapeRequestHtml(request.serviceType)}</h2>
        <p class="secondary-heading" lang="zh-Hans">${escapeRequestHtml(request.area)}</p>
      </div>
      <div class="provider-meta">
        <p><strong>Type of Service Needed / 所需服务</strong><span>${escapeRequestHtml(request.serviceType)}</span></p>
        <p><strong>Area / Location / 地区位置</strong><span>${escapeRequestHtml(request.area || "General Nanaimo area / 纳奈莫地区")}</span></p>
        <p><strong>Preferred Contact Method / 联系方式</strong><span>${escapeRequestHtml(request.contactMethod || "Platform follow-up / 平台跟进")}</span></p>
        <p><strong>Date Submitted / 提交日期</strong><span>${escapeRequestHtml(request.dateSubmitted || "Recent / 最近")}</span></p>
        ${renderPublicContactRows(request)}
      </div>
      <p class="primary-copy provider-description">${renderLinkedRequestText(request.description || "No public description provided / 暂无公开说明")}</p>
    `;
    requestsGridNode.append(article);
  });
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

    allRequests = payload.requests || [];
    requestsEmptyNode.hidden = allRequests.length !== 0;
    renderRequests(allRequests);
    requestsStatusNode.textContent =
      allRequests.length === 1
        ? "1 open request found / 已显示 1 条公开需求"
        : `${allRequests.length} open requests found / 已显示 ${allRequests.length} 条公开需求`;
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

loadServiceRequests();
