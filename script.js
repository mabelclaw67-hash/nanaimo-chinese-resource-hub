const sectionNodes = document.querySelectorAll(".section");
const navLinks = document.querySelectorAll(".site-nav a");

const normalizeText = (text) => text.replace(/\r/g, "");

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

  const cardsNode = document.querySelector("#homepage-cards");
  if (!cardsNode || !homepage.cards.length) {
    return;
  }

  cardsNode.innerHTML = "";
  homepage.cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "feature-card";
    article.innerHTML = `
      <h2>${card.english}</h2>
      <p class="secondary-heading" lang="zh-Hans">${card.chinese}</p>
      <p class="primary-copy">${card.bodyEn}</p>
      <p class="secondary-copy" lang="zh-Hans">${card.bodyZh}</p>
    `;
    cardsNode.append(article);
  });
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
observeSections();
observeNavigation();
