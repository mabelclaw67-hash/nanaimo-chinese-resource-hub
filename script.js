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
  if (introNode && templates.label.english && templates.label.chinese) {
    introNode.innerHTML = "";
    introNode.append(
      createParagraph("primary-copy", templates.label.english),
      createParagraph("secondary-copy", templates.label.chinese, "zh-Hans"),
    );
  }

  const container = document.querySelector("#templates-content");
  if (!container || !templates.items.length) {
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
      : `<p class="template-link template-link-disabled">Google Sheet link coming soon</p>`;

    const chineseMarkup = hasRealLink
      ? ``
      : `<p class="secondary-copy" lang="zh-Hans">Google Sheet 链接稍后补充</p>`;

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
    setListFallback("#latest-requests-list", "#latest-requests-status", "No live data available");
    return;
  }

  statusNode.textContent = `Showing ${Math.min(requests.length, 5)} live request items.`;
  listNode.innerHTML = requests
    .slice(0, 5)
    .map(
      (request) => `
        <li class="dashboard-list-item">
          <div class="dashboard-list-row">
            <div>
              <p class="dashboard-list-title">${escapeHtml(request.serviceType || "Service Request")}</p>
              <p class="dashboard-list-meta">
                ${escapeHtml(request.area || "Nanaimo Area")} · ${escapeHtml(request.contactMethod || "Platform follow-up")}
              </p>
            </div>
            <span class="dashboard-list-badge">${escapeHtml(request.dateSubmitted || "Recent")}</span>
          </div>
          <p class="dashboard-list-description">${escapeHtml(truncateText(request.description || "No public description provided."))}</p>
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

  if (!datedProviders.length) {
    setListFallback("#latest-providers-list", "#latest-providers-status", "Live data not connected");
    return;
  }

  datedProviders.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
  statusNode.textContent = `Showing ${Math.min(datedProviders.length, 5)} live provider items.`;
  listNode.innerHTML = datedProviders
    .slice(0, 5)
    .map(
      (provider) => `
        <li class="dashboard-list-item">
          <div class="dashboard-list-row">
            <div>
              <p class="dashboard-list-title">${escapeHtml(provider.name || "Service Provider")}</p>
              <p class="dashboard-list-meta">
                ${escapeHtml(provider.category || "Category unavailable")} · ${escapeHtml(provider.city || "Nanaimo Area")}
              </p>
            </div>
            <span class="dashboard-list-badge">${escapeHtml(provider.displayDate)}</span>
          </div>
          <p class="dashboard-list-description">${escapeHtml(truncateText(provider.description || "No public description provided."))}</p>
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
    summaryNode.textContent = "No live data available.";
    return;
  }

  const parts = [];

  if (state.providersLive) {
    parts.push("Providers count is live");
  }

  if (state.requestsLive) {
    parts.push("Service requests are live");
  }

  if (!state.latestProvidersLive) {
    parts.push("latest provider ordering is not connected");
  }

  if (!state.submissionsLive) {
    parts.push("submission totals are not connected");
  }

  summaryNode.textContent = `${parts.join("; ")}.`;
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

  setMetricCard("#submissions-count", "#submissions-count-note", "--", "Live data not connected");

  const [providersResult, requestsResult] = await Promise.allSettled([
    fetchJson("/api/providers", "providers"),
    fetchJson("/api/service-requests", "requests"),
  ]);

  if (providersResult.status === "fulfilled") {
    const providers = providersResult.value;
    const categories = [...new Set(providers.map((provider) => String(provider.category ?? "").trim()).filter(Boolean))];

    state.providersLive = true;
    setMetricCard(
      "#providers-count",
      "#providers-count-note",
      String(providers.length),
      "Live data connected",
    );
    setMetricCard(
      "#categories-count",
      "#categories-count-note",
      String(categories.length),
      "Live data connected",
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
    renderLatestProviders(providers);
  } else {
    setMetricCard("#providers-count", "#providers-count-note", "--", "No live data available");
    setMetricCard("#categories-count", "#categories-count-note", "--", "No live data available");
    setListFallback("#latest-providers-list", "#latest-providers-status", "No live data available");
  }

  if (requestsResult.status === "fulfilled") {
    const requests = requestsResult.value;
    state.requestsLive = true;
    setMetricCard(
      "#requests-count",
      "#requests-count-note",
      String(requests.length),
      "Live data connected",
    );
    renderLatestRequests(requests);
  } else {
    setMetricCard("#requests-count", "#requests-count-note", "--", "No live data available");
    setListFallback("#latest-requests-list", "#latest-requests-status", "No live data available");
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
