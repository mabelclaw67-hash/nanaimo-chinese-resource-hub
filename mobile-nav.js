const headerNode = document.querySelector(".site-header");
const navToggleNode = document.querySelector(".nav-toggle");
const mobileNavNode = document.querySelector(".site-nav");

if (headerNode && navToggleNode && mobileNavNode) {
  const closeMenu = () => {
    headerNode.classList.remove("is-menu-open");
    navToggleNode.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    headerNode.classList.add("is-menu-open");
    navToggleNode.setAttribute("aria-expanded", "true");
  };

  navToggleNode.addEventListener("click", () => {
    if (headerNode.classList.contains("is-menu-open")) {
      closeMenu();
      return;
    }

    openMenu();
  });

  mobileNavNode.querySelectorAll("a").forEach((linkNode) => {
    linkNode.addEventListener("click", () => {
      closeMenu();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}
