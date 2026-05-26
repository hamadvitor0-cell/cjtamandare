import { workshops as fallbackWorkshops, categories as fallbackCategories, categoryColors, agenda, galleryItems as fallbackGalleryItems, collaborators as fallbackCollaborators, testimonials as fallbackTestimonials } from "./data.js?v=20260522-1";
import { apiRequest, secureRequest, apiUrl } from "./api.js?v=20260522-2";
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
  openCategoryNames: new Set(),
  workshopCategoryTouched: false,
  openWorkshopIds: new Set(),
  workshopOfficeTouched: false,
  aiMessages: [],
  portalReady: false,
  portal: null,
  workshops: [...fallbackWorkshops],
  categories: [...fallbackCategories],
  galleryItems: [...fallbackGalleryItems],
  collaborators: [...fallbackCollaborators],
  testimonials: [...fallbackTestimonials],
  faq: [],
  workshopsLoaded: false
};

let revealObserver;
const initialWorkshopRatio = 0.3;
const carouselTimers = {
  gallery: null,
  testimonials: null
};

const publicCacheSettings = {
  oficinas: { key: "cj-public-oficinas-v1", ttl: 5 * 60 * 1000 },
  galeria: { key: "cj-public-galeria-v1", ttl: 15 * 60 * 1000 },
  colaboradores: { key: "cj-public-colaboradores-v1", ttl: 30 * 60 * 1000 },
  depoimentos: { key: "cj-public-depoimentos-v1", ttl: 15 * 60 * 1000 },
  faq: { key: "cj-public-faq-v1", ttl: 15 * 60 * 1000 }
};

const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const documentNamePattern = /(rg|cpf|comprovante|residencia|resid\u00eancia|declaracao|declara\u00e7\u00e3o|responsavel|respons\u00e1vel|aluno|certidao|certid\u00e3o)/i;
const pdfNamePattern = /\.pdf$/i;
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
  terca: "Ter\u00e7a",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "S\u00e1bado",
  domingo: "Domingo"
};

const workshopCategoryConfig = [
  {
    name: "Esportes",
    color: "#087a3d",
    description: "Atividades esportivas para disciplina, convivência e desenvolvimento físico.",
    icon: "sports",
    aliases: ["Esporte"]
  },
  {
    name: "Dança e Movimento",
    color: "#1257a6",
    description: "Expressão corporal, ritmo, postura e cuidado com o corpo.",
    icon: "movement",
    aliases: ["Dança", "Danca", "Dança e Movimento", "Danca e Movimento"]
  },
  {
    name: "Música",
    color: "#f07f12",
    description: "Prática musical, escuta, repertório e apresentações em grupo.",
    icon: "music",
    aliases: ["Musica", "Música"]
  },
  {
    name: "Educação",
    color: "#c9181d",
    description: "Aprendizagem, tecnologia, comunicação, raciocínio e inclusão.",
    icon: "education",
    aliases: ["Educação", "Educacao", "Tecnologia", "Jogos"]
  },
  {
    name: "Artes e Cultura",
    color: "#5b2695",
    description: "Criação artística, teatro, pintura e repertório cultural.",
    icon: "art",
    aliases: ["Artes", "Cultura", "Artes e Cultura"]
  }
];

const workshopCategoryOverrides = new Map([
  ["informatica", "Educação"],
  ["informática", "Educação"],
  ["xadrez", "Educação"],
  ["ingles", "Educação"],
  ["inglês", "Educação"],
  ["libras", "Educação"],
  ["ginastica", "Dança e Movimento"],
  ["ginástica", "Dança e Movimento"],
  ["danca ritmos", "Dança e Movimento"],
  ["dança ritmos", "Dança e Movimento"],
  ["ballet", "Dança e Movimento"],
  ["dancas urbanas", "Dança e Movimento"],
  ["danças urbanas", "Dança e Movimento"]
]);

const workshopDisplayOrder = [
  "futsal",
  "volei",
  "basquete",
  "muay thai",
  "judo",
  "capoeira",
  "ginastica",
  "danca ritmos",
  "ballet",
  "dancas urbanas",
  "violao",
  "canto coral",
  "bateria e percussao",
  "teclado",
  "flauta doce",
  "ingles",
  "informatica",
  "xadrez",
  "libras",
  "pintura em tela",
  "teatro"
].reduce((map, name, index) => map.set(name, index), new Map());

function formatDays(days = []) {
  return days.length ? days.map((day) => dayNames[day] || day).join(" e ") : "A definir";
}

function formatPeriod(period = "a definir") {
  const labels = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    noturno: "Noturno",
    manha: "Manhã",
    tarde: "Tarde",
    noite: "Noite",
    integral: "Integral",
    "a definir": "A definir"
  };
  return labels[period] || period;
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function displayCategory(workshop = {}) {
  const byName = workshopCategoryOverrides.get(normalizeText(workshop.nome));
  if (byName) return byName;
  const raw = normalizeText(workshop.categoria);
  const match = workshopCategoryConfig.find((category) => (
    normalizeText(category.name) === raw
    || category.aliases.some((alias) => normalizeText(alias) === raw)
  ));
  return match?.name || "Educação";
}

function categoryMeta(categoryName = "Educação") {
  return workshopCategoryConfig.find((category) => category.name === categoryName)
    || workshopCategoryConfig.find((category) => category.name === "Educação");
}

function createSvgIcon(pathData, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  paths.forEach((data) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    svg.append(path);
  });
  return svg;
}

function createCategoryIcon(categoryName) {
  const icon = categoryMeta(categoryName)?.icon;
  const paths = {
    sports: [
      "M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9Zm0 2a7 7 0 0 1 5.9 3.23l-3.23.62-2.06-2.28.95-1.48A6.82 6.82 0 0 1 12 5Zm-2.7.6 1.55 1.08-.88 2.72-2.7.88-1.37-1A7.04 7.04 0 0 1 9.3 5.6Zm-4.1 5.6 1.6 1.15v3.1l-1.17.72A7.08 7.08 0 0 1 5.2 11.2Zm2.08 6.52 1.42-.87 2.95.96.47 1.18a6.95 6.95 0 0 1-4.84-1.27Zm4.22-1.9-2.7-.88v-2.85l2.7-.88 1.67 2.3-1.67 2.31Zm2.4 2.83-.5-1.25 1.78-2.45 3.04-.3.67.9a7.04 7.04 0 0 1-4.99 3.1Zm4.53-6.03-3.04.3-1.67-2.3.84-2.59 3.76-.72a6.95 6.95 0 0 1 .11 5.31Z"
    ],
    movement: [
      "M12.4 4.2a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Zm4.5 4.1-2.1 2.4-2.4-1.1-1.3 2.7 2.3 2.3v5.1h-2.1v-4.2l-2.2-2.1-1.5 3.4-3.4 1.5-.9-1.9 2.6-1.2 2.6-5.8-2 .8-1.8 2.1-1.6-1.4 2.1-2.5 4.7-2 1.8 1.5 2.6 1.2 1.2-1.4 1.6 1.6Z"
    ],
    music: [
      "M18 3v12.2A3.3 3.3 0 1 1 16 12V7.6l-7 1.6v7A3.3 3.3 0 1 1 7 13V6l11-3Zm-2 2.5-7 1.6v1.95l7-1.6V5.5Z"
    ],
    education: [
      "M4 5.5 12 2l8 3.5-8 3.5-8-3.5Zm2 3.2 6 2.6 6-2.6V14c0 2.2-2.7 4-6 4s-6-1.8-6-4V8.7Zm2 3v2.2c0 .9 1.6 2.1 4 2.1s4-1.2 4-2.1v-2.2l-4 1.75-4-1.75ZM4 11.2l2 .9V17H4v-5.8Z"
    ],
    art: [
      "M12 3a8.5 8.5 0 0 0-8.5 8.5A7.5 7.5 0 0 0 11 19h1.3c.8 0 1.2-.9.75-1.55-.25-.35-.1-.95.45-.95H15a5.5 5.5 0 0 0 5.5-5.5C20.5 6.6 16.7 3 12 3Zm-4 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 8 11Zm3-3a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 11 8Zm4 0a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 15 8Zm1.5 4a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
    ]
  };
  return createSvgIcon(paths[icon] || paths.education, "workshop-category-svg");
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
  const total = Number(workshop.capacidade || workshop.capacidadeTotal || 0);
  const available = Number(workshop.vagasDisponiveis || 0);
  const activeClasses = Number(workshop.turmasAtivas || workshop.turmasDisponiveis?.length || 0);
  if (!activeClasses || !total) {
    return { label: "Sem turmas", className: "workshop-status is-muted", tone: "muted" };
  }
  if (workshop.situacaoVagas === "lista_espera" || available <= 0) {
    return { label: "Lista de espera", className: "workshop-status is-waitlist" };
  }
  if (workshop.situacaoVagas === "poucas_vagas" || available / total <= 0.2) {
    return { label: `Últimas vagas (${available})`, className: "workshop-status is-limited", tone: "limited" };
  }
  return {
    label: `Vagas disponíveis (${available})`,
    className: "workshop-status is-open",
    tone: "open"
  };
}

function turmaStatus(turma = {}) {
  if (turma.ativa === false) {
    return { label: "Inscrições encerradas", className: "turma-status is-closed", action: "Inscrições encerradas", disabled: true };
  }
  const total = Number(turma.vagasTotal || 0);
  const occupied = Number(turma.vagasOcupadas || 0);
  const available = Math.max(total - occupied, 0);
  if (!total) {
    return { label: "Sem vagas cadastradas", className: "turma-status is-muted", action: "Avise-me quando abrir turma", disabled: true };
  }
  if (occupied >= total || turma.situacaoVagas === "lista_espera") {
    return { label: "Lista de espera", className: "turma-status is-waitlist", action: "Entrar na lista de espera", disabled: false };
  }
  if (available / total <= 0.2) {
    return { label: "Últimas vagas", className: "turma-status is-limited", action: "Inscrever-se nesta turma", disabled: false };
  }
  return { label: "Vagas disponíveis", className: "turma-status is-open", action: "Inscrever-se nesta turma", disabled: false };
}

function selectWorkshopForSignup(workshop, turma = null) {
  const select = document.querySelector("[data-office-select]");
  if (!select) return;
  const form = document.querySelector("[data-signup-form]");
  if (form && turma?.id) {
    form.dataset.pendingTurmaId = turma.id;
    form.dataset.pendingTurmaName = turma.nome || "";
  }
  select.value = workshop.nome;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (turma?.nome) {
    showToast(`Turma selecionada: ${turma.nome}`, "success");
  }
}

function vacancyText(turma) {
  if (turma.situacaoVagas === "lista_espera" || Number(turma.vagasDisponiveis || 0) <= 0) {
    return "Lista de espera";
  }
  const available = Number(turma.vagasDisponiveis);
  return available === 1 ? "1 vaga disponível" : `${available} vagas disponíveis`;
}

function observeReveal(root = document) {
  if (!revealObserver) return;
  root.querySelectorAll(".reveal:not([data-observed])").forEach((node) => {
    node.dataset.observed = "true";
    revealObserver.observe(node);
  });
}

function setupReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((node) => node.classList.add("is-visible"));
    return;
  }
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  observeReveal();
  document.documentElement.classList.add("reveal-ready");
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
  if (document.querySelector("[data-theme-toggle]")?.dataset.themeReady === "true") return;
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
    if (icon) icon.textContent = theme === "dark" ? "\u2600" : "\u25d0";
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

  ["Todas", ...workshopCategoryConfig.map((category) => category.name)].forEach((category) => {
    const button = createElement("button", {
      text: category,
      attrs: {
        type: "button",
        "aria-pressed": String(state.category === category)
      }
    });
    if (category !== "Todas") {
      const meta = categoryMeta(category);
      button.style.setProperty("--category-color", meta.color);
    }
    button.addEventListener("click", () => {
      state.category = category;
      state.openCategoryNames.clear();
      state.openWorkshopIds.clear();
      state.workshopCategoryTouched = false;
      state.workshopOfficeTouched = false;
      renderCategoryFilters();
      renderWorkshops();
    });
    container.append(button);
  });
}

function filteredWorkshops() {
  const query = normalizeText(state.search);
  return state.workshops.filter((workshop) => {
    const category = displayCategory(workshop);
    const turmas = workshop.turmasDisponiveis || [];
    const matchesCategory = state.category === "Todas" || category === state.category;
    const matchesSearch = !query
      || normalizeText(workshop.nome).includes(query)
      || normalizeText(category).includes(query)
      || normalizeText(workshop.categoria).includes(query)
      || normalizeText(workshop.descricao).includes(query)
      || turmas.some((turma) => normalizeText(turma.nome).includes(query));
    return matchesCategory && matchesSearch;
  });
}

function workshopKey(workshop) {
  return workshop.id || slugify(workshop.nome);
}

function isWorkshopMobileLayout() {
  return window.matchMedia?.("(max-width: 760px)").matches ?? window.innerWidth <= 760;
}

function groupWorkshopsByCategory(items = []) {
  return workshopCategoryConfig.map((category) => ({
    ...category,
    items: items
      .filter((workshop) => displayCategory(workshop) === category.name)
      .sort((left, right) => {
        const leftOrder = workshopDisplayOrder.get(normalizeText(left.nome)) ?? 999;
        const rightOrder = workshopDisplayOrder.get(normalizeText(right.nome)) ?? 999;
        return leftOrder - rightOrder || left.nome.localeCompare(right.nome, "pt-BR");
      })
  })).filter((category) => category.items.length);
}

function createMetric(label, value) {
  const item = createElement("span", { className: "workshop-card-metric" });
  item.append(createElement("strong", { text: value }), createElement("small", { text: label }));
  return item;
}

function formatAgeRange(turma = {}) {
  const min = Number(turma.idadeMinima);
  const max = Number(turma.idadeMaxima);
  if (Number.isFinite(min) && Number.isFinite(max)) return `${min} a ${max} anos`;
  return "Faixa et\u00e1ria a confirmar";
}

function formatTurmaSchedule(turma = {}) {
  if (turma.horario) return turma.horario;
  if (turma.horarioInicio && turma.horarioFim) return `${turma.horarioInicio} \u00e0s ${turma.horarioFim}`;
  return "Hor\u00e1rio a confirmar";
}

function createChevron(className = "workshop-chevron") {
  return createSvgIcon("M7.4 8.6 12 13.2l4.6-4.6 1.4 1.4-6 6-6-6 1.4-1.4Z", className);
}

function ensureCategoryOpenState(categories, mobile) {
  if (state.workshopCategoryTouched) return;
  state.openCategoryNames = new Set(mobile ? categories.slice(0, 1).map((category) => category.name) : categories.map((category) => category.name));
  state.workshopCategoryTouched = true;
}

function createTurmaCard(workshop, turma) {
  const status = turmaStatus(turma);
  const total = Number(turma.vagasTotal || 0);
  const occupied = Number(turma.vagasOcupadas || 0);
  const available = Math.max(total - occupied, 0);
  const progress = total ? Math.min(100, Math.round((occupied / total) * 100)) : 0;
  const card = createElement("article", { className: `turma-public-card ${status.className.replace("turma-status ", "")}` });
  const progressBar = createElement("span", { className: "turma-progress-bar", attrs: { "aria-hidden": "true" } });
  progressBar.style.setProperty("--progress", `${progress}%`);

  const action = createElement("button", {
    className: "button button-primary turma-public-action",
    text: status.action,
    attrs: { type: "button", disabled: status.disabled ? "disabled" : null }
  });
  action.addEventListener("click", () => {
    if (status.disabled) return;
    selectWorkshopForSignup(workshop, turma);
    openSignupForm();
  });

  card.append(
    createElement("div", { className: "turma-public-heading" }, [
      createElement("div", {}, [
        createElement("h4", { text: turma.nome }),
        createElement("p", { text: formatAgeRange(turma) })
      ]),
      createElement("span", { className: status.className, text: status.label })
    ]),
    createElement("div", { className: "turma-public-info" }, [
      createElement("span", {}, [
        createElement("strong", { text: "Per\u00edodo" }),
        createElement("small", { text: formatPeriod(turma.periodo) })
      ]),
      createElement("span", {}, [
        createElement("strong", { text: "Dias" }),
        createElement("small", { text: formatDays(turma.diasSemana) })
      ]),
      createElement("span", {}, [
        createElement("strong", { text: "Hor\u00e1rio" }),
        createElement("small", { text: formatTurmaSchedule(turma) })
      ]),
      createElement("span", {}, [
        createElement("strong", { text: "Respons\u00e1vel" }),
        createElement("small", { text: turma.responsavel || "A confirmar" })
      ])
    ]),
    createElement("div", { className: "turma-vacancy" }, [
      createElement("div", { className: "turma-vacancy-line" }, [
        createElement("strong", { text: `${occupied}/${total || 0} vagas` }),
        createElement("span", { text: available > 0 ? `Restam ${available} vaga${available === 1 ? "" : "s"}` : "Lista de espera" })
      ]),
      progressBar
    ]),
    action
  );
  return card;
}

function renderWorkshops() {
  const grid = document.querySelector("[data-workshop-grid]");
  if (!grid) return;
  grid.replaceChildren();

  const more = document.querySelector("[data-workshop-more]");
  if (more) more.replaceChildren();
  const items = filteredWorkshops();
  if (!items.length) {
    grid.append(createElement("p", {
      className: "workshop-empty-state",
      text: "Nenhuma oficina encontrada. Tente buscar por outro nome ou categoria."
    }));
    return;
  }

  const groups = groupWorkshopsByCategory(items);
  const query = normalizeText(state.search);
  const singleMatchKey = query && items.length === 1 ? workshopKey(items[0]) : "";
  const mobile = isWorkshopMobileLayout();

  groups.forEach((category, categoryIndex) => {
    const categoryPanelId = `oficinas-categoria-${slugify(category.name)}`;
    const categoryOpen = query
      || (state.workshopCategoryTouched
        ? state.openCategoryNames.has(category.name)
        : (mobile ? categoryIndex === 0 : true));
    const categorySection = createElement("section", { className: `workshop-category reveal${categoryOpen ? " is-open" : ""}` });
    categorySection.style.setProperty("--category-color", category.color || categoryColors[category.name] || "var(--color-primary)");

    const header = createElement("button", {
      className: "workshop-category-header",
      attrs: {
        type: "button",
        "aria-expanded": String(categoryOpen),
        "aria-controls": categoryPanelId
      }
    });
    const icon = createElement("span", { className: "workshop-category-icon" });
    icon.append(createCategoryIcon(category.name));
    header.append(
      icon,
      createElement("span", { className: "workshop-category-copy" }, [
        createElement("h3", { text: category.name }),
        createElement("p", { text: category.description })
      ]),
      createElement("strong", { text: `${category.items.length} oficina${category.items.length === 1 ? "" : "s"}` }),
      createChevron("workshop-category-chevron")
    );
    header.addEventListener("click", () => {
      ensureCategoryOpenState(groups, mobile);
      if (categoryOpen) {
        state.openCategoryNames.delete(category.name);
      } else {
        if (mobile) {
          state.openCategoryNames.clear();
          state.openWorkshopIds.clear();
          state.workshopOfficeTouched = false;
        }
        state.openCategoryNames.add(category.name);
      }
      renderWorkshops();
    });

    const list = createElement("div", {
      className: "workshop-category-grid",
      attrs: { id: categoryPanelId, hidden: categoryOpen ? null : "hidden" }
    });

    category.items.forEach((workshop) => {
      const key = workshopKey(workshop);
      const panelId = `oficina-detalhes-${slugify(key)}`;
      const firstOpenCategoryIndex = mobile
        ? groups.findIndex((group, index) => (
          state.workshopCategoryTouched ? state.openCategoryNames.has(group.name) : index === 0
        ))
        : 0;
      const defaultOpen = !query
        && !state.workshopOfficeTouched
        && categoryOpen
        && categoryIndex === firstOpenCategoryIndex
        && category.items[0] === workshop;
      const open = state.openWorkshopIds.has(key) || singleMatchKey === key || defaultOpen;
      const status = workshopStatus(workshop);
      const total = Number(workshop.capacidade || workshop.capacidadeTotal || 0);
      const occupied = Number(workshop.inscritosConfirmados || workshop.ocupadasTotal || 0);
      const activeClasses = Number(workshop.turmasAtivas || workshop.turmasDisponiveis?.length || 0);
      const card = createElement("article", { className: `workshop-card workshop-office-card${open ? " is-open" : ""}` });
      const toggle = createElement("button", {
        className: "workshop-card-toggle",
        attrs: {
          type: "button",
          "aria-expanded": String(open),
          "aria-controls": panelId
        }
      });
      toggle.append(
        createElement("span", { className: "workshop-mini-icon", text: workshop.initials || workshop.nome.slice(0, 1).toUpperCase(), attrs: { "aria-hidden": "true" } }),
        createElement("span", { className: "workshop-card-main" }, [
          createElement("strong", { text: workshop.nome }),
          createElement("small", { text: activeClasses ? `${activeClasses} turma${activeClasses === 1 ? "" : "s"} dispon\u00edveis` : "Sem turmas no momento" })
        ]),
        createElement("span", { className: "workshop-card-stats" }, [
          createMetric("turmas", activeClasses ? `${activeClasses}` : "0"),
          createMetric("vagas", total ? `${occupied}/${total}` : "-")
        ]),
        createElement("span", { className: status.className, text: status.label }),
        createChevron("workshop-card-arrow")
      );
      toggle.addEventListener("click", () => {
        state.workshopOfficeTouched = true;
        if (open) {
          state.openWorkshopIds.delete(key);
        } else {
          if (mobile) state.openWorkshopIds.clear();
          state.openWorkshopIds.add(key);
        }
        renderWorkshops();
        if (!open) {
          window.setTimeout(() => document.getElementById(panelId)?.closest(".workshop-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
        }
      });

      const panel = createElement("div", {
        className: "workshop-card-panel",
        attrs: { id: panelId, hidden: open ? null : "hidden" }
      });
      const turmas = workshop.turmasDisponiveis || [];
      panel.append(createElement("h4", { text: "Turmas dispon\u00edveis" }));
      if (!turmas.length) {
        panel.append(createElement("p", { className: "empty-state", text: "Nenhuma turma dispon\u00edvel no momento." }));
      } else {
        const turmaGrid = createElement("div", { className: "turma-public-grid" });
        turmas.forEach((turma) => turmaGrid.append(createTurmaCard(workshop, turma)));
        panel.append(turmaGrid);
      }

      card.append(toggle, panel);
      list.append(card);
    });

    categorySection.append(header, list);
    grid.append(categorySection);
  });

  observeReveal(grid);
}

function renderWorkshopLoading(errorMessage = "") {
  const grid = document.querySelector("[data-workshop-grid]");
  if (!grid) return;
  grid.replaceChildren();
  if (errorMessage) {
    const error = createElement("div", { className: "workshop-load-error" });
    const retry = createElement("button", { className: "button button-secondary", text: "Tentar novamente", attrs: { type: "button" } });
    retry.addEventListener("click", () => {
      renderWorkshopLoading();
      refreshPublicWorkshops();
    });
    error.append(
      createElement("strong", { text: errorMessage }),
      retry
    );
    grid.append(error);
    return;
  }
  const loading = createElement("div", { className: "workshop-loading", attrs: { "aria-live": "polite" } });
  loading.append(createElement("p", { text: "Carregando oficinas..." }));
  const skeletons = createElement("div", { className: "workshop-skeleton-grid", attrs: { "aria-hidden": "true" } });
  for (let index = 0; index < 3; index += 1) {
    const card = createElement("div", { className: "workshop-skeleton-card" });
    card.append(
      createElement("span", { className: "workshop-skeleton-line is-title" }),
      createElement("span", { className: "workshop-skeleton-line" }),
      createElement("span", { className: "workshop-skeleton-line is-short" }),
      createElement("span", { className: "workshop-skeleton-row" })
    );
    skeletons.append(card);
  }
  loading.append(skeletons);
  grid.append(loading);
}

function createTurmaCardOld(workshop, turma) {
  const status = turmaStatus(turma);
  const total = Number(turma.vagasTotal || 0);
  const occupied = Number(turma.vagasOcupadas || 0);
  const available = Math.max(total - occupied, 0);
  const progress = total ? Math.min(100, Math.round((occupied / total) * 100)) : 0;
  const card = createElement("article", { className: `turma-public-card ${status.className.replace("turma-status ", "")}` });
  const progressBar = createElement("span", { className: "turma-progress-bar", attrs: { "aria-hidden": "true" } });
  progressBar.style.setProperty("--progress", `${progress}%`);

  const action = createElement("button", {
    className: "button button-primary",
    text: status.action,
    attrs: { type: "button", disabled: status.disabled ? "disabled" : null }
  });
  action.addEventListener("click", () => {
    if (status.disabled) return;
    selectWorkshopForSignup(workshop, turma);
    openSignupForm();
  });

  card.append(
    createElement("div", { className: "turma-public-top" }, [
      createElement("div", {}, [
        createElement("h4", { text: turma.nome }),
        createElement("p", { text: `${formatDays(turma.diasSemana)} · ${turma.horario || "Horário a confirmar"}` })
      ]),
      createElement("span", { className: status.className, text: status.label })
    ]),
    createElement("div", { className: "turma-chip-row" }, [
      createElement("span", { text: formatPeriod(turma.periodo) }),
      createElement("span", { text: `${turma.idadeMinima} a ${turma.idadeMaxima} anos` }),
      createElement("span", { text: turma.local || "Local a confirmar" }),
      createElement("span", { text: turma.responsavel || "Responsável a confirmar" })
    ]),
    createElement("div", { className: "turma-vacancy" }, [
      createElement("strong", { text: `${occupied}/${total || 0} vagas preenchidas` }),
      createElement("span", { text: available > 0 ? `Restam ${available} vaga${available === 1 ? "" : "s"}` : "Lista de espera disponível" }),
      progressBar
    ]),
    action
  );
  return card;
}

function renderWorkshopsOldGrouped() {
  const grid = document.querySelector("[data-workshop-grid]");
  if (!grid) return;
  grid.replaceChildren();

  const more = document.querySelector("[data-workshop-more]");
  if (more) more.replaceChildren();
  const items = filteredWorkshops();
  if (!items.length) {
    grid.append(createElement("p", {
      className: "form-feedback is-error",
      text: "Nenhuma oficina encontrada. Tente buscar por outro nome ou categoria."
    }));
    return;
  }

  groupWorkshopsByCategory(items).forEach((category) => {
    const categorySection = createElement("section", { className: "workshop-category reveal" });
    categorySection.style.setProperty("--category-color", category.color || categoryColors[category.name] || "var(--color-primary)");

    const header = createElement("div", { className: "workshop-category-header" });
    const icon = createElement("span", { className: "workshop-category-icon" });
    icon.append(createCategoryIcon(category.name));
    header.append(
      icon,
      createElement("div", {}, [
        createElement("h3", { text: category.name }),
        createElement("p", { text: category.description })
      ]),
      createElement("strong", { text: `${category.items.length} oficina${category.items.length === 1 ? "" : "s"}` })
    );

    const list = createElement("div", { className: "workshop-category-grid" });
    category.items.forEach((workshop) => {
      const key = workshopKey(workshop);
      const panelId = `oficina-detalhes-${slugify(key)}`;
      const open = state.openWorkshopIds.has(key);
      const status = workshopStatus(workshop);
      const total = Number(workshop.capacidade || workshop.capacidadeTotal || 0);
      const occupied = Number(workshop.inscritosConfirmados || workshop.ocupadasTotal || 0);
      const activeClasses = Number(workshop.turmasAtivas || workshop.turmasDisponiveis?.length || 0);
      const card = createElement("article", { className: `workshop-card${open ? " is-open" : ""}` });
      const toggle = createElement("button", {
        className: "workshop-card-toggle",
        attrs: {
          type: "button",
          "aria-expanded": String(open),
          "aria-controls": panelId
        }
      });
      toggle.append(
        createElement("span", { className: "workshop-mini-icon", text: workshop.initials || workshop.nome.slice(0, 2).toUpperCase(), attrs: { "aria-hidden": "true" } }),
        createElement("span", { className: "workshop-card-main" }, [
          createElement("strong", { text: workshop.nome }),
          createElement("small", { text: workshop.descricao || "Clique para ver turmas, horários e vagas." })
        ]),
        createElement("span", { className: "workshop-card-stats" }, [
          createMetric("turmas", activeClasses ? `${activeClasses}` : "0"),
          createMetric("vagas", total ? `${occupied}/${total}` : "-")
        ]),
        createElement("span", { className: status.className, text: status.label }),
        createElement("span", { className: "workshop-card-arrow", text: open ? "−" : "+", attrs: { "aria-hidden": "true" } })
      );
      toggle.addEventListener("click", () => {
        if (open) {
          state.openWorkshopIds.delete(key);
        } else {
          if (window.matchMedia?.("(max-width: 760px)").matches) state.openWorkshopIds.clear();
          state.openWorkshopIds.add(key);
        }
        renderWorkshops();
        if (!open) {
          window.setTimeout(() => document.getElementById(panelId)?.closest(".workshop-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
        }
      });

      const panel = createElement("div", {
        className: "workshop-card-panel",
        attrs: { id: panelId, hidden: open ? null : "hidden" }
      });
      const turmas = workshop.turmasDisponiveis || [];
      panel.append(createElement("h4", { text: "Turmas disponíveis" }));
      if (!turmas.length) {
        panel.append(createElement("p", { className: "empty-state", text: "Nenhuma turma disponível no momento." }));
      } else {
        const turmaGrid = createElement("div", { className: "turma-public-grid" });
        turmas.forEach((turma) => turmaGrid.append(createTurmaCard(workshop, turma)));
        panel.append(turmaGrid);
      }

      card.append(toggle, panel);
      list.append(card);
    });

    categorySection.append(header, list);
    grid.append(categorySection);
  });

  observeReveal(grid);
}

function renderWorkshopsLegacy() {
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
    const capacity = Number(workshop.capacidade || 0);
    const occupied = Number(workshop.inscritosConfirmados || 0);
    meta.append(
      createElement("span", { text: `Faixa et\u00e1ria: ${workshop.faixaEtaria}` }),
      createElement("span", { text: `Dias: ${formatDays(workshop.diasSemana)}` }),
      createElement("span", { text: `Per\u00edodo: ${formatPeriod(workshop.periodo)}` }),
      createElement("span", { text: `Hor\u00e1rio: ${workshop.horario}` }),
      createElement("span", { text: capacity ? `Vagas: ${occupied}/${capacity} ocupadas` : "Sem turmas disponíveis" }),
      createElement("span", { text: workshop.turmasAtivas ? `Turmas ativas: ${workshop.turmasAtivas}` : "Sem turmas ativas" })
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
      openSignupForm();
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
  const capacity = Number(workshop.capacidade || 0);
  const occupied = Number(workshop.inscritosConfirmados || 0);
  section.hidden = false;
  content.replaceChildren();

  const card = createElement("article", { className: "workshop-page-card reveal" });
  const details = createElement("div", { className: "dialog-detail-grid" });
  [
    ["Categoria", workshop.categoria],
    ["Faixa etária", workshop.faixaEtaria],
    ["Dias", formatDays(workshop.diasSemana)],
    ["Período", formatPeriod(workshop.periodo)],
    ["Horário", workshop.horario],
    ["Vagas", capacity ? `${occupied}/${capacity} ocupadas · ${status.label}` : "Sem turmas disponíveis no momento"],
    ["Turmas ativas", workshop.turmasAtivas ? String(workshop.turmasAtivas) : "Nenhuma"],
    ["Documentos", "RG, CPF, comprovante e declaração escolar quando for menor de idade"]
  ].forEach(([label, value]) => {
    const item = createElement("div");
    item.append(createElement("strong", { text: label }), createElement("span", { text: value || "A definir" }));
    details.append(item);
  });

  const actions = createElement("div", { className: "workshop-page-actions" });
  const signup = createElement("button", { className: "button button-primary", text: "Inscrever-se", attrs: { type: "button" } });
  signup.addEventListener("click", () => {
    selectWorkshopForSignup(workshop);
    openSignupForm();
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
  const capacity = Number(workshop.capacidade || 0);
  const occupied = Number(workshop.inscritosConfirmados || 0);
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
    ["Faixa et\u00e1ria", workshop.faixaEtaria],
    ["Dias", formatDays(workshop.diasSemana)],
    ["Per\u00edodo", formatPeriod(workshop.periodo)],
    ["Hor\u00e1rio", workshop.horario],
    ["Vagas", capacity ? `${occupied}/${capacity} ocupadas` : "Sem turmas disponíveis"],
    ["Turmas ativas", workshop.turmasAtivas ? String(workshop.turmasAtivas) : "Nenhuma"],
    ["Situação", status.label],
    ["Documentos", "RG, CPF, comprovante e declaração escolar quando for menor de idade"]
  ].forEach(([label, value]) => {
    const item = createElement("div");
    item.append(createElement("strong", { text: label }), createElement("span", { text: value || "A definir" }));
    grid.append(item);
  });
  const signup = createElement("button", { className: "button button-primary", text: "Inscrever-se nesta oficina", attrs: { type: "button" } });
  signup.addEventListener("click", () => {
    selectWorkshopForSignup(workshop);
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
    state.openCategoryNames.clear();
    state.openWorkshopIds.clear();
    state.workshopCategoryTouched = false;
    state.workshopOfficeTouched = false;
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

  clearCarouselTimer("gallery");
  grid.replaceChildren();

  if (!state.galleryItems.length) {
    grid.append(createElement("p", {
      className: "empty-state",
      text: "Galeria em atualização. Novas imagens institucionais serão publicadas em breve."
    }));
    return;
  }

  state.galleryItems.forEach((item, index) => {
    const button = createElement("button", {
      className: "gallery-item",
      attrs: {
        type: "button",
        "aria-label": `Abrir imagem: ${item.caption || item.titulo || `Galeria ${index + 1}`}`
      }
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
  clearCarouselTimer("testimonials");
  grid.replaceChildren();

  const card = createElement("article", { className: "testimonial-empty-card" });
  card.append(
    createElement("strong", { text: "Em breve relatos de alunos" })
  );
  grid.append(card);
}

function createTestimonialCard(item, index, isClone = false) {
  const card = createElement("article", {
    className: `testimonial-card testimonial-card-${(index % 6) + 1}`,
    attrs: isClone ? { "aria-hidden": "true" } : {}
  });
  const author = createElement("div", { className: "testimonial-author" });
  const avatar = createElement("span", {
    className: "testimonial-avatar",
    text: initialsFromName(item.nome),
    attrs: { "aria-hidden": "true" }
  });
  const authorText = createElement("span", { className: "testimonial-author-text" });
  authorText.append(
    createElement("strong", { text: item.nome }),
    createElement("span", { text: [item.vinculo, item.oficina].filter(Boolean).join(" \u00b7 ") || "Participante do CJ" })
  );
  author.append(avatar, authorText);
  card.append(
    createElement("p", { className: "testimonial-text", text: `\u201c${item.texto}\u201d` }),
    author
  );
  return card;
}

function clearCarouselTimer(name) {
  if (!carouselTimers[name]) return;
  window.clearInterval(carouselTimers[name]);
  carouselTimers[name] = null;
}

function setupCarousel({ name, root, track, slides, dots, prev, next, interval }) {
  if (!root || !track || !slides.length) return;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let activeIndex = 0;

  function update(nextIndex) {
    activeIndex = (nextIndex + slides.length) % slides.length;
    track.style.transform = `translateX(-${activeIndex * 100}%)`;
    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
      if (slide.tagName === "BUTTON") slide.tabIndex = isActive ? 0 : -1;
    });
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });
  }

  function start() {
    clearCarouselTimer(name);
    if (reducedMotion || slides.length < 2) return;
    carouselTimers[name] = window.setInterval(() => update(activeIndex + 1), interval);
  }

  prev?.addEventListener("click", () => {
    update(activeIndex - 1);
    start();
  });
  next?.addEventListener("click", () => {
    update(activeIndex + 1);
    start();
  });
  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      update(index);
      start();
    });
  });
  root.addEventListener("mouseenter", () => clearCarouselTimer(name));
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", () => clearCarouselTimer(name));
  root.addEventListener("focusout", start);
  update(0);
  start();
}

function setSignupOpen(open, { scroll = false, focus = false } = {}) {
  const section = document.querySelector("[data-signup-section]");
  const form = document.querySelector("[data-signup-form]");
  const toggle = document.querySelector("[data-signup-toggle]");
  const label = document.querySelector("[data-signup-toggle-label]");
  const action = document.querySelector("[data-signup-toggle-action]");
  if (!section || !form || !toggle) return;
  form.hidden = !open;
  section.classList.toggle("is-collapsed", !open);
  section.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  if (label) label.textContent = open ? "Formulário de inscrição aberto" : "Abrir formulário de inscrição";
  if (action) action.textContent = open ? "Ocultar formulário" : "Começar inscrição";
  if (scroll) section.scrollIntoView({ behavior: "smooth", block: "start" });
  if (open && focus) {
    window.setTimeout(() => form.elements.nome?.focus({ preventScroll: true }), 220);
  }
}

function openSignupForm(options = {}) {
  setSignupOpen(true, { scroll: true, ...options });
}

function setupSignupToggle() {
  const toggle = document.querySelector("[data-signup-toggle]");
  toggle?.addEventListener("click", () => {
    const form = document.querySelector("[data-signup-form]");
    const willOpen = Boolean(form?.hidden);
    setSignupOpen(willOpen, { focus: willOpen });
  });
  document.querySelectorAll('a[href="#inscricao"]').forEach((link) => {
    link.addEventListener("click", () => {
      window.setTimeout(() => setSignupOpen(true), 0);
    });
  });
  if (window.location.hash === "#inscricao") setSignupOpen(true);
}

function clearSignupInvalidFields(form) {
  form.querySelectorAll(".is-invalid").forEach((node) => node.classList.remove("is-invalid"));
}

function markSignupInvalid(form, fieldName) {
  const field = form.elements[fieldName];
  const node = field instanceof RadioNodeList ? field[0] : field;
  const wrapper = node?.closest("label") || node?.closest("[data-terms-box]") || node?.closest("[data-captcha]");
  wrapper?.classList.add("is-invalid");
  wrapper?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  node?.focus?.({ preventScroll: true });
}

function isPdfFile(file) {
  return file
    && file.name
    && pdfNamePattern.test(file.name)
    && (!file.type || file.type === "application/pdf")
    && file.size > 0
    && file.size <= 5 * 1024 * 1024;
}

function validateSignup(data, files = [], signedTerm = null, form = null) {
  const fail = (field, message) => {
    if (form && field) markSignupInvalid(form, field);
    return message;
  };

  if (!data.nome || data.nome.trim().length < 3) return fail("nome", "Informe o nome completo.");
  if (!isValidCpf(data.cpf)) return fail("cpf", "Informe um CPF v\u00e1lido.");
  if (!data.dataNascimento) return fail("dataNascimento", "Informe a data de nascimento.");
  if (new Date(`${data.dataNascimento}T12:00:00`).getTime() > Date.now()) return fail("dataNascimento", "A data de nascimento não pode ser futura.");
  const idade = Number(data.idade);
  if (!Number.isInteger(idade) || idade < 0 || idade > 99) return fail("idade", "Informe uma idade v\u00e1lida.");
  if (!/^[0-9()+\-\s]{10,20}$/.test(data.telefone || "")) return fail("telefone", "Informe um telefone v\u00e1lido.");
  if (idade < 18 && !String(data.responsavel || "").trim()) return fail("responsavel", "Informe o respons\u00e1vel legal para menor de idade.");
  if (!data.oficinas?.length) return fail("oficina", "Selecione pelo menos uma oficina.");
  if (!data.turmaId) return fail("turmaId", "Selecione uma turma dispon\u00edvel para a oficina escolhida.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return fail("email", "Informe um e-mail v\u00e1lido.");
  if (!["sim", "nao"].includes(String(data.possuiDeficiencia || ""))) return fail("possuiDeficiencia", "Informe se possui defici\u00eancia.");
  if (data.possuiDeficiencia === "sim" && !String(data.deficienciaDescricao || "").trim()) return fail("deficienciaDescricao", "Descreva qual defici\u00eancia foi informada.");
  if (!files.length) return fail("documentos", "Adicione os documentos obrigat\u00f3rios para finalizar a inscri\u00e7\u00e3o.");
  if (idade < 18 && files.length < 2) return fail("documentos", "Para menor de idade, envie documentos do aluno e do respons\u00e1vel.");
  if (files.length > 8) return fail("documentos", "Envie no m\u00e1ximo 8 documentos.");
  if (!signedTerm?.name) return fail("termoAssinado", "Baixe o termo, assine eletronicamente no gov.br e anexe o PDF assinado.");
  if (!isPdfFile(signedTerm)) return fail("termoAssinado", "O termo assinado deve ser um PDF válido com até 5 MB.");
  const totalSize = files.reduce((sum, file) => sum + file.size, 0) + signedTerm.size;
  if (totalSize > 21 * 1024 * 1024) return fail("documentos", "O envio completo deve ter no máximo 21 MB.");
  const invalidFile = files.find((file) => !allowedDocumentTypes.has(file.type) || file.size > 5 * 1024 * 1024);
  if (invalidFile) return fail("documentos", "Os documentos devem ser PDF, JPG, PNG ou WEBP com at\u00e9 5 MB por arquivo.");
  const unclearFile = files.find((file) => !documentNamePattern.test(file.name || ""));
  if (unclearFile) return fail("documentos", `Renomeie o arquivo "${unclearFile.name}" informando o tipo do documento, por exemplo CPF.png.`);
  if (!captchaState.loaded) return fail("captchaX", "Aguarde o carregamento do puzzle anti-rob\u00f4.");
  if (!captchaState.solved) return fail("captchaX", "Arraste a pe\u00e7a at\u00e9 encaixar no puzzle anti-rob\u00f4.");
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
    setCaptchaStatus("Puzzle encaixado. Pode enviar a inscri\u00e7\u00e3o.", "success");
  } else {
    setCaptchaStatus("Arraste a pe\u00e7a at\u00e9 alinhar com o encaixe.", "");
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
  setCaptchaStatus("Carregando puzzle anti-rob\u00f4...");
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
    setCaptchaStatus("Arraste a pe\u00e7a at\u00e9 encaixar no espa\u00e7o marcado.");
    setCaptchaHiddenFields();
    positionPuzzle();
  } catch (error) {
    setCaptchaStatus("N\u00e3o foi poss\u00edvel carregar o puzzle. Tente atualizar.", "error");
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

  const renderFilePreview = (input, target) => {
    if (!input || !target) return;
    target.replaceChildren();
    const files = Array.from(input.files || []);
    if (!files.length) {
      target.append(createElement("span", { text: "Nenhum arquivo selecionado." }));
      return;
    }
    const list = createElement("ul");
    files.forEach((file) => {
      const sizeMb = file.size / (1024 * 1024);
      const item = createElement("li");
      item.append(
        createElement("strong", { text: file.name }),
        createElement("span", { text: `${sizeMb.toFixed(2)} MB · ${file.type || "tipo não identificado"}` })
      );
      list.append(item);
    });
    target.append(list);
  };

  const updateCpfFeedback = () => {
    const input = form.elements.cpf;
    const hint = form.querySelector("[data-cpf-feedback]");
    if (!input || !hint) return;
    const value = normalizeCpf(input.value);
    input.closest("label")?.classList.remove("is-invalid", "is-valid");
    hint.classList.remove("is-success", "is-error");
    if (!value) {
      hint.textContent = "Digite os 11 números do CPF.";
      return;
    }
    if (value.length < 11) {
      hint.textContent = "CPF incompleto.";
      return;
    }
    if (isValidCpf(value)) {
      input.closest("label")?.classList.add("is-valid");
      hint.textContent = "CPF válido.";
      hint.classList.add("is-success");
    } else {
      input.closest("label")?.classList.add("is-invalid");
      hint.textContent = "CPF inválido. Confira os números digitados.";
      hint.classList.add("is-error");
    }
  };

  const updateDocumentGuidance = () => {
    const idade = Number(form.elements.idade?.value || 0);
    const responsibleField = form.elements.responsavel;
    const help = form.querySelector("[data-documents-help]");
    if (responsibleField) responsibleField.required = idade > 0 && idade < 18;
    if (help) {
      help.textContent = idade > 0 && idade < 18
    ? "Obrigat\u00f3rio para menor de idade: documentos do aluno e do respons\u00e1vel, declara\u00e7\u00e3o escolar e comprovante. Use arquivos leg\u00edveis e nomes como CPF-aluno.png ou RG-responsavel.pdf. Limite de 5 MB por arquivo."
    : "Obrigat\u00f3rio. Maiores: RG, CPF e comprovante de resid\u00eancia. Use arquivos leg\u00edveis e nomes como CPF.png ou Comprovante-residência.pdf. Limite de 5 MB por arquivo.";
    }
  };

  const updateDisabilityField = () => {
    const select = form.elements.possuiDeficiencia;
    const detail = form.querySelector("[data-disability-detail]");
    const input = form.elements.deficienciaDescricao;
    const show = select?.value === "sim";
    if (detail) detail.hidden = !show;
    if (input) {
      input.required = show;
      if (!show) input.value = "";
    }
  };

  let signupTurmas = [];
  const selectedWorkshop = () => state.workshops.find((workshop) => workshop.nome === form.elements.oficina?.value);
  const selectedTurma = () => signupTurmas.find((turma) => turma.id === form.elements.turmaId?.value);

  const renderTurmas = (turmas = [], message = "") => {
    const field = form.querySelector("[data-turma-field]");
    const list = form.querySelector("[data-turma-options]");
    const help = form.querySelector("[data-turma-help]");
    const hidden = form.elements.turmaId;
    if (!field || !list || !hidden) return;
    field.hidden = !form.elements.oficina?.value;
    list.replaceChildren();
    if (help) help.textContent = message || "Selecione a turma desejada para continuar.";
    if (!form.elements.oficina?.value) {
      hidden.value = "";
      return;
    }
    if (!turmas.length) {
      hidden.value = "";
      list.append(createElement("p", { className: "form-feedback is-error", text: message || "Não há turmas disponíveis para esta oficina no momento." }));
      return;
    }
    const idade = Number(form.elements.idade?.value || NaN);
    turmas.forEach((turma) => {
      const incompatible = Number.isInteger(idade) && (idade < turma.idadeMinima || idade > turma.idadeMaxima);
      const option = createElement("button", {
        className: `turma-option${hidden.value === turma.id ? " is-selected" : ""}${incompatible ? " is-disabled" : ""}`,
        attrs: { type: "button", disabled: incompatible ? "disabled" : null }
      });
      option.append(
        createElement("strong", { text: turma.nome }),
        createElement("span", { text: `${formatDays(turma.diasSemana)} · ${turma.horario || "Horário a definir"}` }),
        createElement("span", { text: `Faixa etária: ${turma.idadeMinima} a ${turma.idadeMaxima} anos · ${turma.vagasOcupadas}/${turma.vagasTotal} ocupadas` }),
        createElement("em", { text: incompatible ? "Idade fora da faixa desta turma" : vacancyText(turma) })
      );
      option.addEventListener("click", () => {
        hidden.value = turma.id;
        list.querySelectorAll(".turma-option").forEach((node) => node.classList.remove("is-selected"));
        option.classList.add("is-selected");
        field.classList.remove("is-invalid");
      });
      list.append(option);
    });
  };

  const loadSignupTurmas = async () => {
    const workshop = selectedWorkshop();
    const hidden = form.elements.turmaId;
    if (hidden) hidden.value = "";
    signupTurmas = [];
    if (!workshop?.id) {
      renderTurmas([], "");
      return;
    }
    renderTurmas([], "Carregando turmas...");
    try {
      const data = await apiRequest(`/oficinas/${encodeURIComponent(workshop.id)}/turmas`);
      signupTurmas = data.turmas || [];
      const pendingTurmaId = form.dataset.pendingTurmaId || "";
      if (pendingTurmaId && signupTurmas.some((turma) => turma.id === pendingTurmaId) && hidden) {
        hidden.value = pendingTurmaId;
      }
      delete form.dataset.pendingTurmaId;
      delete form.dataset.pendingTurmaName;
      renderTurmas(signupTurmas, signupTurmas.length ? "Escolha uma turma para concluir a inscrição." : "Não há turmas disponíveis para esta oficina no momento.");
    } catch (error) {
      renderTurmas([], "Não foi possível carregar turmas agora.");
    }
  };

  const setupSignupStepper = () => {
    const grid = form.querySelector(".form-grid");
    const progress = Array.from(form.querySelectorAll(".signup-progress span"));
    const actions = form.querySelector(".form-actions");
    const submit = form.querySelector("button[type='submit']");
    if (!grid || !progress.length || !actions || !submit || grid.dataset.stepperReady) return null;
    grid.dataset.stepperReady = "true";

    const nodeFor = (name) => form.elements[name]?.closest("label") || null;
    const stepDefs = [
      { title: "Dados do aluno", fields: ["nome", "cpf", "idade", "dataNascimento", "telefone", "email", "possuiDeficiencia", "deficienciaDescricao"] },
      { title: "Responsável", fields: ["responsavel"] },
      { title: "Oficinas", fields: ["oficina", "turmaId", "observacoes"] },
      { title: "Documentos", fields: ["documentos"] },
      { title: "Termo gov.br", fields: ["termoAssinado"], extras: ["[data-terms-box]", "[data-captcha]"] },
      { title: "Revisão final", fields: [] }
    ];
    const used = new Set();
    const sections = stepDefs.map((step, index) => {
      const section = createElement("section", {
        className: "signup-step",
        attrs: { "data-signup-step": String(index), "aria-label": step.title }
      });
      step.fields.forEach((field) => {
        const node = nodeFor(field);
        if (node && !used.has(node)) {
          used.add(node);
          section.append(node);
        }
      });
      (step.extras || []).forEach((selector) => {
        const node = form.querySelector(selector);
        if (node && !used.has(node)) {
          used.add(node);
          section.append(node);
        }
      });
      if (index === stepDefs.length - 1) {
        section.append(createElement("div", { className: "signup-review", attrs: { "data-signup-review": "" } }));
      }
      return section;
    });
    const leftovers = Array.from(grid.children).filter((node) => node.classList?.contains("honeypot"));
    grid.replaceChildren(...sections, ...leftovers);

    const previous = createElement("button", {
      className: "button button-secondary",
      text: "Voltar",
      attrs: { type: "button", "data-signup-prev": "" }
    });
    const next = createElement("button", {
      className: "button button-primary",
      text: "Continuar",
      attrs: { type: "button", "data-signup-next": "" }
    });
    actions.prepend(previous, next);

    let current = 0;
      const readCurrent = () => {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.oficinas = formData.getAll("oficina").filter(Boolean);
      return {
        data,
        files: formData.getAll("documentos").filter((file) => file && file.name),
        signedTerm: formData.get("termoAssinado")
      };
    };
    const failStep = (field, message) => {
      markSignupInvalid(form, field);
      setFeedback(feedback, message, "error");
      showToast(message, "error");
      return false;
    };
    const validateStep = (index) => {
      clearSignupInvalidFields(form);
      setFeedback(feedback, "");
      const { data, files, signedTerm } = readCurrent();
      const idade = Number(data.idade);
      if (index === 0) {
        if (!data.nome || data.nome.trim().length < 3) return failStep("nome", "Informe o nome completo.");
        if (!isValidCpf(data.cpf)) return failStep("cpf", "Informe um CPF válido.");
        if (!data.dataNascimento) return failStep("dataNascimento", "Informe a data de nascimento.");
        if (new Date(`${data.dataNascimento}T12:00:00`).getTime() > Date.now()) return failStep("dataNascimento", "A data de nascimento não pode ser futura.");
        if (!Number.isInteger(idade) || idade < 0 || idade > 99) return failStep("idade", "Informe uma idade válida.");
        if (!/^[0-9()+\-\s]{10,20}$/.test(data.telefone || "")) return failStep("telefone", "Informe um telefone válido.");
        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return failStep("email", "Informe um e-mail válido.");
        if (data.possuiDeficiencia === "sim" && !String(data.deficienciaDescricao || "").trim()) return failStep("deficienciaDescricao", "Descreva qual deficiência foi informada.");
      }
      if (index === 1 && idade < 18 && !String(data.responsavel || "").trim()) return failStep("responsavel", "Informe o responsável legal para menor de idade.");
      if (index === 2 && !data.oficinas.length) return failStep("oficina", "Selecione uma oficina.");
      if (index === 2 && !data.turmaId) return failStep("turmaId", "Selecione uma turma disponível para esta oficina.");
      if (index === 3) {
        if (!files.length) return failStep("documentos", "Adicione os documentos obrigatórios.");
        if (idade < 18 && files.length < 2) return failStep("documentos", "Para menor de idade, envie documentos do aluno e do responsável.");
        if (files.length > 8) return failStep("documentos", "Envie no máximo 8 documentos.");
        const invalidFile = files.find((file) => !allowedDocumentTypes.has(file.type) || file.size > 5 * 1024 * 1024);
        if (invalidFile) return failStep("documentos", "Os documentos devem ser PDF, JPG, PNG ou WEBP com até 5 MB por arquivo.");
      }
      if (index === 4) {
        if (!signedTerm?.name) return failStep("termoAssinado", "Anexe o termo assinado eletronicamente pelo gov.br.");
        if (!isPdfFile(signedTerm)) return failStep("termoAssinado", "O termo assinado deve ser um PDF válido com até 5 MB.");
        if (!captchaState.loaded) return failStep("captchaX", "Aguarde o carregamento da verificação.");
        if (!captchaState.solved) return failStep("captchaX", "Arraste a peça até encaixar na verificação.");
      }
      return true;
    };
    const updateReview = () => {
      const target = form.querySelector("[data-signup-review]");
      if (!target) return;
      const { data, files, signedTerm } = readCurrent();
      target.replaceChildren(
        createElement("h3", { text: "Confira antes de enviar" }),
        createElement("p", { text: "Revise os principais dados. Se algo estiver incorreto, volte para a etapa correspondente." }),
        createElement("dl", { className: "signup-review-list" })
      );
      const list = target.querySelector("dl");
      [
        ["Aluno", data.nome],
        ["CPF", maskCpfValue(data.cpf || "")],
        ["Responsável", data.responsavel || "Não informado"],
        ["Oficina", data.oficinas.join(", ") || "Nenhuma"],
        ["Turma", selectedTurma()?.nome || "Nenhuma"],
        ["Documentos", `${files.length} arquivo(s)`],
        ["Termo gov.br", signedTerm?.name || "Não anexado"]
      ].forEach(([label, value]) => {
        list.append(createElement("dt", { text: label }), createElement("dd", { text: value || "-" }));
      });
    };
    const renderStep = () => {
      form.querySelectorAll("[data-signup-step]").forEach((section) => {
        section.hidden = Number(section.dataset.signupStep) !== current;
      });
      progress.forEach((item, index) => {
        item.classList.toggle("is-active", index === current);
        item.classList.toggle("is-complete", index < current);
      });
      previous.hidden = current === 0;
      next.hidden = current === stepDefs.length - 1;
      submit.hidden = current !== stepDefs.length - 1;
      if (current === stepDefs.length - 1) updateReview();
    };
    previous.addEventListener("click", () => {
      current = Math.max(0, current - 1);
      renderStep();
    });
    next.addEventListener("click", () => {
      if (!validateStep(current)) return;
      current = Math.min(stepDefs.length - 1, current + 1);
      renderStep();
    });
    renderStep();
    return {
      goTo(index) {
        current = Math.max(0, Math.min(stepDefs.length - 1, index));
        renderStep();
      },
      isFinal() {
        return current === stepDefs.length - 1;
      },
      validateCurrent() {
        return validateStep(current);
      },
      next() {
        if (!validateStep(current)) return false;
        current = Math.min(stepDefs.length - 1, current + 1);
        renderStep();
        return true;
      }
    };
  };

  const signupStepper = setupSignupStepper();

  form.addEventListener("input", (event) => {
    event.target?.closest("label, [data-terms-box], [data-captcha]")?.classList.remove("is-invalid");
    if (event.target?.name === "idade") updateDocumentGuidance();
    if (event.target?.name === "idade") renderTurmas(signupTurmas, signupTurmas.length ? "Escolha uma turma para concluir a inscrição." : "");
    if (event.target?.name === "possuiDeficiencia") updateDisabilityField();
    if (event.target?.name === "cpf") updateCpfFeedback();
  });
  form.addEventListener("change", (event) => {
    event.target?.closest("label, [data-terms-box], [data-captcha]")?.classList.remove("is-invalid");
    if (event.target?.name === "idade") updateDocumentGuidance();
    if (event.target?.name === "possuiDeficiencia") updateDisabilityField();
    if (event.target?.name === "documentos") renderFilePreview(event.target, form.querySelector("[data-documents-preview]"));
    if (event.target?.name === "termoAssinado") renderFilePreview(event.target, form.querySelector("[data-signed-term-preview]"));
    if (event.target?.name === "oficina") loadSignupTurmas();
  });
  updateDocumentGuidance();
  updateDisabilityField();
  updateCpfFeedback();
  renderFilePreview(form.elements.documentos, form.querySelector("[data-documents-preview]"));
  renderFilePreview(form.elements.termoAssinado, form.querySelector("[data-signed-term-preview]"));
  renderTurmas([], "");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(feedback, "");
    clearSignupInvalidFields(form);
    if (signupStepper && !signupStepper.isFinal()) {
      signupStepper.next();
      return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.oficinas = formData.getAll("oficina").filter(Boolean);
    const files = formData.getAll("documentos").filter((file) => file && file.name);
    const signedTerm = formData.get("termoAssinado");
    const validation = validateSignup(data, files, signedTerm, form);
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
      formData.set("turmaId", data.turmaId || "");
      formData.set("possuiDeficiencia", data.possuiDeficiencia === "sim" ? "true" : "false");
      formData.set("captchaToken", captchaState.token);
      formData.set("captchaX", document.querySelector("[data-captcha-slider]")?.value || "");
      formData.set("captchaMoves", String(captchaState.moves));
      const result = await apiRequest("/inscricao", {
        method: "POST",
        body: formData
      });
      const listaEspera = result.inscricao?.listaEspera || [];
      const message = listaEspera.length
      ? `Inscri\u00e7\u00e3o recebida. ${listaEspera.join(", ")} ficou em lista de espera; a equipe entrar\u00e1 em contato.`
      : "Inscri\u00e7\u00e3o enviada com sucesso. A equipe entrar\u00e1 em contato.";
      form.reset();
      signupTurmas = [];
      signupStepper?.goTo(0);
      renderFilePreview(form.elements.documentos, form.querySelector("[data-documents-preview]"));
      renderFilePreview(form.elements.termoAssinado, form.querySelector("[data-signed-term-preview]"));
      updateCpfFeedback();
      renderTurmas([], "");
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
    submit.textContent = "Enviar inscri\u00e7\u00e3o";
    }
  });
}

const supportCategoryLabels = {
  duvida: "Dúvida",
  erro_matricula: "Erro com matrícula",
  alteracao_documentos: "Alteração de documentos",
  problemas_cj: "Problemas relacionados ao CJ",
  problemas_site: "Problemas relacionados ao site"
};

const supportStatusLabels = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  respondido: "Respondido",
  encerrado: "Encerrado"
};

const fallbackFaqs = [
  ["Como sei se fui confirmado?", "Acesse o Portal do Aluno com o CPF cadastrado para consultar turmas, avisos e chamados. A equipe também pode chamar pelo WhatsApp informado no cadastro."],
  ["Se a turma estiver cheia?", "A inscrição pode ficar em lista de espera. Quando houver vaga, a equipe orienta os próximos passos."],
  ["Posso escolher mais de uma oficina?", "Sim. O formulário permite selecionar mais de uma oficina para o mesmo CPF."],
  ["A inscrição online já garante a vaga?", "A inscrição registra o interesse. A confirmação depende de vaga disponível e conferência da documentação."],
  ["Quais documentos preciso enviar?", "Maiores de 18 anos enviam RG, CPF, comprovante de residência e termo assinado. Menores enviam documentos do aluno e do responsável, declaração escolar, comprovante de residência e termo assinado pelo responsável."],
  ["Como abro um ticket de suporte?", "Primeiro leia o FAQ. Se ainda precisar de atendimento, entre no Portal do Aluno com CPF cadastrado, confirme que leu as dúvidas frequentes e descreva o problema com detalhes."]
].map(([pergunta, resposta], index) => ({ id: `fallback-${index}`, pergunta, resposta, ativo: true, ordem: index + 1 }));

function formatPortalDate(value) {
  if (!value) return "Data não informada";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

function ticketAttachmentError(files = []) {
  if (files.length > 4) return "Envie no máximo 4 anexos por ticket.";
  const invalidType = files.find((file) => !allowedDocumentTypes.has(file.type));
  if (invalidType) return "Anexe apenas PDF, JPG, PNG ou WEBP.";
  const oversized = files.find((file) => file.size > 5 * 1024 * 1024);
  if (oversized) return "Cada anexo pode ter no máximo 5 MB.";
  return "";
}

function renderTicketAttachmentPreview(input) {
  const preview = input.closest("label")?.querySelector("[data-ticket-attachments-preview]");
  if (!preview) return true;
  const files = Array.from(input.files || []);
  preview.replaceChildren();
  const error = ticketAttachmentError(files);
  if (error) {
    preview.append(createElement("span", { className: "error", text: error }));
    input.value = "";
    return false;
  }
  if (!files.length) {
    preview.append(createElement("span", { text: "Nenhum arquivo selecionado." }));
    return true;
  }
  files.forEach((file) => {
    preview.append(createElement("span", { text: `${file.name} · ${formatFileSize(file.size)}` }));
  });
  return true;
}

function emptyState(title, text, icon = "info") {
  const node = createElement("div", { className: "empty-state", attrs: { "data-empty-icon": icon } });
  node.append(
    createElement("span", { className: "empty-state-icon", attrs: { "aria-hidden": "true" } }),
    createElement("strong", { text: title }),
    createElement("p", { text })
  );
  return node;
}

function supportStatusBadge(status) {
  return createElement("span", {
    className: `status-badge status-${status || "aberto"}`,
    text: supportStatusLabels[status] || status || "Aberto"
  });
}

function ticketTimeline(ticket) {
  const status = ticket.status || "aberto";
  const steps = [
    ["aberto", "Aberto"],
    ["em_atendimento", "Em atendimento"],
    [status === "encerrado" ? "encerrado" : "respondido", status === "encerrado" ? "Encerrado" : "Resposta"]
  ];
  const current = Math.max(0, steps.findIndex(([value]) => value === status));
  const timeline = createElement("ol", { className: "ticket-timeline" });
  steps.forEach(([value, label], index) => {
    timeline.append(createElement("li", {
      className: `${index <= current ? "is-active" : ""} ${value === status ? "is-current" : ""}`.trim(),
      text: label
    }));
  });
  return timeline;
}

function attachmentType(attachment) {
  if (attachment.mimeType === "application/pdf") return "PDF";
  if (String(attachment.mimeType || "").startsWith("image/")) return "IMG";
  return "DOC";
}

function renderFaq() {
  document.querySelectorAll("[data-faq-grid]").forEach((grid) => {
    grid.replaceChildren();
    const items = (state.faq.length ? state.faq : fallbackFaqs).filter((item) => item.ativo !== false);
    if (!items.length) {
      grid.append(createElement("p", { className: "form-feedback", text: "Nenhuma pergunta cadastrada no FAQ." }));
      return;
    }
    items.forEach((item) => {
      const details = createElement("details");
      details.append(
        createElement("summary", { text: item.pergunta }),
        createElement("p", { text: item.resposta })
      );
      grid.append(details);
    });
  });
}

function portalCard(title, contentNodes = [], className = "") {
  const article = createElement("article", { className: `portal-card ${className}`.trim() });
  article.append(createElement("h3", { text: title }));
  contentNodes.forEach((node) => article.append(node));
  return article;
}

function portalRatingStars(rating = 0) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const node = createElement("span", {
    className: "portal-rating-stars",
    attrs: { "aria-label": `Nota ${value} de 5` }
  });
  Array.from({ length: 5 }).forEach((_, index) => {
    node.append(createElement("span", {
      className: index < value ? "is-filled" : "is-empty",
      text: "★",
      attrs: { "aria-hidden": "true" }
    }));
  });
  node.append(createElement("small", { text: `${value}/5` }));
  return node;
}

function renderPortalDashboard() {
  const root = document.querySelector("[data-student-portal-dashboard]");
  if (!root || !state.portal) return;
  const { aluno, frequencia, turmas, proximasAulas, murais, notificacoes, tickets, feedbacks, ticketPolicy } = state.portal;
  root.hidden = false;
  root.replaceChildren();

  const header = createElement("div", { className: "portal-welcome" });
  header.append(
    createElement("div", { className: "section-heading" }),
    createElement("button", { className: "button button-secondary", text: "Sair do portal", attrs: { type: "button", "data-student-portal-logout": "" } })
  );
  header.querySelector(".section-heading").append(
    createElement("h3", { text: `Olá, ${aluno.nome}` }),
    createElement("p", { text: `CPF ${aluno.cpf || "não informado"} · Matrícula ${aluno.matricula || "não informada"}. Esta área mostra apenas dados do aluno cadastrado.` })
  );

  const frequency = portalCard("Frequência", [
    createElement("p", { text: `${frequencia.presencasRecentes || 0} presenças recentes e ${frequencia.faltasUltimos30Dias || 0} falta(s) nos últimos 30 dias.` }),
    createElement("small", { text: `${frequencia.chamadasRecentes || 0} chamadas recentes encontradas no histórico.` })
  ], "portal-frequency");

  const classesList = createElement("ul", { className: "portal-list" });
  (turmas || []).forEach((turma) => {
    const item = createElement("li");
    item.append(
      createElement("strong", { text: turma.nome }),
      createElement("span", { text: `${formatDays(turma.diasSemana || [])} · ${formatPeriod(turma.periodo)} · ${turma.horario || "Horário a definir"}` })
    );
    classesList.append(item);
  });
  if (!turmas?.length) classesList.append(createElement("li", { text: "Nenhuma turma vinculada encontrada." }));

  const cancellationForm = createElement("form", { className: "portal-feedback-form portal-cancellation-form", attrs: { "data-enrollment-cancellation-form": "" } });
  if (turmas?.length) {
    const cancellationNotice = createElement("div", { className: "portal-cancellation-notice" });
    cancellationNotice.append(
      createElement("strong", { text: "Cancelamento definitivo da oficina" }),
      createElement("p", { text: "Ao cancelar, seu nome será removido da turma selecionada. Para voltar, será necessário solicitar uma nova inscrição." })
    );
    const cancellationLabel = createElement("label");
    cancellationLabel.append(createElement("span", { text: "Oficina que deseja cancelar" }));
    const cancellationSelect = createElement("select", { attrs: { name: "oficinaId", required: "" } });
    turmas.forEach((turma) => {
      cancellationSelect.append(createElement("option", { text: turma.nome, attrs: { value: turma.id } }));
    });
    cancellationLabel.append(cancellationSelect);
    const confirmationLabel = createElement("label", { className: "check-row portal-cancellation-check" });
    confirmationLabel.append(
      createElement("input", { attrs: { name: "confirmacao", type: "checkbox", required: "" } }),
      createElement("span", { text: "Confirmo que quero cancelar minha inscrição nesta oficina." })
    );
    cancellationForm.append(
      cancellationNotice,
      cancellationLabel,
      confirmationLabel,
      createElement("button", { className: "button button-secondary portal-cancellation-button", text: "Confirmar cancelamento", attrs: { type: "submit" } }),
      createElement("p", { className: "form-feedback", attrs: { "data-enrollment-cancellation-status": "", role: "status", "aria-live": "polite" } })
    );
  } else {
    cancellationForm.append(createElement("p", { className: "form-feedback", text: "Nenhuma inscrição ativa disponível para cancelamento." }));
  }

  const nextList = createElement("ul", { className: "portal-list" });
  (proximasAulas || []).forEach((aula) => {
    const item = createElement("li");
    item.append(
      createElement("strong", { text: `${formatPortalDate(aula.data)} - ${aula.oficina || "Aula"}` }),
      createElement("span", { text: `${aula.horario || "Horário a definir"} · ${aula.origem || "Turma"}` })
    );
    nextList.append(item);
  });
  if (!proximasAulas?.length) nextList.append(createElement("li", { text: "Próximas aulas ainda não informadas." }));

  const notificationList = createElement("div", { className: "portal-feed" });
  [...(notificacoes || []), ...(murais || [])].slice(0, 12).forEach((post) => {
    const item = createElement("article", { className: `portal-post portal-post-${post.tipo} portal-priority-${post.prioridade || "normal"}` });
    item.append(
      createElement("span", { text: [post.prioridade === "urgente" ? "Urgente" : post.prioridade === "importante" ? "Importante" : "", post.oficina || (post.targetType === "geral" ? "Mural geral" : "Aviso")].filter(Boolean).join(" · ") }),
      createElement("strong", { text: post.titulo }),
      createElement("p", { text: post.mensagem }),
      createElement("small", { text: formatPortalDate(post.created_at) })
    );
    notificationList.append(item);
  });
  if (!notificationList.children.length) {
    notificationList.append(emptyState("Sem avisos no momento", "Quando a equipe publicar comunicados ou notificações, eles aparecerão aqui.", "mural"));
  }

  const ticketList = createElement("div", { className: "portal-ticket-list" });
  (tickets || []).forEach((ticket) => {
    const item = createElement("article", { className: `portal-ticket ticket-status-${ticket.status || "aberto"}` });
    const anexos = createElement("div", { className: "ticket-attachment-list" });
    (ticket.anexos || []).forEach((attachment) => {
      anexos.append(createElement("a", {
        className: "file-chip",
        text: `${attachment.originalName} · ${formatFileSize(attachment.sizeBytes)}`,
        attrs: {
          href: apiUrl(attachment.downloadPath || "#"),
          target: "_blank",
          rel: "noopener noreferrer",
          "data-file-type": attachmentType(attachment)
        }
      }));
    });
    const heading = createElement("div", { className: "portal-ticket-heading" });
    heading.append(
      createElement("strong", { text: ticket.codigo }),
      supportStatusBadge(ticket.status)
    );
    item.append(
      heading,
      createElement("span", { text: `${supportCategoryLabels[ticket.categoria] || ticket.categoria} · expira em ${formatPortalDate(ticket.expiresAt)}` }),
      ticketTimeline(ticket),
      createElement("p", { text: ticket.descricao }),
      anexos.children.length ? anexos : createElement("span", { text: "Sem anexos." }),
      ticket.resposta ? createElement("p", { className: "portal-ticket-answer", text: `Resposta: ${ticket.resposta}` }) : createElement("small", { text: "Aguardando atendimento da equipe." })
    );
    ticketList.append(item);
  });
  if (!ticketList.children.length) ticketList.append(emptyState("Nenhum ticket aberto", "Depois de enviar uma solicitação, o histórico e as respostas da equipe ficarão disponíveis aqui por 30 dias.", "suporte"));

  const workshopFeedbackForm = createElement("form", { className: "portal-feedback-form", attrs: { "data-workshop-feedback-form": "" } });
  if (turmas?.length) {
    const officeLabel = createElement("label");
    officeLabel.append(createElement("span", { text: "Oficina avaliada" }));
    const officeSelect = createElement("select", { attrs: { name: "oficinaId", required: "" } });
    turmas.forEach((turma) => {
      officeSelect.append(createElement("option", { text: turma.nome, attrs: { value: turma.id } }));
    });
    officeLabel.append(officeSelect);

    const ratingField = createElement("fieldset", { className: "star-rating", attrs: { "aria-label": "Nota da oficina" } });
    ratingField.append(createElement("legend", { text: "Nota" }));
    [5, 4, 3, 2, 1].forEach((rating) => {
      const inputId = `feedback-rating-${rating}`;
      ratingField.append(
        createElement("input", { attrs: { id: inputId, name: "rating", type: "radio", value: String(rating), required: "" } }),
        createElement("label", { text: "★", attrs: { for: inputId, title: `${rating} estrela${rating > 1 ? "s" : ""}` } })
      );
    });

    const commentLabel = createElement("label");
    commentLabel.append(
      createElement("span", { text: "Comentário" }),
      createElement("textarea", { attrs: { name: "comentario", rows: "4", minlength: "5", maxlength: "1200", required: "", placeholder: "Conte o que está bom, o que pode melhorar e como a oficina tem sido para você." } })
    );
    workshopFeedbackForm.append(
      officeLabel,
      ratingField,
      commentLabel,
      createElement("button", { className: "button button-primary", text: "Enviar avaliação", attrs: { type: "submit" } }),
      createElement("p", { className: "form-feedback", attrs: { "data-workshop-feedback-status": "", role: "status", "aria-live": "polite" } })
    );
  } else {
    workshopFeedbackForm.append(createElement("p", { className: "form-feedback", text: "Nenhuma oficina vinculada para avaliar no momento." }));
  }

  const workshopFeedbackHistory = createElement("div", { className: "portal-feedback-list" });
  (feedbacks || []).slice(0, 4).forEach((item) => {
    const feedbackItem = createElement("article");
    const feedbackHeader = createElement("header");
    feedbackHeader.append(
      createElement("strong", { text: item.oficina }),
      portalRatingStars(item.rating)
    );
    feedbackItem.append(
      feedbackHeader,
      createElement("p", { text: item.comentario }),
      createElement("span", { text: formatPortalDate(item.created_at) })
    );
    workshopFeedbackHistory.append(feedbackItem);
  });
  if (!workshopFeedbackHistory.children.length) {
    workshopFeedbackHistory.append(createElement("p", { className: "form-feedback", text: "Você ainda não enviou avaliações de oficina." }));
  }

  const faqNotice = createElement("div", { className: "support-faq-required" });
  faqNotice.append(
    createElement("strong", { text: "Leia o FAQ antes de abrir chamado" }),
    createElement("span", { text: "Verifique as perguntas frequentes abaixo. Se a resposta não resolver, confirme a leitura e envie o ticket." }),
    createElement("a", {
      className: "button button-secondary",
      text: "Ir para o FAQ",
      attrs: { href: "#duvidas" }
    })
  );

  const form = createElement("form", { className: "portal-ticket-form", attrs: { "data-student-ticket-form": "" } });
  form.append(
    createElement("div", { className: "ticket-expiry-warning" }),
    faqNotice,
    createElement("label")
  );
  form.querySelector(".ticket-expiry-warning").append(
    createElement("strong", { text: "Atenção: validade de 30 dias" }),
    createElement("span", { text: ticketPolicy?.aviso || "O ticket será excluído após 30 dias. O histórico não ficará disponível após esse prazo." })
  );
  const categoryLabel = form.querySelector("label");
  categoryLabel.append(createElement("span", { text: "Categoria do problema" }));
  const select = createElement("select", { attrs: { name: "categoria", required: "" } });
  Object.entries(supportCategoryLabels).forEach(([value, label]) => {
    select.append(createElement("option", { text: label, attrs: { value } }));
  });
  categoryLabel.append(select);
  const textLabel = createElement("label");
  textLabel.append(
    createElement("span", { text: "Descreva o problema" }),
    createElement("textarea", { attrs: { name: "descricao", rows: "5", minlength: "10", maxlength: "2000", required: "", placeholder: "Explique o que aconteceu, quando começou e como a equipe pode ajudar." } })
  );
  const attachmentLabel = createElement("label");
  attachmentLabel.append(
    createElement("span", { text: "Anexos opcionais" }),
    createElement("input", {
      attrs: {
        name: "anexos",
        type: "file",
        multiple: "",
        accept: ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp",
        "data-ticket-attachments": ""
      }
    }),
    createElement("small", { text: "Envie até 4 arquivos em PDF, JPG, PNG ou WEBP, com no máximo 5 MB cada." }),
    createElement("div", { className: "ticket-attachment-preview", attrs: { "data-ticket-attachments-preview": "" } })
  );
  const readFaqLabel = createElement("label", { className: "check-row support-faq-check" });
  readFaqLabel.append(
    createElement("input", { attrs: { name: "leuFaq", type: "checkbox", "data-support-faq-check": "" } }),
    createElement("span", { text: "Li o FAQ e minha dúvida ainda precisa de atendimento." })
  );
  const submit = createElement("button", { className: "button button-primary", text: "Abrir ticket", attrs: { type: "submit", disabled: "" } });
  const feedback = createElement("p", { className: "form-feedback", attrs: { "data-student-ticket-feedback": "", role: "status", "aria-live": "polite" } });
  form.append(textLabel, attachmentLabel, readFaqLabel, submit, feedback);

  const supportTabs = createElement("div", { className: "portal-support-tabs" });
  const supportTabButtons = createElement("div", { className: "portal-tab-buttons", attrs: { role: "tablist", "aria-label": "Suporte do aluno" } });
  const historyTab = createElement("button", { className: "is-active", text: "Meus chamados", attrs: { type: "button", role: "tab", "aria-selected": "true", "data-portal-support-tab": "history" } });
  const newTicketTab = createElement("button", { text: "Abrir ticket", attrs: { type: "button", role: "tab", "aria-selected": "false", "data-portal-support-tab": "new" } });
  const historyPanel = createElement("div", { className: "portal-tab-panel", attrs: { "data-portal-support-panel": "history" } });
  const newTicketPanel = createElement("div", { className: "portal-tab-panel", attrs: { "data-portal-support-panel": "new", hidden: "" } });
  historyPanel.append(ticketList);
  newTicketPanel.append(form);
  supportTabButtons.append(historyTab, newTicketTab);
  supportTabs.append(supportTabButtons, historyPanel, newTicketPanel);

  const importantPosts = [...(notificacoes || []), ...(murais || [])].slice(0, 3);
  const alertStrip = createElement("div", { className: "portal-alert-strip" });
  if (importantPosts.length) {
    importantPosts.forEach((post) => {
      const alert = createElement("article");
      alert.append(
        createElement("span", { text: post.oficina || (post.targetType === "geral" ? "Mural geral" : "Aviso") }),
        createElement("strong", { text: post.titulo }),
        createElement("p", { text: post.mensagem })
      );
      alertStrip.append(alert);
    });
  } else {
    alertStrip.append(emptyState("Nenhum alerta importante", "Avisos urgentes sobre aulas, horários e eventos aparecerão neste espaço.", "alerta"));
  }

  root.append(
    header,
    alertStrip,
    createElement("div", { className: "portal-grid" })
  );
  const grid = root.querySelector(".portal-grid");
  grid.append(
    frequency,
    portalCard("Turmas matriculadas", [classesList]),
    portalCard("Cancelar inscrição", [cancellationForm], "portal-cancellation-card"),
    portalCard("Próximas aulas", [nextList]),
    portalCard("Murais e notificações", [notificationList], "portal-feed-card"),
    portalCard("Feedback de oficina", [workshopFeedbackForm, workshopFeedbackHistory], "portal-feedback-card"),
    portalCard("Suporte", [supportTabs], "portal-ticket-card portal-support-card")
  );
}

async function loadStudentPortal(credentials) {
  const data = await apiRequest("/suporte/login", {
    method: "POST",
    body: credentials
  });
  state.portalReady = true;
  state.portal = data.portal;
  localStorage.removeItem("cj-portal-cpf");
  renderPortalDashboard();
}

async function loadStudentPortalSession() {
  const data = await apiRequest("/suporte/portal", { cache: "no-store" });
  state.portalReady = true;
  state.portal = data.portal;
  renderPortalDashboard();
}

function setupStudentPortal() {
  const form = document.querySelector("[data-student-portal-login]");
  const feedback = document.querySelector("[data-student-portal-feedback]");
  if (!form) return;

  form.elements.matricula?.addEventListener("input", (event) => {
    const caret = event.target.selectionStart;
    event.target.value = event.target.value.toUpperCase();
    event.target.setSelectionRange(caret, caret);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cpf = normalizeCpf(form.elements.cpf?.value || "");
    const matricula = String(form.elements.matricula?.value || "").trim().toUpperCase();
    if (!isValidCpf(cpf)) {
      setFeedback(feedback, "Informe um CPF válido.", "error");
      return;
    }
    if (!/^CJ-\d{4}-\d{4,8}$/.test(matricula)) {
      setFeedback(feedback, "Informe a matrícula no formato CJ-2026-0001.", "error");
      return;
    }
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Entrando...";
    try {
      await loadStudentPortal({ cpf, matricula });
      setFeedback(feedback, "Portal carregado.", "success");
      document.querySelector("[data-student-portal-dashboard]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Entrar no portal";
    }
  });

  document.addEventListener("click", (event) => {
    const logout = event.target.closest("[data-student-portal-logout]");
    if (logout) {
      secureRequest("/suporte/logout", { method: "POST" }).catch(() => {});
      state.portalReady = false;
      state.portal = null;
      const dashboard = document.querySelector("[data-student-portal-dashboard]");
      if (dashboard) {
        dashboard.hidden = true;
        dashboard.replaceChildren();
      }
      setFeedback(feedback, "Sessão local encerrada.", "success");
    }

    const supportTab = event.target.closest("[data-portal-support-tab]");
    if (supportTab) {
      const rootTabs = supportTab.closest(".portal-support-tabs");
      const target = supportTab.dataset.portalSupportTab;
      rootTabs?.querySelectorAll("[data-portal-support-tab]").forEach((button) => {
        const active = button.dataset.portalSupportTab === target;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      rootTabs?.querySelectorAll("[data-portal-support-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.portalSupportPanel !== target;
      });
    }

  });

  document.addEventListener("change", (event) => {
    const attachmentInput = event.target.closest("[data-ticket-attachments]");
    if (attachmentInput) {
      renderTicketAttachmentPreview(attachmentInput);
      return;
    }

    const faqCheck = event.target.closest("[data-support-faq-check]");
    if (!faqCheck) return;
    const ticketForm = faqCheck.closest("[data-student-ticket-form]");
    const submit = ticketForm?.querySelector("button[type='submit']");
    if (submit) submit.disabled = !faqCheck.checked;
    if (faqCheck.checked) {
      showToast("FAQ confirmado. Descreva o problema com detalhes para abrir o ticket.", "success");
    }
  });

  document.addEventListener("submit", async (event) => {
    const cancellationForm = event.target.closest("[data-enrollment-cancellation-form]");
    if (cancellationForm) {
      event.preventDefault();
      const status = cancellationForm.querySelector("[data-enrollment-cancellation-status]");
      if (!state.portalReady) {
        setFeedback(status, "Entre no portal antes de cancelar uma inscrição.", "error");
        return;
      }
      const data = getFormData(cancellationForm);
      const confirmed = cancellationForm.querySelector("[name='confirmacao']")?.checked;
      if (!data.oficinaId || !confirmed) {
        setFeedback(status, "Escolha a oficina e confirme o cancelamento para continuar.", "error");
        return;
      }
      const button = cancellationForm.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "Cancelando...";
      try {
        const result = await secureRequest("/suporte/inscricoes/cancelar", {
          method: "POST",
          body: { oficinaId: data.oficinaId, confirmacao: true }
        });
        showToast(result.message, "success");
        await loadStudentPortalSession();
      } catch (error) {
        setFeedback(status, error.message, "error");
        button.disabled = false;
        button.textContent = "Confirmar cancelamento";
      }
      return;
    }

    const feedbackForm = event.target.closest("[data-workshop-feedback-form]");
    if (feedbackForm) {
      event.preventDefault();
      const status = feedbackForm.querySelector("[data-workshop-feedback-status]");
      if (!state.portalReady) {
        setFeedback(status, "Entre no portal antes de avaliar uma oficina.", "error");
        return;
      }
      const data = getFormData(feedbackForm);
      data.rating = Number(data.rating || 0);
      if (!data.oficinaId) {
        setFeedback(status, "Selecione a oficina que deseja avaliar.", "error");
        return;
      }
      if (!data.rating || data.rating < 1 || data.rating > 5) {
        setFeedback(status, "Escolha uma nota de 1 a 5 estrelas.", "error");
        return;
      }
      if (String(data.comentario || "").trim().length < 5) {
        setFeedback(status, "Escreva um comentário com pelo menos 5 caracteres.", "error");
        return;
      }
      const button = feedbackForm.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "Enviando...";
      try {
        const result = await secureRequest("/suporte/feedback", {
          method: "POST",
          body: data
        });
        setFeedback(status, result.message, "success");
        showToast(result.message, "success");
        feedbackForm.reset();
        await loadStudentPortalSession();
      } catch (error) {
        setFeedback(status, error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Enviar avaliação";
      }
      return;
    }

    const ticketForm = event.target.closest("[data-student-ticket-form]");
    if (!ticketForm) return;
    event.preventDefault();
    const ticketFeedback = ticketForm.querySelector("[data-student-ticket-feedback]");
    if (!state.portalReady) {
      setFeedback(ticketFeedback, "Entre no portal antes de abrir ticket.", "error");
      return;
    }
    const data = getFormData(ticketForm);
    const readFaq = ticketForm.querySelector("[data-support-faq-check]")?.checked;
    if (!readFaq) {
      setFeedback(ticketFeedback, "Leia o FAQ e marque a confirmação antes de abrir o ticket.", "error");
      return;
    }
    if (String(data.descricao || "").trim().length < 10) {
      setFeedback(ticketFeedback, "Descreva o problema com pelo menos 10 caracteres.", "error");
      return;
    }
    const attachmentInput = ticketForm.querySelector("[data-ticket-attachments]");
    const attachmentFiles = Array.from(attachmentInput?.files || []);
    const attachmentError = ticketAttachmentError(attachmentFiles);
    if (attachmentError) {
      setFeedback(ticketFeedback, attachmentError, "error");
      return;
    }
    const button = ticketForm.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Enviando...";
    try {
      const formData = new FormData();
      formData.append("categoria", data.categoria);
      formData.append("descricao", data.descricao);
      attachmentFiles.forEach((file) => formData.append("anexos", file));
      const result = await secureRequest("/suporte/tickets", {
        method: "POST",
        body: formData
      });
      setFeedback(ticketFeedback, result.message, "success");
      showToast(result.message, "success");
      ticketForm.reset();
      ticketForm.querySelector("[data-ticket-attachments-preview]")?.replaceChildren();
      await loadStudentPortalSession();
    } catch (error) {
      const detail = error.details?.[0]?.message || "";
      setFeedback(ticketFeedback, detail ? `${error.message} ${detail}` : error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Abrir ticket";
    }
  });

  localStorage.removeItem("cj-portal-cpf");
  loadStudentPortalSession().catch(() => {});
}

function appendAiMessageContent(node, content) {
  const lines = String(content || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    node.append(createElement("p", { text: "" }));
    return;
  }

  let list = null;
  lines.forEach((line) => {
      const bullet = line.match(/^[\u2022*-]\s+(.+)$/);
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
      pushAiMessage("assistant", "Olá! Posso ajudar com documentos, assinatura pelo gov.br, oficinas disponíveis, consulta de inscrição e canais oficiais de atendimento.");
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
    pushAiMessage("assistant", data.message || "Não consegui responder agora. Tente reformular a pergunta ou fale com a equipe pelo WhatsApp: (41) 3657-2117.");
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

function readPublicCache(resource) {
  const setting = publicCacheSettings[resource];
  if (!setting) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(setting.key) || "null");
    if (!stored || Date.now() - Number(stored.savedAt || 0) > setting.ttl) return null;
    return stored.value;
  } catch (error) {
    return null;
  }
}

function writePublicCache(resource, value) {
  const setting = publicCacheSettings[resource];
  if (!setting) return;
  try {
    localStorage.setItem(setting.key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch (error) {
    // Public cache is opportunistic and must not prevent rendering.
  }
}

function applyWorkshopsData(data, cache = false) {
  if (!Array.isArray(data?.oficinas) || !data.oficinas.length) return false;
  state.workshops = data.oficinas;
  state.categories = data.categorias?.length
    ? data.categorias
    : ["Todas", ...Array.from(new Set(state.workshops.map((item) => item.categoria)))];
  state.workshopsLoaded = true;
  if (cache) writePublicCache("oficinas", data);
  renderCategoryFilters();
  populateOfficeSelects();
  renderWorkshops();
  setupYearAndStats();
  return true;
}

function hydratePublicCache() {
  const oficinas = readPublicCache("oficinas");
  if (oficinas) applyWorkshopsData(oficinas);
  const galeria = readPublicCache("galeria");
  if (Array.isArray(galeria?.galeria) && galeria.galeria.length) {
    state.galleryItems = galeria.galeria.map((item) => ({ src: item.imagemUrl, alt: item.alt || item.titulo, caption: item.titulo }));
  }
  const colaboradores = readPublicCache("colaboradores");
  if (Array.isArray(colaboradores?.colaboradores) && colaboradores.colaboradores.length) state.collaborators = colaboradores.colaboradores;
  const depoimentos = readPublicCache("depoimentos");
  if (Array.isArray(depoimentos?.depoimentos) && depoimentos.depoimentos.length) state.testimonials = depoimentos.depoimentos;
  const faq = readPublicCache("faq");
  if (Array.isArray(faq?.faq) && faq.faq.length) state.faq = faq.faq;
}

async function refreshPublicWorkshops() {
  try {
    const started = performance.now();
    const data = await apiRequest("/oficinas", { timeout: 10000, cache: "default", headers: { "Cache-Control": "max-age=60" } });
    applyWorkshopsData(data, true);
    if (location.hostname === "localhost") console.debug(`[performance] oficinas: ${Math.round(performance.now() - started)}ms`);
  } catch (error) {
    if (!state.workshopsLoaded) {
      renderWorkshopLoading("N\u00e3o foi poss\u00edvel carregar as oficinas no momento.");
    }
  }
}

function refreshPublicContent() {
  refreshPublicWorkshops();
  const publicOptions = { timeout: 10000, cache: "default", headers: { "Cache-Control": "max-age=60" } };
  apiRequest("/galeria", publicOptions).then((data) => {
    if (!Array.isArray(data.galeria) || !data.galeria.length) return;
    state.galleryItems = data.galeria.map((item) => ({ src: item.imagemUrl, alt: item.alt || item.titulo, caption: item.titulo }));
    writePublicCache("galeria", data);
    renderGallery();
  }).catch(() => {});
  apiRequest("/colaboradores", publicOptions).then((data) => {
    if (!Array.isArray(data.colaboradores) || !data.colaboradores.length) return;
    state.collaborators = data.colaboradores;
    writePublicCache("colaboradores", data);
    renderCollaborators();
  }).catch(() => {});
  apiRequest("/depoimentos", publicOptions).then((data) => {
    if (!Array.isArray(data.depoimentos) || !data.depoimentos.length) return;
    state.testimonials = data.depoimentos;
    writePublicCache("depoimentos", data);
    renderTestimonials();
  }).catch(() => {});
  apiRequest("/faq", publicOptions).then((data) => {
    if (!Array.isArray(data.faq) || !data.faq.length) return;
    state.faq = data.faq;
    writePublicCache("faq", data);
    renderFaq();
  }).catch(() => {});
}

async function init() {
  applyLogoPalette();
  setupTheme();
  setupNavigation();
  setupReveal();
  hydratePublicCache();
  renderCategoryFilters();
  setupWorkshopSearch();
  populateOfficeSelects();
  if (state.workshopsLoaded) {
    renderWorkshops();
  } else {
    renderWorkshopLoading();
  }
  setupWorkshopRoutes();
  renderAgenda();
  renderGallery();
  renderCollaborators();
  renderTestimonials();
  renderFaq();
  refreshPublicContent();
  setupWorkshopDialog();
  setupPhoneMasks();
  setupCpfMasks();
  await setupPuzzleCaptcha();
  setupSignupToggle();
  setupSignupForm();
  setupStudentPortal();
  setupAiChat();
  setupYearAndStats();
}

init();

