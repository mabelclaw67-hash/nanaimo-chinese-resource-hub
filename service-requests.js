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
        <p><strong>Type of Service Needed</strong><span>${escapeRequestHtml(request.serviceType)}</span></p>
        <p><strong>Area / Location</strong><span>${escapeRequestHtml(request.area || "General Nanaimo area")}</span></p>
        <p><strong>Preferred Contact Method</strong><span>${escapeRequestHtml(request.contactMethod || "Platform follow-up")}</span></p>
        <p><strong>Date Submitted</strong><span>${escapeRequestHtml(request.dateSubmitted || "Recent")}</span></p>
      </div>
      <p class="primary-copy provider-description">${escapeRequestHtml(request.description || "No public description provided.")}</p>
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
      allRequests.length === 1 ? "1 open request found." : `${allRequests.length} open requests found.`;
  } catch (error) {
    requestsStatusNode.textContent = "Service request data is not available yet.";
    requestsEmptyNode.hidden = false;
    requestsGridNode.innerHTML = "";
    requestsEmptyNode.innerHTML = `
      <p class="primary-copy">Service request data could not be loaded right now.</p>
      <p class="secondary-copy" lang="zh-Hans">目前暂时无法载入服务需求资料。</p>
      <p class="secondary-copy providers-error-detail">${escapeRequestHtml(error.message)}</p>
    `;
  }
};

loadServiceRequests();
