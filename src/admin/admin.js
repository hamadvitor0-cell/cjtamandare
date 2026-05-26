import { workshops as fallbackWorkshops } from "../../frontend/js/data.js";
import { apiRequest, secureRequest as secureApiRequest, apiUrl, getCsrfToken } from "../../frontend/js/api.js";
import {
  createElement,
  debounce,
  formatDate,
  getFormData,
  isValidCpf,
  maskCpfValue,
  setFeedback,
  showToast,
  setupCpfMasks,
  setupPhoneMasks
} from "../../frontend/js/utils.js";
import { applyLogoPalette } from "../../frontend/js/palette.js";

const credentialQueryKeys = [
  "username",
  "email",
  "registrationCode",
  "password",
  "senha",
  "codigo",
  "code",
  "token",
  "access_token",
  "csrf_token"
];

function sanitizeCredentialUrl() {
  const url = new URL(window.location.href);
  const found = credentialQueryKeys.filter((key) => url.searchParams.has(key));
  if (!found.length) return false;

  window.history.replaceState({}, document.title, `${url.pathname}${url.hash || ""}`);
  sessionStorage.setItem("cj-admin-url-cleaned", found.join(","));
  return true;
}

const state = {
  admin: null,
  oficinas: fallbackWorkshops.map((item) => ({
    ...item,
    id: item.nome,
    faixaEtaria: item.faixaEtaria,
    imagemUrl: "/img/oficinas.png",
    ativo: true
  })),
  galeria: [],
  colaboradores: [],
  depoimentos: [],
  faq: [],
  turmas: [],
  supportTickets: [],
  supportPosts: [],
  workshopFeedbacks: [],
  firstAccessStudents: [],
  firstAccessPagination: { page: 1, limit: 20, total: 0, pages: 1 },
  manual: null,
  manualSearch: "",
  graficos: null,
  graficosOverview: null,
  adminUsers: [],
  auditLogs: [],
  alunos: [],
  studentPagination: { page: 1, limit: 20, total: 0, pages: 1 },
  classStudents: [],
  attendanceClasses: [],
  bolsistas: [],
  attendanceRows: [],
  inscricoes: [],
  search: "",
  oficina: "",
  studentSearch: "",
  studentOffice: "",
  studentStatus: "",
  studentSort: "nome",
  loadedPages: new Set(),
  pageLoads: new Map(),
  classSearch: "",
  classOffice: "",
  classPeriod: "",
  classStatus: "",
  classBolsista: "",
  bolsistaSearch: "",
  bolsistaOffice: "",
  feedbackOffice: "",
  feedbackRating: "",
  chartPeriod: "geral",
  chartMonth: "",
  chartWeek: "",
  chartSort: "inscritos_desc",
  logSearch: "",
  logAction: "",
  logEntity: "",
  logStart: "",
  logEnd: "",
  firstAccessFilters: {
    oficinaId: "",
    turma: "",
    statusPrimeiroAcesso: "sem_primeiro_acesso",
    statusOrientacao: "todos",
    search: "",
    page: 1,
    limit: 20
  },
  calendar: {
    month: new Date().toISOString().slice(0, 7),
    aulas: [],
    eventos: []
  }
};

async function secureRequest(path, options = {}) {
  const result = await secureApiRequest(path, options);
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && path !== "/auth/logout") {
    showToast(result?.message || "Alteração salva com sucesso.", "success");
  }
  return result;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const dayLabels = {
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
  domingo: "Domingo"
};

function formatDays(days = []) {
  return days.length ? days.map((day) => dayLabels[day] || day).join(" e ") : "dias a definir";
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
    "a definir": "Período a definir"
  };
  return labels[period] || period;
}

function monthLabel(month) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return "";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1, 12)));
}

function addMonths(month, amount) {
  const [year, monthNumber] = String(month || state.calendar.month).split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1, 12));
  return date.toISOString().slice(0, 7);
}

function dateFromMonthDay(month, day) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function weekdayIndexMondayFirst(dateValue) {
  const day = new Date(`${dateValue}T12:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

const bolsistaFunctionLabels = {
  adm: "ADM",
  social_media: "Social media",
  professor: "Professor",
  ajudante_professor: "Ajudante de professor"
};

const bolsistaActionLabels = {
  aula: "Dá aula",
  ajuda: "Ajuda professor",
  apoio: "Apoio",
  sem_vinculo: "Sem vínculo direto"
};

const eventTypeLabels = {
  aula: "Aula",
  evento: "Evento",
  reuniao: "Reunião",
  passeio: "Passeio",
  cancelamento: "Cancelamento",
  comunicado: "Comunicado",
  formacao: "Formação",
  outro: "Outro"
};

const loginView = document.querySelector("[data-login-view]");
const adminView = document.querySelector("[data-admin-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginFeedback = document.querySelector("[data-login-feedback]");
const tableBody = document.querySelector("[data-inscricoes-table]");
const editDialog = document.querySelector("[data-edit-dialog]");
const editForm = document.querySelector("[data-edit-form]");
const editFeedback = document.querySelector("[data-edit-feedback]");
const documentsDialog = document.querySelector("[data-documents-dialog]");
const documentsList = document.querySelector("[data-documents-list]");
const profileDialog = document.querySelector("[data-profile-dialog]");
const profileContent = document.querySelector("[data-profile-content]");
const profileSubtitle = document.querySelector("[data-profile-subtitle]");
const aiAssistDialog = document.querySelector("[data-ai-assist-dialog]");
const aiAssistContent = document.querySelector("[data-ai-assist-content]");
const pageTitle = document.querySelector("[data-page-title]");

const pageTitles = {
  dashboard: "Dashboard",
  graficos: "Gráficos",
  "ia-adm": "IA ADM",
  suporte: "Suporte",
  "primeiro-acesso": "Primeiro Acesso",
  manual: "Manual ADM",
  mural: "Mural",
  feedbacks: "Feedbacks",
  automacao: "Automação",
  relatorios: "Relatórios",
  inscritos: "Inscritos",
  oficinas: "Oficinas",
  turmas: "Turmas",
  galeria: "Galeria",
  colaboradores: "Colaboradores",
  depoimentos: "Depoimentos",
  faq: "FAQ",
  alunos: "Alunos",
  bolsistas: "Bolsistas",
  calendario: "Calendário",
  chamada: "Chamada",
  "usuarios-adm": "ADMs",
  logs: "Logs"
};

const pageAliases = {
  ia: "ia-adm",
  assistente: "ia-adm",
  reports: "relatorios",
  relatorio: "relatorios",
  comunicacao: "mural",
  murais: "mural",
  notificacoes: "mural",
  "gerenciar-oficinas": "oficinas",
  "gerenciar-galeria": "galeria",
  colaboradores: "colaboradores",
  parceiros: "colaboradores",
  ajuda: "manual",
  guia: "manual"
};

const navIconPaths = {
  dashboard: ["M4 13h7V4H4v9Z", "M13 20h7V4h-7v16Z", "M4 20h7v-5H4v5Z"],
  graficos: ["M5 19V5", "M5 19h14", "M9 16v-5", "M13 16V8", "M17 16v-10", "M7 7l4 3 5-5"],
  inscritos: ["M5 5h14v14H5z", "M8 9h8", "M8 13h8", "M8 17h5"],
  alunos: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 20a8 8 0 0 1 16 0"],
  turmas: ["M4 7h16", "M4 12h16", "M4 17h16", "M8 4v16", "M16 4v16"],
  oficinas: ["M5 18h14", "M7 18V8l5-4 5 4v10", "M10 18v-5h4v5"],
  chamada: ["M5 4h14v16H5z", "M8 9l2 2 4-4", "M8 15h8"],
  calendario: ["M5 6h14v14H5z", "M8 4v4", "M16 4v4", "M5 10h14"],
  suporte: ["M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4", "M4 12v4a2 2 0 0 0 2 2h2v-6H4", "M12 18h3"],
  "primeiro-acesso": ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 20a7 7 0 0 1 14 0", "M17 10l2 2 3-4"],
  mural: ["M5 5h14v12H8l-3 3V5z", "M8 9h8", "M8 13h6"],
  feedbacks: ["M12 17.3 6.8 20l1-5.8L3.6 10.1l5.8-.8L12 4l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 17.3Z", "M4 21h16"],
  faq: ["M12 18h.01", "M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2 1-1.7 1.6-1.7 3.2", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"],
  "ia-adm": ["M12 3l1.7 4.2L18 9l-4.3 1.8L12 15l-1.7-4.2L6 9l4.3-1.8L12 3Z", "M5 16l.8 2L8 19l-2.2 1L5 22l-.8-2L2 19l2.2-1L5 16Z"],
  automacao: ["M12 5v3", "M12 16v3", "M5 12h3", "M16 12h3", "M8 8l8 8", "M16 8l-8 8"],
  relatorios: ["M5 19V5", "M5 19h14", "M9 16v-5", "M13 16V8", "M17 16v-8"],
  galeria: ["M5 5h14v14H5z", "M8 15l3-3 2 2 2-3 3 4", "M9 9h.01"],
  colaboradores: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M3 20a5 5 0 0 1 10 0", "M11 20a5 5 0 0 1 10 0"],
  depoimentos: ["M5 6h14v9H8l-3 4V6z", "M9 10h6", "M9 13h4"],
  bolsistas: ["M12 4l8 4-8 4-8-4 8-4Z", "M6 10v4c0 2 3 4 6 4s6-2 6-4v-4"],
  "usuarios-adm": ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 20a8 8 0 0 1 16 0", "M18 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"],
  logs: ["M5 5h14v14H5z", "M8 9h8", "M8 13h8", "M8 17h4"],
  manual: ["M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Z", "M8 4v14a2 2 0 0 0 2 2", "M10 8h5"],
  publico: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"]
};

function createIcon(name, className = "ui-icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  (navIconPaths[name] || navIconPaths.dashboard).forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  });
  return svg;
}

function setupAdminNavIcons() {
  document.querySelectorAll("[data-admin-nav] a").forEach((link) => {
    if (link.querySelector(".nav-icon")) return;
    const page = link.dataset.adminPageLink;
    const iconName = page || (link.getAttribute("href") === "/" ? "publico" : "manual");
    const label = link.textContent.trim();
    link.replaceChildren(createIcon(iconName, "nav-icon"), createElement("span", { text: label }));
  });
}

const roleLabels = {
  master: "Master",
  admin: "ADM",
  chamadas: "Chamadas"
};

const auditActionLabels = {
  login: "Login",
  create: "Criou",
  update: "Editou",
  delete: "Excluiu",
  send: "Enviou",
  export: "Exportou",
  denied: "Acesso negado"
};

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

const rolePages = {
  master: Object.keys(pageTitles),
  admin: Object.keys(pageTitles).filter((page) => !["usuarios-adm", "logs"].includes(page)),
  chamadas: ["chamada"]
};

function allowedPages() {
  return rolePages[state.admin?.role || "admin"] || rolePages.admin;
}

function canAccessPage(page) {
  return allowedPages().includes(page);
}

function firstAllowedPage() {
  return allowedPages()[0] || "dashboard";
}

function showAdmin() {
  loginView.hidden = true;
  adminView.hidden = false;
  updateMasterVisibility();
}

function showLogin() {
  loginView.hidden = false;
  adminView.hidden = true;
}

function normalizePage(page) {
  const normalized = pageAliases[page] || page;
  if (!pageTitles[normalized]) return firstAllowedPage();
  return canAccessPage(normalized) ? normalized : firstAllowedPage();
}

function updateMasterVisibility() {
  const isMaster = state.admin?.role === "master";
  document.querySelectorAll("[data-master-only]").forEach((node) => {
    node.hidden = !isMaster;
  });
  document.querySelectorAll("[data-admin-page-link]").forEach((link) => {
    link.hidden = !canAccessPage(link.dataset.adminPageLink);
  });
  document.querySelectorAll("[data-admin-nav] a:not([data-admin-page-link])").forEach((link) => {
    link.hidden = state.admin?.role === "chamadas";
  });
  document.querySelectorAll("[data-admin-nav] .nav-section").forEach((section) => {
    const visibleLinks = Array.from(section.querySelectorAll("a")).some((link) => !link.hidden);
    section.hidden = !visibleLinks;
  });
  document.querySelector(".global-search")?.classList.toggle("is-disabled", state.admin?.role === "chamadas");
}

function showAdminPage(page, updateHash = false) {
  const activePage = normalizePage(page);
  document.querySelectorAll("[data-admin-page]").forEach((section) => {
    section.hidden = section.dataset.adminPage !== activePage;
  });
  document.querySelectorAll("[data-admin-page-link]").forEach((link) => {
    const isActive = link.dataset.adminPageLink === activePage;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  if (pageTitle) pageTitle.textContent = pageTitles[activePage];
  if (updateHash && window.location.hash !== `#${activePage}`) {
    history.pushState(null, "", `#${activePage}`);
  }
  if (adminView && !adminView.hidden) {
    document.querySelector(".admin-main")?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (state.admin) {
    loadPageData(activePage).catch((error) => showToast(error.message || "Não foi possível carregar esta área.", "error"));
  }
}

function setupAdminPages() {
  showAdminPage(window.location.hash.replace("#", "") || "dashboard");
  document.querySelectorAll("[data-admin-page-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showAdminPage(link.dataset.adminPageLink, true);
    });
  });
  window.addEventListener("hashchange", () => {
    showAdminPage(window.location.hash.replace("#", ""));
  });
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
    if (icon) icon.textContent = theme === "dark" ? "\u2600" : "\u25d0";
  }

  apply(initial);
  button?.addEventListener("click", () => {
    apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}

function populateSelects() {
  document.querySelectorAll("[data-admin-office-filter], [data-edit-office-select]").forEach((select) => {
    const current = select.multiple
      ? Array.from(select.selectedOptions).map((option) => option.value)
      : select.value;
    const first = !select.multiple ? select.querySelector("option[value='']")?.cloneNode(true) : null;
    select.replaceChildren();
    if (first) select.append(first);
    state.oficinas.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.nome }
      }));
    });
    if (select.multiple) {
      setSelectedValues(select, current);
    } else {
      select.value = current;
    }
  });

  document.querySelectorAll("[data-student-office-select], [data-student-office-filter], [data-class-office-filter], [data-feedback-office-filter], [data-first-access-office-filter], [data-turma-office-select]").forEach((select) => {
    const current = select.multiple
      ? Array.from(select.selectedOptions).map((option) => option.value)
      : select.value;
    const first = !select.multiple ? select.querySelector("option[value='']")?.cloneNode(true) : null;
    select.replaceChildren();
    if (first && !select.multiple) select.append(first);
    state.oficinas.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.id }
      }));
    });
    if (select.multiple) {
      setSelectedValues(select, current);
    } else {
      select.value = state.oficinas.some((item) => item.id === current) ? current : (first ? "" : state.oficinas[0]?.id || "");
    }
  });
  renderStudentOfficePicker();
  renderTurmaDayPicker();
  populateAttendanceClassSelect();

  document.querySelectorAll("[data-bolsista-office-select], [data-bolsista-office-filter]").forEach((select) => {
    const current = select.multiple
      ? Array.from(select.selectedOptions).map((option) => option.value)
      : select.value;
    const first = !select.multiple ? select.querySelector("option[value='']")?.cloneNode(true) : null;
    select.replaceChildren();
    if (first) select.append(first);
    state.oficinas.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.id }
      }));
    });
    if (select.multiple) {
      setSelectedValues(select, current);
    } else {
      select.value = state.oficinas.some((item) => item.id === current) ? current : "";
    }
  });
  renderBolsistaOfficePicker();
  populateTurmaBolsistaSelects();

  document.querySelectorAll("[data-calendar-event-office]").forEach((select) => {
    const current = select.value;
    const first = select.querySelector("option[value='']")?.cloneNode(true);
    select.replaceChildren();
    if (first) select.append(first);
    state.oficinas.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.id }
      }));
    });
    select.value = state.oficinas.some((item) => item.id === current) ? current : "";
  });
}

function populateTurmaBolsistaSelects() {
  document.querySelectorAll("[data-turma-bolsista-select], [data-class-bolsista-filter]").forEach((select) => {
    const current = select.value;
    const first = select.querySelector("option[value='']")?.cloneNode(true);
    select.replaceChildren();
    if (first) select.append(first);
    state.bolsistas
      .filter((bolsista) => bolsista.status !== "inativo")
      .forEach((bolsista) => {
        select.append(createElement("option", {
          text: bolsista.nome,
          attrs: { value: bolsista.id }
        }));
      });
    select.value = state.bolsistas.some((item) => item.id === current) ? current : "";
  });
}

function attendanceClassValue(item = {}) {
  return `${item.oficinaId || ""}::${item.turmaId || ""}::${encodeURIComponent(item.turma || "")}`;
}

function parseAttendanceClassValue(value = "") {
  const parts = String(value || "").split("::");
  const [oficinaId = "", maybeTurmaId = "", encodedTurma = ""] = parts.length >= 3
    ? parts
    : [parts[0] || "", "", parts[1] || ""];
  return {
    oficinaId,
    turmaId: maybeTurmaId,
    turma: decodeURIComponent(encodedTurma || "")
  };
}

function populateAttendanceClassSelect() {
  const select = document.querySelector("[data-attendance-office]");
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  select.append(createElement("option", { text: "Selecione uma turma", attrs: { value: "" } }));
  const options = state.attendanceClasses.length
    ? state.attendanceClasses
    : state.oficinas.flatMap((oficina) => (oficina.turmas?.length ? oficina.turmas : [""]).map((turma) => ({
      oficinaId: oficina.id,
      oficina: oficina.nome,
      turma,
      label: [oficina.nome, turma].filter(Boolean).join(" · ")
    })));
  options.forEach((item) => {
    select.append(createElement("option", {
      text: item.label || [item.oficina, item.turma].filter(Boolean).join(" · "),
      attrs: { value: attendanceClassValue(item) }
    }));
  });
  select.value = Array.from(select.options).some((option) => option.value === current) ? current : "";
}

function populateBolsistaSelects() {
  document.querySelectorAll("[data-calendar-event-bolsistas]").forEach((select) => {
    const current = Array.from(select.selectedOptions).map((option) => option.value);
    select.replaceChildren();
    state.bolsistas
      .filter((bolsista) => bolsista.status === "ativo")
      .forEach((bolsista) => {
        select.append(createElement("option", {
          text: bolsista.nome,
          attrs: { value: bolsista.id }
        }));
      });
    setSelectedValues(select, current);
  });
}

async function checkSession() {
  await secureRequest("/auth/logout", { method: "POST" }).catch(() => {});
  showLogin();
}

async function refreshAll() {
  const page = normalizePage(window.location.hash.replace("#", "") || firstAllowedPage());
  await loadPageData(page, true);
}

async function loadAdminData() {
  state.loadedPages.clear();
  state.pageLoads.clear();
  const page = state.admin?.role === "chamadas"
    ? "chamada"
    : normalizePage(window.location.hash.replace("#", "") || "dashboard");
  showAdminPage(page, true);
  await loadPageData(page, true);
}

async function loadAdminUsers() {
  if (state.admin?.role !== "master") return;
  const data = await apiRequest("/admin/usuarios");
  state.adminUsers = data.admins || [];
  renderAdminUserList();
}

async function loadAuditLogs() {
  const params = new URLSearchParams();
  if (state.logSearch) params.set("search", state.logSearch);
  if (state.logAction) params.set("action", state.logAction);
  if (state.logEntity) params.set("entityType", state.logEntity);
  if (state.logStart) params.set("dataInicio", state.logStart);
  if (state.logEnd) params.set("dataFim", state.logEnd);
  const data = await apiRequest(`/admin/logs?${params.toString()}`);
  state.auditLogs = data.logs || [];
  renderAuditLogs();
}

async function loadDashboard() {
  const data = await apiRequest("/dashboard");
  renderDashboard(data.dashboard);
}

async function loadInscricoes() {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.oficina) params.set("oficina", state.oficina);
  const data = await apiRequest(`/inscricoes?${params.toString()}`);
  state.inscricoes = data.inscricoes;
  renderTable();
  renderAiStudentSelect();
  renderAutomation();
  renderReports();
}

async function loadManagedModule(endpoint, label) {
  try {
    return await apiRequest(endpoint);
  } catch (error) {
    showToast(`Não foi possível carregar ${label}. Atualize a página ou tente novamente em instantes.`, "error");
    return null;
  }
}

async function loadManagedContent(requested = ["oficinas", "turmas", "galeria", "colaboradores", "depoimentos", "faq"]) {
  if (state.admin?.role === "chamadas") {
    const [oficinasData, turmasData] = await Promise.all([
      loadManagedModule("/admin/oficinas?includeInactive=true", "oficinas"),
      loadManagedModule("/admin/turmas?includeInactive=true", "turmas")
    ]);
    state.oficinas = oficinasData?.oficinas || state.oficinas || [];
    state.turmas = turmasData?.turmas || state.turmas || [];
    populateSelects();
    return;
  }
  const endpoints = {
    oficinas: ["/admin/oficinas?includeInactive=true", "oficinas"],
    turmas: ["/admin/turmas?includeInactive=true", "turmas"],
    galeria: ["/admin/galeria?includeInactive=true", "galeria"],
    colaboradores: ["/admin/colaboradores?includeInactive=true", "colaboradores"],
    depoimentos: ["/admin/depoimentos?includeInactive=true", "depoimentos"],
    faq: ["/admin/faq", "FAQ"]
  };
  const responses = await Promise.all(requested.map(async (key) => [key, await loadManagedModule(...endpoints[key])]));
  const loaded = Object.fromEntries(responses);
  if (loaded.oficinas) state.oficinas = loaded.oficinas.oficinas || state.oficinas;
  if (loaded.turmas) state.turmas = loaded.turmas.turmas || state.turmas;
  if (loaded.galeria) state.galeria = loaded.galeria.galeria || state.galeria;
  if (loaded.colaboradores) state.colaboradores = loaded.colaboradores.colaboradores || state.colaboradores;
  if (loaded.depoimentos) state.depoimentos = loaded.depoimentos.depoimentos || state.depoimentos;
  if (loaded.faq) state.faq = loaded.faq.faq || state.faq;
  populateSelects();
  populateSupportSelects();
  if (loaded.oficinas) renderOfficeList();
  if (loaded.turmas) renderClassList();
  if (loaded.galeria) renderGalleryList();
  if (loaded.colaboradores) renderCollaboratorList();
  if (loaded.depoimentos) renderTestimonialList();
  if (loaded.faq) renderFaqList();
}

async function loadPageData(page, force = false) {
  if (!state.admin) return;
  if (!force && state.loadedPages.has(page)) return;
  if (state.pageLoads.has(page)) return state.pageLoads.get(page);
  const pending = (async () => {
    switch (page) {
      case "dashboard": await loadDashboard(); break;
      case "inscritos": await Promise.all([loadManagedContent(["oficinas"]), loadInscricoes()]); break;
      case "alunos": await Promise.all([loadManagedContent(["oficinas", "turmas"]), loadAlunos()]); break;
      case "oficinas": await loadManagedContent(["oficinas"]); break;
      case "turmas": await Promise.all([loadManagedContent(["oficinas", "turmas"]), loadBolsistas()]); break;
      case "galeria": await loadManagedContent(["galeria"]); break;
      case "colaboradores": await loadManagedContent(["colaboradores"]); break;
      case "depoimentos": await loadManagedContent(["depoimentos"]); break;
      case "faq": await loadManagedContent(["faq"]); break;
      case "bolsistas": await Promise.all([loadManagedContent(["oficinas"]), loadBolsistas()]); break;
      case "calendario": await Promise.all([loadManagedContent(["oficinas"]), loadBolsistas(), loadCalendar()]); break;
      case "chamada": await Promise.all([loadManagedContent(["oficinas", "turmas"]), loadAttendanceClasses(), loadAttendanceHistory()]); break;
      case "suporte":
      case "mural": await loadSupport(); break;
      case "graficos": await loadGraficos(); break;
      case "feedbacks": await loadWorkshopFeedbacks(); break;
      case "primeiro-acesso": await Promise.all([loadManagedContent(["oficinas", "turmas"]), loadFirstAccess()]); break;
      case "manual": await loadManual(); break;
      case "usuarios-adm": await loadAdminUsers(); break;
      case "logs": await loadAuditLogs(); break;
      case "relatorios": await Promise.all([loadInscricoes(), loadBolsistas()]); renderReports(); break;
      default: break;
    }
    state.loadedPages.add(page);
  })();
  state.pageLoads.set(page, pending);
  try {
    await pending;
  } finally {
    state.pageLoads.delete(page);
  }
}

async function loadAttendanceClasses() {
  const data = await apiRequest("/chamadas/turmas");
  state.attendanceClasses = data.turmas || [];
  populateAttendanceClassSelect();
}

async function loadAlunos() {
  renderSkeletonList(document.querySelector("[data-student-list]"), 4);
  const params = new URLSearchParams();
  if (state.studentSearch) params.set("search", state.studentSearch);
  if (state.studentOffice) params.set("oficinaId", state.studentOffice);
  if (state.studentStatus) params.set("status", state.studentStatus);
  params.set("sort", state.studentSort);
  params.set("page", String(state.studentPagination.page));
  params.set("limit", String(state.studentPagination.limit));
  const data = await apiRequest(`/alunos?${params.toString()}`);
  state.alunos = data.alunos || [];
  state.studentPagination = data.pagination || state.studentPagination;
  renderStudentList();
  populateSupportSelects();
}

async function loadBolsistas() {
  const params = new URLSearchParams();
  if (state.bolsistaSearch) params.set("search", state.bolsistaSearch);
  if (state.bolsistaOffice) params.set("oficinaId", state.bolsistaOffice);
  const data = await apiRequest(`/admin/bolsistas?${params.toString()}`);
  state.bolsistas = data.bolsistas || [];
  populateBolsistaSelects();
  populateTurmaBolsistaSelects();
  renderBolsistaList(data.limite || 40);
  renderReports();
}

async function loadCalendar() {
  const data = await apiRequest(`/admin/calendario?mes=${encodeURIComponent(state.calendar.month)}`);
  const calendario = data.calendario || {};
  state.calendar.month = calendario.mes || state.calendar.month;
  state.calendar.aulas = calendario.aulas || [];
  state.calendar.eventos = calendario.eventos || [];
  renderCalendar();
  renderReports();
}

async function loadAttendanceHistory() {
  const selected = parseAttendanceClassValue(document.querySelector("[data-attendance-office]")?.value || "");
  const officeId = selected.oficinaId;
  if (officeId && !uuidPattern.test(officeId)) return;
  const params = new URLSearchParams();
  if (officeId) params.set("oficinaId", officeId);
  if (selected.turmaId) params.set("turmaId", selected.turmaId);
  if (selected.turma) params.set("turma", selected.turma);
  const data = await apiRequest(`/chamadas/historico?${params.toString()}`);
  renderAttendanceHistory(data.chamadas || []);
}

async function loadSupport() {
  renderSupportLoading();
  const data = await apiRequest(`/admin/suporte?_=${Date.now()}`, { cache: "no-store" });
  const support = data.support || {};
  state.supportTickets = support.tickets || [];
  state.supportPosts = support.posts || [];
  populateSupportSelects();
  renderSupportAdmin();
}

async function loadGraficos() {
  renderChartsLoading();
  const params = new URLSearchParams();
  params.set("periodo", state.chartPeriod || "geral");
  params.set("sort", state.chartSort || "inscritos_desc");
  if (state.chartPeriod === "mes" && state.chartMonth) params.set("mes", state.chartMonth);
  if (state.chartPeriod === "semana" && state.chartWeek) params.set("semana", state.chartWeek);
  params.set("_", String(Date.now()));
  const overviewParams = new URLSearchParams({ periodo: "geral", sort: "inscritos_desc", _: String(Date.now()) });
  const [data, overviewData] = await Promise.all([
    apiRequest(`/admin/graficos?${params.toString()}`, { cache: "no-store" }),
    apiRequest(`/admin/graficos?${overviewParams.toString()}`, { cache: "no-store" })
  ]);
  state.graficos = data.graficos || {};
  state.graficosOverview = overviewData.graficos || state.graficos;
  renderGraficos();
}

async function loadWorkshopFeedbacks() {
  renderSkeletonList(document.querySelector("[data-feedback-list]"));
  const params = new URLSearchParams();
  if (state.feedbackOffice) params.set("oficinaId", state.feedbackOffice);
  if (state.feedbackRating) params.set("rating", state.feedbackRating);
  params.set("_", String(Date.now()));
  const data = await apiRequest(`/admin/feedbacks?${params.toString()}`, { cache: "no-store" });
  state.workshopFeedbacks = data.feedbacks || [];
  renderWorkshopFeedbacks();
}

async function loadFirstAccess() {
  if (!state.admin || state.admin.role === "chamadas") return;
  renderSkeletonList(document.querySelector("[data-first-access-list]"), 3);
  const params = new URLSearchParams();
  Object.entries(state.firstAccessFilters).forEach(([key, value]) => {
    if (value !== "" && value !== undefined) params.set(key, String(value));
  });
  const data = await apiRequest(`/admin/primeiro-acesso/alunos?${params.toString()}`, { cache: "no-store" });
  state.firstAccessStudents = data.alunos || [];
  state.firstAccessPagination = data.pagination || state.firstAccessPagination;
  renderFirstAccess();
}

function emptyState(title, text, iconName = "mural") {
  const node = createElement("div", { className: "empty-state" });
  node.append(
    createIcon(iconName, "empty-state-icon"),
    createElement("strong", { text: title }),
    createElement("p", { text })
  );
  return node;
}

const accessEventLabels = {
  copied_access_message: "Mensagem copiada",
  opened_access_whatsapp: "WhatsApp aberto manualmente",
  marked_access_guidance_sent: "Orientação marcada como enviada",
  unmarked_access_guidance_sent: "Orientação desmarcada",
  generated_access_guidance_pdf: "PDF gerado"
};

async function loadFirstAccessHistory(student, target) {
  const data = await apiRequest(`/admin/primeiro-acesso/alunos/${student.id}/historico`, { cache: "no-store" });
  const events = data.events || [];
  target.replaceChildren();
  if (!events.length) {
    target.append(createElement("small", { text: "Nenhuma orientação registrada." }));
    return;
  }
  events.forEach((event) => {
    target.append(createElement("span", {
      text: `${accessEventLabels[event.actionType] || event.actionType} · ${formatDate(event.created_at)} · ${event.adminName || "Usuário administrativo"}`
    }));
  });
}

async function accessMessageFor(student, actionType) {
  return secureApiRequest(`/admin/primeiro-acesso/alunos/${student.id}/mensagem`, {
    method: "POST",
    body: { actionType }
  });
}

async function copyFirstAccessMessage(student) {
  const result = await accessMessageFor(student, "copied_access_message");
  await navigator.clipboard.writeText(result.message);
  showToast("Mensagem copiada. Marque como enviada somente após orientar o aluno.", "success");
}

async function openFirstAccessWhatsapp(student) {
  const result = await accessMessageFor(student, "opened_access_whatsapp");
  if (!result.canOpenWhatsapp || !result.whatsappUrl) {
    showToast(result.warning || "Telefone não cadastrado ou inválido.", "error");
    return;
  }
  window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
  showToast("WhatsApp aberto para envio manual individual.", "success");
}

async function markFirstAccessStudent(student, method) {
  await secureRequest(`/admin/primeiro-acesso/alunos/${student.id}/marcar-enviado`, {
    method: "POST",
    body: { method }
  });
  await loadFirstAccess();
}

async function unmarkFirstAccessStudent(student) {
  await secureRequest(`/admin/primeiro-acesso/alunos/${student.id}/desmarcar-enviado`, {
    method: "POST",
    body: {}
  });
  await loadFirstAccess();
}

function renderFirstAccess() {
  const list = document.querySelector("[data-first-access-list]");
  const pagination = document.querySelector("[data-first-access-pagination]");
  if (!list || !pagination) return;
  list.replaceChildren();
  pagination.replaceChildren();
  if (!state.firstAccessStudents.length) {
    list.append(emptyState("Nenhum aluno encontrado", "Ajuste os filtros para localizar alunos pendentes de orientação.", "primeiro-acesso"));
  }
  state.firstAccessStudents.forEach((student) => {
    const item = createElement("article", { className: "first-access-card" });
    const header = createElement("div", { className: "first-access-card-header" });
    const title = createElement("div");
    title.append(
      createElement("strong", { text: student.nome }),
      createElement("span", { text: `${(student.oficinas || []).join(", ") || "Sem oficina"}${student.turmas?.length ? ` · ${student.turmas.join(", ")}` : ""}` })
    );
    const statuses = createElement("div", { className: "first-access-badges" });
    statuses.append(
      createElement("span", {
        className: `status-badge ${student.primeiroAcessoConcluido ? "status-confirmado" : "status-pendente"}`,
        text: student.primeiroAcessoConcluido ? "Acesso registrado" : "Sem acesso registrado"
      }),
      createElement("span", {
        className: `status-badge ${student.orientacaoEnviada ? "status-confirmado" : "status-pendente"}`,
        text: student.orientacaoEnviada ? "Orientação enviada" : "Orientação pendente"
      })
    );
    header.append(title, statuses);
    const details = createElement("div", { className: "first-access-details" });
    details.append(
      createElement("span", { text: `Matrícula: ${student.matricula || "Não gerada"}` }),
      createElement("span", { text: `CPF: ${student.cpfMascarado || "Não informado"}` }),
      createElement("span", { text: `Telefone: ${student.telefoneMascarado || "Não cadastrado"}` }),
      createElement("span", { text: student.orientacaoEnviadaEm ? `Última orientação: ${formatDate(student.orientacaoEnviadaEm)}` : "Sem orientação registrada" }),
      ...(student.orientacaoEnviadaPorNome ? [createElement("span", { text: `Responsável: ${student.orientacaoEnviadaPorNome}` })] : [])
    );
    const actions = createElement("div", { className: "first-access-actions" });
    const copy = createElement("button", { className: "button button-secondary", text: "Copiar mensagem", attrs: { type: "button" } });
    copy.addEventListener("click", () => copyFirstAccessMessage(student).catch((error) => showToast(error.message, "error")));
    const whatsapp = createElement("button", {
      className: "button button-secondary",
      text: "Abrir WhatsApp",
      attrs: { type: "button", disabled: student.telefoneWhatsappDisponivel ? null : "disabled" }
    });
    whatsapp.addEventListener("click", () => openFirstAccessWhatsapp(student).catch((error) => showToast(error.message, "error")));
    const method = createElement("select", { attrs: { "aria-label": `Método de orientação de ${student.nome}` } });
    [["whatsapp_manual", "WhatsApp manual"], ["presencial", "Presencial"], ["telefone", "Telefone"], ["outro", "Outro"]].forEach(([value, text]) => {
      method.append(createElement("option", { text, attrs: { value } }));
    });
    const mark = createElement("button", {
      className: "button button-primary",
      text: student.orientacaoEnviada ? "Desmarcar envio" : "Marcar como enviada",
      attrs: { type: "button" }
    });
    mark.addEventListener("click", () => {
      const promise = student.orientacaoEnviada ? unmarkFirstAccessStudent(student) : markFirstAccessStudent(student, method.value);
      promise.catch((error) => showToast(error.message, "error"));
    });
    const historyToggle = createElement("button", { className: "button button-secondary", text: "Histórico", attrs: { type: "button" } });
    const history = createElement("div", { className: "first-access-history", attrs: { hidden: "hidden" } });
    historyToggle.addEventListener("click", () => {
      history.hidden = !history.hidden;
      if (!history.hidden) loadFirstAccessHistory(student, history).catch((error) => showToast(error.message, "error"));
    });
    actions.append(copy, whatsapp, method, mark, historyToggle);
    item.append(header, details, actions, history);
    list.append(item);
  });

  const { page, pages, total } = state.firstAccessPagination;
  const previous = createElement("button", { className: "button button-secondary", text: "Anterior", attrs: { type: "button", disabled: page <= 1 ? "disabled" : null } });
  previous.addEventListener("click", () => {
    state.firstAccessFilters.page = Math.max(1, page - 1);
    loadFirstAccess();
  });
  const next = createElement("button", { className: "button button-secondary", text: "Próxima", attrs: { type: "button", disabled: page >= pages ? "disabled" : null } });
  next.addEventListener("click", () => {
    state.firstAccessFilters.page = Math.min(pages, page + 1);
    loadFirstAccess();
  });
  pagination.append(previous, createElement("span", { text: `Página ${page} de ${pages} · ${total} aluno(s)` }), next);
}

async function downloadFirstAccessPdf() {
  const payload = {
    oficinaId: state.firstAccessFilters.oficinaId,
    turma: state.firstAccessFilters.turma,
    somenteSemPrimeiroAcesso: state.firstAccessFilters.statusPrimeiroAcesso === "sem_primeiro_acesso",
    somenteNaoOrientados: state.firstAccessFilters.statusOrientacao === "pendente",
    formato: "cards",
    confirmLarge: false
  };
  if (!payload.oficinaId && !payload.turma) {
    throw new Error("Selecione uma oficina ou informe a turma antes de gerar o PDF.");
  }
  if (!window.confirm("Gerar cartões com matrículas para entrega individual? Guarde o PDF em local seguro.")) return;
  payload.confirmLarge = true;
  const csrfToken = await getCsrfToken();
  const response = await fetch(apiUrl("/admin/primeiro-acesso/pdf"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Não foi possível gerar o PDF.");
  }
  const href = URL.createObjectURL(await response.blob());
  const link = createElement("a", { attrs: { href, download: "primeiro-acesso-cj.pdf" } });
  link.click();
  URL.revokeObjectURL(href);
  showToast("PDF gerado. Entregue cada cartão apenas à pessoa autorizada.", "success");
}

const manualToneLabels = {
  attention: "Atenção",
  danger: "Não faça",
  practice: "Boa prática"
};

async function loadManual() {
  if (!state.admin || state.admin.role === "chamadas") return;
  const feedback = document.querySelector("[data-manual-feedback]");
  if (!state.manual) {
    setFeedback(feedback, "Carregando guia interno...");
    const data = await apiRequest("/admin/manual", { cache: "no-store" });
    state.manual = data.manual;
  }
  setFeedback(feedback, "");
  renderManual();
}

function manualSectionMatches(section, query) {
  if (!query) return true;
  return searchableText(
    section.title,
    section.category,
    section.summary,
    section.profiles,
    section.steps,
    (section.blocks || []).flatMap((block) => [block.title, ...(block.items || [])]),
    (section.notices || []).flatMap((notice) => [notice.label, notice.text])
  ).includes(query);
}

function manualProfileBadge(profile) {
  return createElement("span", {
    className: `manual-badge manual-badge-${String(profile).toLowerCase()}`,
    text: profile
  });
}

function renderManual() {
  const summary = document.querySelector("[data-manual-summary]");
  const sections = document.querySelector("[data-manual-sections]");
  const feedback = document.querySelector("[data-manual-feedback]");
  if (!summary || !sections || !state.manual) return;
  const query = searchableText(state.manualSearch);
  const visibleSections = state.manual.sections.filter((section) => manualSectionMatches(section, query));
  summary.replaceChildren();
  sections.replaceChildren();

  if (!visibleSections.length) {
    sections.append(emptyState("Nenhuma orientação encontrada", "Tente outra palavra, como aluno, matrícula, suporte ou chamada.", "manual"));
    setFeedback(feedback, "Nenhuma seção corresponde à busca.");
    return;
  }
  setFeedback(feedback, state.manualSearch ? `${visibleSections.length} seção(ões) encontrada(s).` : "");

  const summaryTitle = createElement("strong", { className: "manual-summary-title", text: "Sumário" });
  summary.append(summaryTitle);
  visibleSections.forEach((section, index) => {
    const sectionId = `manual-${section.id}`;
    const summaryButton = createElement("button", {
      className: "manual-summary-link",
      attrs: { type: "button" }
    });
    summaryButton.append(
      createElement("span", { text: String(index + 1).padStart(2, "0") }),
      createElement("strong", { text: section.title })
    );
    summaryButton.addEventListener("click", () => {
      const target = document.getElementById(sectionId);
      if (!target) return;
      target.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    summary.append(summaryButton);

    const details = createElement("details", {
      className: "manual-section-card",
      attrs: { id: sectionId }
    });
    details.open = Boolean(state.manualSearch) || section.id === "boas-vindas";
    const header = createElement("summary", { className: "manual-section-heading" });
    const headingCopy = createElement("div");
    const headingLine = createElement("div", { className: "manual-section-title" });
    headingLine.append(
      createElement("span", { className: "manual-section-number", text: String(index + 1).padStart(2, "0") }),
      createElement("h3", { text: section.title })
    );
    headingCopy.append(headingLine, createElement("p", { text: section.summary }));
    const badges = createElement("div", { className: "manual-section-badges" });
    (section.profiles || []).forEach((profile) => badges.append(manualProfileBadge(profile)));
    header.append(headingCopy, badges);

    const body = createElement("div", { className: "manual-section-body" });
    if (section.steps?.length) {
      const list = createElement("ol", { className: "manual-step-list" });
      section.steps.forEach((step) => list.append(createElement("li", { text: step })));
      body.append(list);
    }
    if (section.blocks?.length) {
      const grid = createElement("div", { className: "manual-block-grid" });
      section.blocks.forEach((block) => {
        const card = createElement("section", { className: "manual-block" });
        card.append(createElement("h4", { text: block.title }));
        const items = createElement("ul");
        (block.items || []).forEach((item) => items.append(createElement("li", { text: item })));
        card.append(items);
        grid.append(card);
      });
      body.append(grid);
    }
    (section.notices || []).forEach((notice) => {
      const callout = createElement("aside", { className: `manual-callout is-${notice.tone || "attention"}` });
      callout.append(
        createElement("strong", { text: notice.label || manualToneLabels[notice.tone] || "Atenção" }),
        createElement("p", { text: notice.text })
      );
      body.append(callout);
    });
    const shortcuts = (section.shortcuts || []).filter((shortcut) => canAccessPage(shortcut.page));
    if (shortcuts.length) {
      const actions = createElement("div", { className: "manual-shortcuts" });
      shortcuts.forEach((shortcut) => {
        const button = createElement("button", {
          className: "button button-secondary",
          text: shortcut.label,
          attrs: { type: "button" }
        });
        button.addEventListener("click", () => showAdminPage(shortcut.page, true));
        actions.append(button);
      });
      body.append(actions);
    }
    details.append(header, body);
    sections.append(details);
  });
}

function ratingStars(rating = 0, label = "") {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const node = createElement("span", {
    className: "feedback-stars",
    attrs: { "aria-label": label || `Nota ${value} de 5` }
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

function renderSkeletonList(list, count = 3) {
  if (!list) return;
  list.replaceChildren();
  Array.from({ length: count }).forEach(() => {
    const item = createElement("div", { className: "skeleton-card" });
    item.append(
      createElement("span", { className: "skeleton-line skeleton-line-title" }),
      createElement("span", { className: "skeleton-line" }),
      createElement("span", { className: "skeleton-line skeleton-line-short" })
    );
    list.append(item);
  });
}

function renderSupportLoading() {
  renderSkeletonList(document.querySelector("[data-support-ticket-list]"));
  renderSkeletonList(document.querySelector("[data-support-post-list]"));
}

function renderChartsLoading() {
  renderSkeletonList(document.querySelector("[data-charts-summary]"), 4);
  renderSkeletonList(document.querySelector("[data-charts-grid]"), 4);
  renderSkeletonList(document.querySelector("[data-charts-filtered-grid]"), 1);
  renderSkeletonList(document.querySelector("[data-charts-table]"), 4);
}

function metricLabel(value = 0) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function chartLeader(rows = [], key = "inscritos") {
  return rows.find((row) => Number(row[key] || 0) > 0) || null;
}

const chartSortLabels = {
  inscritos_desc: "Inscritos - maior para menor",
  inscritos_asc: "Inscritos - menor para maior",
  frequencia_desc: "Maior frequência",
  frequencia_asc: "Menor frequência",
  presencas_desc: "Mais presenças",
  presencas_asc: "Menos presenças",
  faltas_desc: "Mais faltas",
  faltas_asc: "Menos faltas",
  justificadas_desc: "Mais faltas justificadas",
  justificadas_asc: "Menos faltas justificadas",
  chamadas_desc: "Mais chamadas",
  chamadas_asc: "Menos chamadas"
};

function chartValueLabel(value, key) {
  return key === "frequenciaPercentual" ? `${Number(value || 0)}%` : metricLabel(value);
}

function chartMetricCard(title, value, subtitle, iconName = "graficos") {
  const card = createElement("article", { className: "chart-metric-card" });
  card.append(
    createIcon(iconName, "chart-metric-icon"),
    createElement("span", { text: title }),
    createElement("strong", { text: metricLabel(value) }),
    createElement("small", { text: subtitle || "Sem dados lançados ainda." })
  );
  return card;
}

function renderBarChart(title, rows = [], key, accentClass = "") {
  const card = createElement("article", { className: `chart-card ${accentClass}`.trim() });
  card.append(createElement("h3", { text: title }));
  const max = Math.max(...rows.map((row) => Number(row[key] || 0)), 1);
  const list = createElement("div", { className: "chart-bars" });
  rows.slice(0, 10).forEach((row, index) => {
    const value = Number(row[key] || 0);
    const bar = createElement("div", { className: "chart-bar-row" });
    bar.append(
      createElement("span", { className: "chart-rank", text: String(index + 1).padStart(2, "0") }),
      createElement("span", { className: "chart-label", text: row.oficina }),
      createElement("span", { className: "chart-track" }),
      createElement("strong", { text: chartValueLabel(value, key) })
    );
    bar.querySelector(".chart-track").style.setProperty("--bar-size", `${Math.max((value / max) * 100, value ? 4 : 0)}%`);
    list.append(bar);
  });
  if (!list.children.length) {
    list.append(emptyState("Sem dados para este gráfico", "Os números aparecerão depois de importar alunos e salvar chamadas.", "graficos"));
  }
  card.append(list);
  return card;
}

function renderDonutChart(title, rows = [], key, accentClass = "") {
  const card = createElement("article", { className: `chart-card chart-donut-card ${accentClass}`.trim() });
  card.append(createElement("h3", { text: title }));
  const items = rows.filter((row) => Number(row[key] || 0) > 0).slice(0, 6);
  const total = items.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  if (!total) {
    card.append(emptyState("Sem dados para este gráfico", "Os números aparecerão depois de importar alunos e salvar chamadas.", "graficos"));
    return card;
  }
  let current = 0;
  const colors = ["#2563eb", "#16a34a", "#f97316", "#d946ef", "#facc15", "#14b8a6"];
  const segments = items.map((row, index) => {
    const value = Number(row[key] || 0);
    const start = current;
    current += (value / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${current}%`;
  });
  const chart = createElement("div", { className: "chart-donut" });
  chart.style.setProperty("--donut-segments", segments.join(", "));
  chart.append(
    createElement("strong", { text: metricLabel(total) }),
    createElement("span", { text: "total" })
  );
  const legend = createElement("div", { className: "chart-donut-legend" });
  items.forEach((row, index) => {
    const item = createElement("span", { className: "chart-donut-item" });
    item.style.setProperty("--dot-color", colors[index % colors.length]);
    item.append(
      createElement("i", { attrs: { "aria-hidden": "true" } }),
      createElement("b", { text: row.oficina }),
      createElement("em", { text: chartValueLabel(row[key], key) })
    );
    legend.append(item);
  });
  card.append(chart, legend);
  return card;
}

function populateChartFilters(graficos = {}) {
  const period = document.querySelector("[data-chart-period-filter]");
  const month = document.querySelector("[data-chart-month-filter]");
  const week = document.querySelector("[data-chart-week-filter]");
  const sort = document.querySelector("[data-chart-sort-filter]");
  const monthField = document.querySelector("[data-chart-month-field]");
  const weekField = document.querySelector("[data-chart-week-field]");
  if (period) period.value = state.chartPeriod || "geral";
  if (sort) sort.value = state.chartSort || "inscritos_desc";
  if (month) {
    const months = graficos.periodOptions?.months || [];
    const current = state.chartMonth || months[months.length - 1]?.key || "";
    month.replaceChildren(createElement("option", { text: "Selecione o mês", attrs: { value: "" } }));
    months.forEach((item) => {
      month.append(createElement("option", { text: item.label || item.key, attrs: { value: item.key } }));
    });
    month.value = current;
    state.chartMonth = month.value;
  }
  if (week) {
    const weeks = graficos.periodOptions?.weeks || [];
    const current = state.chartWeek || weeks[weeks.length - 1]?.key || "";
    week.replaceChildren(createElement("option", { text: "Selecione a semana", attrs: { value: "" } }));
    weeks.forEach((item) => {
      week.append(createElement("option", { text: `${item.key} - ${item.label || ""}`.trim(), attrs: { value: item.key } }));
    });
    week.value = current;
    state.chartWeek = week.value;
  }
  if (monthField) monthField.hidden = state.chartPeriod !== "mes";
  if (weekField) weekField.hidden = state.chartPeriod !== "semana";
}

function renderChartsTable(rows = []) {
  const table = document.querySelector("[data-charts-table]");
  if (!table) return;
  table.replaceChildren();
  if (!rows.length) {
    table.append(emptyState("Nenhum dado de oficina encontrado", "Importe os inscritos e registre chamadas para visualizar o resumo por oficina.", "graficos"));
    return;
  }
  const header = createElement("div", { className: "charts-table-row charts-table-head" });
  ["Oficina", "Inscritos", "Chamadas", "Presenças", "Faltas", "Justificadas", "Freq."].forEach((label) => {
    header.append(createElement("span", { text: label }));
  });
  table.append(header);
  rows.slice(0, 60).forEach((row) => {
    const item = createElement("div", { className: "charts-table-row" });
    item.append(
      createElement("strong", { text: row.oficina }),
      createElement("span", { text: metricLabel(row.inscritos) }),
      createElement("span", { text: metricLabel(row.chamadas) }),
      createElement("span", { text: metricLabel(row.presencas) }),
      createElement("span", { text: metricLabel(row.faltas) }),
      createElement("span", { text: metricLabel(row.justificadas) }),
      createElement("span", { text: `${row.frequenciaPercentual || 0}%` })
    );
    table.append(item);
  });
}

function renderGraficos() {
  const summary = document.querySelector("[data-charts-summary]");
  const grid = document.querySelector("[data-charts-grid]");
  const filteredGrid = document.querySelector("[data-charts-filtered-grid]");
  if (!summary || !grid || !filteredGrid) return;
  const graficos = state.graficos || {};
  const overview = state.graficosOverview || graficos;
  populateChartFilters(graficos);
  const totals = overview.totals || {};
  const rows = graficos.byOficina || [];
  const overviewRows = overview.byOficina || [];
  const leaderInscritos = chartLeader(overview.topInscritos || [], "inscritos");
  const leaderFaltas = chartLeader(overview.topFaltas || [], "faltas");
  const leaderJustificadas = chartLeader(overview.topJustificadas || [], "justificadas");
  const leaderPresencas = chartLeader(overview.topPresencas || [], "presencas");
  summary.replaceChildren(
    chartMetricCard("Total de inscritos", totals.inscritos, leaderInscritos ? `Maior turma: ${leaderInscritos.oficina}` : "Nenhuma oficina com inscritos.", "alunos"),
    chartMetricCard("Presenças registradas", totals.presencas, leaderPresencas ? `Mais presenças: ${leaderPresencas.oficina}` : "Nenhuma chamada salva.", "chamada"),
    chartMetricCard("Faltas registradas", totals.faltas, leaderFaltas ? `Mais faltas: ${leaderFaltas.oficina}` : "Sem faltas registradas.", "suporte"),
    chartMetricCard("Faltas justificadas", totals.justificadas, leaderJustificadas ? `Mais justificadas: ${leaderJustificadas.oficina}` : "Sem justificativas registradas.", "faq")
  );
  if (overview.source === "planilhas_chamadas_2026") {
    const notice = createElement("p", {
      className: "charts-source-note",
      text: `Dados exibidos a partir do resumo geral das planilhas de chamadas 2026 (${overview.files || 0} arquivos). O banco será priorizado quando tiver a base de chamadas completa.`
    });
    summary.append(notice);
  }
  grid.replaceChildren(
    renderDonutChart("Distribuição de inscritos", overview.topInscritos || overviewRows, "inscritos", "chart-accent-primary"),
    renderBarChart("Oficinas com mais inscritos", overview.topInscritos || [], "inscritos", "chart-accent-primary"),
    renderBarChart("Presenças por oficina", overview.topPresencas || [], "presencas", "chart-accent-success"),
    renderBarChart("Faltas por oficina", overview.topFaltas || [], "faltas", "chart-accent-danger")
  );
  filteredGrid.replaceChildren(
    renderBarChart(
      graficos.rankingTitle || chartSortLabels[state.chartSort] || "Ranking filtrado",
      graficos.ranking || rows,
      graficos.rankingKey || "inscritos",
      "chart-accent-primary"
    )
  );
  renderChartsTable(rows);
}

function statusBadge(status) {
  return createElement("span", {
    className: `status-badge status-${status || "aberto"}`,
    text: supportStatusLabels[status] || status || "Aberto"
  });
}

function supportTicketTimeline(ticket) {
  const status = ticket.status || "aberto";
  const steps = [
    ["aberto", "Aberto"],
    ["em_atendimento", "Em atendimento"],
    [status === "encerrado" ? "encerrado" : "respondido", status === "encerrado" ? "Encerrado" : "Resposta"]
  ];
  const activeIndex = Math.max(0, steps.findIndex(([value]) => value === status));
  const normalizedActive = activeIndex === -1 ? (status === "respondido" || status === "encerrado" ? 2 : 0) : activeIndex;
  const timeline = createElement("ol", { className: "ticket-timeline" });
  steps.forEach(([value, label], index) => {
    timeline.append(createElement("li", {
      className: `${index <= normalizedActive ? "is-active" : ""} ${value === status ? "is-current" : ""}`.trim(),
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

function populateSupportSelects() {
  document.querySelectorAll("[data-support-office-select]").forEach((select) => {
    const current = select.value;
    select.replaceChildren();
    select.append(createElement("option", { text: "Selecione uma turma", attrs: { value: "" } }));
    state.oficinas.forEach((oficina) => {
      select.append(createElement("option", { text: oficina.nome, attrs: { value: oficina.id } }));
    });
    select.value = state.oficinas.some((oficina) => oficina.id === current) ? current : "";
  });

  document.querySelectorAll("[data-support-student-select]").forEach((select) => {
    const current = select.value;
    select.replaceChildren();
    select.append(createElement("option", { text: "Selecione um aluno", attrs: { value: "" } }));
    state.alunos.forEach((aluno) => {
      select.append(createElement("option", {
        text: `${aluno.nome}${aluno.cpf ? ` - ${maskCpfValue(aluno.cpf)}` : ""}`,
        attrs: { value: aluno.id }
      }));
    });
    select.value = state.alunos.some((aluno) => aluno.id === current) ? current : "";
  });
}

function renderSupportAdmin() {
  const ticketList = document.querySelector("[data-support-ticket-list]");
  const postList = document.querySelector("[data-support-post-list]");
  if (ticketList) {
    ticketList.replaceChildren();
    if (!state.supportTickets.length) {
      ticketList.append(emptyState("Nenhum ticket aberto", "Quando um aluno abrir um chamado pelo portal, ele aparecerá aqui para resposta da equipe.", "suporte"));
    }
    state.supportTickets.forEach((ticket) => {
      const item = createElement("article", { className: `support-admin-ticket ticket-status-${ticket.status || "aberto"}` });
      const responseForm = createElement("form", { className: "support-response-form", attrs: { "data-support-response-form": ticket.id } });
      const status = createElement("select", { attrs: { name: "status" } });
      Object.entries(supportStatusLabels).forEach(([value, label]) => {
        const option = createElement("option", { text: label, attrs: { value } });
        if (value === ticket.status) option.selected = true;
        status.append(option);
      });
      responseForm.append(
        status,
        createElement("textarea", { text: ticket.resposta || "", attrs: { name: "resposta", rows: "3", maxlength: "2000", placeholder: "Resposta para o aluno" } }),
        createElement("button", { className: "button button-secondary", text: "Responder", attrs: { type: "submit" } })
      );
      const attachments = createElement("div", { className: "support-attachment-list" });
      (ticket.anexos || []).forEach((attachment) => {
        attachments.append(createElement("a", {
          className: "file-chip",
          text: attachment.originalName || "Anexo do ticket",
          attrs: {
            href: apiUrl(attachment.downloadPath || "#"),
            target: "_blank",
            rel: "noopener noreferrer",
            "data-file-type": attachmentType(attachment)
          }
        }));
      });
      const heading = createElement("div", { className: "support-ticket-heading" });
      heading.append(
        createElement("strong", { text: `${ticket.codigo} - ${ticket.nome}` }),
        statusBadge(ticket.status)
      );
      item.append(
        heading,
        createElement("span", { text: `${supportCategoryLabels[ticket.categoria] || ticket.categoria} · ${supportStatusLabels[ticket.status] || ticket.status} · expira em ${formatDate(ticket.expiresAt)}` }),
        supportTicketTimeline(ticket),
        createElement("p", { text: ticket.descricao }),
        attachments.children.length ? attachments : createElement("small", { text: "Sem anexos enviados." }),
        responseForm
      );
      ticketList.append(item);
    });
  }

  if (postList) {
    postList.replaceChildren();
    if (!state.supportPosts.length) {
      postList.append(emptyState("Nenhuma mensagem publicada", "Avisos do mural geral, turmas ou alunos aparecerão aqui depois da publicação.", "mural"));
    }
    state.supportPosts.forEach((post) => {
      const item = createElement("article", { className: `support-admin-post priority-${post.prioridade || "normal"}` });
      const target = post.targetType === "geral" ? "Mural geral" : post.oficina || post.aluno || post.targetType;
      const actions = createElement("div", { className: "content-actions" });
      const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button", "data-edit-support-post": post.id } });
      const remove = createElement("button", { className: "icon-action danger", text: "Remover", attrs: { type: "button", "data-remove-support-post": post.id } });
      actions.append(edit, remove);
      item.append(
        createElement("strong", { text: post.titulo }),
        createElement("span", { text: `${target} · ${post.tipo} · ${post.prioridade || "normal"} · ${formatDate(post.created_at)}` }),
        createElement("p", { text: post.mensagem }),
        actions
      );
      postList.append(item);
    });
  }
}

function renderWorkshopFeedbacks() {
  const list = document.querySelector("[data-feedback-list]");
  const summary = document.querySelector("[data-feedback-summary]");
  if (!list) return;

  const rows = state.workshopFeedbacks || [];
  list.replaceChildren();
  if (summary) {
    const average = rows.length
      ? (rows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rows.length).toFixed(1)
      : "0.0";
    const lowRatings = rows.filter((item) => Number(item.rating || 0) <= 2).length;
    summary.replaceChildren(
      createElement("article", { className: "feedback-metric" }),
      createElement("article", { className: "feedback-metric" }),
      createElement("article", { className: "feedback-metric" })
    );
    summary.children[0].append(createElement("span", { text: "Avaliações" }), createElement("strong", { text: String(rows.length) }));
    summary.children[1].append(createElement("span", { text: "Média" }), createElement("strong", { text: `${average} ★` }));
    summary.children[2].append(createElement("span", { text: "Notas 1-2" }), createElement("strong", { text: String(lowRatings) }));
  }

  if (!rows.length) {
    list.append(emptyState("Nenhum feedback encontrado", "As avaliações enviadas pelo Portal do Aluno aparecerão aqui para leitura da equipe.", "feedbacks"));
    return;
  }

  rows.forEach((feedback) => {
    const item = createElement("article", { className: `feedback-admin-card rating-${feedback.rating}` });
    item.append(
      createElement("div", { className: "feedback-admin-heading" }),
      createElement("p", { text: feedback.comentario }),
      createElement("span", { text: `${feedback.aluno} · ${feedback.cpf || "CPF não informado"} · ${formatDate(feedback.created_at)}` })
    );
    item.querySelector(".feedback-admin-heading").append(
      createElement("strong", { text: feedback.oficina }),
      ratingStars(feedback.rating)
    );
    list.append(item);
  });
}

function resetSupportPostForm() {
  const form = document.querySelector("[data-support-post-form]");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  document.querySelector("[data-support-post-form-title]").textContent = "Publicar mural ou notificação";
  document.querySelector("[data-support-post-submit]").textContent = "Publicar mensagem";
  document.querySelector("[data-support-target-type]")?.dispatchEvent(new Event("change"));
  setFeedback(document.querySelector("[data-support-post-feedback]"), "");
}

function editSupportPost(post) {
  const form = document.querySelector("[data-support-post-form]");
  if (!form) return;
  setFormValues(form, {
    id: post.id,
    targetType: post.targetType || "geral",
    tipo: post.tipo || "aviso",
    prioridade: post.prioridade || "normal",
    oficinaId: post.oficinaId || "",
    alunoId: post.alunoId || "",
    titulo: post.titulo || "",
    mensagem: post.mensagem || ""
  });
  document.querySelector("[data-support-post-form-title]").textContent = "Editar mural ou notificação";
  document.querySelector("[data-support-post-submit]").textContent = "Salvar alterações";
  document.querySelector("[data-support-target-type]")?.dispatchEvent(new Event("change"));
  setFeedback(document.querySelector("[data-support-post-feedback]"), "Edite os campos e salve as alterações.", "success");
  showAdminPage("mural", true);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteSupportPost(post) {
  if (!window.confirm(`Remover o aviso "${post.titulo}"?`)) return;
  await secureRequest(`/admin/suporte/murais/${post.id}`, { method: "DELETE" });
  resetSupportPostForm();
  await loadSupport();
}

function renderDashboard(dashboard) {
  const total = dashboard.total || 0;
  const porOficina = dashboard.porOficina || [];
  const top = porOficina[0];

  document.querySelector("[data-total-inscritos]").textContent = String(total);
  document.querySelector("[data-top-oficina]").textContent = top ? top.oficina : "-";
  document.querySelector("[data-oficinas-ativas]").textContent = String(porOficina.length);

  const chart = document.querySelector("[data-chart]");
  chart.replaceChildren();
  const max = Math.max(...porOficina.map((item) => item.total), 1);

  if (!porOficina.length) {
    chart.append(createElement("p", { className: "form-feedback", text: "Ainda não há inscrições registradas." }));
  } else {
    porOficina.forEach((item) => {
      const row = createElement("div", { className: "bar-row" });
      const header = createElement("header");
      header.append(createElement("span", { text: item.oficina }), createElement("strong", { text: String(item.total) }));
      const track = createElement("div", { className: "bar-track" });
      const fill = createElement("div", { className: "bar-fill" });
      fill.style.width = `${Math.max(8, (item.total / max) * 100)}%`;
      track.append(fill);
      row.append(header, track);
      chart.append(row);
    });
  }

  const recent = document.querySelector("[data-recent-list]");
  recent.replaceChildren();
  const recentes = dashboard.recentes || [];
  if (!recentes.length) {
    recent.append(createElement("p", { className: "form-feedback", text: "Sem inscrições recentes." }));
  } else {
    recentes.forEach((item) => {
      const node = createElement("article", { className: "recent-item" });
      node.append(
        createElement("strong", { text: item.nome }),
        createElement("span", { text: `${item.oficina} · ${formatDate(item.created_at)}` })
      );
      recent.append(node);
    });
  }
}

function firstName(person) {
  return String(person?.nome || "aluno").trim().split(/\s+/)[0] || "aluno";
}

function waitlistOficinas(person) {
  return Array.from(new Set([
    ...(Array.isArray(person.listaEspera) ? person.listaEspera : []),
    ...(Array.isArray(person.oficinaDetalhes) ? person.oficinaDetalhes : [])
      .filter((detail) => detail.status === "lista_espera")
      .map((detail) => detail.oficina)
  ].filter(Boolean)));
}

function hasPhone(person) {
  return String(person.telefone || "").replace(/\D/g, "").length >= 10;
}

function automationMessages(person) {
  const name = firstName(person);
  const oficinas = (person.oficinas || [person.oficina].filter(Boolean)).join(", ") || "suas oficinas";
  const lista = waitlistOficinas(person).join(", ");
  const faltas = Number(person.faltasUltimos30Dias || 0);

  return {
    documentos: `Olá, ${name}! Para concluir sua matrícula no Centro da Juventude, precisamos regularizar documentos pendentes do cadastro. Em caso de dúvida, responda esta mensagem.`,
    faltas: `Olá, ${name}! Identificamos ${faltas} falta(s) recente(s) em ${oficinas}. Procure a equipe para justificar ou regularizar a frequência.`,
    listaEspera: `Olá, ${name}! Você está em lista de espera para ${lista || oficinas}. A equipe avisará quando houver vaga disponível.`,
    contato: `Olá, ${name}! Estamos entrando em contato pelo Centro da Juventude sobre seu cadastro em ${oficinas}.`
  };
}

function actionPeople() {
  return state.inscricoes || [];
}

function automationQueues() {
  const people = actionPeople();
  return [
    {
      key: "documentos",
      title: "Documentos pendentes",
      description: "Cadastros sem documentos anexados ou com pendência marcada.",
      people: people.filter((person) => Boolean(person.documentosPendentes || Number(person.documentosCount || 0) === 0)),
      message: (person) => automationMessages(person).documentos
    },
    {
      key: "faltas",
      title: "Alerta de faltas",
      description: "Alunos com mais de duas faltas nos últimos 30 dias.",
      people: people.filter((person) => Number(person.faltasUltimos30Dias || 0) > 2),
      message: (person) => automationMessages(person).faltas
    },
    {
      key: "listaEspera",
      title: "Lista de espera",
      description: "Inscrições aguardando vaga em uma ou mais oficinas.",
      people: people.filter((person) => waitlistOficinas(person).length > 0),
      message: (person) => automationMessages(person).listaEspera
    },
    {
      key: "semTelefone",
      title: "Sem telefone válido",
      description: "Cadastros que precisam de revisão antes do contato por WhatsApp.",
      people: people.filter((person) => !hasPhone(person)),
      message: (person) => automationMessages(person).contato
    }
  ];
}

function automationDetail(person, queueKey) {
  if (queueKey === "faltas") return `${person.faltasUltimos30Dias || 0} faltas nos últimos 30 dias`;
  if (queueKey === "listaEspera") return `Lista: ${waitlistOficinas(person).join(", ")}`;
  if (queueKey === "documentos") return Number(person.documentosCount || 0) ? "Pendência marcada na ficha" : "Sem documento anexado";
  return "Revisar telefone antes do contato";
}

function renderAutomationCard(person, queue) {
  const card = createElement("article", { className: `automation-card${hasPhone(person) ? "" : " is-muted"}` });
  const main = createElement("div", { className: "automation-card-main" });
  main.append(
    createElement("strong", { text: person.nome || "Sem nome" }),
    createElement("span", { text: person.oficina || (person.oficinas || []).join(", ") || "Sem oficina" }),
    createElement("span", { text: automationDetail(person, queue.key) })
  );

  const actions = createElement("div", { className: "automation-actions" });
  const ficha = createElement("button", { className: "icon-action", text: "Ficha", attrs: { type: "button" } });
  ficha.addEventListener("click", () => openStudentProfile(person));
  const resumo = createElement("button", { className: "icon-action", text: "IA", attrs: { type: "button" } });
  resumo.addEventListener("click", () => openAiAssist(person));
  const message = queue.message(person);
  const url = whatsappUrl(person.telefone, message);
  const whats = createElement(url ? "a" : "button", {
    className: "icon-action",
    text: url ? "Whats" : "Sem tel.",
    attrs: url
      ? { href: url, target: "_blank", rel: "noopener noreferrer" }
      : { type: "button", disabled: "disabled" }
  });
  actions.append(ficha, resumo, whats);
  card.append(main, actions);
  return card;
}

function renderAiStudentSelect() {
  const select = document.querySelector("[data-ai-student-select]");
  if (!select) return;
  const current = select.value;
  const first = createElement("option", {
    text: "Selecione um cadastro",
    attrs: { value: "" }
  });
  select.replaceChildren(first);
  actionPeople().forEach((person, index) => {
    select.append(createElement("option", {
      text: `${person.nome || "Sem nome"} - ${person.oficina || (person.oficinas || []).join(", ") || "Sem oficina"}`,
      attrs: { value: String(index) }
    }));
  });
  select.value = current && select.querySelector(`option[value="${current}"]`) ? current : "";
}

function renderAutomation() {
  const summary = document.querySelector("[data-automation-summary]");
  const board = document.querySelector("[data-automation-board]");
  if (!summary || !board) return;

  const queues = automationQueues();
  summary.replaceChildren();
  board.replaceChildren();
  queues.forEach((queue) => {
    const metric = createElement("article", { className: "automation-metric" });
    metric.append(
      createElement("span", { text: queue.title }),
      createElement("strong", { text: String(queue.people.length) })
    );
    summary.append(metric);

    const column = createElement("section", { className: "automation-column" });
    column.append(
      createElement("h3", { text: queue.title }),
      createElement("p", { text: queue.description })
    );

    const list = createElement("div", { className: "automation-list" });
    if (!queue.people.length) {
      list.append(createElement("p", { className: "form-feedback", text: "Nenhum cadastro nesta fila." }));
    } else {
      queue.people.slice(0, 12).forEach((person) => list.append(renderAutomationCard(person, queue)));
      if (queue.people.length > 12) {
        list.append(createElement("p", { className: "form-feedback", text: `Mostrando 12 de ${queue.people.length}. Use a aba Inscritos para filtrar.` }));
      }
    }
    column.append(list);
    board.append(column);
  });
}

function filteredDocumentsZipUrl() {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.oficina) params.set("oficina", state.oficina);
  const query = params.toString();
  return apiUrl(`/inscricoes/documentos.zip${query ? `?${query}` : ""}`);
}

function uniquePeople() {
  const seen = new Set();
  return actionPeople().filter((person) => {
    const key = person.cpf || person.id || person.sourceId || person.nome;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function peopleCard(title, description, people, actionLabel = "Abrir ficha") {
  const card = createElement("article", { className: "report-card" });
  const header = createElement("div", { className: "report-card-header" });
  header.append(
    createElement("span", { text: title }),
    createElement("strong", { text: String(people.length) })
  );
  card.append(
    header,
    createElement("p", { text: description })
  );

  const list = createElement("div", { className: "report-list" });
  if (!people.length) {
    list.append(createElement("span", { className: "form-feedback", text: "Nada pendente neste grupo." }));
  } else {
    people.slice(0, 8).forEach((person) => {
      const row = createElement("button", {
        className: "report-row",
        attrs: { type: "button" }
      });
      row.append(
        createElement("strong", { text: person.nome || "Sem nome" }),
        createElement("span", { text: [person.oficina, maskCpfValue(person.cpf || "")].filter(Boolean).join(" - ") || actionLabel })
      );
      row.addEventListener("click", () => openStudentProfile(person));
      list.append(row);
    });
    if (people.length > 8) {
      list.append(createElement("span", { className: "form-feedback", text: `Mais ${people.length - 8} cadastro(s). Use filtros em Inscritos.` }));
    }
  }
  card.append(list);
  return card;
}

function reportMetric(label, value, description = "") {
  const metric = createElement("article", { className: "report-metric" });
  metric.append(
    createElement("span", { text: label }),
    createElement("strong", { text: String(value) }),
    createElement("small", { text: description })
  );
  return metric;
}

function reportPriorityCard(title, value, description, tone = "neutral") {
  const card = createElement("article", { className: `report-priority-card is-${tone}` });
  card.append(
    createElement("span", { text: title }),
    createElement("strong", { text: String(value) }),
    createElement("p", { text: description })
  );
  return card;
}

function renderReports() {
  const summary = document.querySelector("[data-reports-summary]");
  const priority = document.querySelector("[data-reports-priority]");
  const grid = document.querySelector("[data-reports-grid]");
  if (!summary || !priority || !grid) return;

  const people = uniquePeople();
  const docsMissing = people.filter((person) => Boolean(person.documentosPendentes || Number(person.documentosCount || 0) === 0));
  const withDocs = people.filter((person) => Number(person.documentosCount || 0) > 0);
  const absences = people.filter((person) => Number(person.faltasUltimos30Dias || 0) > 2);
  const waitlist = people.filter((person) => (person.listaEspera || []).length || person.emListaEspera);
  const activeBolsistas = state.bolsistas.filter((item) => item.ativo !== false);
  const nextEvents = [...(state.calendar.eventos || [])]
    .filter((event) => event.data >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(0, 4);

  summary.replaceChildren(
    reportMetric("Cadastros filtrados", people.length, "Alunos na visão atual"),
    reportMetric("Com documentos", withDocs.length, "Prontos para conferência"),
    reportMetric("Pendência de docs", docsMissing.length, "Prioridade administrativa"),
    reportMetric("Alertas de falta", absences.length, "Mais de 2 faltas recentes"),
    reportMetric("Lista de espera", waitlist.length, "Aguardando vaga ou retorno"),
    reportMetric("Bolsistas ativos", activeBolsistas.length, "Vinculados ao calendário")
  );

  priority.replaceChildren(
    reportPriorityCard("Primeiro", docsMissing.length, "Conferir documentos pendentes antes da confirmação final.", docsMissing.length ? "danger" : "ok"),
    reportPriorityCard("Depois", absences.length, "Verificar alunos com faltas acima do limite e registrar orientação.", absences.length ? "warning" : "ok"),
    reportPriorityCard("Retorno", waitlist.length, "Acompanhar lista de espera quando houver novas vagas.", waitlist.length ? "info" : "ok")
  );

  const eventCard = createElement("article", { className: "report-card" });
  const eventHeader = createElement("div", { className: "report-card-header" });
  eventHeader.append(
    createElement("span", { text: "Próximos eventos" }),
    createElement("strong", { text: String(nextEvents.length) })
  );
  eventCard.append(eventHeader, createElement("p", { text: "Reuniões, passeios e eventos cadastrados para acompanhamento interno." }));
  const eventList = createElement("div", { className: "report-list" });
  if (!nextEvents.length) {
    eventList.append(createElement("span", { className: "form-feedback", text: "Nenhum evento futuro neste mês." }));
  } else {
    nextEvents.forEach((event) => {
      eventList.append(createElement("span", {
        className: "report-row static",
        text: `${String(event.data).slice(0, 10)} - ${event.titulo || event.tipo || "Evento"}`
      }));
    });
  }
  eventCard.append(eventList);

  grid.replaceChildren(
    peopleCard("Documentos pendentes", "Prioridade para conferir ou cobrar por WhatsApp manual.", docsMissing),
    peopleCard("Faltas acima do limite", "Alunos com mais de 2 faltas nos últimos 30 dias.", absences),
    peopleCard("Lista de espera", "Cadastros que precisam de retorno quando houver vaga.", waitlist),
    peopleCard("Com documentos anexados", "Cadastros disponíveis para baixar em ZIP.", withDocs, "Ver documentos"),
    eventCard
  );
}

function renderTable() {
  tableBody.replaceChildren();
  if (!state.inscricoes.length) {
    const row = createElement("tr");
    const cell = createElement("td", {
      text: "Nenhum inscrito encontrado.",
      attrs: { colspan: "9" }
    });
    row.append(cell);
    tableBody.append(row);
    return;
  }

  state.inscricoes.forEach((item) => {
    const row = createElement("tr", {
      className: `person-row${item.fichaAlerta ? " is-attention" : ""}`,
      attrs: {
        tabindex: "0",
        "aria-label": `Abrir ficha de ${item.nome}`
      }
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      openStudentProfile(item);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openStudentProfile(item);
    });

    row.append(
      createElement("td", { text: item.nome }),
      createElement("td", { text: maskCpfValue(item.cpf || "") || "-" }),
      createElement("td", { text: item.idade === "" || item.idade === undefined ? "-" : String(item.idade) }),
      createElement("td", { text: item.telefone || "-" }),
      createElement("td", { text: item.oficina || "-" }),
      createElement("td", { text: item.sourceSummary || (item.source === "aluno" ? "Aluno ADM" : "Inscrição online") })
    );

    const docsCell = createElement("td");
    const docsCount = Number(item.documentosCount || 0);
    if (docsCount > 0) {
      const docsButton = createElement("button", {
        className: "icon-action docs-action",
        text: `${docsCount} doc${docsCount > 1 ? "s" : ""}`,
        attrs: { type: "button" }
      });
      docsButton.addEventListener("click", () => openDocuments(item));
      docsCell.append(docsButton);
    } else {
      docsCell.append(createElement("span", { className: "muted-cell", text: "0" }));
    }
    row.append(docsCell, createElement("td", { text: formatDate(item.created_at) }));

    const actionsCell = createElement("td");
    const actions = createElement("div", { className: "table-actions" });
    const ficha = createElement("button", {
      className: "icon-action",
      text: "Ficha",
      attrs: { type: "button" }
    });
    const edit = createElement("button", {
      className: "icon-action",
      text: "Editar",
      attrs: { type: "button" }
    });
    ficha.addEventListener("click", () => openStudentProfile(item));
    edit.addEventListener("click", () => openPrimaryEdit(item));
    actions.append(ficha, edit);

    const isGrouped = item.source === "pessoa" && (item.sources || []).length > 1;
    const del = createElement("button", {
      className: "icon-action danger",
      text: "Excluir",
      attrs: { type: "button" }
    });
    if (isGrouped) {
      del.addEventListener("click", () => deletePersonRecords(item));
    } else if (item.source === "aluno" || item.primarySource === "aluno") {
      del.textContent = "Excluir aluno";
      del.addEventListener("click", () => removeStudentFromEnrollment(item));
    } else {
      del.addEventListener("click", () => removeInscricao({ ...item, id: item.sourceId || item.id }));
    }
    actions.append(del);
    actionsCell.append(actions);
    row.append(actionsCell);
    tableBody.append(row);
  });
}

function resetAdminUserForm() {
  const form = document.querySelector("[data-admin-user-form]");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  form.elements.role.value = "admin";
  form.elements.registrationCode.required = true;
  setFeedback(document.querySelector("[data-admin-user-feedback]"), "");
}

function editAdminUser(admin) {
  const form = document.querySelector("[data-admin-user-form]");
  if (!form) return;
  setFormValues(form, {
    id: admin.id,
    name: admin.name,
    username: admin.username,
    role: admin.role,
    active: admin.active
  });
  form.elements.registrationCode.value = "";
  form.elements.registrationCode.required = false;
  showAdminPage("usuarios-adm", true);
}

function renderAdminUserList() {
  const list = document.querySelector("[data-admin-user-list]");
  if (!list) return;
  list.replaceChildren();
  if (state.admin?.role !== "master") {
    list.append(createElement("p", { className: "form-feedback", text: "Somente o ADM master acessa esta área." }));
    return;
  }
  if (!state.adminUsers.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhum ADM cadastrado." }));
    return;
  }
  state.adminUsers.forEach((admin) => {
    const item = createElement("article", { className: `content-item${admin.active ? "" : " is-inactive"}` });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: admin.name }),
      createElement("span", { text: `Usuário: ${admin.username || "-"}` }),
      createElement("span", { text: `${roleLabels[admin.role] || admin.role} - ${admin.active ? "ativo" : "inativo"}${admin.last_login_at ? ` - último login ${formatDate(admin.last_login_at)}` : ""}` })
    );
    const actions = createElement("div", { className: "table-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    edit.addEventListener("click", () => editAdminUser(admin));
    actions.append(edit);
    if (admin.id !== state.admin?.id) {
      const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
      del.addEventListener("click", async () => {
        if (!window.confirm(`Excluir ADM ${admin.name}?`)) return;
        await secureRequest(`/admin/usuarios/${admin.id}`, { method: "DELETE" });
        await loadAdminUsers();
        await loadAuditLogs();
      });
      actions.append(del);
    }
    item.append(main, actions);
    list.append(item);
  });
}

function renderAuditLogs() {
  const list = document.querySelector("[data-audit-log-list]");
  if (!list) return;
  list.replaceChildren();
  if (!state.auditLogs.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhum log encontrado." }));
    return;
  }
  state.auditLogs.forEach((log) => {
    const item = createElement("article", { className: "content-item audit-log-item" });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: `${auditActionLabels[log.action] || log.action} ${log.entityType || ""}` }),
      createElement("span", { text: log.adminName || "Sistema" }),
      createElement("span", { text: [log.entityLabel, log.entityId].filter(Boolean).join(" - ") || "Sem item informado" }),
      createElement("span", { text: `${formatDate(log.created_at)}${log.ip ? ` - IP ${log.ip}` : ""}` })
    );
    item.append(main);
    list.append(item);
  });
}

function searchableText(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function globalSearchResults(term) {
  const query = searchableText(term);
  if (!query || query.length < 2) return [];
  const results = [];
  Object.entries(pageTitles).forEach(([page, title]) => {
    if (!canAccessPage(page)) return;
    const aliases = [title, page, pageAliases[page] || ""];
    if (searchableText(aliases).includes(query)) {
      results.push({ type: "page", title, subtitle: "Abrir página do ADM", page });
    }
  });
  state.alunos.forEach((aluno) => {
    const haystack = searchableText(aluno.nome, aluno.cpf, aluno.matricula, aluno.responsavel, aluno.bairro, aluno.oficinas, aluno.turmas, aluno.documentosLinks);
    if (haystack.includes(query)) {
      results.push({
        type: "aluno",
        title: aluno.nome || "Aluno",
        subtitle: `${aluno.matricula || "Sem matrícula"} · CPF ${maskCpfValue(aluno.cpf || "") || "não informado"}`,
        aluno
      });
    }
  });
  state.supportTickets.forEach((ticket) => {
    const haystack = searchableText(ticket.codigo, ticket.nome, ticket.cpf, ticket.categoria, ticket.descricao, ticket.status);
    if (haystack.includes(query)) {
      results.push({
        type: "ticket",
        title: ticket.codigo || "Ticket",
        subtitle: `${ticket.nome || "Aluno"} · ${supportStatusLabels[ticket.status] || ticket.status}`,
        page: "suporte"
      });
    }
  });
  state.oficinas.forEach((oficina) => {
    const haystack = searchableText(oficina.nome, oficina.categoria, oficina.horario, oficina.turmas);
    if (haystack.includes(query)) {
      results.push({
        type: "oficina",
        title: oficina.nome,
        subtitle: [oficina.categoria, oficina.horario].filter(Boolean).join(" · ") || "Oficina",
        page: "oficinas"
      });
    }
  });
  state.supportPosts.forEach((post) => {
    const haystack = searchableText(post.titulo, post.mensagem, post.oficina, post.aluno, post.tipo, post.prioridade);
    if (haystack.includes(query)) {
      results.push({
        type: "aviso",
        title: post.titulo,
        subtitle: `${post.prioridade || "normal"} · ${post.oficina || post.aluno || "Mural geral"}`,
        page: "mural"
      });
    }
  });
  return results.slice(0, 8);
}

function renderGlobalSearch(term) {
  const box = document.querySelector("[data-global-search-results]");
  if (!box) return;
  const results = globalSearchResults(term);
  box.replaceChildren();
  box.hidden = !results.length;
  results.forEach((result) => {
    const button = createElement("button", {
      className: "global-search-item",
      attrs: { type: "button" }
    });
    button.append(
      createElement("strong", { text: result.title }),
      createElement("span", { text: result.subtitle })
    );
    button.addEventListener("click", () => {
      box.hidden = true;
      document.querySelector("[data-global-search]").value = "";
      if (result.type === "aluno") {
        showAdminPage("alunos", true);
        openStudentProfile(result.aluno);
        return;
      }
      showAdminPage(result.page || "dashboard", true);
    });
    box.append(button);
  });
}

function activeFromForm(form) {
  return form.elements.ativo ? form.elements.ativo.checked : true;
}

function checkedValues(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function setCheckedValues(form, name, values = []) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function selectedValues(select) {
  return Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean);
}

function setSelectedValues(select, values = []) {
  Array.from(select.options).forEach((option) => {
    option.selected = values.includes(option.value);
  });
}

function setFormValues(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    if (!form.elements[key]) return;
    if (form.elements[key].type === "checkbox") {
      form.elements[key].checked = Boolean(value);
    } else {
      form.elements[key].value = value ?? "";
    }
  });
}

function addProfileField(container, label, value) {
  const item = createElement("div", { className: "profile-field" });
  item.append(
    createElement("span", { text: label }),
    createElement("strong", { text: value || "-" })
  );
  container.append(item);
}

function multilineText(value, fallback) {
  return String(value || "").trim() || fallback;
}

function primaryOnlineSource(person) {
  return (person.sources || []).find((source) => source.source === "inscricao");
}

function primaryStudentSource(person) {
  return (person.sources || []).find((source) => source.source === "aluno");
}

function sourceName(source) {
  return source === "aluno" ? "Aluno ADM" : "Inscrição online";
}

function oficinaStatusLabel(status) {
  return status === "lista_espera" ? "Lista de espera" : "Confirmada";
}

function openPrimaryEdit(person) {
  const student = primaryStudentSource(person);
  const online = primaryOnlineSource(person);
  if (student) {
    openStudentFromEnrollment({ sourceId: student.sourceId, nome: person.nome });
    return;
  }
  if (online) {
    openEdit({ ...online, id: online.sourceId });
    return;
  }
  openStudentProfile(person);
}

function makeProfileSection(title) {
  const section = createElement("section", { className: "profile-section" });
  section.append(createElement("h3", { text: title }));
  return section;
}

function appendProfileNote(section, title, value, fallback) {
  const note = createElement("article", { className: "profile-note" });
  note.append(
    createElement("strong", { text: title }),
    createElement("p", { text: multilineText(value, fallback) })
  );
  section.append(note);
}

function openStudentProfile(person) {
  if (!profileDialog || !profileContent) return;

  const sources = person.sources?.length ? person.sources : [person];
  const online = primaryOnlineSource(person);
  const student = primaryStudentSource(person);
  const cpf = maskCpfValue(person.cpf || "") || "CPF não informado";
  profileDialog.classList.toggle("is-attention", Number(person.faltasUltimos30Dias || 0) > 2);
  if (profileSubtitle) {
    profileSubtitle.textContent = `${cpf} - ${person.sourceSummary || sourceName(person.primarySource || person.source)}`;
  }

  const summary = makeProfileSection("Dados principais");
  const grid = createElement("div", { className: "profile-grid" });
  addProfileField(grid, "Nome", person.nome);
  addProfileField(grid, "CPF", cpf);
  addProfileField(grid, "Matrícula", person.matricula);
  addProfileField(grid, "Idade", person.idade === "" || person.idade === undefined ? "-" : `${person.idade} anos`);
  addProfileField(grid, "Telefone", person.telefone);
  addProfileField(grid, "Responsável", person.responsavel);
  addProfileField(grid, "E-mail", person.email);
  addProfileField(grid, "Status", person.status || "inscrito");
  addProfileField(grid, "Faltas nos últimos 30 dias", String(person.faltasUltimos30Dias || 0));
  addProfileField(grid, "Documentos", person.documentosPendentes ? "Faltando" : "Sem pendências marcadas");
  addProfileField(grid, "Primeiro cadastro", formatDate(person.created_at));
  summary.append(grid);

  const officesSection = makeProfileSection("Oficinas e matrículas");
  const timeline = createElement("div", { className: "profile-timeline" });
  const detalhes = person.oficinaDetalhes?.length
    ? person.oficinaDetalhes
    : (person.oficinas || [person.oficina].filter(Boolean)).map((oficina) => ({
      oficina,
      createdAt: person.created_at,
      source: person.primarySource || person.source
    }));

  if (!detalhes.length) {
    timeline.append(createElement("p", { className: "form-feedback", text: "Nenhuma oficina vinculada." }));
  } else {
    detalhes.forEach((detail) => {
      const card = createElement("article", { className: "profile-card" });
      card.append(
        createElement("strong", { text: detail.oficina || "Oficina" }),
        createElement("span", { text: `Cadastrado em ${formatDate(detail.createdAt || detail.created_at || person.created_at)}` }),
        createElement("span", { text: `Origem: ${detail.sourceLabel || sourceName(detail.source)}` }),
        createElement("span", { className: detail.status === "lista_espera" ? "status-waitlist" : "", text: `Status: ${oficinaStatusLabel(detail.status)}` })
      );
      timeline.append(card);
    });
  }
  officesSection.append(timeline);

  const history = makeProfileSection("Histórico do aluno");
  appendProfileNote(history, "Advertências", person.advertencias, "Sem advertências registradas.");
  appendProfileNote(history, "Oficinas anteriores", person.historicoOficinas, "Sem historico anterior registrado.");
  appendProfileNote(history, "Observações", person.observacoes, "Sem observações registradas.");

  const callsSection = makeProfileSection("Ultimas chamadas");
  const callsList = createElement("div", { className: "profile-timeline" });
  const calls = person.ultimasChamadas || [];
  if (!calls.length) {
    callsList.append(createElement("p", { className: "form-feedback", text: "Nenhuma chamada registrada para este aluno." }));
  } else {
    calls.forEach((call) => {
      const card = createElement("article", {
        className: `profile-card${call.status === "ausente" ? " is-absence" : ""}`
      });
      card.append(
        createElement("strong", { text: call.oficina || "Oficina" }),
        createElement("span", { text: `Data: ${String(call.data || "").slice(0, 10)}` }),
        createElement("span", { text: `Status: ${call.status || "-"}` }),
        createElement("span", { text: call.observacao || "" })
      );
      callsList.append(card);
    });
  }
  callsSection.append(callsList);

  const sourceSection = makeProfileSection("Registros vinculados");
  const sourceList = createElement("div", { className: "profile-timeline" });
  sources.forEach((source) => {
    const item = createElement("article", { className: "profile-card" });
    item.append(
      createElement("strong", { text: source.sourceLabel || sourceName(source.source) }),
      createElement("span", { text: source.oficina || "Sem oficina" }),
      createElement("span", { text: `Criado em ${formatDate(source.created_at)}` }),
      createElement("span", { text: `Telefone: ${source.telefone || "não informado"}` })
    );
    if (source.documentosCount) {
      item.append(createElement("span", { text: `Documentos: ${source.documentosCount}` }));
    }
    sourceList.append(item);
  });
  sourceSection.append(sourceList);

  const actions = createElement("div", { className: "profile-actions" });
  const aiButton = createElement("button", {
    className: "button button-primary",
    text: "Resumo IA",
    attrs: { type: "button" }
  });
  aiButton.addEventListener("click", () => openAiAssist(person));
  actions.append(aiButton);

  if (student) {
    const editStudentButton = createElement("button", {
      className: "button button-secondary",
      text: "Editar ficha ADM",
      attrs: { type: "button" }
    });
    editStudentButton.addEventListener("click", () => {
      profileDialog.close();
      openStudentFromEnrollment({ sourceId: student.sourceId, nome: person.nome });
    });
    actions.append(editStudentButton);
  }
  if (online) {
    const editOnlineButton = createElement("button", {
      className: "button button-secondary",
      text: "Editar inscrição online",
      attrs: { type: "button" }
    });
    editOnlineButton.addEventListener("click", () => {
      profileDialog.close();
      openEdit({ ...online, id: online.sourceId });
    });
    actions.append(editOnlineButton);
  }
  if (Number(person.documentosCount || 0) > 0) {
    const docsButton = createElement("button", {
      className: "button button-secondary",
      text: "Ver documentos",
      attrs: { type: "button" }
    });
    docsButton.addEventListener("click", () => {
      profileDialog.close();
      openDocuments(person);
    });
    actions.append(docsButton);
    const zipSource = primaryOnlineSource(person) || person.documentSources?.[0];
    if (zipSource?.sourceId) {
      actions.append(createElement("a", {
        className: "button button-primary",
        text: "Baixar ZIP",
        attrs: {
          href: apiUrl(`/inscricoes/${zipSource.sourceId}/documentos.zip`),
          target: "_blank",
          rel: "noopener noreferrer"
        }
      }));
    }
  }
  const warningButton = createElement("button", {
    className: "button button-secondary",
    text: "Dar advertência",
    attrs: { type: "button" }
  });
  warningButton.addEventListener("click", () => addWarningToStudent(person));
  actions.append(warningButton);

  const studentIdForMatricula = student?.sourceId || (person.source === "aluno" ? person.sourceId || person.id : "");
  if (studentIdForMatricula) {
    const matriculaButton = createElement("button", {
      className: "button button-secondary",
      text: "Enviar matrícula por WhatsApp",
      attrs: { type: "button" }
    });
    matriculaButton.addEventListener("click", () => sendMatriculaWhatsApp({ id: studentIdForMatricula }));
    actions.append(matriculaButton);
  }

  profileContent.replaceChildren(summary, officesSection, history, callsSection, sourceSection, actions);
  if (profileDialog.open) profileDialog.close();
  profileDialog.showModal();
}

function normalizeWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

function whatsappUrl(phone, message) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function messageTitle(key) {
  const titles = {
    confirmacao: "Confirmação",
    documentos: "Documentos",
    faltas: "Faltas",
    listaEspera: "Lista de espera"
  };
  return titles[key] || key;
}

function renderAiAssist(result, person) {
  if (!aiAssistContent) return;
  renderAiAssistInto(aiAssistContent, result, person);
}

function renderAiAssistInto(target, result, person) {
  if (!target) return;
  target.replaceChildren();

  const status = createElement("p", {
    className: `form-feedback${result.fallback ? "" : " is-success"}`,
    text: result.aiEnabled
      ? "Resumo gerado com IA configurada."
      : "Assistente automático ativo. Resumo gerado pelas regras do sistema."
  });
  const summary = createElement("section", { className: "ai-assist-section" });
  summary.append(
    createElement("h3", { text: "Resumo" }),
    createElement("p", { text: result.summary || "Não foi possível gerar resumo." })
  );

  const alerts = createElement("section", { className: "ai-assist-section" });
  alerts.append(createElement("h3", { text: "Alertas" }));
  const alertList = createElement("ul", { className: "ai-alert-list" });
  const alertItems = result.alerts?.length ? result.alerts : ["Sem alertas automáticos."];
  alertItems.forEach((alert) => alertList.append(createElement("li", { text: alert })));
  alerts.append(alertList);

  const messages = createElement("section", { className: "ai-assist-section" });
  messages.append(createElement("h3", { text: "Mensagens WhatsApp" }));
  const grid = createElement("div", { className: "ai-message-grid" });
  Object.entries(result.messages || {}).forEach(([key, text]) => {
    const card = createElement("article", { className: "ai-message-card" });
    card.append(
      createElement("strong", { text: messageTitle(key) }),
      createElement("p", { text })
    );
    const url = whatsappUrl(person.telefone, text);
    const action = createElement(url ? "a" : "button", {
      className: "button button-secondary",
      text: url ? "Abrir WhatsApp" : "Sem telefone",
      attrs: url
        ? { href: url, target: "_blank", rel: "noopener noreferrer" }
        : { type: "button", disabled: "disabled" }
    });
    card.append(action);
    grid.append(card);
  });
  messages.append(grid);
  target.append(status, summary, alerts, messages);
}

async function openAiAssist(person) {
  if (!aiAssistDialog || !aiAssistContent) return;
  if (profileDialog?.open) profileDialog.close();
  aiAssistContent.replaceChildren(createElement("p", { className: "form-feedback", text: "Gerando resumo e mensagens..." }));
  aiAssistDialog.showModal();

  try {
    const result = await secureRequest("/ai/admin/student-assist", {
      method: "POST",
      timeout: 30000,
      body: {
        mode: "full",
        student: person
      }
    });
    renderAiAssist(result, person);
  } catch (error) {
    aiAssistContent.replaceChildren(createElement("p", { className: "form-feedback is-error", text: error.message }));
  }
}

async function generateAdminAiSummary() {
  const select = document.querySelector("[data-ai-student-select]");
  const output = document.querySelector("[data-admin-ai-output]");
  const index = Number(select?.value);
  const person = Number.isInteger(index) ? actionPeople()[index] : null;
  if (!output) return;
  if (!person) {
    output.replaceChildren(createElement("p", { className: "form-feedback is-error", text: "Selecione um cadastro para gerar o resumo IA." }));
    return;
  }

  output.replaceChildren(createElement("p", { className: "form-feedback", text: "Gerando resumo IA administrativo..." }));
  try {
    const result = await secureRequest("/ai/admin/student-assist", {
      method: "POST",
      timeout: 30000,
      body: {
        mode: "full",
        student: person
      }
    });
    renderAiAssistInto(output, result, person);
  } catch (error) {
    output.replaceChildren(createElement("p", { className: "form-feedback is-error", text: error.message }));
  }
}

function studentPayload(aluno, advertencias) {
  return {
    nome: aluno.nome,
    cpf: maskCpfValue(aluno.cpf || ""),
    idade: aluno.idade || "",
    telefone: aluno.telefone || "",
    responsavel: aluno.responsavel || "",
    email: aluno.email || "",
    oficinaIds: aluno.oficinaIds || [],
    oficinaId: aluno.oficinaIds?.[0] || "",
    status: aluno.status || "ativo",
    documentosPendentes: Boolean(aluno.documentosPendentes),
    advertencias,
    historicoOficinas: aluno.historicoOficinas || "",
    observacoes: aluno.observacoes || ""
  };
}

function officeIdsForPerson(person) {
  const oficinas = person.oficinas || [person.oficina].filter(Boolean);
  return state.oficinas
    .filter((oficina) => oficinas.includes(oficina.nome))
    .map((oficina) => oficina.id);
}

async function getStudentForPerson(person) {
  const student = primaryStudentSource(person);
  const searchKey = person.cpf || person.nome || student?.sourceId;
  const responseData = await apiRequest(`/alunos?search=${encodeURIComponent(searchKey || "")}`);
  const candidates = responseData.alunos || [];
  const existing = student
    ? candidates.find((aluno) => aluno.id === student.sourceId)
    : candidates.find((aluno) => aluno.cpf && aluno.cpf === person.cpf);
  if (existing) return existing;

  const oficinaIds = officeIdsForPerson(person);
  if (!oficinaIds.length) {
    throw new Error("Não foi possível vincular uma oficina cadastrada para criar a ficha ADM.");
  }

  const response = await secureRequest("/alunos", {
    method: "POST",
    body: {
      nome: person.nome,
      cpf: maskCpfValue(person.cpf || ""),
      idade: person.idade || "",
      telefone: person.telefone?.split(" / ")[0] || "",
      responsavel: person.responsavel?.split(" / ")[0] || "",
      email: person.email?.split(" / ")[0] || "",
      oficinaIds,
      oficinaId: oficinaIds[0],
      status: "ativo",
      documentosPendentes: Boolean(person.documentosPendentes),
      advertencias: person.advertencias || "",
      historicoOficinas: person.historicoOficinas || "",
      observacoes: person.observacoes || ""
    }
  });
  await loadAlunos();
  return response.aluno;
}

async function addWarningToStudent(person) {
  const text = window.prompt(`Descreva a advertência para ${person.nome}:`);
  if (!text || !text.trim()) return;

  try {
    const aluno = await getStudentForPerson(person);
    const stamp = new Date().toLocaleString("pt-BR");
    const advertencias = [aluno.advertencias, `[${stamp}] ${text.trim()}`].filter(Boolean).join("\n");
    await secureRequest(`/alunos/${aluno.id}`, {
      method: "PUT",
      body: studentPayload(aluno, advertencias)
    });
    profileDialog?.close();
    await refreshAll();
    window.alert("Advertencia registrada na ficha do aluno.");
  } catch (error) {
    window.alert(error.message || "Não foi possível registrar a advertência.");
  }
}

function renderOfficeList() {
  const list = document.querySelector("[data-office-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.oficinas.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhuma oficina cadastrada." }));
    return;
  }

  state.oficinas.forEach((oficina) => {
    const item = createElement("article", { className: "content-item" });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: oficina.nome }),
      createElement("span", { text: `${oficina.categoria} · ${oficina.faixaEtaria} · ${formatDays(oficina.diasSemana)} · ${formatPeriod(oficina.periodo)}` }),
      createElement("span", { text: `Horário: ${oficina.horario}` }),
      createElement("span", { text: `Capacidade: ${oficina.capacidade || 30} vagas` }),
      createElement("span", { text: `${(oficina.turmas || []).length} turma(s) cadastrada(s)` }),
      createElement("span", { text: oficina.ativo ? "Ativa no site" : "Inativa" })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editOffice(oficina));
    del.addEventListener("click", () => deleteOffice(oficina));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getClassRows() {
  if (state.turmas.length) {
    return state.turmas
      .map((turma) => ({
        ...turma,
        alunosCount: Number(turma.vagasOcupadas || 0),
        oficina: state.oficinas.find((oficina) => oficina.id === turma.oficinaId) || { id: turma.oficinaId, nome: turma.oficina, categoria: "" }
      }))
      .sort((a, b) => {
        const officeSort = String(a.oficina?.nome || a.oficina || "").localeCompare(String(b.oficina?.nome || b.oficina || ""), "pt-BR");
        return officeSort || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
      });
  }
  const classCounts = new Map();
  (state.classStudents.length ? state.classStudents : state.alunos).forEach((aluno) => {
    (aluno.turmas || []).forEach((turma) => {
      const key = String(turma || "").trim();
      if (!key) return;
      classCounts.set(key, (classCounts.get(key) || 0) + 1);
    });
  });

  return state.oficinas
    .flatMap((oficina) => (oficina.turmas || [])
      .map((turma) => String(turma || "").trim())
      .filter(Boolean)
      .map((turma) => ({
        turma,
        oficina,
        alunosCount: classCounts.get(turma) || 0
      })))
    .sort((a, b) => {
      const officeSort = String(a.oficina.nome || "").localeCompare(String(b.oficina.nome || ""), "pt-BR");
      return officeSort || a.turma.localeCompare(b.turma, "pt-BR");
    });
}

function renderClassList() {
  const summary = document.querySelector("[data-class-summary]");
  const list = document.querySelector("[data-class-list]");
  if (!summary || !list) return;

  const term = normalizeSearchText(state.classSearch);
  if (state.classOffice && !state.oficinas.some((oficina) => oficina.id === state.classOffice)) {
    state.classOffice = "";
  }
  const rows = getClassRows();
  const visibleRows = rows.filter((row) => {
    const oficina = row.oficina || {};
    const matchesOffice = !state.classOffice || row.oficinaId === state.classOffice || oficina.id === state.classOffice;
    const matchesPeriod = !state.classPeriod || row.periodo === state.classPeriod;
    const matchesStatus = !state.classStatus
      || (state.classStatus === "ativa" && row.ativa)
      || (state.classStatus === "inativa" && !row.ativa);
    const matchesBolsista = !state.classBolsista || row.bolsistaId === state.classBolsista;
    const searchable = normalizeSearchText([row.nome || row.turma, row.oficina || oficina.nome, oficina.categoria, row.bolsista].join(" "));
    return matchesOffice && matchesPeriod && matchesStatus && matchesBolsista && (!term || searchable.includes(term));
  });
  const officeCount = new Set(visibleRows.map((row) => row.oficinaId || row.oficina?.id)).size;
  const linkedStudents = visibleRows.reduce((sum, row) => sum + row.alunosCount, 0);
  const capacity = visibleRows.reduce((sum, row) => sum + Number(row.vagasTotal || 0), 0);
  const metrics = [
    ["Turmas", visibleRows.length],
    ["Oficinas com turma", officeCount],
    ["Ocupação", capacity ? `${linkedStudents}/${capacity}` : linkedStudents]
  ];

  summary.replaceChildren(...metrics.map(([label, value]) => {
    const metric = createElement("article", { className: "turma-metric" });
    metric.append(
      createElement("span", { text: label }),
      createElement("strong", { text: String(value) })
    );
    return metric;
  }));

  list.replaceChildren();
  if (!rows.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhuma turma cadastrada. Use o formulário acima para adicionar a primeira turma." }));
    return;
  }
  if (!visibleRows.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhuma turma encontrada para o filtro." }));
    return;
  }

  visibleRows.forEach((row) => {
    const item = createElement("article", { className: "content-item" });
    const main = createElement("div", { className: "content-item-main" });
    const turmaNome = row.nome || row.turma;
    const oficinaNome = row.oficina?.nome || row.oficina || "";
    const horario = row.horario || [row.horarioInicio, row.horarioFim].filter(Boolean).join(" às ") || "Horário a definir";
    const faixa = row.idadeMinima !== undefined ? `${row.idadeMinima} a ${row.idadeMaxima} anos` : "Faixa etária a definir";
    main.append(
      createElement("strong", { text: turmaNome }),
      createElement("span", { text: `${oficinaNome} · ${formatDays(row.diasSemana || [])} · ${formatPeriod(row.periodo)} · ${horario}` }),
      createElement("span", { text: `Faixa etária: ${faixa}` }),
      createElement("span", { text: `Vagas: ${row.vagasOcupadas ?? row.alunosCount}/${row.vagasTotal || "sem limite definido"}${row.bolsista ? ` · Bolsista: ${row.bolsista}` : ""}` })
    );
    const actions = createElement("div", { className: "content-actions" });
    const status = createElement("span", { className: `status-badge ${row.ativa === false ? "danger" : "success"}`, text: row.ativa === false ? "Inativa" : "Ativa" });
    actions.append(status);
    if (row.id) {
      const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
      const toggle = createElement("button", { className: "icon-action", text: row.ativa === false ? "Ativar" : "Inativar", attrs: { type: "button" } });
      const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button", disabled: row.podeExcluir === false ? "disabled" : null } });
      edit.addEventListener("click", () => editTurma(row));
      toggle.addEventListener("click", () => toggleTurmaStatus(row));
      del.addEventListener("click", () => deleteTurma(row));
      actions.append(edit, toggle, del);
    } else {
      const edit = createElement("button", { className: "icon-action", text: "Editar oficina", attrs: { type: "button" } });
      edit.addEventListener("click", () => editOffice(row.oficina));
      actions.append(edit);
    }
    item.append(main, actions);
    list.append(item);
  });
}

function resetTurmaForm() {
  const form = document.querySelector("[data-turma-form]");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.periodo.value = "manha";
  form.elements.idadeMinima.value = "6";
  form.elements.idadeMaxima.value = "17";
  form.elements.vagasTotal.value = "20";
  form.elements.ativa.checked = true;
  setTurmaDays([]);
  setFeedback(document.querySelector("[data-turma-feedback]"), "");
}

function editTurma(turma) {
  const form = document.querySelector("[data-turma-form]");
  if (!form) return;
  setFormValues(form, {
    id: turma.id,
    oficinaId: turma.oficinaId,
    nome: turma.nome,
    periodo: turma.periodo,
    horarioInicio: turma.horarioInicio,
    horarioFim: turma.horarioFim,
    idadeMinima: turma.idadeMinima,
    idadeMaxima: turma.idadeMaxima,
    vagasTotal: turma.vagasTotal,
    bolsistaId: turma.bolsistaId || "",
    local: turma.local || "",
    observacoes: turma.observacoes || "",
    ativa: turma.ativa !== false
  });
  setTurmaDays(turma.diasSemana || []);
  showAdminPage("turmas", true);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleTurmaStatus(turma) {
  await secureRequest(`/admin/turmas/${turma.id}/status`, {
    method: "PATCH",
    body: { ativa: turma.ativa === false }
  });
  await loadManagedContent();
  await loadAttendanceClasses();
}

async function deleteTurma(turma) {
  if (turma.podeExcluir === false) {
    setFeedback(document.querySelector("[data-turma-feedback]"), "Esta turma possui vínculos. Inative em vez de excluir.", "error");
    return;
  }
  if (!window.confirm(`Excluir a turma ${turma.nome}?`)) return;
  await secureRequest(`/admin/turmas/${turma.id}`, { method: "DELETE" });
  await loadManagedContent();
  await loadAttendanceClasses();
}

function resetOfficeForm() {
  const form = document.querySelector("[data-office-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.imagemUrl.value = "/img/oficinas.png";
  form.elements.periodo.value = "a definir";
  form.elements.capacidade.value = "30";
  if (form.elements.turmas) form.elements.turmas.value = "";
  form.elements.ativo.checked = true;
  setCheckedValues(form, "diasSemana", []);
  setFeedback(document.querySelector("[data-office-feedback]"), "");
}

function editOffice(oficina) {
  const form = document.querySelector("[data-office-form]");
  setFormValues(form, {
    id: oficina.id,
    nome: oficina.nome,
    categoria: oficina.categoria,
    faixaEtaria: oficina.faixaEtaria,
    periodo: oficina.periodo,
    horario: oficina.horario,
    capacidade: oficina.capacidade || 30,
    imagemUrl: oficina.imagemUrl,
    initials: oficina.initials,
    descricao: oficina.descricao,
    turmas: arrayToLines(oficina.turmas),
    ativo: oficina.ativo
  });
  setCheckedValues(form, "diasSemana", oficina.diasSemana || []);
  showAdminPage("oficinas", true);
}

async function deleteOffice(oficina) {
  if (!window.confirm(`Excluir a oficina ${oficina.nome}? Alunos vinculados ficarão sem oficina.`)) return;
  await secureRequest(`/admin/oficinas/${oficina.id}`, { method: "DELETE" });
  await loadManagedContent();
  await refreshAll();
}

async function openStudentFromEnrollment(item) {
  if (!item.sourceId) {
    showAdminPage("alunos", true);
    return;
  }
  try {
    const data = await apiRequest(`/alunos/${item.sourceId}`, { cache: "no-store" });
    await editStudent(data.aluno, true);
  } catch (error) {
    showToast(error.message || "Não foi possível abrir a ficha do aluno.", "error");
    showAdminPage("alunos", true);
  }
}

async function removeStudentFromEnrollment(item) {
  const aluno = state.alunos.find((record) => record.id === item.sourceId) || {
    id: item.sourceId,
    nome: item.nome
  };
  await deleteStudent(aluno);
}

function linkedDeleteSources(person) {
  const sources = person.sources?.length
    ? person.sources
    : [{ source: person.primarySource || person.source, sourceId: person.primarySourceId || person.sourceId || person.id }];
  const seen = new Set();
  return sources
    .map((source) => ({
      source: source.source,
      sourceId: source.sourceId || source.id
    }))
    .filter((source) => {
      if (!source.source || !source.sourceId) return false;
      const key = `${source.source}:${source.sourceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function deletePersonRecords(person) {
  const sources = linkedDeleteSources(person);
  if (!sources.length) return;
  const confirmed = window.confirm(`Excluir todos os registros vinculados de ${person.nome}?`);
  if (!confirmed) return;

  for (const source of sources) {
    if (source.source === "aluno") {
      await secureRequest(`/alunos/${source.sourceId}`, { method: "DELETE" });
    } else if (source.source === "inscricao") {
      await secureRequest(`/inscricoes/${source.sourceId}`, { method: "DELETE" });
    }
  }

  await refreshAll();
}

function renderGalleryList() {
  const list = document.querySelector("[data-gallery-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.galeria.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhuma imagem cadastrada." }));
    return;
  }

  state.galeria.forEach((image) => {
    const item = createElement("article", { className: "content-item" });
    item.append(createElement("img", {
      className: "content-thumb",
      attrs: { src: image.imagemUrl, alt: image.alt || image.titulo, loading: "lazy" }
    }));
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: image.titulo }),
      createElement("span", { text: image.descricao || image.imagemUrl }),
      createElement("span", { text: image.hasUploadedFile ? `Arquivo: ${image.originalName || "imagem enviada"}` : "Origem: URL" }),
      createElement("span", { text: image.ativo ? `Ativa · ordem ${image.ordem}` : `Inativa · ordem ${image.ordem}` })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editGallery(image));
    del.addEventListener("click", () => deleteGallery(image));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function resetGalleryForm() {
  const form = document.querySelector("[data-gallery-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.ordem.value = String(state.galeria.length + 1);
  form.elements.ativo.checked = true;
  if (form.elements.imagemArquivo) form.elements.imagemArquivo.value = "";
  setFeedback(document.querySelector("[data-gallery-feedback]"), "");
}

function editGallery(image) {
  const form = document.querySelector("[data-gallery-form]");
  setFormValues(form, {
    id: image.id,
    titulo: image.titulo,
    descricao: image.descricao,
    imagemUrl: image.imagemUrl,
    alt: image.alt,
    ordem: image.ordem,
    ativo: image.ativo
  });
  if (form.elements.imagemArquivo) form.elements.imagemArquivo.value = "";
  showAdminPage("galeria", true);
}

async function deleteGallery(image) {
  if (!window.confirm(`Excluir a imagem ${image.titulo}?`)) return;
  await secureRequest(`/admin/galeria/${image.id}`, { method: "DELETE" });
  await loadManagedContent();
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

function linesToArray(value) {
  return String(value || "")
    .split(/[\n;,|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("\n") : "";
}

function renderLegacyImportSummary(result) {
  const summary = document.querySelector("[data-student-legacy-import-summary]");
  if (!summary) return;
  summary.replaceChildren();
  if (!result) return;
  const items = [
    `Linhas lidas: ${result.totalRows || 0}`,
    `Novos alunos: ${result.importedCount || 0}`,
    `Fichas atualizadas: ${result.updatedCount || 0}`,
    `Alertas/erros: ${result.errorCount || 0}`,
    `Turmas reconhecidas: ${result.plannedTurmas || 0}`
  ];
  if (result.plannedOffices?.length) items.push(`Oficinas faltantes: ${result.plannedOffices.join(", ")}`);
  if (result.createdOffices?.length) items.push(`Oficinas criadas: ${result.createdOffices.join(", ")}`);
  const list = createElement("ul");
  items.forEach((text) => list.append(createElement("li", { text })));
  summary.append(list);
  if (result.errors?.length) {
    const errorList = createElement("ul", { className: "import-errors" });
    result.errors.slice(0, 10).forEach((item) => {
      errorList.append(createElement("li", { text: `Linha ${item.linha}: ${item.erro}` }));
    });
    summary.append(createElement("strong", { text: "Primeiros alertas" }), errorList);
  }
}

function collaboratorThumb(item) {
  if (item.imagemUrl) {
    return createElement("img", {
      className: "content-thumb",
      attrs: { src: item.imagemUrl, alt: item.alt || item.nome, loading: "lazy" }
    });
  }
  return createElement("div", {
    className: "content-thumb content-thumb-placeholder",
    text: initialsFromName(item.nome),
    attrs: { "aria-hidden": "true" }
  });
}

function renderCollaboratorList() {
  const list = document.querySelector("[data-collaborator-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.colaboradores.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhum colaborador cadastrado." }));
    return;
  }

  state.colaboradores.forEach((itemData) => {
    const item = createElement("article", { className: "content-item" });
    item.append(collaboratorThumb(itemData));
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: itemData.nome }),
      createElement("span", { text: itemData.descricao || "Sem descrição." }),
      createElement("span", { text: itemData.siteUrl }),
      createElement("span", { text: itemData.hasUploadedFile ? `Arquivo: ${itemData.originalName || "imagem enviada"}` : (itemData.imagemUrl ? "Origem: URL" : "Sem imagem") }),
      createElement("span", { text: itemData.ativo ? `Ativo - ordem ${itemData.ordem}` : `Inativo - ordem ${itemData.ordem}` })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editCollaborator(itemData));
    del.addEventListener("click", () => deleteCollaborator(itemData));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function resetCollaboratorForm() {
  const form = document.querySelector("[data-collaborator-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.ordem.value = String(state.colaboradores.length + 1);
  form.elements.ativo.checked = true;
  if (form.elements.imagemArquivo) form.elements.imagemArquivo.value = "";
  setFeedback(document.querySelector("[data-collaborator-feedback]"), "");
}

function editCollaborator(item) {
  const form = document.querySelector("[data-collaborator-form]");
  setFormValues(form, {
    id: item.id,
    nome: item.nome,
    descricao: item.descricao,
    siteUrl: item.siteUrl,
    imagemUrl: item.imagemUrl,
    alt: item.alt,
    ordem: item.ordem,
    ativo: item.ativo
  });
  if (form.elements.imagemArquivo) form.elements.imagemArquivo.value = "";
  showAdminPage("colaboradores", true);
}

async function deleteCollaborator(item) {
  if (!window.confirm(`Excluir o colaborador ${item.nome}?`)) return;
  await secureRequest(`/admin/colaboradores/${item.id}`, { method: "DELETE" });
  await loadManagedContent();
}

function renderTestimonialList() {
  const list = document.querySelector("[data-testimonial-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.depoimentos.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhum depoimento cadastrado." }));
    return;
  }

  state.depoimentos.forEach((itemData) => {
    const item = createElement("article", { className: "content-item" });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: itemData.nome }),
      createElement("span", { text: itemData.texto || "Sem depoimento." }),
      createElement("span", { text: [itemData.vinculo, itemData.oficina].filter(Boolean).join(" · ") || "Sem vínculo informado" }),
      createElement("span", { text: itemData.ativo ? `Ativo - ordem ${itemData.ordem}` : `Inativo - ordem ${itemData.ordem}` })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editTestimonial(itemData));
    del.addEventListener("click", () => deleteTestimonial(itemData));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function resetTestimonialForm() {
  const form = document.querySelector("[data-testimonial-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.ordem.value = String(state.depoimentos.length + 1);
  form.elements.ativo.checked = true;
  setFeedback(document.querySelector("[data-testimonial-feedback]"), "");
}

function editTestimonial(item) {
  const form = document.querySelector("[data-testimonial-form]");
  setFormValues(form, {
    id: item.id,
    nome: item.nome,
    vinculo: item.vinculo,
    texto: item.texto,
    oficina: item.oficina,
    ordem: item.ordem,
    ativo: item.ativo
  });
  showAdminPage("depoimentos", true);
}

async function deleteTestimonial(item) {
  if (!window.confirm(`Excluir o depoimento de ${item.nome}?`)) return;
  await secureRequest(`/admin/depoimentos/${item.id}`, { method: "DELETE" });
  await loadManagedContent();
}

function renderFaqList() {
  const list = document.querySelector("[data-faq-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.faq.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhuma pergunta cadastrada no FAQ." }));
    return;
  }

  state.faq.forEach((itemData) => {
    const item = createElement("article", { className: `content-item${itemData.ativo ? "" : " is-inactive"}` });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: itemData.pergunta }),
      createElement("span", { text: itemData.resposta }),
      createElement("span", { text: itemData.ativo ? `Ativo - ordem ${itemData.ordem}` : `Inativo - ordem ${itemData.ordem}` })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editFaq(itemData));
    del.addEventListener("click", () => deleteFaq(itemData));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function resetFaqForm() {
  const form = document.querySelector("[data-faq-form]");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.ordem.value = String(state.faq.length + 1);
  form.elements.ativo.checked = true;
  setFeedback(document.querySelector("[data-faq-feedback]"), "");
}

function editFaq(item) {
  const form = document.querySelector("[data-faq-form]");
  setFormValues(form, {
    id: item.id,
    pergunta: item.pergunta,
    resposta: item.resposta,
    ordem: item.ordem,
    ativo: item.ativo
  });
  showAdminPage("faq", true);
}

async function deleteFaq(item) {
  if (!window.confirm(`Excluir a pergunta "${item.pergunta}"?`)) return;
  await secureRequest(`/admin/faq/${item.id}`, { method: "DELETE" });
  await loadManagedContent();
}

function selectedTurmaDays() {
  return Array.from(document.querySelectorAll("[data-turma-day-check]:checked")).map((input) => input.value);
}

function setTurmaDays(days = []) {
  const values = new Set(days);
  document.querySelectorAll("[data-turma-day-check]").forEach((input) => {
    input.checked = values.has(input.value);
    input.closest(".office-picker-option")?.classList.toggle("is-selected", input.checked);
  });
}

function renderTurmaDayPicker() {
  const picker = document.querySelector("[data-turma-days-picker]");
  if (!picker || picker.children.length) return;
  Object.entries(dayLabels).forEach(([value, label]) => {
    const item = createElement("label", { className: "office-picker-option" });
    const input = createElement("input", {
      attrs: {
        type: "checkbox",
        value,
        "data-turma-day-check": ""
      }
    });
    input.addEventListener("change", () => {
      item.classList.toggle("is-selected", input.checked);
    });
    item.append(input, createElement("span", { text: label }));
    picker.append(item);
  });
}

function syncStudentOfficeSelectFromPicker() {
  const select = document.querySelector("[data-student-office-select]");
  if (!select) return;
  const values = Array.from(document.querySelectorAll("[data-student-office-check]:checked")).map((input) => input.value);
  setSelectedValues(select, values);
  document.querySelector("[data-student-office-picker]")?.classList.toggle("is-invalid", values.length === 0);
  renderStudentOfficeChips();
  renderStudentTurmaPicker();
}

function renderStudentOfficePicker() {
  const picker = document.querySelector("[data-student-office-picker]");
  const select = document.querySelector("[data-student-office-select]");
  if (!picker || !select) {
    renderStudentOfficeChips();
    return;
  }

  picker.replaceChildren();
  const options = Array.from(select.options);
  if (!options.length) {
    picker.append(createElement("span", { className: "form-feedback", text: "Nenhuma oficina cadastrada." }));
    renderStudentOfficeChips();
    return;
  }

  options.forEach((option) => {
    const item = createElement("label", {
      className: `office-picker-option${option.selected ? " is-selected" : ""}`
    });
    const input = createElement("input", {
      attrs: {
        type: "checkbox",
        value: option.value,
        "data-student-office-check": ""
      }
    });
    input.checked = option.selected;
    input.addEventListener("change", () => {
      item.classList.toggle("is-selected", input.checked);
      syncStudentOfficeSelectFromPicker();
    });
    item.append(input, createElement("span", { text: option.textContent }));
    picker.append(item);
  });

  picker.classList.toggle("is-invalid", selectedValues(select).length === 0);
  renderStudentOfficeChips();
  renderStudentTurmaPicker();
}

function renderStudentOfficeChips() {
  const container = document.querySelector("[data-student-office-chips]");
  const select = document.querySelector("[data-student-office-select]");
  if (!container || !select) return;

  const selected = Array.from(select.selectedOptions)
    .map((option) => option.textContent.trim())
    .filter(Boolean);

  container.replaceChildren();
  if (!selected.length) {
    container.append(createElement("span", { className: "chip chip-muted", text: "Nenhuma oficina selecionada" }));
    return;
  }

  selected.slice(0, 10).forEach((label) => {
    container.append(createElement("span", { className: "chip chip-success", text: label }));
  });

  if (selected.length > 10) {
    container.append(createElement("span", { className: "chip chip-muted", text: `+${selected.length - 10}` }));
  }
}

function getStudentFormAge() {
  const form = document.querySelector("[data-student-form]");
  if (!form) return null;
  const explicitAge = Number(form.elements.idade?.value || "");
  if (Number.isInteger(explicitAge) && explicitAge >= 0) return explicitAge;
  const birthDate = form.elements.dataNascimento?.value;
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return Number.isInteger(age) && age >= 0 ? age : null;
}

function selectedStudentTurmaIds() {
  return Array.from(document.querySelectorAll("[data-student-turma-check]:checked")).map((input) => input.value);
}

function turmaMatchesStudentAge(turma, age) {
  if (!Number.isInteger(age)) return true;
  return age >= Number(turma.idadeMinima ?? 0) && age <= Number(turma.idadeMaxima ?? 99);
}

function formatTurmaDetails(turma) {
  const schedule = turma.horario || [turma.horarioInicio, turma.horarioFim].filter(Boolean).join(" às ") || "horário a definir";
  const age = `${turma.idadeMinima ?? 0} a ${turma.idadeMaxima ?? 99} anos`;
  const vacancies = Number(turma.vagasTotal || 0) > 0
    ? `${Number(turma.vagasOcupadas || 0)}/${Number(turma.vagasTotal || 0)} vagas`
    : "vagas a definir";
  return `${formatDays(turma.diasSemana || [])} · ${formatPeriod(turma.periodo)} · ${schedule} · ${age} · ${vacancies}`;
}

function selectedStudentTurmas() {
  const ids = new Set(selectedStudentTurmaIds());
  return state.turmas.filter((turma) => ids.has(turma.id));
}

function renderStudentTurmaPicker(preferredIds = selectedStudentTurmaIds()) {
  const picker = document.querySelector("[data-student-turma-picker]");
  const help = document.querySelector("[data-student-turma-help]");
  const officeSelect = document.querySelector("[data-student-office-select]");
  if (!picker || !officeSelect) return;

  const officeIds = selectedValues(officeSelect);
  const selected = new Set(preferredIds);
  const age = getStudentFormAge();
  picker.replaceChildren();

  if (!officeIds.length) {
    picker.append(createElement("p", { className: "form-feedback", text: "Selecione uma oficina para ver as turmas disponíveis." }));
    if (help) help.textContent = "Depois de escolher a oficina, selecione uma turma compatível com a idade do aluno.";
    return;
  }

  let renderedOptions = 0;
  officeIds.forEach((officeId) => {
    const office = state.oficinas.find((item) => item.id === officeId);
    const group = createElement("section", { className: "student-turma-group" });
    group.append(createElement("strong", { text: office?.nome || "Oficina selecionada" }));

    const turmas = state.turmas
      .filter((turma) => turma.oficinaId === officeId && turma.ativa !== false)
      .filter((turma) => turmaMatchesStudentAge(turma, age));

    if (!turmas.length) {
      group.append(createElement("p", {
        className: "form-feedback",
        text: Number.isInteger(age)
          ? "Nenhuma turma ativa compatível com a idade informada."
          : "Nenhuma turma ativa cadastrada para esta oficina."
      }));
      picker.append(group);
      return;
    }

    const options = createElement("div", { className: "student-turma-options" });
    turmas.forEach((turma) => {
      renderedOptions += 1;
      const item = createElement("label", {
        className: `office-picker-option turma-picker-option${selected.has(turma.id) ? " is-selected" : ""}`
      });
      const input = createElement("input", {
        attrs: {
          type: "checkbox",
          value: turma.id,
          "data-student-turma-check": "",
          "data-office-id": officeId,
          "data-turma-name": turma.nome
        }
      });
      input.checked = selected.has(turma.id);
      input.addEventListener("change", () => {
        if (input.checked) {
          document.querySelectorAll(`[data-student-turma-check][data-office-id="${officeId}"]`).forEach((other) => {
            if (other !== input) {
              other.checked = false;
              other.closest(".turma-picker-option")?.classList.remove("is-selected");
            }
          });
        }
        item.classList.toggle("is-selected", input.checked);
      });
      const text = createElement("span");
      text.append(
        createElement("strong", { text: turma.nome }),
        createElement("small", { text: formatTurmaDetails(turma) })
      );
      item.append(input, text);
      options.append(item);
    });
    group.append(options);
    picker.append(group);
  });

  if (help) {
    help.textContent = renderedOptions
      ? "Selecione no máximo uma turma por oficina. Turmas incompatíveis com a idade não aparecem."
      : "Nenhuma turma disponível para as oficinas e idade informadas.";
  }
}

function syncBolsistaOfficeSelectFromPicker() {
  const select = document.querySelector("[data-bolsista-office-select]");
  if (!select) return;
  const values = Array.from(document.querySelectorAll("[data-bolsista-office-check]:checked")).map((input) => input.value);
  setSelectedValues(select, values);
}

function renderBolsistaOfficePicker() {
  const picker = document.querySelector("[data-bolsista-office-picker]");
  const select = document.querySelector("[data-bolsista-office-select]");
  if (!picker || !select) return;

  picker.replaceChildren();
  const options = Array.from(select.options);
  if (!options.length) {
    picker.append(createElement("span", { className: "form-feedback", text: "Nenhuma oficina cadastrada." }));
    return;
  }

  options.forEach((option) => {
    const item = createElement("label", {
      className: `office-picker-option${option.selected ? " is-selected" : ""}`
    });
    const input = createElement("input", {
      attrs: {
        type: "checkbox",
        value: option.value,
        "data-bolsista-office-check": ""
      }
    });
    input.checked = option.selected;
    input.addEventListener("change", () => {
      item.classList.toggle("is-selected", input.checked);
      syncBolsistaOfficeSelectFromPicker();
    });
    item.append(input, createElement("span", { text: option.textContent }));
    picker.append(item);
  });
}

function renderStudentOverview() {
  const summary = document.querySelector("[data-student-overview]");
  if (!summary) return;

  const alunos = state.alunos || [];
  const active = alunos.filter((aluno) => aluno.status !== "inativo").length;
  const documentsPending = alunos.filter((aluno) => Boolean(aluno.documentosPendentes)).length;
  const linkedWorkshops = new Set(alunos.flatMap((aluno) => aluno.oficinas || []).filter(Boolean)).size;

  summary.replaceChildren(
    reportMetric("Total encontrado", state.studentPagination.total, "Resultado da busca atual"),
    reportMetric("Exibidos", alunos.length, "Nesta página"),
    reportMetric("Ativos exibidos", active, "Nesta página"),
    reportMetric("Pendência de docs", documentsPending, "Nesta página"),
    reportMetric("Oficinas exibidas", linkedWorkshops, "Nesta página")
  );
}

function renderStudentList() {
  const list = document.querySelector("[data-student-list]");
  const pagination = document.querySelector("[data-student-pagination]");
  if (!list) return;
  renderStudentOverview();
  list.replaceChildren();
  pagination?.replaceChildren();

  if (!state.alunos.length) {
    const empty = createElement("article", { className: "empty-state student-empty" });
    empty.append(
      createElement("span", { className: "empty-state-icon", attrs: { "aria-hidden": "true" } }),
      createElement("strong", { text: "Nenhum aluno encontrado" }),
      createElement("p", { text: "Ajuste os filtros ou cadastre um novo aluno para começar o acompanhamento." })
    );
    list.append(empty);
    return;
  }

  state.alunos.forEach((aluno) => {
    const item = createElement("article", {
      className: `content-item student-item student-card${Number(aluno.faltasUltimos30Dias || 0) > 2 ? " is-attention" : ""}`
    });
    const main = createElement("div", { className: "content-item-main student-card-main" });
    const title = createElement("div", { className: "student-title" });
    title.append(
      createElement("strong", { text: aluno.nome || "Aluno sem nome" }),
      createElement("span", { text: `${(aluno.oficinas || []).join(", ") || "Sem oficina"} · CPF: ${aluno.cpfMascarado || maskCpfValue(aluno.cpf || "") || "sem CPF"} · Matrícula: ${aluno.matricula || "gerando"}` })
    );

    const heading = createElement("div", { className: "student-card-heading" });
    heading.append(title);

    main.append(
      heading
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const whatsapp = createElement("button", { className: "icon-action", text: "Enviar matrícula", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editStudent(aluno));
    whatsapp.addEventListener("click", () => sendMatriculaWhatsApp(aluno));
    del.addEventListener("click", () => deleteStudent(aluno));
    actions.append(edit, whatsapp, del);
    item.append(main, actions);
    list.append(item);
  });

  if (pagination) {
    const { page, pages, total } = state.studentPagination;
    const previous = createElement("button", { className: "button button-secondary", text: "Anterior", attrs: { type: "button", disabled: page <= 1 ? "disabled" : null } });
    const next = createElement("button", { className: "button button-secondary", text: "Próxima", attrs: { type: "button", disabled: page >= pages ? "disabled" : null } });
    previous.addEventListener("click", () => {
      if (page <= 1) return;
      state.studentPagination.page = page - 1;
      loadAlunos();
    });
    next.addEventListener("click", () => {
      if (page >= pages) return;
      state.studentPagination.page = page + 1;
      loadAlunos();
    });
    pagination.append(previous, createElement("span", { text: `Página ${page} de ${pages} · ${total} aluno(s)` }), next);
  }
}

function resetStudentForm() {
  const form = document.querySelector("[data-student-form]");
  form.reset();
  form.elements.id.value = "";
  const matriculaInput = document.querySelector("[data-student-matricula]");
  if (matriculaInput) matriculaInput.value = "";
  form.elements.status.value = "ativo";
  form.elements.documentosPendentes.checked = false;
  if (form.elements.possuiDeficiencia) form.elements.possuiDeficiencia.value = "false";
  if (form.elements.documentosLinks) form.elements.documentosLinks.value = "";
  setSelectedValues(form.elements.oficinaIds, []);
  renderStudentOfficePicker();
  renderStudentTurmaPicker([]);
  setFeedback(document.querySelector("[data-student-feedback]"), "");
}

async function editStudent(aluno, loaded = false) {
  if (aluno?.id && !loaded) {
    try {
      const data = await apiRequest(`/alunos/${aluno.id}`, { cache: "no-store" });
      return editStudent(data.aluno, true);
    } catch (error) {
      showToast(error.message || "Não foi possível carregar os detalhes do aluno.", "error");
      return;
    }
  }
  const form = document.querySelector("[data-student-form]");
  const matriculaInput = document.querySelector("[data-student-matricula]");
  if (matriculaInput) matriculaInput.value = aluno.matricula || "";
  setFormValues(form, {
    id: aluno.id,
    nome: aluno.nome,
    cpf: maskCpfValue(aluno.cpf || ""),
    idade: aluno.idade,
    telefone: aluno.telefone,
    responsavel: aluno.responsavel,
    email: aluno.email,
    dataNascimento: aluno.dataNascimento,
    bairro: aluno.bairro,
    possuiDeficiencia: aluno.possuiDeficiencia ? "true" : "false",
    deficienciaDescricao: aluno.deficienciaDescricao,
    documentosLinks: arrayToLines(aluno.documentosLinks),
    status: aluno.status,
    documentosPendentes: Boolean(aluno.documentosPendentes),
    advertencias: aluno.advertencias,
    historicoOficinas: aluno.historicoOficinas,
    observacoes: aluno.observacoes
  });
  setSelectedValues(form.elements.oficinaIds, aluno.oficinaIds || []);
  renderStudentOfficePicker();
  renderStudentTurmaPicker(aluno.turmaIds || (aluno.turmaId ? [aluno.turmaId] : []));
  showAdminPage("alunos", true);
}

async function deleteStudent(aluno) {
  if (!window.confirm(`Excluir o aluno ${aluno.nome}?`)) return;
  await secureRequest(`/alunos/${aluno.id}`, { method: "DELETE" });
  await refreshAll();
}

async function sendMatriculaWhatsApp(aluno) {
  if (!aluno?.id) return;
  try {
    const result = await secureRequest(`/alunos/${aluno.id}/matricula-whatsapp`, { method: "POST" });
    if (!result.whatsappUrl) {
      showToast("Não foi possível preparar a mensagem de WhatsApp.", "error");
      return;
    }
    window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    showToast(error.message || "Não há telefone disponível para envio da matrícula.", "error");
  }
}

function renderBolsistaSummary(limit = 40) {
  const summary = document.querySelector("[data-bolsista-summary]");
  if (!summary) return;
  const total = state.bolsistas.length;
  const ativos = state.bolsistas.filter((item) => item.status === "ativo").length;
  const professores = state.bolsistas.filter((item) => item.funcao === "professor").length;
  const ajudantes = state.bolsistas.filter((item) => item.funcao === "ajudante_professor").length;
  const metrics = [
    ["Bolsistas", `${total}/${limit}`],
    ["Ativos", String(ativos)],
    ["Professores", String(professores)],
    ["Ajudantes", String(ajudantes)]
  ];

  summary.replaceChildren();
  metrics.forEach(([label, value]) => {
    const metric = createElement("article", { className: "bolsista-metric" });
    metric.append(
      createElement("span", { text: label }),
      createElement("strong", { text: value })
    );
    summary.append(metric);
  });
}

function renderBolsistaList(limit = 40) {
  renderBolsistaSummary(limit);
  const list = document.querySelector("[data-bolsista-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.bolsistas.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhum bolsista cadastrado para o filtro." }));
    return;
  }

  state.bolsistas.forEach((bolsista) => {
    const item = createElement("article", { className: `content-item${bolsista.status !== "ativo" ? " is-muted" : ""}` });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: bolsista.nome }),
      createElement("span", { text: `${bolsistaFunctionLabels[bolsista.funcao] || bolsista.funcao} - ${bolsistaActionLabels[bolsista.tipoAtuacao] || bolsista.tipoAtuacao}` }),
      createElement("span", { text: `Dias: ${(bolsista.diasSemana || []).map((day) => dayLabels[day] || day).join(", ") || "sem escala semanal"}` }),
      createElement("span", { text: `${bolsista.idade} anos - CPF: ${maskCpfValue(bolsista.cpf || "") || "sem CPF"} - ${bolsista.status}` }),
      createElement("span", { text: bolsista.telefone || bolsista.email || "sem contato informado" }),
      createElement("span", { text: (bolsista.oficinas || []).length ? `Oficinas: ${bolsista.oficinas.join(", ")}` : "Sem oficina vinculada" }),
      createElement("span", { text: bolsista.observacoes || "" })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editBolsista(bolsista));
    del.addEventListener("click", () => deleteBolsista(bolsista));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function resetBolsistaForm() {
  const form = document.querySelector("[data-bolsista-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.funcao.value = "adm";
  form.elements.tipoAtuacao.value = "apoio";
  form.elements.status.value = "ativo";
  setCheckedValues(form, "diasSemana", []);
  setSelectedValues(form.elements.oficinaIds, []);
  renderBolsistaOfficePicker();
  setFeedback(document.querySelector("[data-bolsista-feedback]"), "");
}

function editBolsista(bolsista) {
  const form = document.querySelector("[data-bolsista-form]");
  setFormValues(form, {
    id: bolsista.id,
    nome: bolsista.nome,
    cpf: maskCpfValue(bolsista.cpf || ""),
    idade: bolsista.idade,
    telefone: bolsista.telefone,
    email: bolsista.email,
    funcao: bolsista.funcao,
    tipoAtuacao: bolsista.tipoAtuacao,
    status: bolsista.status,
    observacoes: bolsista.observacoes
  });
  setCheckedValues(form, "diasSemana", bolsista.diasSemana || []);
  setSelectedValues(form.elements.oficinaIds, bolsista.oficinaIds || []);
  renderBolsistaOfficePicker();
  showAdminPage("bolsistas", true);
}

async function deleteBolsista(bolsista) {
  if (!window.confirm(`Excluir o bolsista ${bolsista.nome}?`)) return;
  await secureRequest(`/admin/bolsistas/${bolsista.id}`, { method: "DELETE" });
  await Promise.all([loadBolsistas(), loadCalendar()]);
}

function timeRange(item) {
  const start = item.horarioInicio || "";
  const end = item.horarioFim || "";
  if (start && end) return `${start} - ${end}`;
  return start || item.horario || "";
}

function itemsByDate() {
  const map = new Map();
  const add = (date, item) => {
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(item);
  };
  state.calendar.aulas.forEach((aula) => add(aula.data, { ...aula, kind: "aula" }));
  state.calendar.eventos.forEach((evento) => add(evento.data, { ...evento, kind: "evento" }));
  return map;
}

function renderCalendarItem(item) {
  const node = createElement("article", {
    className: `calendar-item is-${item.kind === "aula" ? "class" : item.tipo || "event"}`
  });
  node.append(
    createElement("strong", { text: item.kind === "aula" ? item.titulo : `${eventTypeLabels[item.tipo] || "Evento"}: ${item.titulo}` })
  );
  const details = [
    timeRange(item),
    item.kind === "aula" ? item.periodo : item.local,
    item.kind === "aula"
      ? ((item.bolsistas || []).map((bolsista) => bolsista.nome).join(", ") || "Sem bolsista escalado")
      : ((item.bolsistas || []).join(", ") || "")
  ].filter(Boolean);
  if (details.length) {
    node.append(createElement("span", { text: details.join(" - ") }));
  }
  return node;
}

function calendarMetric(label, value, description = "") {
  const metric = createElement("article", { className: "calendar-metric" });
  metric.append(
    createElement("span", { text: label }),
    createElement("strong", { text: String(value) }),
    createElement("small", { text: description })
  );
  return metric;
}

function renderCalendar() {
  const grid = document.querySelector("[data-calendar-grid]");
  const eventList = document.querySelector("[data-calendar-event-list]");
  const summary = document.querySelector("[data-calendar-summary]");
  const monthInput = document.querySelector("[data-calendar-month]");
  if (!grid || !eventList) return;

  if (monthInput) monthInput.value = state.calendar.month;
  const [year, monthNumber] = state.calendar.month.split("-").map(Number);
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDate = `${state.calendar.month}-01`;
  const leading = weekdayIndexMondayFirst(firstDate);
  const today = new Date().toISOString().slice(0, 10);
  const grouped = itemsByDate();

  if (summary) {
    const busyDays = Array.from(grouped.values()).filter((items) => items.length).length;
    const nextItem = Array.from(grouped.entries())
      .flatMap(([date, items]) => items.map((item) => ({ ...item, data: date })))
      .filter((item) => item.data >= today)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(timeRange(a)).localeCompare(String(timeRange(b))))[0];
    summary.replaceChildren(
      calendarMetric("Aulas previstas", state.calendar.aulas.length, monthLabel(state.calendar.month)),
      calendarMetric("Eventos manuais", state.calendar.eventos.length, "Reuniões, passeios e formações"),
      calendarMetric("Dias com agenda", busyDays, `${totalDays} dias no mês`),
      calendarMetric("Próximo item", nextItem ? String(nextItem.data).slice(8, 10) : "-", nextItem ? (nextItem.titulo || eventTypeLabels[nextItem.tipo] || "Agenda") : "Nada futuro no mês")
    );
  }

  grid.replaceChildren();
  ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].forEach((label) => {
    grid.append(createElement("div", { className: "calendar-weekday", text: label }));
  });
  for (let i = 0; i < leading; i += 1) {
    grid.append(createElement("div", { className: "calendar-day is-empty" }));
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const date = dateFromMonthDay(state.calendar.month, day);
    const cell = createElement("section", {
      className: `calendar-day${date === today ? " is-today" : ""}`
    });
    const header = createElement("header");
    header.append(
      createElement("strong", { text: String(day) }),
      createElement("span", { text: date === today ? "Hoje" : "" })
    );
    cell.append(header);
    const items = grouped.get(date) || [];
    if (!items.length) {
      cell.append(createElement("p", { text: "Sem agenda" }));
    } else {
      items.forEach((item) => cell.append(renderCalendarItem(item)));
    }
    grid.append(cell);
  }

  const agendaItems = Array.from(grouped.entries())
    .flatMap(([date, items]) => items.map((item) => ({ ...item, data: date })))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(timeRange(a)).localeCompare(String(timeRange(b))));

  eventList.replaceChildren();
  if (!agendaItems.length) {
    eventList.append(createElement("p", { className: "form-feedback", text: `Nenhuma aula ou evento em ${monthLabel(state.calendar.month)}.` }));
    return;
  }

  agendaItems.forEach((evento) => {
    const item = createElement("article", { className: `content-item calendar-agenda-item is-${evento.kind === "aula" ? "class" : evento.tipo || "event"}` });
    const main = createElement("div", { className: "content-item-main" });
    const title = evento.kind === "aula" ? evento.titulo : `${eventTypeLabels[evento.tipo] || evento.tipo}: ${evento.titulo}`;
    main.append(
      createElement("strong", { text: title }),
      createElement("span", { text: `${evento.data} ${timeRange(evento)}`.trim() }),
      createElement("span", { text: [evento.local, evento.oficina, evento.periodo].filter(Boolean).join(" - ") || "Sem local/oficina" }),
      createElement("span", { text: (evento.bolsistas || []).length ? `Bolsistas: ${(evento.bolsistas || []).map((bolsista) => bolsista.nome || bolsista).join(", ")}` : "Sem bolsista vinculado" }),
      createElement("span", { text: evento.descricao || "" })
    );
    const actions = createElement("div", { className: "content-actions" });
    if (evento.kind === "evento") {
      const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
      const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
      edit.addEventListener("click", () => editCalendarEvent(evento));
      del.addEventListener("click", () => deleteCalendarEvent(evento));
      actions.append(edit, del);
    } else {
      actions.append(createElement("span", { className: "status-badge", text: "Aula prevista" }));
    }
    item.append(main, actions);
    eventList.append(item);
  });
}

function resetCalendarEventForm() {
  const form = document.querySelector("[data-calendar-event-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.tipo.value = "reuniao";
  form.elements.data.value = `${state.calendar.month}-01`;
  setSelectedValues(form.elements.bolsistaIds, []);
  setFeedback(document.querySelector("[data-calendar-feedback]"), "");
  document.querySelector(".calendar-composer")?.setAttribute("open", "");
}

function editCalendarEvent(evento) {
  const form = document.querySelector("[data-calendar-event-form]");
  setFormValues(form, {
    id: evento.id,
    titulo: evento.titulo,
    tipo: evento.tipo,
    data: evento.data,
    horarioInicio: evento.horarioInicio,
    horarioFim: evento.horarioFim,
    local: evento.local,
    oficinaId: evento.oficinaId,
    descricao: evento.descricao
  });
  setSelectedValues(form.elements.bolsistaIds, evento.bolsistaIds || []);
  document.querySelector(".calendar-composer")?.setAttribute("open", "");
  showAdminPage("calendario", true);
}

async function deleteCalendarEvent(evento) {
  if (!window.confirm(`Excluir o evento ${evento.titulo}?`)) return;
  await secureRequest(`/admin/calendario/eventos/${evento.id}`, { method: "DELETE" });
  await loadCalendar();
}

function renderAttendanceSummary() {
  const summary = document.querySelector("[data-attendance-summary]");
  if (!summary) return;
  const rows = state.attendanceRows || [];
  const counts = rows.reduce((acc, aluno) => {
    const status = document.querySelector(`[data-presence-status="${aluno.id}"]`)?.value || aluno.presenca || "presente";
    acc.total += 1;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { total: 0, presente: 0, ausente: 0, justificado: 0 });
  if (!counts.total) {
    summary.replaceChildren(createElement("p", { className: "form-feedback", text: "Carregue uma turma e data para iniciar a chamada." }));
    return;
  }
  summary.replaceChildren(
    reportMetric("Alunos na turma", counts.total, "Lista carregada"),
    reportMetric("Presentes", counts.presente, "Marcados para hoje"),
    reportMetric("Ausentes", counts.ausente, "Faltas sem justificativa"),
    reportMetric("Justificados", counts.justificado, "Faltas justificadas")
  );
}

function renderAttendanceRows(payload) {
  const list = document.querySelector("[data-attendance-list]");
  const notes = document.querySelector("[data-attendance-notes]");
  if (!list) return;
  list.replaceChildren();
  state.attendanceRows = payload.alunos || [];
  notes.value = payload.chamada?.observacoes || "";

  if (!state.attendanceRows.length) {
    list.append(createElement("p", {
      className: "form-feedback",
      text: "Nenhum aluno ativo cadastrado para esta turma."
    }));
    renderAttendanceSummary();
    return;
  }
  if (payload.fallbackTurma) {
    list.append(createElement("p", {
      className: "form-feedback",
      text: "Nenhum aluno tinha esta turma vinculada diretamente; a lista completa da oficina foi carregada para conferência."
    }));
  }

  state.attendanceRows.forEach((aluno) => {
    const row = createElement("article", { className: "attendance-row" });
    row.dataset.alunoId = aluno.id;
    const header = createElement("header");
    header.append(
      createElement("strong", { text: aluno.nome }),
      createElement("span", { text: [aluno.matricula, maskCpfValue(aluno.cpf || ""), aluno.responsavel ? `Responsável: ${aluno.responsavel}` : aluno.telefone || "Sem telefone"].filter(Boolean).join(" · ") })
    );

    const controls = createElement("div", { className: "attendance-status" });
    const statusLabel = createElement("label");
    statusLabel.append(createElement("span", { text: "Presença" }));
    const status = createElement("select", { attrs: { "data-presence-status": aluno.id } });
    ["presente", "ausente", "justificado"].forEach((option) => {
      status.append(createElement("option", {
        text: option[0].toUpperCase() + option.slice(1),
        attrs: { value: option }
      }));
    });
    status.value = aluno.presenca || "presente";
    status.addEventListener("change", renderAttendanceSummary);
    statusLabel.append(status);

    const obsLabel = createElement("label");
    obsLabel.append(createElement("span", { text: "Observação" }));
    obsLabel.append(createElement("input", {
      attrs: {
        type: "text",
        maxlength: "240",
        value: aluno.observacaoPresenca || "",
        "data-presence-note": aluno.id
      }
    }));

    controls.append(statusLabel, obsLabel);
    row.append(header, controls);
    list.append(row);
  });
  renderAttendanceSummary();
}

function renderAttendanceHistory(chamadas) {
  const list = document.querySelector("[data-attendance-history]");
  if (!list) return;
  list.replaceChildren();

  if (!chamadas.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhuma chamada salva ainda." }));
    return;
  }

  chamadas.forEach((chamada) => {
    const item = createElement("article", { className: "content-item" });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: `${chamada.turmaLabel || [chamada.oficina || "Oficina", chamada.turma].filter(Boolean).join(" · ")} · ${chamada.data}` }),
      createElement("span", { text: `Presentes: ${chamada.presentes} · Ausentes: ${chamada.ausentes} · Justificados: ${chamada.justificados}` }),
      createElement("span", { text: chamada.observacoes || "" })
    );
    item.append(main);
    list.append(item);
  });
}

async function loadAttendance() {
  const selected = parseAttendanceClassValue(document.querySelector("[data-attendance-office]")?.value || "");
  const officeId = selected.oficinaId;
  const date = document.querySelector("[data-attendance-date]")?.value;
  const feedback = document.querySelector("[data-attendance-feedback]");
  if (!officeId || !date) {
    setFeedback(feedback, "Selecione turma e data para carregar a chamada.", "error");
    return;
  }

  const params = new URLSearchParams({ oficinaId: officeId, data: date });
  if (selected.turmaId) params.set("turmaId", selected.turmaId);
  if (selected.turma) params.set("turma", selected.turma);
  const data = await apiRequest(`/chamadas?${params.toString()}`);
  renderAttendanceRows(data);
  setFeedback(feedback, data.chamada ? "Chamada já existente carregada para edição." : "Lista da turma carregada.", "success");
}

function openEdit(item) {
  setFeedback(editFeedback, "");
  editForm.elements.id.value = item.id;
  editForm.elements.nome.value = item.nome;
  editForm.elements.cpf.value = maskCpfValue(item.cpf || "");
  editForm.elements.idade.value = item.idade;
  editForm.elements.telefone.value = item.telefone;
  editForm.elements.responsavel.value = item.responsavel || "";
  editForm.elements.email.value = item.email || "";
  setSelectedValues(editForm.elements.oficina, item.oficinas || [item.oficina].filter(Boolean));
  editForm.elements.observacoes.value = item.observacoes || "";
  editDialog.showModal();
}

function validateInscricao(data) {
  if (!data.nome || data.nome.trim().length < 3) return "Informe o nome completo.";
  if (data.cpf && !isValidCpf(data.cpf)) return "Informe um CPF válido.";
  const idade = Number(data.idade);
  if (!Number.isInteger(idade) || idade < 10 || idade > 99) return "Informe uma idade válida.";
  if (!/^[0-9()+\-\s]{10,20}$/.test(data.telefone || "")) return "Informe um telefone válido.";
  if (!data.oficinas?.length) return "Selecione pelo menos uma oficina.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Informe um e-mail válido.";
  return "";
}

async function removeInscricao(item) {
  const confirmed = window.confirm(`Excluir a inscrição de ${item.nome}?`);
  if (!confirmed) return;
  await secureRequest(`/inscricoes/${item.id}`, { method: "DELETE" });
  await refreshAll();
}

async function openDocuments(item) {
  if (!documentsDialog || !documentsList) return;
  documentsList.replaceChildren(createElement("p", { className: "form-feedback", text: "Carregando documentos..." }));
  documentsDialog.showModal();

  try {
    const sources = item.documentSources?.length
      ? item.documentSources
      : [{ sourceId: item.sourceId || item.id, sourceLabel: item.sourceSummary || sourceName(item.source) }];
    const documentos = [];

    for (const source of sources) {
      if (!source.sourceId) continue;
      const data = await apiRequest(`/inscricoes/${source.sourceId}/documentos`);
      documentos.push(...(data.documentos || []).map((documento) => ({
        ...documento,
        sourceLabel: source.sourceLabel || "Inscrição online"
      })));
    }
    documentsList.replaceChildren();

    if (!documentos.length) {
      documentsList.append(createElement("p", { className: "form-feedback", text: "Nenhum documento anexado nesta inscrição." }));
      return;
    }

    const zipActions = createElement("div", { className: "document-zip-actions" });
    sources
      .filter((source) => source.sourceId)
      .forEach((source, index) => {
        zipActions.append(createElement("a", {
          className: "button button-primary",
          text: sources.length > 1 ? `ZIP ${index + 1}` : "Baixar todos em ZIP",
          attrs: {
            href: apiUrl(`/inscricoes/${source.sourceId}/documentos.zip`),
            target: "_blank",
            rel: "noopener noreferrer"
          }
        }));
      });
    documentsList.append(zipActions);

    documentos.forEach((documento) => {
      const node = createElement("article", { className: "content-item document-item" });
      const main = createElement("div", { className: "content-item-main" });
      const sizeKb = Math.max(1, Math.round((documento.sizeBytes || 0) / 1024));
      main.append(
        createElement("strong", { text: documento.originalName }),
        createElement("span", { text: [documento.mimeType, `${sizeKb} KB`, documento.sourceLabel].filter(Boolean).join(" - ") })
      );
      const link = createElement("a", {
        className: "button button-secondary",
        text: "Baixar",
        attrs: {
          href: apiUrl(documento.downloadPath),
          target: "_blank",
          rel: "noopener noreferrer"
        }
      });
      node.append(main, link);
      documentsList.append(node);
    });
  } catch (error) {
    documentsList.replaceChildren(createElement("p", { className: "form-feedback is-error", text: error.message }));
  }
}

function setupEvents() {
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(loginFeedback, "");
    const data = getFormData(loginForm);
    const button = loginForm.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Entrando...";

    try {
      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: data
      });
      state.admin = result.admin;
      await getCsrfToken(true);
      document.querySelector("[data-admin-name]").textContent = `${result.admin.name} - ${roleLabels[result.admin.role] || result.admin.role}`;
      showAdmin();
      try {
        await loadAdminData();
      } catch (error) {
        if (error.status !== 401 && error.status !== 403) {
          setFeedback(loginFeedback, `Login realizado, mas alguns dados do painel não carregaram: ${error.message}`, "error");
          return;
        }
        showLogin();
        setFeedback(loginFeedback, "Login aceito, mas a sessão não foi mantida. Acesse pelo mesmo domínio da API e tente novamente.", "error");
      }
    } catch (error) {
      setFeedback(loginFeedback, error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Entrar";
    }
  });

  document.querySelector("[data-refresh]")?.addEventListener("click", refreshAll);
  document.querySelector("[data-global-search]")?.addEventListener("input", debounce((event) => {
    renderGlobalSearch(event.target.value);
  }, 80));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".global-search")) {
      const results = document.querySelector("[data-global-search-results]");
      if (results) results.hidden = true;
    }
  });
  document.querySelectorAll("[data-refresh-support]").forEach((button) => {
    button.addEventListener("click", loadSupport);
  });
  document.querySelector("[data-refresh-charts]")?.addEventListener("click", loadGraficos);
  document.querySelector("[data-chart-period-filter]")?.addEventListener("change", (event) => {
    state.chartPeriod = event.target.value || "geral";
    renderGraficos();
    loadGraficos();
  });
  document.querySelector("[data-chart-month-filter]")?.addEventListener("change", (event) => {
    state.chartMonth = event.target.value;
    loadGraficos();
  });
  document.querySelector("[data-chart-week-filter]")?.addEventListener("change", (event) => {
    state.chartWeek = event.target.value;
    loadGraficos();
  });
  document.querySelector("[data-chart-sort-filter]")?.addEventListener("change", (event) => {
    state.chartSort = event.target.value || "inscritos_desc";
    loadGraficos();
  });
  document.querySelector("[data-refresh-feedbacks]")?.addEventListener("click", loadWorkshopFeedbacks);
  document.querySelector("[data-refresh-first-access]")?.addEventListener("click", loadFirstAccess);
  document.querySelector("[data-manual-search]")?.addEventListener("input", debounce((event) => {
    state.manualSearch = event.target.value.trim();
    renderManual();
  }, 100));
  document.querySelector("[data-first-access-filters]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = getFormData(event.currentTarget);
    state.firstAccessFilters = {
      oficinaId: data.oficinaId || "",
      turma: String(data.turma || "").trim(),
      statusPrimeiroAcesso: data.statusPrimeiroAcesso || "sem_primeiro_acesso",
      statusOrientacao: data.statusOrientacao || "todos",
      search: String(data.search || "").trim(),
      page: 1,
      limit: Number(data.limit || 20)
    };
    loadFirstAccess().catch((error) => showToast(error.message, "error"));
  });
  document.querySelector("[data-first-access-pdf]")?.addEventListener("click", () => {
    const form = document.querySelector("[data-first-access-filters]");
    if (form) {
      const data = getFormData(form);
      state.firstAccessFilters.oficinaId = data.oficinaId || "";
      state.firstAccessFilters.turma = String(data.turma || "").trim();
      state.firstAccessFilters.statusPrimeiroAcesso = data.statusPrimeiroAcesso || "sem_primeiro_acesso";
      state.firstAccessFilters.statusOrientacao = data.statusOrientacao || "todos";
    }
    downloadFirstAccessPdf().catch((error) => showToast(error.message, "error"));
  });
  document.querySelector("[data-render-automation]")?.addEventListener("click", renderAutomation);
  document.querySelector("[data-generate-ai-summary]")?.addEventListener("click", generateAdminAiSummary);

  document.querySelector("[data-support-target-type]")?.addEventListener("change", (event) => {
    const target = event.target.value;
    const officeField = document.querySelector("[data-support-office-field]");
    const studentField = document.querySelector("[data-support-student-field]");
    if (officeField) officeField.hidden = target !== "oficina";
    if (studentField) studentField.hidden = target !== "aluno";
  });

  document.querySelector("[data-support-post-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-support-post-feedback]");
    const data = getFormData(form);
    if (data.targetType === "oficina" && !data.oficinaId) {
      setFeedback(feedback, "Selecione a turma/oficina de destino.", "error");
      return;
    }
    if (data.targetType === "aluno" && !data.alunoId) {
      setFeedback(feedback, "Selecione o aluno de destino.", "error");
      return;
    }
    if (data.targetType !== "oficina") data.oficinaId = "";
    if (data.targetType !== "aluno") data.alunoId = "";
    const id = String(data.id || "").trim();
    delete data.id;
    try {
      await secureRequest(id ? `/admin/suporte/murais/${id}` : "/admin/suporte/murais", {
        method: id ? "PUT" : "POST",
        body: data
      });
      resetSupportPostForm();
      setFeedback(feedback, id ? "Mensagem atualizada." : "Mensagem publicada.", "success");
      await loadSupport();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-support-ai-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const output = document.querySelector("[data-support-ai-output]");
    output.replaceChildren(createElement("p", { className: "form-feedback", text: "Gerando texto..." }));
    try {
      const result = await secureRequest("/ai/admin/message-assist", {
        method: "POST",
        body: getFormData(form)
      });
      output.replaceChildren();
      output.append(
        createElement("strong", { text: result.titulo || "Mensagem sugerida" }),
        createElement("p", { text: result.mensagem || "" }),
        createElement("button", { className: "button button-secondary", text: "Usar no formulário", attrs: { type: "button", "data-use-support-ai": "" } })
      );
      output.dataset.title = result.titulo || "";
      output.dataset.message = result.mensagem || "";
    } catch (error) {
      output.replaceChildren(createElement("p", { className: "form-feedback is-error", text: error.message }));
    }
  });

  document.addEventListener("click", async (event) => {
    const editPost = event.target.closest("[data-edit-support-post]");
    if (editPost) {
      const post = state.supportPosts.find((item) => item.id === editPost.dataset.editSupportPost);
      if (post) editSupportPost(post);
    }
    const removePost = event.target.closest("[data-remove-support-post]");
    if (removePost) {
      const post = state.supportPosts.find((item) => item.id === removePost.dataset.removeSupportPost);
      if (post) await deleteSupportPost(post);
    }
    const useAi = event.target.closest("[data-use-support-ai]");
    if (useAi) {
      const output = document.querySelector("[data-support-ai-output]");
      const form = document.querySelector("[data-support-post-form]");
      if (form && output) {
        form.elements.titulo.value = output.dataset.title || "";
        form.elements.mensagem.value = output.dataset.message || "";
        showAdminPage("mural", true);
      }
    }
  });

  document.addEventListener("submit", async (event) => {
    const responseForm = event.target.closest("[data-support-response-form]");
    if (!responseForm) return;
    event.preventDefault();
    const data = getFormData(responseForm);
    try {
      await secureRequest(`/admin/suporte/tickets/${responseForm.dataset.supportResponseForm}/responder`, {
        method: "POST",
        body: data
      });
      await loadSupport();
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  document.querySelector("[data-reset-office-form]")?.addEventListener("click", resetOfficeForm);
  document.querySelector("[data-open-office-form]")?.addEventListener("click", () => {
    resetOfficeForm();
    showAdminPage("oficinas", true);
  });
  document.querySelector("[data-reset-turma-form]")?.addEventListener("click", resetTurmaForm);
  document.querySelector("[data-cancel-turma-form]")?.addEventListener("click", resetTurmaForm);
  document.querySelector("[data-reset-gallery-form]")?.addEventListener("click", resetGalleryForm);
  document.querySelector("[data-reset-collaborator-form]")?.addEventListener("click", resetCollaboratorForm);
  document.querySelector("[data-reset-testimonial-form]")?.addEventListener("click", resetTestimonialForm);
  document.querySelector("[data-reset-faq-form]")?.addEventListener("click", resetFaqForm);
  document.querySelector("[data-reset-student-form]")?.addEventListener("click", resetStudentForm);
  document.querySelector("[data-reset-bolsista-form]")?.addEventListener("click", resetBolsistaForm);
  document.querySelector("[data-reset-calendar-event-form]")?.addEventListener("click", resetCalendarEventForm);
  document.querySelector("[data-reset-admin-user-form]")?.addEventListener("click", resetAdminUserForm);

  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await secureRequest("/auth/logout", { method: "POST" });
    state.admin = null;
    showLogin();
  });

  document.querySelector("[data-admin-search]")?.addEventListener("input", debounce((event) => {
    state.search = event.target.value.trim();
    loadInscricoes();
  }, 180));

  document.querySelector("[data-admin-office-filter]")?.addEventListener("change", (event) => {
    state.oficina = event.target.value;
    loadInscricoes();
  });

  document.querySelector("[data-student-search]")?.addEventListener("input", debounce((event) => {
    state.studentSearch = event.target.value.trim();
    state.studentPagination.page = 1;
    loadAlunos();
  }, 400));

  document.querySelector("[data-student-office-filter]")?.addEventListener("change", (event) => {
    state.studentOffice = event.target.value;
    state.studentPagination.page = 1;
    loadAlunos();
  });

  document.querySelector("[data-student-status-filter]")?.addEventListener("change", (event) => {
    state.studentStatus = event.target.value;
    state.studentPagination.page = 1;
    loadAlunos();
  });

  document.querySelector("[data-student-sort]")?.addEventListener("change", (event) => {
    state.studentSort = event.target.value || "nome";
    state.studentPagination.page = 1;
    loadAlunos();
  });

  document.querySelector("[data-student-limit]")?.addEventListener("change", (event) => {
    state.studentPagination.limit = Number(event.target.value || 20);
    state.studentPagination.page = 1;
    loadAlunos();
  });

  document.querySelector("[data-student-office-select]")?.addEventListener("change", renderStudentOfficePicker);
  document.querySelector("[data-student-form] input[name='idade']")?.addEventListener("input", debounce(() => renderStudentTurmaPicker(), 120));
  document.querySelector("[data-student-form] input[name='dataNascimento']")?.addEventListener("change", () => renderStudentTurmaPicker());
  document.querySelector("[data-refresh-students]")?.addEventListener("click", () => loadAlunos());

  document.querySelector("[data-toggle-student-imports]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const area = document.querySelector("[data-student-import-area]");
    if (!area) return;
    const willOpen = area.hidden;
    area.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    button.textContent = willOpen ? "Ocultar importações" : "Mostrar importações";
  });

  document.querySelector("[data-class-search]")?.addEventListener("input", debounce((event) => {
    state.classSearch = event.target.value.trim();
    renderClassList();
  }, 180));

  document.querySelector("[data-class-office-filter]")?.addEventListener("change", (event) => {
    state.classOffice = event.target.value;
    renderClassList();
  });

  document.querySelector("[data-class-period-filter]")?.addEventListener("change", (event) => {
    state.classPeriod = event.target.value;
    renderClassList();
  });

  document.querySelector("[data-class-status-filter]")?.addEventListener("change", (event) => {
    state.classStatus = event.target.value;
    renderClassList();
  });

  document.querySelector("[data-class-bolsista-filter]")?.addEventListener("change", (event) => {
    state.classBolsista = event.target.value;
    renderClassList();
  });

  document.querySelector("[data-student-import-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-student-import-feedback]");
    const file = form.elements.planilha?.files?.[0];
    if (!file) {
      setFeedback(feedback, "Selecione uma planilha XLSX ou CSV.", "error");
      return;
    }
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Importando...";
    try {
      const result = await secureRequest("/alunos/importar", {
        method: "POST",
        body: new FormData(form)
      });
      const details = result.errors?.length
        ? ` Primeiros erros: ${result.errors.map((item) => `linha ${item.linha}: ${item.erro}`).join("; ")}`
        : "";
      setFeedback(feedback, `${result.message}${details}`, result.errorCount ? "error" : "success");
      form.reset();
      await refreshAll();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Importar alunos";
    }
  });

  async function runLegacyImport(preview = false) {
    const form = document.querySelector("[data-student-legacy-import-form]");
    const feedback = document.querySelector("[data-student-legacy-import-feedback]");
    if (!form) return;
    const file = form.elements.planilha?.files?.[0];
    if (!file) {
      setFeedback(feedback, "Selecione a planilha CSV ou XLSX de inscritos.", "error");
      return;
    }
    const submit = form.querySelector("button[type='submit']");
    const previewButton = form.querySelector("[data-student-legacy-preview]");
    submit.disabled = true;
    previewButton.disabled = true;
    const originalSubmitText = submit.textContent;
    const originalPreviewText = previewButton.textContent;
    submit.textContent = preview ? "Lendo..." : "Importando...";
    previewButton.textContent = preview ? "Lendo..." : "Aguarde...";
    try {
      const result = await secureRequest(`/alunos/importar-legado?preview=${preview ? "true" : "false"}`, {
        method: "POST",
        body: new FormData(form)
      });
      renderLegacyImportSummary(result);
      setFeedback(feedback, result.message, result.errorCount ? "error" : "success");
      if (!preview) {
        form.reset();
        await refreshAll();
      }
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    } finally {
      submit.disabled = false;
      previewButton.disabled = false;
      submit.textContent = originalSubmitText;
      previewButton.textContent = originalPreviewText;
    }
  }

  document.querySelector("[data-student-legacy-preview]")?.addEventListener("click", () => runLegacyImport(true));
  document.querySelector("[data-student-legacy-import-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runLegacyImport(false);
  });

  document.querySelector("[data-bolsista-search]")?.addEventListener("input", debounce((event) => {
    state.bolsistaSearch = event.target.value.trim();
    loadBolsistas();
  }, 180));

  document.querySelector("[data-bolsista-office-filter]")?.addEventListener("change", (event) => {
    state.bolsistaOffice = event.target.value;
    loadBolsistas();
  });

  document.querySelector("[data-log-search]")?.addEventListener("input", debounce((event) => {
    state.logSearch = event.target.value.trim();
    loadAuditLogs();
  }, 180));

  document.querySelector("[data-log-action]")?.addEventListener("change", (event) => {
    state.logAction = event.target.value;
    loadAuditLogs();
  });

  document.querySelector("[data-log-entity]")?.addEventListener("input", debounce((event) => {
    state.logEntity = event.target.value.trim();
    loadAuditLogs();
  }, 180));

  document.querySelector("[data-log-start]")?.addEventListener("change", (event) => {
    state.logStart = event.target.value;
    loadAuditLogs();
  });

  document.querySelector("[data-log-end]")?.addEventListener("change", (event) => {
    state.logEnd = event.target.value;
    loadAuditLogs();
  });

  document.querySelector("[data-feedback-office-filter]")?.addEventListener("change", (event) => {
    state.feedbackOffice = event.target.value;
    loadWorkshopFeedbacks();
  });

  document.querySelector("[data-feedback-rating-filter]")?.addEventListener("change", (event) => {
    state.feedbackRating = event.target.value;
    loadWorkshopFeedbacks();
  });

  document.querySelector("[data-refresh-logs]")?.addEventListener("click", loadAuditLogs);

  document.querySelector("[data-calendar-month]")?.addEventListener("change", (event) => {
    state.calendar.month = event.target.value || new Date().toISOString().slice(0, 7);
    loadCalendar();
  });

  document.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
    state.calendar.month = addMonths(state.calendar.month, -1);
    loadCalendar();
  });

  document.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
    state.calendar.month = addMonths(state.calendar.month, 1);
    loadCalendar();
  });

  document.querySelector("[data-calendar-today]")?.addEventListener("click", () => {
    state.calendar.month = new Date().toISOString().slice(0, 7);
    loadCalendar();
  });

  document.querySelector("[data-attendance-office]")?.addEventListener("change", () => {
    loadAttendanceHistory();
  });

  document.querySelector("[data-load-attendance]")?.addEventListener("click", () => {
    loadAttendance().catch((error) => {
      setFeedback(document.querySelector("[data-attendance-feedback]"), error.message, "error");
    });
  });

  document.querySelector("[data-save-attendance]")?.addEventListener("click", async () => {
    const feedback = document.querySelector("[data-attendance-feedback]");
    const selected = parseAttendanceClassValue(document.querySelector("[data-attendance-office]")?.value || "");
    const officeId = selected.oficinaId;
    const date = document.querySelector("[data-attendance-date]")?.value;
    if (!officeId || !date) {
      setFeedback(feedback, "Selecione turma e data antes de salvar.", "error");
      return;
    }
    const presencas = state.attendanceRows.map((aluno) => ({
      alunoId: aluno.id,
      status: document.querySelector(`[data-presence-status="${aluno.id}"]`)?.value || "presente",
      observacao: document.querySelector(`[data-presence-note="${aluno.id}"]`)?.value || ""
    }));
    try {
      await secureRequest("/chamadas", {
        method: "POST",
        body: {
          oficinaId: officeId,
          turmaId: selected.turmaId,
          turma: selected.turma,
          data: date,
          observacoes: document.querySelector("[data-attendance-notes]")?.value || "",
          presencas
        }
      });
      setFeedback(feedback, "Chamada salva com sucesso. Se já existia chamada para esta turma/data, ela foi atualizada.", "success");
      await loadAttendanceHistory();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-export-csv]")?.addEventListener("click", () => {
    const params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    if (state.oficina) params.set("oficina", state.oficina);
    window.location.href = apiUrl(`/inscricoes/export/csv?${params.toString()}`);
  });

  document.querySelectorAll("[data-download-documents-zip]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = filteredDocumentsZipUrl();
    });
  });

  document.querySelector("[data-print-report]")?.addEventListener("click", () => {
    window.print();
  });

  document.querySelector("[data-admin-user-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-admin-user-feedback]");
    const data = getFormData(form);
    data.active = form.elements.active.checked;
    const id = data.id;
    delete data.id;
    if (!id && !data.registrationCode) {
      setFeedback(feedback, "Informe um código de 6 dígitos para o novo ADM.", "error");
      return;
    }
    if (id && !data.registrationCode) delete data.registrationCode;
    try {
      await secureRequest(id ? `/admin/usuarios/${id}` : "/admin/usuarios", {
        method: id ? "PUT" : "POST",
        body: data
      });
      setFeedback(feedback, "ADM salvo com sucesso.", "success");
      resetAdminUserForm();
      await loadAdminUsers();
      await loadAuditLogs();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-close-dialog]")?.addEventListener("click", () => {
    editDialog.close();
  });

  document.querySelector("[data-close-documents]")?.addEventListener("click", () => {
    documentsDialog?.close();
  });

  document.querySelector("[data-close-profile]")?.addEventListener("click", () => {
    profileDialog?.close();
  });

  document.querySelector("[data-close-ai-assist]")?.addEventListener("click", () => {
    aiAssistDialog?.close();
  });

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = getFormData(editForm);
    data.oficinas = selectedValues(editForm.elements.oficina);
    data.oficina = data.oficinas[0] || "";
    const validation = validateInscricao(data);
    if (validation) {
      setFeedback(editFeedback, validation, "error");
      return;
    }

    const id = data.id;
    delete data.id;
    const button = editForm.querySelector("button[type='submit']");
    button.disabled = true;

    try {
      await secureRequest(`/inscricoes/${id}`, {
        method: "PUT",
        body: data
      });
      editDialog.close();
      await refreshAll();
    } catch (error) {
      setFeedback(editFeedback, error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("[data-office-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-office-feedback]");
    const data = getFormData(form);
    data.ativo = activeFromForm(form);
    data.diasSemana = checkedValues(form, "diasSemana");
    data.turmas = linesToArray(data.turmas);
    data.imagemUrl = data.imagemUrl || "/img/oficinas.png";
    data.capacidade = Number(data.capacidade || 0);
    if (!Number.isInteger(data.capacidade) || data.capacidade < 1) {
      setFeedback(feedback, "Informe a capacidade de vagas da oficina.", "error");
      return;
    }
    const id = data.id;
    delete data.id;
    try {
      await secureRequest(id ? `/admin/oficinas/${id}` : "/admin/oficinas", {
        method: id ? "PUT" : "POST",
        body: data
      });
      setFeedback(feedback, "Oficina salva com sucesso.", "success");
      resetOfficeForm();
      await loadManagedContent();
      await refreshAll();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-turma-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-turma-feedback]");
    const data = getFormData(form);
    data.diasSemana = selectedTurmaDays();
    data.ativa = form.elements.ativa.checked;
    data.idadeMinima = Number(data.idadeMinima);
    data.idadeMaxima = Number(data.idadeMaxima);
    data.vagasTotal = Number(data.vagasTotal);
    if (!data.diasSemana.length) {
      setFeedback(feedback, "Selecione pelo menos um dia da semana.", "error");
      return;
    }
    const id = data.id;
    delete data.id;
    try {
      await secureRequest(id ? `/admin/turmas/${id}` : "/admin/turmas", {
        method: id ? "PUT" : "POST",
        body: data
      });
      setFeedback(feedback, "Turma salva com sucesso.", "success");
      resetTurmaForm();
      await loadManagedContent();
      await loadAttendanceClasses();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-gallery-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-gallery-feedback]");
    const formData = new FormData(form);
    const id = formData.get("id");
    const imageFile = form.elements.imagemArquivo?.files?.[0];

    formData.set("ativo", String(activeFromForm(form)));
    formData.set("ordem", String(Number(formData.get("ordem") || 0)));
    formData.delete("id");
    if (!imageFile) formData.delete("imagemArquivo");

    if (!String(formData.get("imagemUrl") || "").trim() && !imageFile) {
      setFeedback(feedback, "Informe uma URL ou envie um arquivo de imagem.", "error");
      return;
    }

    try {
      await secureRequest(id ? `/admin/galeria/${id}` : "/admin/galeria", {
        method: id ? "PUT" : "POST",
        body: formData
      });
      setFeedback(feedback, "Imagem salva com sucesso.", "success");
      resetGalleryForm();
      await loadManagedContent();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-collaborator-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-collaborator-feedback]");
    const formData = new FormData(form);
    const id = formData.get("id");
    const imageFile = form.elements.imagemArquivo?.files?.[0];

    formData.set("ativo", String(activeFromForm(form)));
    formData.set("ordem", String(Number(formData.get("ordem") || 0)));
    formData.delete("id");
    if (!imageFile) formData.delete("imagemArquivo");

    if (!String(formData.get("siteUrl") || "").trim()) {
      setFeedback(feedback, "Informe o site oficial do colaborador.", "error");
      return;
    }

    try {
      await secureRequest(id ? `/admin/colaboradores/${id}` : "/admin/colaboradores", {
        method: id ? "PUT" : "POST",
        body: formData
      });
      resetCollaboratorForm();
      setFeedback(feedback, "Colaborador salvo com sucesso.", "success");
      await loadManagedContent();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-testimonial-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-testimonial-feedback]");
    const data = getFormData(form);
    const id = data.id;

    data.ativo = activeFromForm(form);
    data.ordem = Number(data.ordem || 0);
    delete data.id;

    if (!String(data.texto || "").trim()) {
      setFeedback(feedback, "Informe o texto do depoimento.", "error");
      return;
    }

    try {
      await secureRequest(id ? `/admin/depoimentos/${id}` : "/admin/depoimentos", {
        method: id ? "PUT" : "POST",
        body: data
      });
      resetTestimonialForm();
      setFeedback(feedback, "Depoimento salvo com sucesso.", "success");
      await loadManagedContent();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-faq-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-faq-feedback]");
    const data = getFormData(form);
    const id = data.id;

    data.ativo = activeFromForm(form);
    data.ordem = Number(data.ordem || 0);
    delete data.id;

    if (!String(data.pergunta || "").trim() || !String(data.resposta || "").trim()) {
      setFeedback(feedback, "Informe a pergunta e a resposta do FAQ.", "error");
      return;
    }

    try {
      await secureRequest(id ? `/admin/faq/${id}` : "/admin/faq", {
        method: id ? "PUT" : "POST",
        body: data
      });
      resetFaqForm();
      setFeedback(feedback, "FAQ salvo com sucesso.", "success");
      await loadManagedContent();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-student-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-student-feedback]");
    const data = getFormData(form);
    data.oficinaIds = selectedValues(form.elements.oficinaIds);
    data.oficinaId = data.oficinaIds[0] || "";
    const selectedTurmas = selectedStudentTurmas();
    data.turmaIds = selectedTurmas.map((turma) => turma.id);
    data.turmaId = data.turmaIds[0] || "";
    data.turmas = selectedTurmas.map((turma) => turma.nome);
    data.documentosLinks = linesToArray(data.documentosLinks);
    data.possuiDeficiencia = data.possuiDeficiencia === "true";
    data.documentosPendentes = Boolean(form.elements.documentosPendentes?.checked);
    if (!data.oficinaIds.length) {
      document.querySelector("[data-student-office-picker]")?.classList.add("is-invalid");
      setFeedback(feedback, "Selecione pelo menos uma oficina.", "error");
      return;
    }
    const age = getStudentFormAge();
    const officesWithAvailableTurmas = data.oficinaIds.filter((officeId) => state.turmas.some((turma) => turma.oficinaId === officeId && turma.ativa !== false && turmaMatchesStudentAge(turma, age)));
    const selectedOffices = new Set(selectedTurmas.map((turma) => turma.oficinaId));
    const missingTurmaOffice = officesWithAvailableTurmas.find((officeId) => !selectedOffices.has(officeId));
    if (missingTurmaOffice) {
      renderStudentTurmaPicker(data.turmaIds);
      setFeedback(feedback, "Selecione uma turma para cada oficina com turma disponível.", "error");
      return;
    }
    if (data.cpf && !isValidCpf(data.cpf)) {
      setFeedback(feedback, "Informe um CPF válido.", "error");
      return;
    }
    const id = data.id;
    delete data.id;
    try {
      await secureRequest(id ? `/alunos/${id}` : "/alunos", {
        method: id ? "PUT" : "POST",
        body: data
      });
      setFeedback(feedback, "Aluno salvo com sucesso.", "success");
      resetStudentForm();
      await refreshAll();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-bolsista-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-bolsista-feedback]");
    const data = getFormData(form);
    data.oficinaIds = selectedValues(form.elements.oficinaIds);
    data.oficinaId = data.oficinaIds[0] || "";
    data.diasSemana = checkedValues(form, "diasSemana");
    data.idade = Number(data.idade || 0);
    if (data.cpf && !isValidCpf(data.cpf)) {
      setFeedback(feedback, "Informe um CPF válido.", "error");
      return;
    }
    if (!Number.isInteger(data.idade) || data.idade < 14 || data.idade > 24) {
      setFeedback(feedback, "A idade do bolsista deve estar entre 14 e 24 anos.", "error");
      return;
    }
    if (data.diasSemana.length > 2) {
      setFeedback(feedback, "Selecione no máximo 2 dias de trabalho para o bolsista.", "error");
      return;
    }
    const id = data.id;
    delete data.id;
    try {
      await secureRequest(id ? `/admin/bolsistas/${id}` : "/admin/bolsistas", {
        method: id ? "PUT" : "POST",
        body: data
      });
      setFeedback(feedback, "Bolsista salvo com sucesso.", "success");
      resetBolsistaForm();
      await Promise.all([loadBolsistas(), loadCalendar()]);
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });

  document.querySelector("[data-calendar-event-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-calendar-feedback]");
    const data = getFormData(form);
    data.bolsistaIds = selectedValues(form.elements.bolsistaIds);
    data.oficinaId = data.oficinaId || "";
    if (!data.titulo || !data.data) {
      setFeedback(feedback, "Informe título e data do evento.", "error");
      return;
    }
    const id = data.id;
    delete data.id;
    try {
      await secureRequest(id ? `/admin/calendario/eventos/${id}` : "/admin/calendario/eventos", {
        method: id ? "PUT" : "POST",
        body: data
      });
      state.calendar.month = data.data.slice(0, 7);
      setFeedback(feedback, "Evento salvo com sucesso.", "success");
      resetCalendarEventForm();
      await loadCalendar();
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    }
  });
}

function init() {
  const cleanedCredentialUrl = sanitizeCredentialUrl();
  applyLogoPalette();
  setupTheme();
  setupAdminNavIcons();
  setupAdminPages();
  populateSelects();
  setupPhoneMasks();
  setupCpfMasks();
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.querySelector("[data-attendance-date]");
  if (dateInput && !dateInput.value) dateInput.value = today;
  const monthInput = document.querySelector("[data-calendar-month]");
  if (monthInput && !monthInput.value) monthInput.value = state.calendar.month;
  const eventDateInput = document.querySelector("[data-calendar-event-form] input[name='data']");
  if (eventDateInput && !eventDateInput.value) eventDateInput.value = today;
  setupEvents();
  checkSession();
  const cleanedKeys = sessionStorage.getItem("cj-admin-url-cleaned");
  if (cleanedCredentialUrl || cleanedKeys) {
    setFeedback(loginFeedback, "Por segurança, usuário e código não podem ficar na URL. Digite o acesso diretamente neste formulário.", "error");
    sessionStorage.removeItem("cj-admin-url-cleaned");
  }
}

init();

