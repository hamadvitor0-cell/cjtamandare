import { workshops as fallbackWorkshops, categories as fallbackCategories, categoryColors, agenda, galleryItems as fallbackGalleryItems, collaborators as fallbackCollaborators, testimonials as fallbackTestimonials } from "./data.js?v=20260510-5";
import { apiRequest } from "./api.js?v=20260509-2";
import {
  createElement,
  debounce,
  getFormData,
  isValidCpf,
  maskCpfValue,
  normalizeCpf,
  showToast,
  setFeedback,
  setupCpfMasks,
  setupPhoneMasks
} from "./utils.js";
import { applyLogoPalette } from "./palette.js";

const state = {
  category: "Todas",
  search: "",
  showAllWorkshops: false,
  aiMessages: [],
  workshops: [...fallbackWorkshops],
  categories: [...fallbackCategories],
  galleryItems: [...fallbackGalleryItems],
  collaborators: [...fallbackCollaborators],
  testimonials: [...fallbackTestimonials]
};

let revealObserver;
const initialWorkshopRatio = 0.3;

const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const captchaState = {
  loaded: false,
  solved: false,
  token: "",
  target: 0,
  y: 48,
  max: 1000,
  tolerance: 42,
  pieceSize: 46,
  moves: 0
};

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

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function workshopPath(workshop) {
  return `/oficina/${slugify(workshop.nome)}`;
}

function workshopStatus(workshop) {
  if (workshop.situacaoVagas === "lista_espera") {
    return { label: "Lista de espera", className: "workshop-status is-waitlist" };
  }
  if (workshop.situacaoVagas === "poucas_vagas") {
    return { label: `Poucas vagas (${workshop.vagasDisponiveis})`, className: "workshop-status" };
  }
  if (Number(workshop.vagasDisponiveis) <= 0 && Number(workshop.capacidade) > 0) {
    return { label: "Turma cheia", className: "workshop-status is-full" };
  }
  return {
    label: `Vagas abertas${workshop.vagasDisponiveis !== undefined ? ` (${workshop.vagasDisponiveis})` : ""}`,
    className: "workshop-status"
  };
}

function selectWorkshopForSignup(workshop) {
  const select = document.querySelector("[data-office-select]");
  if (!select) return;
  Array.from(select.options).forEach((option) => {
    option.selected = option.value === workshop.nome;
  });
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
      state.showAllWorkshops = false;
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
  const canCollapse = state.category === "Todas" && !state.search;
  const initialCount = Math.max(1, Math.ceil(items.length * initialWorkshopRatio));
  const visibleItems = canCollapse && !state.showAllWorkshops ? items.slice(0, initialCount) : items;
  if (!items.length) {
    grid.append(createElement("p", {
      className: "form-feedback is-error",
      text: "Nenhuma oficina encontrada para o filtro informado."
    }));
    renderWorkshopMore(0, 0, false);
    return;
  }

  visibleItems.forEach((workshop) => {
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
    const status = workshopStatus(workshop);
    content.append(
      createElement("span", { className: "category-chip", text: workshop.categoria }),
      createElement("span", { className: status.className, text: status.label }),
      createElement("h3", { text: workshop.nome }),
      createElement("p", { text: workshop.descricao })
    );

    const meta = createElement("div", { className: "workshop-meta" });
    meta.append(
      createElement("span", { text: `Faixa etária: ${workshop.faixaEtaria}` }),
      createElement("span", { text: `Dias: ${formatDays(workshop.diasSemana)}` }),
      createElement("span", { text: `Período: ${formatPeriod(workshop.periodo)}` }),
      createElement("span", { text: `Horário: ${workshop.horario}` }),
      createElement("span", { text: `Vagas: ${workshop.capacidade || 30}` })
    );

    const detail = createElement("a", {
      className: "button button-secondary",
      text: "Detalhes",
      attrs: { href: workshopPath(workshop) }
    });
    detail.addEventListener("click", (event) => {
      event.preventDefault();
      openWorkshopPage(workshop, true);
    });

    const button = createElement("button", {
      className: "button button-primary",
      text: "Inscrever-se",
      attrs: { type: "button" }
    });
    button.addEventListener("click", () => {
      selectWorkshopForSignup(workshop);
      document.querySelector("#inscrição")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const actions = createElement("div", { className: "card-actions" });
    actions.append(detail, button);
    content.append(meta, actions);
    card.append(thumb, content);
    grid.append(card);
  });

  renderWorkshopMore(items.length, initialCount, canCollapse);
  observeReveal(grid);
}

function renderWorkshopMore(total, initialCount, canCollapse) {
  const container = document.querySelector("[data-workshop-more]");
  if (!container) return;
  container.replaceChildren();

  if (!canCollapse || total <= initialCount) return;

  const button = createElement("button", {
    className: "button button-secondary workshop-more-button",
    text: state.showAllWorkshops ? "Ver menos oficinas" : `Ver todas as oficinas (${total})`,
    attrs: {
      type: "button",
      "aria-expanded": String(state.showAllWorkshops),
      "aria-controls": "oficinas-lista"
    }
  });
  button.addEventListener("click", () => {
    state.showAllWorkshops = !state.showAllWorkshops;
    renderWorkshops();
    if (!state.showAllWorkshops) {
      document.querySelector("#oficinas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  container.append(button);
}

function findWorkshopBySlug(slug) {
  return state.workshops.find((workshop) => slugify(workshop.nome) === slug);
}

function renderWorkshopPage(workshop) {
  const section = document.querySelector("[data-workshop-page]");
  const content = document.querySelector("[data-workshop-page-content]");
  if (!section || !content) return;
  const status = workshopStatus(workshop);
  section.hidden = false;
  content.replaceChildren();

  const card = createElement("article", { className: "workshop-page-card reveal" });
  const details = createElement("div", { className: "dialog-detail-grid" });
  [
    ["Categoria", workshop.categoria],
    ["Faixa etaria", workshop.faixaEtaria],
    ["Dias", formatDays(workshop.diasSemana)],
    ["Periodo", formatPeriod(workshop.periodo)],
    ["Horario", workshop.horario],
    ["Vagas", status.label],
    ["Documentos", "RG, CPF, comprovante e declaracao escolar quando for menor de idade"]
  ].forEach(([label, value]) => {
    const item = createElement("div");
    item.append(createElement("strong", { text: label }), createElement("span", { text: value || "A definir" }));
    details.append(item);
  });

  const actions = createElement("div", { className: "workshop-page-actions" });
  const signup = createElement("button", { className: "button button-primary", text: "Inscrever-se", attrs: { type: "button" } });
  signup.addEventListener("click", () => {
    selectWorkshopForSignup(workshop);
    document.querySelector("#inscrição")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const back = createElement("button", { className: "button button-secondary", text: "Ver outras oficinas", attrs: { type: "button" } });
  back.addEventListener("click", () => {
    history.pushState(null, "", "/#oficinas");
    section.hidden = true;
    document.querySelector("#oficinas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  actions.append(signup, back);

  card.append(
    createElement("span", { className: "category-chip", text: workshop.categoria }),
    createElement("span", { className: status.className, text: status.label }),
    createElement("h2", { text: workshop.nome }),
    createElement("p", { text: workshop.descricao }),
    details,
    actions
  );
  content.append(card);
  observeReveal(section);
}

function openWorkshopPage(workshop, push = false) {
  if (!workshop) return;
  if (push) history.pushState(null, "", workshopPath(workshop));
  renderWorkshopPage(workshop);
  document.querySelector("[data-workshop-page]")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupWorkshopRoutes() {
  const section = document.querySelector("[data-workshop-page]");

  function syncRoute() {
    const match = window.location.pathname.match(/^\/oficina\/([^/]+)$/);
    if (!match) {
      if (section) section.hidden = true;
      return;
    }
    const workshop = findWorkshopBySlug(match[1]);
    if (workshop) {
      renderWorkshopPage(workshop);
    }
  }

  syncRoute();
  window.addEventListener("popstate", syncRoute);
}

function openWorkshopDialog(workshop) {
  const dialog = document.querySelector("[data-workshop-dialog]");
  const content = document.querySelector("[data-workshop-dialog-content]");
  if (!dialog || !content) return;
  const status = workshopStatus(workshop);
  content.replaceChildren();
  content.append(
    createElement("span", { className: "category-chip", text: workshop.categoria }),
    createElement("span", { className: status.className, text: status.label }),
    createElement("h2", { text: workshop.nome }),
    createElement("p", { text: workshop.descricao }),
    createElement("div", { className: "dialog-detail-grid" })
  );
  const grid = content.querySelector(".dialog-detail-grid");
  [
    ["Faixa etária", workshop.faixaEtaria],
    ["Dias", formatDays(workshop.diasSemana)],
    ["Período", formatPeriod(workshop.periodo)],
    ["Horário", workshop.horario],
    ["Vagas", String(workshop.capacidade || 30)],
    ["Situacao", status.label],
    ["Documentos", "RG, CPF, comprovante e declaracao escolar quando for menor de idade"]
  ].forEach(([label, value]) => {
    const item = createElement("div");
    item.append(createElement("strong", { text: label }), createElement("span", { text: value || "A definir" }));
    grid.append(item);
  });
  const signup = createElement("button", { className: "button button-primary", text: "Inscrever-se nesta oficina", attrs: { type: "button" } });
  signup.addEventListener("click", () => {
    selectWorkshopForSignup(workshop);
    dialog.close();
    document.querySelector("#inscrição")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    state.showAllWorkshops = false;
    renderWorkshops();
  }, 120));
}

function populateOfficeSelects() {
  document.querySelectorAll("[data-office-select], [data-edit-office-select], [data-admin-office-filter]").forEach((select) => {
    const current = select.multiple
      ? Array.from(select.selectedOptions).map((option) => option.value)
      : select.value;
    const keepFirst = !select.multiple && select.querySelector("option")?.value === "";
    const first = keepFirst ? select.querySelector("option").cloneNode(true) : null;
    select.replaceChildren();
    if (first) select.append(first);
    state.workshops.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.nome }
      }));
    });
    if (select.multiple) {
      Array.from(select.options).forEach((option) => {
        option.selected = current.includes(option.value);
      });
    } else {
      select.value = current;
    }
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

function initialsFromName(name) {
  return String(name || "CJ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderCollaborators() {
  const grid = document.querySelector("[data-collaborators-grid]");
  if (!grid) return;
  grid.replaceChildren();

  state.collaborators
    .slice()
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .forEach((item) => {
      const card = createElement("article", { className: "collaborator-card" });
      const media = createElement("div", { className: "collaborator-media" });

      if (item.imagemUrl) {
        media.append(createElement("img", {
          attrs: {
            src: item.imagemUrl,
            alt: item.alt || item.nome,
            loading: "lazy"
          }
        }));
      } else {
        media.append(createElement("span", {
          className: "collaborator-mark",
          text: initialsFromName(item.nome),
          attrs: { "aria-hidden": "true" }
        }));
      }

      const content = createElement("div", { className: "collaborator-content" });
      content.append(
        createElement("h3", { text: item.nome }),
        createElement("p", { text: item.descricao })
      );

      if (item.siteUrl) {
        content.append(createElement("a", {
          className: "button button-secondary",
          text: "Site oficial",
          attrs: {
            href: item.siteUrl,
            target: "_blank",
            rel: "noopener noreferrer"
          }
        }));
      }

      card.append(media, content);
      grid.append(card);
    });
}

function renderTestimonials() {
  const grid = document.querySelector("[data-testimonials-grid]");
  if (!grid) return;
  grid.replaceChildren();

  state.testimonials
    .slice()
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .forEach((item) => {
      const card = createElement("article", { className: "testimonial-card" });
      const author = createElement("div", { className: "testimonial-author" });
      author.append(
        createElement("strong", { text: item.nome }),
        createElement("span", { text: [item.vinculo, item.oficina].filter(Boolean).join(" · ") || "Participante do CJ" })
      );
      card.append(
        createElement("p", { className: "testimonial-text", text: `“${item.texto}”` }),
        author
      );
      grid.append(card);
    });
}

function validateSignup(data, files = []) {
  if (!data.nome || data.nome.trim().length < 3) return "Informe o nome completo.";
  if (!isValidCpf(data.cpf)) return "Informe um CPF válido.";
  const idade = Number(data.idade);
  if (!Number.isInteger(idade) || idade < 10 || idade > 99) return "Informe uma idade válida.";
  if (!/^[0-9()+\-\s]{10,20}$/.test(data.telefone || "")) return "Informe um telefone válido.";
  if (!data.oficinas?.length) return "Selecione pelo menos uma oficina.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Informe um e-mail válido.";
  if (files.length > 8) return "Envie no máximo 8 documentos.";
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > 16 * 1024 * 1024) return "O envio completo deve ter no máximo 16 MB.";
  const invalidFile = files.find((file) => !allowedDocumentTypes.has(file.type) || file.size > 5 * 1024 * 1024);
  if (invalidFile) return "Os documentos devem ser PDF, JPG, PNG ou WEBP com até 5 MB por arquivo.";
  if (!captchaState.loaded) return "Aguarde o carregamento do puzzle anti-robô.";
  if (!captchaState.solved) return "Arraste a peça até encaixar no puzzle anti-robô.";
  return "";
}

function setCaptchaStatus(message, type = "") {
  const status = document.querySelector("[data-captcha-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("is-success", "is-error");
  if (type) status.classList.add(`is-${type}`);
}

function setCaptchaHiddenFields() {
  const token = document.querySelector("[data-captcha-token]");
  const x = document.querySelector("[data-captcha-x]");
  const moves = document.querySelector("[data-captcha-moves]");
  if (token) token.value = captchaState.token;
  if (x) x.value = document.querySelector("[data-captcha-slider]")?.value || "";
  if (moves) moves.value = String(captchaState.moves);
}

function positionPuzzle() {
  const board = document.querySelector("[data-puzzle-board]");
  const slot = document.querySelector("[data-puzzle-slot]");
  const piece = document.querySelector("[data-puzzle-piece]");
  const slider = document.querySelector("[data-captcha-slider]");
  if (!board || !slot || !piece || !slider) return;

  const boardWidth = board.clientWidth || 320;
  const pieceSize = captchaState.pieceSize;
  const maxLeft = Math.max(boardWidth - pieceSize, 1);
  const current = Number(slider.value || 0);
  const pieceLeft = (current / captchaState.max) * maxLeft;
  const targetLeft = (captchaState.target / captchaState.max) * maxLeft;

  [slot, piece].forEach((node) => {
    node.style.width = `${pieceSize}px`;
    node.style.height = `${pieceSize}px`;
    node.style.top = `${captchaState.y}px`;
  });
  slot.style.left = `${targetLeft}px`;
  piece.style.left = `${pieceLeft}px`;
  piece.style.setProperty("--piece-offset", `${pieceLeft}px`);
}

function updatePuzzlePosition(countMove = true) {
  const slider = document.querySelector("[data-captcha-slider]");
  const puzzle = document.querySelector("[data-captcha]");
  if (!slider || !captchaState.loaded) return;

  if (countMove) captchaState.moves += 1;

  const current = Number(slider.value || 0);
  const isSolved = Math.abs(current - captchaState.target) <= captchaState.tolerance;
  captchaState.solved = isSolved;
  puzzle?.classList.toggle("is-solved", isSolved);

  if (isSolved) {
    slider.value = String(captchaState.target);
    setCaptchaStatus("Puzzle encaixado. Pode enviar a inscrição.", "success");
  } else {
    setCaptchaStatus("Arraste a peça até alinhar com o encaixe.", "");
  }

  setCaptchaHiddenFields();
  positionPuzzle();
}

async function loadPuzzleCaptcha() {
  const slider = document.querySelector("[data-captcha-slider]");
  const puzzle = document.querySelector("[data-captcha]");
  if (!slider || !puzzle) return;

  captchaState.loaded = false;
  captchaState.solved = false;
  captchaState.token = "";
  captchaState.moves = 0;
  slider.value = "0";
  slider.disabled = true;
  puzzle.classList.remove("is-solved");
  setCaptchaStatus("Carregando puzzle anti-robô...");
  setCaptchaHiddenFields();

  try {
    const data = await apiRequest("/captcha/challenge", { timeout: 8000 });
    const challenge = data.captcha || {};
    captchaState.loaded = true;
    captchaState.token = challenge.token;
    captchaState.target = Number(challenge.target || 0);
    captchaState.y = Number(challenge.y || 48);
    captchaState.max = Number(challenge.max || 1000);
    captchaState.tolerance = Number(challenge.tolerance || 42);
    captchaState.pieceSize = Number(challenge.pieceSize || 46);
    slider.max = String(captchaState.max);
    slider.disabled = false;
    setCaptchaStatus("Arraste a peça até encaixar no espaço marcado.");
    setCaptchaHiddenFields();
    positionPuzzle();
  } catch (error) {
    setCaptchaStatus("Não foi possível carregar o puzzle. Tente atualizar.", "error");
  }
}

async function setupPuzzleCaptcha() {
  const slider = document.querySelector("[data-captcha-slider]");
  const refresh = document.querySelector("[data-captcha-refresh]");
  if (!slider) return;

  slider.addEventListener("input", () => updatePuzzlePosition(true));
  refresh?.addEventListener("click", () => loadPuzzleCaptcha());
  window.addEventListener("resize", debounce(positionPuzzle, 120), { passive: true });
  await loadPuzzleCaptcha();
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
    data.oficinas = formData.getAll("oficina").filter(Boolean);
    const files = formData.getAll("documentos").filter((file) => file && file.name);
    const validation = validateSignup(data, files);
    if (validation) {
      setFeedback(feedback, validation, "error");
      showToast(validation, "error");
      return;
    }

    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    submit.textContent = "Enviando...";

    try {
      setCaptchaHiddenFields();
      formData.delete("oficinas");
      data.oficinas.forEach((oficina) => formData.append("oficinas", oficina));
      formData.set("oficina", data.oficinas[0] || "");
      formData.set("captchaToken", captchaState.token);
      formData.set("captchaX", document.querySelector("[data-captcha-slider]")?.value || "");
      formData.set("captchaMoves", String(captchaState.moves));
      const result = await apiRequest("/inscrição", {
        method: "POST",
        body: formData
      });
      const listaEspera = result.inscrição?.listaEspera || [];
      const message = listaEspera.length
        ? `Inscrição recebida. ${listaEspera.join(", ")} ficou em lista de espera; a equipe entrará em contato.`
        : "Inscrição enviada com sucesso. A equipe entrará em contato.";
      form.reset();
      await loadPuzzleCaptcha();
      setFeedback(feedback, message, "success");
      showToast(message, "success");
    } catch (error) {
      setFeedback(feedback, error.message, "error");
      showToast(error.message, "error");
      if (error.status === 403) {
        await loadPuzzleCaptcha();
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar inscrição";
    }
  });
}

function formatStatusDate(value) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function renderStatusLookup(status) {
  const result = document.querySelector("[data-status-result]");
  if (!result) return;
  result.replaceChildren();

  if (!status?.encontrado) {
    result.append(createElement("p", {
      className: "form-feedback is-error",
      text: status?.message || "Nenhuma inscrição encontrada para este CPF."
    }));
    return;
  }

  const card = createElement("article", { className: "status-card" });
  const header = createElement("header");
  const badgeClass = status.situacao === "Lista de espera" ? "status-badge is-waitlist" : "status-badge";
  header.append(
    createElement("h3", { text: `${status.nomeParcial || "Inscrição"} - ${maskCpfValue(status.cpf || "")}` }),
    createElement("span", { className: badgeClass, text: status.situacao })
  );

  const list = createElement("ul", { className: "status-list" });
  (status.oficinas || []).forEach((office) => {
    const item = createElement("li");
    item.append(
      createElement("strong", { text: office.oficina }),
      createElement("span", { text: `${office.situacao} - ${formatStatusDate(office.dataInscrição)}` })
    );
    list.append(item);
  });

  card.append(
    header,
    list,
    createElement("p", { text: status.documentos }),
    createElement("p", { text: `Faltas nos últimos 30 dias: ${Number(status.frequencia?.faltasUltimos30Dias || 0)}` }),
    createElement("p", { text: `Última atualização: ${formatStatusDate(status.ultimaAtualizacao || status.dataInscrição)}` })
  );
  const aulas = status.frequencia?.aulasUltimos30Dias || [];
  if (aulas.length) {
    const calls = createElement("ul", { className: "status-list status-attendance-list" });
    aulas.slice(0, 6).forEach((call) => {
      const item = createElement("li");
      item.append(
        createElement("strong", { text: `${formatStatusDate(call.data)} - ${call.oficina || "Oficina"}` }),
        createElement("span", { text: `Status: ${call.status || "-"}` })
      );
      calls.append(item);
    });
    card.append(createElement("p", { className: "status-section-title", text: "Aulas registradas nos últimos 30 dias" }), calls);
  }
  result.append(card);
}

function setupStatusLookup() {
  const form = document.querySelector("[data-status-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = document.querySelector("[data-status-result]");
    const cpf = normalizeCpf(form.elements.cpf?.value || "");
    if (!isValidCpf(cpf)) {
      renderStatusLookup({ encontrado: false, message: "Informe um CPF válido." });
      return;
    }

    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    if (result) result.replaceChildren(createElement("p", { className: "form-feedback", text: "Consultando inscrição..." }));
    try {
      const data = await apiRequest("/inscricoes/status", {
        method: "POST",
        body: { cpf }
      });
      renderStatusLookup(data.status);
    } catch (error) {
      renderStatusLookup({ encontrado: false, message: error.message });
    } finally {
      button.disabled = false;
    }
  });
}

function appendAiMessageContent(node, content) {
  const lines = String(content || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    node.append(createElement("p", { text: "" }));
    return;
  }

  let list = null;
  lines.forEach((line) => {
    const bullet = line.match(/^[•*-]\s+(.+)$/);
    if (bullet) {
      if (!list) {
        list = createElement("ul", { className: "ai-message-list" });
        node.append(list);
      }
      list.append(createElement("li", { text: bullet[1] }));
      return;
    }

    list = null;
    node.append(createElement("p", { text: line }));
  });
}

function renderAiMessages() {
  const container = document.querySelector("[data-ai-messages]");
  if (!container) return;
  container.replaceChildren();
  state.aiMessages.forEach((message) => {
    const item = createElement("div", {
      className: `ai-message ${message.role === "user" ? "is-user" : message.role === "system" ? "is-system" : "is-assistant"}`
    });
    appendAiMessageContent(item, message.content);
    container.append(item);
  });
  container.scrollTop = container.scrollHeight;
}

function pushAiMessage(role, content) {
  state.aiMessages.push({ role, content });
  state.aiMessages = state.aiMessages.slice(-12);
  renderAiMessages();
}

function setupAiChat() {
  const toggle = document.querySelector("[data-ai-toggle]");
  const panel = document.querySelector("[data-ai-panel]");
  const close = document.querySelector("[data-ai-close]");
  const form = document.querySelector("[data-ai-form]");
  const prompts = document.querySelector("[data-ai-prompts]");
  if (!toggle || !panel || !form) return;

  function openPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open && !state.aiMessages.length) {
      pushAiMessage("assistant", "Olá! Posso ajudar com oficinas, documentos, inscrição, lista de espera, status por CPF, faltas e aulas recentes.");
    }
    if (open) form.elements.message?.focus();
  }

  toggle.addEventListener("click", () => openPanel(panel.hidden));
  close?.addEventListener("click", () => openPanel(false));

  async function sendAiMessage(text) {
    const input = form.elements.message;
    input.value = "";
    pushAiMessage("user", text);
    pushAiMessage("assistant", "Consultando...");

    try {
      const chatMessages = state.aiMessages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .filter((message) => message.content !== "Consultando...");
      const data = await apiRequest("/ai/chat", {
        method: "POST",
        timeout: 22000,
        body: { messages: chatMessages }
      });
      state.aiMessages.pop();
      pushAiMessage("assistant", data.message || "Não consegui responder agora.");
    } catch (error) {
      state.aiMessages.pop();
      pushAiMessage("assistant", error.message);
    }
  }

  prompts?.querySelectorAll("[data-ai-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      openPanel(true);
      sendAiMessage(button.dataset.aiPrompt || button.textContent || "");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.elements.message;
    const text = String(input?.value || "").trim();
    if (!text) return;
    await sendAiMessage(text);
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
    const [oficinasData, galeriaData, colaboradoresData, depoimentosData] = await Promise.all([
      apiRequest("/oficinas"),
      apiRequest("/galeria"),
      apiRequest("/colaboradores"),
      apiRequest("/depoimentos")
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
    if (Array.isArray(colaboradoresData.colaboradores) && colaboradoresData.colaboradores.length) {
      state.collaborators = colaboradoresData.colaboradores;
    }
    if (Array.isArray(depoimentosData.depoimentos) && depoimentosData.depoimentos.length) {
      state.testimonials = depoimentosData.depoimentos;
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
  setupWorkshopRoutes();
  renderAgenda();
  renderGallery();
  renderCollaborators();
  renderTestimonials();
  setupWorkshopDialog();
  setupPhoneMasks();
  setupCpfMasks();
  await setupPuzzleCaptcha();
  setupSignupForm();
  setupStatusLookup();
  setupAiChat();
  setupYearAndStats();
}

init();
