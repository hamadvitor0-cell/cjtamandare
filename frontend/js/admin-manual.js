import { apiRequest } from "./api.js";
import { applyLogoPalette } from "./palette.js";

function setupTheme() {
  const button = document.querySelector("[data-theme-toggle]");
  const saved = localStorage.getItem("cj-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const initial = saved || (prefersDark ? "dark" : "light");

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cj-theme", theme);
    button?.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
    button?.setAttribute("aria-pressed", String(theme === "dark"));
    const icon = button?.querySelector("[aria-hidden='true']");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "◐";
  }

  apply(initial);
  button?.addEventListener("click", () => {
    apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}

async function guardAdminManual() {
  try {
    await apiRequest("/auth/me");
    document.querySelector("[data-manual-content]").hidden = false;
  } catch (error) {
    window.location.href = "/admin.html";
  }
}

applyLogoPalette();
setupTheme();
guardAdminManual();
