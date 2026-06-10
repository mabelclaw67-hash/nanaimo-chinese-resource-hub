const adminGridNode = document.querySelector("#provider-admin-grid");
const adminEmptyNode = document.querySelector("#provider-admin-empty");
const adminStatusNode = document.querySelector("#provider-admin-status");
const adminSearchNode = document.querySelector("#provider-admin-search");
const adminModalNode = document.querySelector("#provider-admin-modal");
const adminFormNode = document.querySelector("#provider-admin-form");
const adminMessageNode = document.querySelector("#provider-admin-message");
const adminTitleNode = document.querySelector("#provider-admin-title");
const adminSubtitleNode = document.querySelector("#provider-admin-subtitle");

let allAdminProviders = [];

// ── Admin token (server-side gate) ────────────────────────────────────────────
// The real token lives only in the Netlify env var ADMIN_TOKEN. The admin types
// it once per browser session; it is never hardcoded in this file.
const ADMIN_TOKEN_STORAGE_KEY = "provider_admin_token";

const getAdminToken = () => {
  let token = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  if (!token) {
    token = String(window.prompt("Admin token / 管理员令牌:") || "").trim();
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    }
  }
  return token;
};

const clearAdminToken = () => sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);

const normalizeValue = (value) => String(value ?? "").trim();
const normalizeSearch = (value) => normalizeValue(value).toLowerCase();

const escapeHtml = (value) =>
  normalizeValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderLinkedText = (value) => {
  const text = normalizeValue(value);
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    return `<a class="detail-link" href="${escapeHtml(text)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`;
  }

  return escapeHtml(text);
};

const getApiErrorMessage = async (response, fallbackMessage) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      return payload.error || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  return fallbackMessage;
};

const renderAdminProviders = (providers) => {
  adminGridNode.innerHTML = "";

  providers.forEach((provider) => {
    const article = document.createElement("article");
    article.className = "provider-card provider-admin-card";
    article.innerHTML = `
      <div class="card-heading">
        <h2>${escapeHtml(provider.name)}</h2>
        <p class="secondary-heading" lang="zh-Hans">${escapeHtml(provider.category || "未分类")}</p>
      </div>
      <div class="provider-meta">
        <p><strong>Phone / 电话</strong><span>${escapeHtml(provider.phone || "Not provided / 未提供")}</span></p>
        <p><strong>Email / 邮箱</strong><span>${escapeHtml(provider.email || "Not provided / 未提供")}</span></p>
        <p><strong>Row / 行号</strong><span>${escapeHtml(provider.rowNumber)}</span></p>
      </div>
      <p class="primary-copy provider-description">${escapeHtml(
        provider.description || "No description provided / 暂无说明",
      )}</p>
      <div class="provider-admin-links">
        <p><strong>Business Card URL / 名片链接</strong></p>
        <p class="secondary-copy">${renderLinkedText(provider.businessCardUrl || "Not set / 尚未设置")}</p>
      </div>
      <div class="provider-card-actions">
        <button
          type="button"
          class="button button-primary provider-admin-edit-button"
          data-provider-admin-row="${escapeHtml(provider.rowNumber)}"
        >
          Edit Record / 编辑记录
        </button>
      </div>
    `;
    adminGridNode.append(article);
  });
};

const applyAdminFilters = () => {
  const query = normalizeSearch(adminSearchNode?.value || "");

  const filtered = allAdminProviders.filter((provider) =>
    [
      provider.name,
      provider.category,
      provider.phone,
      provider.email,
      provider.description,
      provider.businessCardUrl,
    ]
      .map(normalizeSearch)
      .join(" ")
      .includes(query),
  );

  renderAdminProviders(filtered);
  adminEmptyNode.hidden = filtered.length !== 0;
  adminStatusNode.textContent = query
    ? `${filtered.length} matching provider records / 已匹配 ${filtered.length} 条服务商记录`
    : `${filtered.length} provider records loaded / 已载入 ${filtered.length} 条服务商记录`;
};

const closeAdminModal = () => {
  if (!adminModalNode || !adminFormNode) {
    return;
  }

  adminModalNode.hidden = true;
  adminFormNode.reset();
  adminMessageNode.textContent = "";
  document.body.classList.remove("modal-open");
};

const fillAdminForm = (provider) => {
  adminFormNode.elements.rowNumber.value = provider.rowNumber || "";
  adminFormNode.elements.providerId.value = provider.providerId || "";
  adminFormNode.elements.name.value = provider.name || "";
  adminFormNode.elements.category.value = provider.category || "";
  adminFormNode.elements.phone.value = provider.phone || "";
  adminFormNode.elements.email.value = provider.email || "";
  adminFormNode.elements.description.value = provider.description || "";
  adminFormNode.elements.businessCardUrl.value = provider.businessCardUrl || "";
};

const openAdminModal = (rowNumber) => {
  const provider = allAdminProviders.find((entry) => String(entry.rowNumber) === String(rowNumber));
  if (!provider || !adminModalNode || !adminFormNode) {
    return;
  }

  fillAdminForm(provider);
  adminTitleNode.textContent = provider.name || "Edit Provider Record";
  adminSubtitleNode.textContent = provider.category || "编辑服务商记录";
  adminMessageNode.textContent =
    "Save will write back through the current provider Apps Script / 保存将通过当前 provider Apps Script 回写";
  adminModalNode.hidden = false;
  document.body.classList.add("modal-open");
};

const loadAdminProviders = async () => {
  try {
    const response = await fetch("/api/admin/providers", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(
          response,
          "Unable to load provider admin data / 当前无法载入服务商管理数据",
        ),
      );
    }

    const payload = await response.json();
    allAdminProviders = Array.isArray(payload.providers) ? payload.providers : [];
    applyAdminFilters();
  } catch (error) {
    adminStatusNode.innerHTML = `
      Unable to load provider admin data / 当前无法载入服务商管理数据
      <span class="providers-error-detail">${escapeHtml(error.message || "Unknown error")}</span>
    `;
  }
};

const saveAdminProvider = async (event) => {
  event.preventDefault();

  const formData = new FormData(adminFormNode);
  const payload = {
    rowNumber: Number(formData.get("rowNumber")),
    providerId: formData.get("providerId"),
    name: formData.get("name"),
    category: formData.get("category"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    description: formData.get("description"),
    businessCardUrl: formData.get("businessCardUrl"),
  };

  adminMessageNode.textContent = "Saving provider changes... / 正在保存服务商修改...";

  try {
    const response = await fetch("/api/admin/providers", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-admin-token": getAdminToken(),
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      // Wrong or expired token — forget it so the next save prompts again.
      clearAdminToken();
      throw new Error("Invalid admin token / 管理员令牌无效，请重试");
    }

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(
          response,
          "Unable to save provider changes / 当前无法保存服务商修改",
        ),
      );
    }

    const result = await response.json();
    const updatedProvider = result.provider || payload;
    allAdminProviders = allAdminProviders.map((provider) =>
      provider.rowNumber === updatedProvider.rowNumber ? { ...provider, ...updatedProvider } : provider,
    );
    applyAdminFilters();
    adminMessageNode.textContent = "Provider changes saved / 服务商修改已保存";
    window.setTimeout(closeAdminModal, 500);
  } catch (error) {
    adminMessageNode.textContent =
      error instanceof Error
        ? error.message
        : "Unable to save provider changes / 当前无法保存服务商修改";
  }
};

adminSearchNode?.addEventListener("input", applyAdminFilters);
adminGridNode?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider-admin-row]");
  if (!button) {
    return;
  }

  openAdminModal(button.getAttribute("data-provider-admin-row"));
});

document.addEventListener("click", (event) => {
  const closeTrigger = event.target.closest("[data-close-provider-admin='true']");
  if (closeTrigger) {
    closeAdminModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminModalNode && !adminModalNode.hidden) {
    closeAdminModal();
  }
});

adminFormNode?.addEventListener("submit", saveAdminProvider);

loadAdminProviders();
