const requestsGridNode = document.querySelector("#service-requests-grid");
const requestsEmptyNode = document.querySelector("#service-requests-empty");
const requestsStatusNode = document.querySelector("#service-requests-status");

let allRequests = [];

const normalizeRequestValue = (value) => String(value ?? "").trim();

const escapeRequestHtml = (value) =>
  normalizeRequestValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
      </div>
      <p class="primary-copy provider-description">${escapeRequestHtml(request.description || "No public description provided / 暂无公开说明")}</p>
    `;
    requestsGridNode.append(article);
  });
};

const loadServiceRequests = async () => {
  try {
    const response = await fetch("/api/service-requests", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load service request data.");
    }

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
