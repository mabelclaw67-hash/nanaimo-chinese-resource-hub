const gridNode = document.querySelector("#providers-grid");
const emptyNode = document.querySelector("#providers-empty");
const statusNode = document.querySelector("#providers-status");
const searchNode = document.querySelector("#provider-search");
const categoryNode = document.querySelector("#provider-category");

let allProviders = [];

const normalizeValue = (value) => String(value ?? "").trim();

const normalizeSearch = (value) => normalizeValue(value).toLowerCase();

const escapeHtml = (value) =>
  normalizeValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
        <p><strong>Service Category</strong><span>${escapeHtml(provider.category)}</span></p>
        <p><strong>City / Area</strong><span>${escapeHtml(provider.city)}</span></p>
        <p><strong>Phone</strong><span>${escapeHtml(provider.phone || "Not provided")}</span></p>
        <p><strong>${escapeHtml(provider.contactLabel)}</strong><span>${escapeHtml(provider.contactValue || "Not provided")}</span></p>
      </div>
      <p class="primary-copy provider-description">${escapeHtml(provider.description || "No description provided.")}</p>
    `;
    gridNode.append(article);
  });
};

const updateCategoryOptions = (providers) => {
  const currentValue = categoryNode.value;
  const categories = [...new Set(providers.map((provider) => provider.category).filter(Boolean))].sort();
  categoryNode.innerHTML = '<option value="">All categories</option>';

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
    filtered.length === 1 ? "1 approved provider found." : `${filtered.length} approved providers found.`;
};

const loadProviders = async () => {
  try {
    const response = await fetch("/api/providers", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load provider data.");
    }

    allProviders = (payload.providers || []).map((provider) => ({
      ...provider,
      searchIndex: buildSearchIndex(provider),
    }));

    updateCategoryOptions(allProviders);
    applyFilters();
  } catch (error) {
    statusNode.textContent = "Provider data is not available yet.";
    emptyNode.hidden = false;
    gridNode.innerHTML = "";
    emptyNode.innerHTML = `
      <p class="primary-copy">Provider data could not be loaded right now.</p>
      <p class="secondary-copy" lang="zh-Hans">目前暂时无法载入服务提供者资料。</p>
      <p class="secondary-copy providers-error-detail">${escapeHtml(error.message)}</p>
    `;
  }
};

searchNode.addEventListener("input", applyFilters);
categoryNode.addEventListener("change", applyFilters);

loadProviders();
