const sectionNodes = document.querySelectorAll(".section");
const navLinks = document.querySelectorAll(".site-nav a");

const normalizeText = (text) => String(text ?? "").replace(/\r/g, "");

const nonEmptyLines = (text) =>
  normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const splitHeading = (line) => {
  const [english = "", chinese = ""] = line.split("|").map((part) => part.trim());
  return { english, chinese };
};

const setText = (selector, value) => {
  const node = document.querySelector(selector);
  if (node && value) {
    node.textContent = value;
  }
};

const createParagraph = (className, text, lang) => {
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = text;

  if (lang) {
    paragraph.lang = lang;
  }

  return paragraph;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const truncateText = (value, limit = 128) => {
  const text = String(value ?? "").trim();
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1).trimEnd()}...`;
};

const UI_TEXT = {
  loading: "Loading live data... / 正在读取实时数据...",
  loadingRequests: "Checking live requests... / 正在检查实时服务需求...",
  loadingProviders: "Checking live providers... / 正在检查实时服务提供者...",
  loadingTemplates: "Checking template data... / 正在检查模板数据...",
  liveConnected: "Live data connected / 实时数据已连接",
  liveNotConnected: "Live data not connected / 实时数据未连接",
  noLiveData: "No live data available / 暂无实时数据",
  templatesNotConnected: "Templates not connected yet / 模板数据暂未连接",
  sourceOrderOnly: "Source order shown; latest sorting unavailable / 按原始顺序显示，暂无法按最新排序",
  liveRequestsShown: "Showing live request items / 显示实时服务需求",
  liveProvidersShown: "Showing live provider items / 显示实时服务提供者",
  noDescription: "No public description provided. / 暂无公开说明",
  serviceRequest: "Service Request / 服务需求",
  serviceProvider: "Service Provider / 服务提供者",
  nanaimoArea: "Nanaimo Area / 纳奈莫地区",
  recent: "Recent / 最近",
  categoryUnavailable: "Category unavailable / 暂无分类",
  platformFollowUp: "Platform follow-up / 平台跟进",
};

const parseHomepage = (text) => {
  const lines = nonEmptyLines(text);
  const result = {
    titleEn: lines[0] || "",
    titleZh: lines[1] || "",
    intro: { headingEn: "", headingZh: "", bodyEn: "", bodyZh: "" },
    cards: [],
  };

  for (let index = 2; index < lines.length; index += 3) {
    const headingLine = lines[index];

    if (!headingLine || !headingLine.includes("|")) {
      continue;
    }

    const heading = splitHeading(headingLine);
    const bodyEn = lines[index + 1] || "";
    const bodyZh = lines[index + 2] || "";

    if (heading.english.toLowerCase() === "intro") {
      result.intro = { ...heading, bodyEn, bodyZh };
      continue;
    }

    result.cards.push({ ...heading, bodyEn, bodyZh });
  }

  return result;
};

const parseServices = (text) => {
  const lines = nonEmptyLines(text);
  const result = {
    titleEn: lines[0] || "",
    titleZh: lines[1] || "",
    sections: [],
  };

  let index = 2;

  while (index < lines.length) {
    const headingLine = lines[index];

    if (!headingLine.includes("|")) {
      index += 1;
      continue;
    }

    const heading = splitHeading(headingLine);
    index += 1;

    const pairs = [];
    while (index < lines.length && !lines[index].includes("|")) {
      const bodyEn = lines[index] || "";
      const bodyZh = lines[index + 1] || "";

      if (bodyEn) {
        pairs.push({ bodyEn, bodyZh });
      }

      index += 2;
    }

    result.sections.push({ ...heading, pairs });
  }

  return result;
};

const parseTemplates = (text) => {
  const lines = nonEmptyLines(text);
  const result = {
    titleEn: lines[0] || "",
    titleZh: lines[1] || "",
    label: splitHeading(lines[2] || ""),
    items: [],
  };

  for (let index = 3; index < lines.length; index += 4) {
    const titleEn = lines[index] || "";
    const titleZh = lines[index + 1] || "";
    const linkEn = lines[index + 2] || "";
    const linkZh = lines[index + 3] || "";

    if (!titleEn) {
      continue;
    }

    result.items.push({ titleEn, titleZh, linkEn, linkZh });
  }

  return result;
};

const extractLinkValue = (line) =>
  line.replace(/^Link:\s*/i, "").replace(/^链接[:：]\s*/i, "").trim();

const renderHomepage = (homepage) => {
  setText("#hero-title-en", homepage.titleEn);
  setText("#hero-title-zh", homepage.titleZh);

  const introNode = document.querySelector("#hero-intro");
  if (introNode && homepage.intro.bodyEn && homepage.intro.bodyZh) {
    introNode.innerHTML = "";
    introNode.append(
      createParagraph("primary-copy", homepage.intro.bodyEn),
      createParagraph("secondary-copy", homepage.intro.bodyZh, "zh-Hans"),
    );
  }
};

const renderServices = (services) => {
  setText("#services-title-en", services.titleEn);
  setText("#services-title-zh", services.titleZh);

  const container = document.querySelector("#services-content");
  if (!container || !services.sections.length) {
    return;
  }

  container.innerHTML = "";
  services.sections.forEach((section, index) => {
    const article = document.createElement("article");
    article.className = `service-card${index === 1 ? " service-card-accent" : ""}`;

    const stack = document.createElement("div");
    stack.className = "stack";

    section.pairs.forEach((pair) => {
      stack.append(
        createParagraph("primary-copy", pair.bodyEn),
        createParagraph("secondary-copy", pair.bodyZh, "zh-Hans"),
      );
    });

    article.innerHTML = `
      <div class="card-heading">
        <h3>${section.english}</h3>
        <p class="secondary-heading" lang="zh-Hans">${section.chinese}</p>
      </div>
    `;
    article.append(stack);
    container.append(article);
  });
};

const renderTemplates = (templates) => {
  setText("#templates-title-en", templates.titleEn);
  setText("#templates-title-zh", templates.titleZh);

  const introNode = document.querySelector(".template-intro");
  let statusNode = document.querySelector("#templates-data-status");

  if (introNode && templates.label.english && templates.label.chinese) {
    introNode.innerHTML = "";
    introNode.append(
      createParagraph("primary-copy", templates.label.english),
      createParagraph("secondary-copy", templates.label.chinese, "zh-Hans"),
    );

    statusNode = document.createElement("p");
    statusNode.className = "dashboard-panel-status";
    statusNode.id = "templates-data-status";
    introNode.append(statusNode);
  }

  const container = document.querySelector("#templates-content");

  if (statusNode) {
    statusNode.textContent = templates.items.length
      ? `${templates.items.length} live templates / ${templates.items.length} 个实时模板`
      : UI_TEXT.templatesNotConnected;
  }

  if (!container || !templates.items.length) {
    if (container) {
      container.innerHTML = `
        <article class="template-card">
          <h3>Templates not connected yet</h3>
          <p class="secondary-heading" lang="zh-Hans">模板数据暂未连接</p>
          <p class="secondary-copy">${UI_TEXT.templatesNotConnected}</p>
        </article>
      `;
    }
    return;
  }

  container.innerHTML = "";

  templates.items.forEach((item, index) => {
    const englishLinkValue = extractLinkValue(item.linkEn);
    const hasRealLink = /^https?:\/\//i.test(englishLinkValue);
    const card = document.createElement("article");
    card.className = "template-card";
    const cleanTitleEn = item.titleEn.replace(/^\d+\.\s*/, "");
    const bilingualLabel = `${cleanTitleEn} / ${item.titleZh}`;

    const linkMarkup = hasRealLink
      ? `<a class="template-link template-link-active" href="${englishLinkValue}" target="_blank" rel="noreferrer">${bilingualLabel}</a>`
      : `<p class="template-link template-link-disabled">${UI_TEXT.templatesNotConnected}</p>`;

    const chineseMarkup = hasRealLink
      ? ``
      : `<p class="secondary-copy" lang="zh-Hans">模板数据暂未连接</p>`;

    card.innerHTML = `
      <span class="template-index">${String(index + 1).padStart(2, "0")}</span>
      <h3>${cleanTitleEn}</h3>
      <p class="secondary-heading" lang="zh-Hans">${item.titleZh}</p>
      ${linkMarkup}
      ${chineseMarkup}
    `;

    container.append(card);
  });
};

const setMetricCard = (valueSelector, noteSelector, value, note) => {
  const valueNode = document.querySelector(valueSelector);
  const noteNode = document.querySelector(noteSelector);

  if (valueNode) {
    valueNode.textContent = value;
  }

  if (noteNode) {
    noteNode.textContent = note;
  }
};

const setListFallback = (listSelector, statusSelector, message) => {
  const listNode = document.querySelector(listSelector);
  const statusNode = document.querySelector(statusSelector);

  if (statusNode) {
    statusNode.textContent = message;
  }

  if (listNode) {
    listNode.innerHTML = `<li class="dashboard-list-empty">${escapeHtml(message)}</li>`;
  }
};

const splitCategoryTokens = (value) =>
  String(value ?? "")
    .split(/[;,，；]/)
    .map((part) => part.trim())
    .filter(Boolean);

const toBilingualContactMethod = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return UI_TEXT.platformFollowUp;
  }

  if (normalized.includes("wechat")) {
    return "WeChat / 微信";
  }

  if (normalized.includes("email")) {
    return "Email / 邮箱";
  }

  if (normalized.includes("text")) {
    return "Text Message / 短信";
  }

  if (normalized.includes("phone") || normalized.includes("call")) {
    return "Phone Call / 电话";
  }

  return `${value} / 联系方式`;
};

const parseDateValue = (value) => {
  const parsed = new Date(String(value ?? "").trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const fetchJson = async (url, emptyKey) => {
  const response = await fetch(url, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("No live data available");
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No live data available");
  }

  return payload[emptyKey] || [];
};

const renderLatestRequests = (requests) => {
  const listNode = document.querySelector("#latest-requests-list");
  const statusNode = document.querySelector("#latest-requests-status");

  if (!listNode || !statusNode) {
    return;
  }

  if (!requests.length) {
    setListFallback("#latest-requests-list", "#latest-requests-status", UI_TEXT.noLiveData);
    return;
  }

  const requestsWithDates = requests.filter((request) => parseDateValue(request.dateSubmitted));
  statusNode.textContent = requestsWithDates.length
    ? `${Math.min(requests.length, 5)} live request items / ${Math.min(requests.length, 5)} 条实时服务需求`
    : UI_TEXT.sourceOrderOnly;

  const sortedRequests = requestsWithDates.length
    ? [...requests].sort((left, right) => {
        const leftDate = parseDateValue(left.dateSubmitted);
        const rightDate = parseDateValue(right.dateSubmitted);
        if (!leftDate || !rightDate) {
          return 0;
        }
        return rightDate.getTime() - leftDate.getTime();
      })
    : requests;

  listNode.innerHTML = sortedRequests
    .slice(0, 5)
    .map(
      (request) => `
        <li class="dashboard-list-item">
          <div class="dashboard-list-row">
            <div>
              <p class="dashboard-list-title">${escapeHtml(request.serviceType || UI_TEXT.serviceRequest)}</p>
              <p class="dashboard-list-meta">
                ${escapeHtml(request.area || UI_TEXT.nanaimoArea)} · ${escapeHtml(toBilingualContactMethod(request.contactMethod))}
              </p>
            </div>
            <span class="dashboard-list-badge">${escapeHtml(request.dateSubmitted || UI_TEXT.recent)}</span>
          </div>
          <p class="dashboard-list-description">${escapeHtml(truncateText(request.description || UI_TEXT.noDescription))}</p>
        </li>
      `,
    )
    .join("");
};

const renderLatestProviders = (providers) => {
  const listNode = document.querySelector("#latest-providers-list");
  const statusNode = document.querySelector("#latest-providers-status");

  if (!listNode || !statusNode) {
    return;
  }

  const datedProviders = providers
    .map((provider) => {
      const dateValue =
        provider.timestamp ||
        provider.createdAt ||
        provider.updatedAt ||
        provider.submittedAt ||
        provider.dateSubmitted;

      return {
        ...provider,
        parsedDate: parseDateValue(dateValue),
        displayDate: String(dateValue ?? "").trim(),
      };
    })
    .filter((provider) => provider.parsedDate);

  const providersToShow = datedProviders.length
    ? [...datedProviders].sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime())
    : providers;

  if (!providersToShow.length) {
    setListFallback("#latest-providers-list", "#latest-providers-status", UI_TEXT.noLiveData);
    return;
  }

  statusNode.textContent = datedProviders.length
    ? `${Math.min(providersToShow.length, 5)} live provider items / ${Math.min(providersToShow.length, 5)} 条实时服务提供者`
    : UI_TEXT.sourceOrderOnly;

  listNode.innerHTML = providersToShow
    .slice(0, 5)
    .map(
      (provider) => `
        <li class="dashboard-list-item">
          <div class="dashboard-list-row">
            <div>
              <p class="dashboard-list-title">${escapeHtml(provider.name || UI_TEXT.serviceProvider)}</p>
              <p class="dashboard-list-meta">
                ${escapeHtml(provider.category || UI_TEXT.categoryUnavailable)} · ${escapeHtml(provider.city || UI_TEXT.nanaimoArea)}
              </p>
            </div>
            <span class="dashboard-list-badge">${escapeHtml(provider.displayDate || "Source Order / 原始顺序")}</span>
          </div>
          <p class="dashboard-list-description">${escapeHtml(truncateText(provider.description || UI_TEXT.noDescription))}</p>
        </li>
      `,
    )
    .join("");
};

const updateDashboardSummary = (state) => {
  const summaryNode = document.querySelector("#dashboard-live-status");
  if (!summaryNode) {
    return;
  }

  if (!state.providersLive && !state.requestsLive) {
    summaryNode.textContent = UI_TEXT.noLiveData;
    return;
  }

  const parts = [];

  if (state.providersLive) {
    parts.push("Providers live / 服务提供者已连接");
  }

  if (state.requestsLive) {
    parts.push("Requests live / 服务需求已连接");
  }

  if (!state.latestProvidersLive) {
    parts.push("provider latest sorting unavailable / 服务提供者暂无法按最新排序");
  }

  if (!state.submissionsLive) {
    parts.push("submissions not connected / 最新提交未连接");
  }

  summaryNode.textContent = parts.join(" ; ");
};

const loadDashboardData = async () => {
  const providersCountNode = document.querySelector("#providers-count");
  if (!providersCountNode) {
    return;
  }

  const state = {
    providersLive: false,
    requestsLive: false,
    latestProvidersLive: false,
    submissionsLive: false,
  };

  setMetricCard("#submissions-count", "#submissions-count-note", "--", UI_TEXT.liveNotConnected);

  const [providersResult, requestsResult] = await Promise.allSettled([
    fetchJson("/api/providers", "providers"),
    fetchJson("/api/service-requests", "requests"),
  ]);

  if (providersResult.status === "fulfilled") {
    const providers = providersResult.value;
    const categories = new Set(
      providers.flatMap((provider) => splitCategoryTokens(provider.category)).filter(Boolean),
    );

    state.providersLive = true;
    setMetricCard(
      "#providers-count",
      "#providers-count-note",
      String(providers.length),
      UI_TEXT.liveConnected,
    );

    const datedProviders = providers.filter(
      (provider) =>
        parseDateValue(
          provider.timestamp ||
            provider.createdAt ||
            provider.updatedAt ||
            provider.submittedAt ||
            provider.dateSubmitted,
        ),
    );

    state.latestProvidersLive = datedProviders.length > 0;
    state.providerCategories = categories;
    renderLatestProviders(providers);
  } else {
    setMetricCard("#providers-count", "#providers-count-note", "--", UI_TEXT.noLiveData);
    setListFallback("#latest-providers-list", "#latest-providers-status", UI_TEXT.noLiveData);
  }

  if (requestsResult.status === "fulfilled") {
    const requests = requestsResult.value;
    state.requestsLive = true;
    setMetricCard(
      "#requests-count",
      "#requests-count-note",
      String(requests.length),
      UI_TEXT.liveConnected,
    );
    state.requestCategories = new Set(
      requests.flatMap((request) => splitCategoryTokens(request.serviceType)).filter(Boolean),
    );
    renderLatestRequests(requests);
  } else {
    setMetricCard("#requests-count", "#requests-count-note", "--", UI_TEXT.noLiveData);
    setListFallback("#latest-requests-list", "#latest-requests-status", UI_TEXT.noLiveData);
  }

  const categoryCount = new Set([
    ...(state.providerCategories ? [...state.providerCategories] : []),
    ...(state.requestCategories ? [...state.requestCategories] : []),
  ]).size;

  if (categoryCount) {
    setMetricCard("#categories-count", "#categories-count-note", String(categoryCount), UI_TEXT.liveConnected);
  } else {
    setMetricCard("#categories-count", "#categories-count-note", "--", UI_TEXT.liveNotConnected);
  }

  updateDashboardSummary(state);
};

const loadContent = async () => {
  try {
    const [homepageText, servicesText, templatesText] = await Promise.all([
      fetch("./content/homepage.txt", { cache: "no-store" }).then((response) => response.text()),
      fetch("./content/services.txt", { cache: "no-store" }).then((response) => response.text()),
      fetch("./content/templates.txt", { cache: "no-store" }).then((response) => response.text()),
    ]);

    renderHomepage(parseHomepage(homepageText));
    renderServices(parseServices(servicesText));
    renderTemplates(parseTemplates(templatesText));
  } catch (error) {
    console.warn("Using built-in fallback content because the text files could not be loaded.", error);
    const statusNode = document.querySelector("#templates-data-status");
    if (statusNode) {
      statusNode.textContent = UI_TEXT.templatesNotConnected;
    }
  }
};

const observeSections = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.16,
    },
  );

  sectionNodes.forEach((section) => observer.observe(section));
};

const observeNavigation = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        navLinks.forEach((link) => {
          const isActive = link.getAttribute("href") === `#${entry.target.id}`;
          link.classList.toggle("is-active", isActive);
        });
      });
    },
    {
      rootMargin: "-45% 0px -45% 0px",
      threshold: 0,
    },
  );

  sectionNodes.forEach((section) => observer.observe(section));
};

loadContent();
loadDashboardData();
observeSections();
observeNavigation();
