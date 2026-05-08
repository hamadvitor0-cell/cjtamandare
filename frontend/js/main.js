import { workshops as fallbackWorkshops, categories as fallbackCategories, categoryColors, agenda, galleryItems as fallbackGalleryItems } from "./data.js";
import { apiRequest } from "./api.js";
import {
  createElement,
  debounce,
  getFormData,
  showToast,
  setFeedback,
  setupPhoneMasks
} from "./utils.js";
import { applyLogoPalette } from "./palette.js";

const state = {
  category: "Todas",
  search: "",
  workshops: [...fallbackWorkshops],
  categories: [...fallbackCategories],
  galleryItems: [...fallbackGalleryItems]
};

let revealObserver;

const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const recaptchaSiteKey = "6Lcw9t4sAAAAAPYyOHKlvCUTfbVUjMldHLUnjbND";

const dayNames = {
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
  domingo: "Domingo"
};

function formatDays(days = []) {
  return days.length ? days.map((day) => dayNames[day] || day).join(" e ") : "A definir";
}

function formatPeriod(period = "a definir") {
  const labels = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    noturno: "Noturno",
    integral: "Integral",
    "a definir": "A definir"
  };
  return labels[period] || period;
}

function observeReveal(root = document) {
  if (!revealObserver) return;
  root.querySelectorAll(".reveal:not([data-observed])").forEach((node) => {
    node.dataset.observed = "true";
    revealObserver.observe(node);
  });
}

function setupReveal() {
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  observeReveal();
}

function setupNavigation() {
  const button = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-menu]");
  const header = document.querySelector("[data-header]");

  button?.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    menu?.classList.toggle("is-open", !expanded);
  });

  menu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      button?.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
    });
  });

  document.addEventListener("scroll", () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 20);
  }, { passive: true });
}

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

function renderCategoryFilters() {
  const container = document.querySelector("[data-category-filters]");
  if (!container) return;
  container.replaceChildren();

  state.categories.forEach((category) => {
    const button = createElement("button", {
      text: category,
      attrs: {
        type: "button",
        "aria-pressed": String(state.category === category)
      }
    });
    button.addEventListener("click", () => {
      state.category = category;
      renderCategoryFilters();
      renderWorkshops();
    });
    container.append(button);
  });
}

function filteredWorkshops() {
  const query = state.search.toLowerCase();
  return state.workshops.filter((workshop) => {
    const matchesCategory = state.category === "Todas" || workshop.categoria === state.category;
    const matchesSearch = !query
      || workshop.nome.toLowerCase().includes(query)
      || workshop.categoria.toLowerCase().includes(query)
      || workshop.descricao.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
}

function renderWorkshops() {
  const grid = document.querySelector("[data-workshop-grid]");
  if (!grid) return;
  grid.replaceChildren();

  const items = filteredWorkshops();
  if (!items.length) {
    grid.append(createElement("p", {
      className: "form-feedback is-error",
      text: "Nenhuma oficina encontrada para o filtro informado."
    }));
    return;
  }

  items.forEach((workshop) => {
    const card = createElement("article", { className: "workshop-card reveal" });
    card.style.setProperty("--category-color", categoryColors[workshop.categoria] || "var(--color-primary)");

    const thumb = createElement("div", { className: "workshop-thumb" });
    const img = createElement("img", {
      attrs: {
        src: workshop.imagemUrl || "/img/oficinas.png",
        alt: `Imagem oficial das oficinas, usada no card de ${workshop.nome}`,
        loading: "lazy"
      }
    });
    const mark = createElement("span", {
      className: "category-mark",
      text: workshop.initials,
      attrs: { "aria-hidden": "true" }
    });
    thumb.append(img, mark);

    const content = createElement("div", { className: "workshop-content" });
    content.append(
      createElement("span", { className: "category-chip", text: workshop.categoria }),
      createElement("h3", { text: workshop.nome }),
      createElement("p", { text: workshop.descricao })
    );

    const meta = createElement("div", { className: "workshop-meta" });
    meta.append(
      createElement("span", { text: `Faixa etária: ${workshop.faixaEtaria}` }),
      createElement("span", { text: `Dias: ${formatDays(workshop.diasSemana)}` }),
      createElement("span", { text: `Período: ${formatPeriod(workshop.periodo)}` }),
      createElement("span", { text: `Horário: ${workshop.horario}` })
    );

    const detail = createElement("button", {
      className: "button button-secondary",
      text: "Detalhes",
      attrs: { type: "button" }
    });
    detail.addEventListener("click", () => openWorkshopDialog(workshop));

    const button = createElement("button", {
      className: "button button-primary",
      text: "Inscrever-se",
      attrs: { type: "button" }
    });
    button.addEventListener("click", () => {
      const select = document.querySelector("[data-office-select]");
      if (select) select.value = workshop.nome;
      document.querySelector("#inscricao")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const actions = createElement("div", { className: "card-actions" });
    actions.append(detail, button);
    content.append(meta, actions);
    card.append(thumb, content);
    grid.append(card);
  });

  observeReveal(grid);
}

function openWorkshopDialog(workshop) {
  const dialog = document.querySelector("[data-workshop-dialog]");
  const content = document.querySelector("[data-workshop-dialog-content]");
  if (!dialog || !content) return;
  content.replaceChildren();
  content.append(
    createElement("span", { className: "category-chip", text: workshop.categoria }),
    createElement("h2", { text: workshop.nome }),
    createElement("p", { text: workshop.descricao }),
    createElement("div", { className: "dialog-detail-grid" })
  );
  const grid = content.querySelector(".dialog-detail-grid");
  [
    ["Faixa etária", workshop.faixaEtaria],
    ["Dias", formatDays(workshop.diasSemana)],
    ["Período", formatPeriod(workshop.periodo)],
    ["Horário", workshop.horario]
  ].forEach(([label, value]) => {
    const item = createElement("div");
    item.append(createElement("strong", { text: label }), createElement("span", { text: value || "A definir" }));
    grid.append(item);
  });
  const signup = createElement("button", { className: "button button-primary", text: "Inscrever-se nesta oficina", attrs: { type: "button" } });
  signup.addEventListener("click", () => {
    const select = document.querySelector("[data-office-select]");
    if (select) select.value = workshop.nome;
    dialog.close();
    document.querySelector("#inscricao")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  content.append(signup);
  dialog.showModal();
}

function setupWorkshopDialog() {
  const dialog = document.querySelector("[data-workshop-dialog]");
  document.querySelector("[data-workshop-dialog-close]")?.addEventListener("click", () => dialog?.close());
}

function setupWorkshopSearch() {
  const input = document.querySelector("[data-workshop-search]");
  input?.addEventListener("input", debounce(() => {
    state.search = input.value.trim();
    renderWorkshops();
  }, 120));
}

function populateOfficeSelects() {
  document.querySelectorAll("[data-office-select], [data-edit-office-select], [data-admin-office-filter]").forEach((select) => {
    const current = select.value;
    const keepFirst = select.querySelector("option")?.value === "";
    const first = keepFirst ? select.querySelector("option").cloneNode(true) : null;
    select.replaceChildren();
    if (first) select.append(first);
    state.workshops.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.nome }
      }));
    });
    select.value = current;
  });
}

function renderAgenda() {
  const grid = document.querySelector("[data-agenda-grid]");
  if (!grid) return;
  grid.replaceChildren();

  agenda.forEach((day) => {
    const article = createElement("article", { className: "calendar-day" });
    article.style.setProperty("--day-color", day.color);
    article.append(createElement("strong", { text: day.dia }));

    const list = createElement("ul");
    day.eventos.forEach(([hora, texto]) => {
      const item = createElement("li");
      item.append(
        createElement("b", { text: hora }),
        createElement("span", { text: texto })
      );
      list.append(item);
    });

    article.append(list);
    grid.append(article);
  });
}

function renderGallery() {
  const grid = document.querySelector("[data-gallery-grid]");
  const lightbox = document.querySelector("[data-lightbox]");
  const image = document.querySelector("[data-lightbox-image]");
  const caption = document.querySelector("[data-lightbox-caption]");
  const close = document.querySelector("[data-lightbox-close]");
  if (!grid || !lightbox || !image || !caption) return;

  grid.replaceChildren();
  state.galleryItems.forEach((item) => {
    const button = createElement("button", {
      className: "gallery-item",
      attrs: { type: "button" }
    });
    button.append(
      createElement("img", {
        attrs: {
          src: item.src || item.imagemUrl,
          alt: item.alt || item.titulo,
          loading: "lazy"
        }
      }),
      createElement("span", { className: "gallery-caption", text: item.caption })
    );
    button.addEventListener("click", () => {
      image.src = item.src || item.imagemUrl;
      image.alt = item.alt || item.titulo;
      caption.textContent = item.caption || item.titulo;
      lightbox.hidden = false;
      close?.focus();
    });
    grid.append(button);
  });

  function closeLightbox() {
    lightbox.hidden = true;
    image.removeAttribute("src");
  }

  close?.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
  });
}

function validateSignup(data, files = []) {
  if (!data.nome || data.nome.trim().length < 3) return "Informe o nome completo.";
  const idade = Number(data.idade);
  if (!Number.isInteger(idade) || idade < 10 || idade > 99) return "Informe uma idade válida.";
  if (!/^[0-9()+\-\s]{10,20}$/.test(data.telefone || "")) return "Informe um telefone válido.";
  if (!data.oficina) return "Selecione uma oficina.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Informe um e-mail válido.";
  if (files.length > 8) return "Envie no máximo 8 documentos.";
  const invalidFile = files.find((file) => !allowedDocumentTypes.has(file.type) || file.size > 5 * 1024 * 1024);
  if (invalidFile) return "Os documentos devem ser PDF, JPG, PNG ou WEBP com até 5 MB por arquivo.";
  return "";
}

function getRecaptchaToken() {
  return new Promise((resolve, reject) => {
    if (!window.grecaptcha?.ready || !window.grecaptcha?.execute) {
      reject(new Error("reCAPTCHA indisponível. Recarregue a página e tente novamente."));
      return;
    }

    window.grecaptcha.ready(() => {
      window.grecaptcha
        .execute(recaptchaSiteKey, { action: "inscricao" })
        .then(resolve)
        .catch(() => reject(new Error("Não foi possível iniciar a verificação anti-robô.")));
    });
  });
}

function setupSignupForm() {
  const form = document.querySelector("[data-signup-form]");
  const feedback = document.querySelector("[data-form-feedback]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(feedback, "");

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const files = formData.getAll("documentos").filter((file) => file && file.name);
    const validation = validateSignup(data, files);
    if (validation) {
      setFeedback(feedback, validation, "error");
      return;
    }

    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    submit.textContent = "Enviando...";

    try {
      const token = await getRecaptchaToken();
      formData.set("g-recaptcha-response", token);
      await apiRequest("/inscricao", {
        method: "POST",
        body: formData
      });
      form.reset();
      setFeedback(feedback, "Inscrição enviada com sucesso. A equipe entrará em contato.", "success");
      showToast("Inscrição enviada com sucesso.", "success");
    } catch (error) {
      setFeedback(feedback, error.message, "error");
      showToast(error.message, "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar inscrição";
    }
  });
}

function setupVLibras() {
  window.addEventListener("load", () => {
    if (window.VLibras?.Widget) {
      new window.VLibras.Widget("https://vlibras.gov.br/app");
    }
  });
}

function setupYearAndStats() {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
  const stat = document.querySelector("[data-stat-oficinas]");
  if (stat) stat.textContent = String(state.workshops.length);
}

async function loadPublicContent() {
  try {
    const [oficinasData, galeriaData] = await Promise.all([
      apiRequest("/oficinas"),
      apiRequest("/galeria")
    ]);
    if (Array.isArray(oficinasData.oficinas) && oficinasData.oficinas.length) {
      state.workshops = oficinasData.oficinas;
      state.categories = oficinasData.categorias?.length
        ? oficinasData.categorias
        : ["Todas", ...Array.from(new Set(state.workshops.map((item) => item.categoria)))];
    }
    if (Array.isArray(galeriaData.galeria) && galeriaData.galeria.length) {
      state.galleryItems = galeriaData.galeria.map((item) => ({
        src: item.imagemUrl,
        alt: item.alt || item.titulo,
        caption: item.titulo
      }));
    }
  } catch (error) {
    console.warn("Conteúdo dinâmico indisponível. Usando dados locais.", error.message);
  }
}

async function init() {
  applyLogoPalette();
  setupTheme();
  setupNavigation();
  setupReveal();
  await loadPublicContent();
  renderCategoryFilters();
  setupWorkshopSearch();
  populateOfficeSelects();
  renderWorkshops();
  renderAgenda();
  renderGallery();
  setupWorkshopDialog();
  setupVLibras();
  setupPhoneMasks();
  setupSignupForm();
  setupYearAndStats();
}

init();
