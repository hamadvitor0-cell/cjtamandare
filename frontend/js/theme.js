(() => {
  const root = document.documentElement;
  root.classList.add("js");

  function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    root.dataset.theme = nextTheme;
    localStorage.setItem("cj-theme", nextTheme);

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", nextTheme === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
      button.setAttribute("aria-pressed", String(nextTheme === "dark"));
      const icon = button.querySelector("[aria-hidden='true']");
      if (icon) icon.textContent = nextTheme === "dark" ? "\u2600" : "\u25d0";
    });
  }

  function initialTheme() {
    const saved = localStorage.getItem("cj-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function bindThemeButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.dataset.themeReady = "true";
    });
  }

  applyTheme(initialTheme());
  bindThemeButtons();

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-theme-toggle]");
    if (!button) return;
    event.preventDefault();
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  window.addEventListener("DOMContentLoaded", () => {
    applyTheme(root.dataset.theme);
    bindThemeButtons();
  });
})();
