import { workshops as fallbackWorkshops } from "./data.js";
import { apiRequest, secureRequest, apiUrl } from "./api.js?v=20260509-2";
import {
  createElement,
  debounce,
  formatDate,
  getFormData,
  isValidCpf,
  maskCpfValue,
  setFeedback,
  setupCpfMasks,
  setupPhoneMasks
} from "./utils.js";
import { applyLogoPalette } from "./palette.js";

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
  alunos: [],
  bolsistas: [],
  attendanceRows: [],
  inscricoes: [],
  search: "",
  oficina: "",
  studentSearch: "",
  studentOffice: "",
  bolsistaSearch: "",
  bolsistaOffice: "",
  calendar: {
    month: new Date().toISOString().slice(0, 7),
    aulas: [],
    eventos: []
  }
};

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
  aula: "Da aula",
  ajuda: "Ajuda professor",
  apoio: "Apoio",
  sem_vinculo: "Sem vinculo direto"
};

const eventTypeLabels = {
  reuniao: "Reuniao",
  passeio: "Passeio",
  evento: "Evento",
  formacao: "Formacao",
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
  "ia-adm": "IA ADM",
  automacao: "Automacao",
  inscritos: "Inscritos",
  oficinas: "Oficinas",
  galeria: "Galeria",
  alunos: "Alunos",
  bolsistas: "Bolsistas",
  calendario: "Calendario",
  chamada: "Chamada"
};

const pageAliases = {
  ia: "ia-adm",
  assistente: "ia-adm",
  "gerenciar-oficinas": "oficinas",
  "gerenciar-galeria": "galeria"
};

function showAdmin() {
  loginView.hidden = true;
  adminView.hidden = false;
}

function showLogin() {
  loginView.hidden = false;
  adminView.hidden = true;
}

function normalizePage(page) {
  const normalized = pageAliases[page] || page;
  return pageTitles[normalized] ? normalized : "dashboard";
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
    if (icon) icon.textContent = theme === "dark" ? "☀" : "◐";
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

  document.querySelectorAll("[data-student-office-select], [data-student-office-filter], [data-attendance-office]").forEach((select) => {
    const current = select.value;
    const first = select.querySelector("option[value='']")?.cloneNode(true);
    select.replaceChildren();
    if (first && !select.multiple) select.append(first);
    state.oficinas.forEach((workshop) => {
      select.append(createElement("option", {
        text: workshop.nome,
        attrs: { value: workshop.id }
      }));
    });
    if (!select.multiple) {
      select.value = state.oficinas.some((item) => item.id === current) ? current : (first ? "" : state.oficinas[0]?.id || "");
    }
  });

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
  try {
    const data = await apiRequest("/auth/me");
    state.admin = data.admin;
    document.querySelector("[data-admin-name]").textContent = `${data.admin.name} · ${data.admin.email}`;
    showAdmin();
    await loadAdminData();
  } catch (error) {
    showLogin();
  }
}

async function refreshAll() {
  await Promise.all([loadDashboard(), loadInscricoes(), loadAlunos(), loadBolsistas(), loadCalendar(), loadAttendanceHistory()]);
}

async function loadAdminData() {
  await loadManagedContent();
  await refreshAll();
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
}

async function loadManagedContent() {
  const [oficinasData, galeriaData] = await Promise.all([
    apiRequest("/admin/oficinas?includeInactive=true"),
    apiRequest("/admin/galeria?includeInactive=true")
  ]);
  state.oficinas = oficinasData.oficinas || [];
  state.galeria = galeriaData.galeria || [];
  populateSelects();
  renderOfficeList();
  renderGalleryList();
}

async function loadAlunos() {
  const params = new URLSearchParams();
  if (state.studentSearch) params.set("search", state.studentSearch);
  if (state.studentOffice) params.set("oficinaId", state.studentOffice);
  const data = await apiRequest(`/alunos?${params.toString()}`);
  state.alunos = data.alunos || [];
  renderStudentList();
  renderAutomation();
}

async function loadBolsistas() {
  const params = new URLSearchParams();
  if (state.bolsistaSearch) params.set("search", state.bolsistaSearch);
  if (state.bolsistaOffice) params.set("oficinaId", state.bolsistaOffice);
  const data = await apiRequest(`/admin/bolsistas?${params.toString()}`);
  state.bolsistas = data.bolsistas || [];
  populateBolsistaSelects();
  renderBolsistaList(data.limite || 40);
}

async function loadCalendar() {
  const data = await apiRequest(`/admin/calendario?mes=${encodeURIComponent(state.calendar.month)}`);
  const calendario = data.calendario || {};
  state.calendar.month = calendario.mes || state.calendar.month;
  state.calendar.aulas = calendario.aulas || [];
  state.calendar.eventos = calendario.eventos || [];
  renderCalendar();
}

async function loadAttendanceHistory() {
  const officeId = document.querySelector("[data-attendance-office]")?.value || "";
  if (officeId && !uuidPattern.test(officeId)) return;
  const params = new URLSearchParams();
  if (officeId) params.set("oficinaId", officeId);
  const data = await apiRequest(`/chamadas/historico?${params.toString()}`);
  renderAttendanceHistory(data.chamadas || []);
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
    documentos: `Ola, ${name}! Para concluir sua matricula no Centro da Juventude, precisamos regularizar documentos pendentes do cadastro. Em caso de duvida, responda esta mensagem.`,
    faltas: `Ola, ${name}! Identificamos ${faltas} falta(s) recente(s) em ${oficinas}. Procure a equipe para justificar ou regularizar a frequencia.`,
    listaEspera: `Ola, ${name}! Voce esta em lista de espera para ${lista || oficinas}. A equipe avisara quando houver vaga disponivel.`,
    contato: `Ola, ${name}! Estamos entrando em contato pelo Centro da Juventude sobre seu cadastro em ${oficinas}.`
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
      description: "Cadastros sem documentos anexados ou com pendencia marcada.",
      people: people.filter((person) => Boolean(person.documentosPendentes || Number(person.documentosCount || 0) === 0)),
      message: (person) => automationMessages(person).documentos
    },
    {
      key: "faltas",
      title: "Alerta de faltas",
      description: "Alunos com mais de duas faltas nos ultimos 30 dias.",
      people: people.filter((person) => Number(person.faltasUltimos30Dias || 0) > 2),
      message: (person) => automationMessages(person).faltas
    },
    {
      key: "listaEspera",
      title: "Lista de espera",
      description: "Inscricoes aguardando vaga em uma ou mais oficinas.",
      people: people.filter((person) => waitlistOficinas(person).length > 0),
      message: (person) => automationMessages(person).listaEspera
    },
    {
      key: "semTelefone",
      title: "Sem telefone valido",
      description: "Cadastros que precisam de revisao antes do contato por WhatsApp.",
      people: people.filter((person) => !hasPhone(person)),
      message: (person) => automationMessages(person).contato
    }
  ];
}

function automationDetail(person, queueKey) {
  if (queueKey === "faltas") return `${person.faltasUltimos30Dias || 0} faltas nos ultimos 30 dias`;
  if (queueKey === "listaEspera") return `Lista: ${waitlistOficinas(person).join(", ")}`;
  if (queueKey === "documentos") return Number(person.documentosCount || 0) ? "Pendencia marcada na ficha" : "Sem documento anexado";
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
      createElement("td", { text: item.sourceSummary || (item.source === "aluno" ? "Aluno ADM" : "Inscricao online") })
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
  return source === "aluno" ? "Aluno ADM" : "Inscricao online";
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
  const cpf = maskCpfValue(person.cpf || "") || "CPF nao informado";
  profileDialog.classList.toggle("is-attention", Number(person.faltasUltimos30Dias || 0) > 2);
  if (profileSubtitle) {
    profileSubtitle.textContent = `${cpf} - ${person.sourceSummary || sourceName(person.primarySource || person.source)}`;
  }

  const summary = makeProfileSection("Dados principais");
  const grid = createElement("div", { className: "profile-grid" });
  addProfileField(grid, "Nome", person.nome);
  addProfileField(grid, "CPF", cpf);
  addProfileField(grid, "Idade", person.idade === "" || person.idade === undefined ? "-" : `${person.idade} anos`);
  addProfileField(grid, "Telefone", person.telefone);
  addProfileField(grid, "Responsavel", person.responsavel);
  addProfileField(grid, "E-mail", person.email);
  addProfileField(grid, "Status", person.status || "inscrito");
  addProfileField(grid, "Faltas nos ultimos 30 dias", String(person.faltasUltimos30Dias || 0));
  addProfileField(grid, "Documentos", person.documentosPendentes ? "Faltando" : "Sem pendencias marcadas");
  addProfileField(grid, "Primeiro cadastro", formatDate(person.created_at));
  summary.append(grid);

  const officesSection = makeProfileSection("Oficinas e matriculas");
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

  const history = makeProfileSection("Historico do aluno");
  appendProfileNote(history, "Advertencias", person.advertencias, "Sem advertencias registradas.");
  appendProfileNote(history, "Oficinas anteriores", person.historicoOficinas, "Sem historico anterior registrado.");
  appendProfileNote(history, "Observacoes", person.observacoes, "Sem observacoes registradas.");

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
      createElement("span", { text: `Telefone: ${source.telefone || "nao informado"}` })
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
      text: "Editar inscricao online",
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
  }
  const warningButton = createElement("button", {
    className: "button button-secondary",
    text: "Dar advertencia",
    attrs: { type: "button" }
  });
  warningButton.addEventListener("click", () => addWarningToStudent(person));
  actions.append(warningButton);

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
    confirmacao: "Confirmacao",
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
      : "IA real nao configurada. Usando resumo seguro por regras."
  });
  const summary = createElement("section", { className: "ai-assist-section" });
  summary.append(
    createElement("h3", { text: "Resumo" }),
    createElement("p", { text: result.summary || "Nao foi possivel gerar resumo." })
  );

  const alerts = createElement("section", { className: "ai-assist-section" });
  alerts.append(createElement("h3", { text: "Alertas" }));
  const alertList = createElement("ul", { className: "ai-alert-list" });
  const alertItems = result.alerts?.length ? result.alerts : ["Sem alertas automaticos."];
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
    throw new Error("Nao foi possivel vincular uma oficina cadastrada para criar a ficha ADM.");
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
  const text = window.prompt(`Descreva a advertencia para ${person.nome}:`);
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
    window.alert(error.message || "Nao foi possivel registrar a advertencia.");
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

function resetOfficeForm() {
  const form = document.querySelector("[data-office-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.imagemUrl.value = "/img/oficinas.png";
  form.elements.periodo.value = "a definir";
  form.elements.capacidade.value = "30";
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
  if (!state.alunos.some((aluno) => aluno.id === item.sourceId)) {
    await loadAlunos();
  }
  const aluno = state.alunos.find((record) => record.id === item.sourceId);
  if (aluno) {
    editStudent(aluno);
  } else {
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

function renderStudentList() {
  const list = document.querySelector("[data-student-list]");
  if (!list) return;
  list.replaceChildren();

  if (!state.alunos.length) {
    list.append(createElement("p", { className: "form-feedback", text: "Nenhum aluno cadastrado para o filtro." }));
    return;
  }

  state.alunos.forEach((aluno) => {
    const item = createElement("article", {
      className: `content-item${Number(aluno.faltasUltimos30Dias || 0) > 2 ? " is-attention" : ""}`
    });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: aluno.nome }),
      createElement("span", { text: `${(aluno.oficinas || []).join(", ") || "Sem oficina"} · CPF: ${maskCpfValue(aluno.cpf || "") || "sem CPF"} · ${aluno.status}` }),
      createElement("span", { text: aluno.telefone || "sem telefone" }),
      createElement("span", { text: aluno.responsavel ? `Responsável: ${aluno.responsavel}` : aluno.email || "" }),
      createElement("span", { text: `Faltas nos ultimos 30 dias: ${aluno.faltasUltimos30Dias || 0}${aluno.documentosPendentes ? " · documentos faltando" : ""}` })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editStudent(aluno));
    del.addEventListener("click", () => deleteStudent(aluno));
    actions.append(edit, del);
    item.append(main, actions);
    list.append(item);
  });
}

function resetStudentForm() {
  const form = document.querySelector("[data-student-form]");
  form.reset();
  form.elements.id.value = "";
  form.elements.status.value = "ativo";
  form.elements.documentosPendentes.checked = false;
  setSelectedValues(form.elements.oficinaIds, []);
  setFeedback(document.querySelector("[data-student-feedback]"), "");
}

function editStudent(aluno) {
  const form = document.querySelector("[data-student-form]");
  setFormValues(form, {
    id: aluno.id,
    nome: aluno.nome,
    cpf: maskCpfValue(aluno.cpf || ""),
    idade: aluno.idade,
    telefone: aluno.telefone,
    responsavel: aluno.responsavel,
    email: aluno.email,
    status: aluno.status,
    documentosPendentes: Boolean(aluno.documentosPendentes),
    advertencias: aluno.advertencias,
    historicoOficinas: aluno.historicoOficinas,
    observacoes: aluno.observacoes
  });
  setSelectedValues(form.elements.oficinaIds, aluno.oficinaIds || []);
  showAdminPage("alunos", true);
}

async function deleteStudent(aluno) {
  if (!window.confirm(`Excluir o aluno ${aluno.nome}?`)) return;
  await secureRequest(`/alunos/${aluno.id}`, { method: "DELETE" });
  await refreshAll();
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

function renderCalendar() {
  const grid = document.querySelector("[data-calendar-grid]");
  const eventList = document.querySelector("[data-calendar-event-list]");
  const monthInput = document.querySelector("[data-calendar-month]");
  if (!grid || !eventList) return;

  if (monthInput) monthInput.value = state.calendar.month;
  const [year, monthNumber] = state.calendar.month.split("-").map(Number);
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDate = `${state.calendar.month}-01`;
  const leading = weekdayIndexMondayFirst(firstDate);
  const today = new Date().toISOString().slice(0, 10);
  const grouped = itemsByDate();

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

  eventList.replaceChildren();
  if (!state.calendar.eventos.length) {
    eventList.append(createElement("p", { className: "form-feedback", text: `Nenhum evento manual em ${monthLabel(state.calendar.month)}.` }));
    return;
  }

  state.calendar.eventos.forEach((evento) => {
    const item = createElement("article", { className: "content-item" });
    const main = createElement("div", { className: "content-item-main" });
    main.append(
      createElement("strong", { text: evento.titulo }),
      createElement("span", { text: `${eventTypeLabels[evento.tipo] || evento.tipo} - ${evento.data} ${timeRange(evento)}`.trim() }),
      createElement("span", { text: [evento.local, evento.oficina].filter(Boolean).join(" - ") || "Sem local/oficina" }),
      createElement("span", { text: (evento.bolsistas || []).length ? `Bolsistas: ${evento.bolsistas.join(", ")}` : "Sem bolsista vinculado" }),
      createElement("span", { text: evento.descricao || "" })
    );
    const actions = createElement("div", { className: "content-actions" });
    const edit = createElement("button", { className: "icon-action", text: "Editar", attrs: { type: "button" } });
    const del = createElement("button", { className: "icon-action danger", text: "Excluir", attrs: { type: "button" } });
    edit.addEventListener("click", () => editCalendarEvent(evento));
    del.addEventListener("click", () => deleteCalendarEvent(evento));
    actions.append(edit, del);
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
  showAdminPage("calendario", true);
}

async function deleteCalendarEvent(evento) {
  if (!window.confirm(`Excluir o evento ${evento.titulo}?`)) return;
  await secureRequest(`/admin/calendario/eventos/${evento.id}`, { method: "DELETE" });
  await loadCalendar();
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
      text: "Nenhum aluno ativo cadastrado para esta oficina."
    }));
    return;
  }

  state.attendanceRows.forEach((aluno) => {
    const row = createElement("article", { className: "attendance-row" });
    row.dataset.alunoId = aluno.id;
    const header = createElement("header");
    header.append(
      createElement("strong", { text: aluno.nome }),
      createElement("span", { text: aluno.responsavel ? `Responsável: ${aluno.responsavel}` : aluno.telefone || "Sem telefone" })
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
      createElement("strong", { text: `${chamada.oficina || "Oficina"} · ${chamada.data}` }),
      createElement("span", { text: `Presentes: ${chamada.presentes} · Ausentes: ${chamada.ausentes} · Justificados: ${chamada.justificados}` }),
      createElement("span", { text: chamada.observacoes || "" })
    );
    item.append(main);
    list.append(item);
  });
}

async function loadAttendance() {
  const officeId = document.querySelector("[data-attendance-office]")?.value;
  const date = document.querySelector("[data-attendance-date]")?.value;
  const feedback = document.querySelector("[data-attendance-feedback]");
  if (!officeId || !date) {
    setFeedback(feedback, "Selecione oficina e data para carregar a chamada.", "error");
    return;
  }

  const data = await apiRequest(`/chamadas?oficinaId=${encodeURIComponent(officeId)}&data=${encodeURIComponent(date)}`);
  renderAttendanceRows(data);
  setFeedback(feedback, "Chamada carregada.", "success");
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
  if (data.cpf && !isValidCpf(data.cpf)) return "Informe um CPF valido.";
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
        sourceLabel: source.sourceLabel || "Inscricao online"
      })));
    }
    documentsList.replaceChildren();

    if (!documentos.length) {
      documentsList.append(createElement("p", { className: "form-feedback", text: "Nenhum documento anexado nesta inscrição." }));
      return;
    }

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
      document.querySelector("[data-admin-name]").textContent = `${result.admin.name} · ${result.admin.email}`;
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
  document.querySelector("[data-render-automation]")?.addEventListener("click", renderAutomation);
  document.querySelector("[data-generate-ai-summary]")?.addEventListener("click", generateAdminAiSummary);

  document.querySelector("[data-reset-office-form]")?.addEventListener("click", resetOfficeForm);
  document.querySelector("[data-reset-gallery-form]")?.addEventListener("click", resetGalleryForm);
  document.querySelector("[data-reset-student-form]")?.addEventListener("click", resetStudentForm);
  document.querySelector("[data-reset-bolsista-form]")?.addEventListener("click", resetBolsistaForm);
  document.querySelector("[data-reset-calendar-event-form]")?.addEventListener("click", resetCalendarEventForm);

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
    loadAlunos();
  }, 180));

  document.querySelector("[data-student-office-filter]")?.addEventListener("change", (event) => {
    state.studentOffice = event.target.value;
    loadAlunos();
  });

  document.querySelector("[data-bolsista-search]")?.addEventListener("input", debounce((event) => {
    state.bolsistaSearch = event.target.value.trim();
    loadBolsistas();
  }, 180));

  document.querySelector("[data-bolsista-office-filter]")?.addEventListener("change", (event) => {
    state.bolsistaOffice = event.target.value;
    loadBolsistas();
  });

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
    const officeId = document.querySelector("[data-attendance-office]")?.value;
    const date = document.querySelector("[data-attendance-date]")?.value;
    if (!officeId || !date) {
      setFeedback(feedback, "Selecione oficina e data antes de salvar.", "error");
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
          data: date,
          observacoes: document.querySelector("[data-attendance-notes]")?.value || "",
          presencas
        }
      });
      setFeedback(feedback, "Chamada salva com sucesso.", "success");
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

  document.querySelector("[data-student-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("[data-student-feedback]");
    const data = getFormData(form);
    data.oficinaIds = selectedValues(form.elements.oficinaIds);
    data.oficinaId = data.oficinaIds[0] || "";
    data.documentosPendentes = Boolean(form.elements.documentosPendentes?.checked);
    if (data.cpf && !isValidCpf(data.cpf)) {
      setFeedback(feedback, "Informe um CPF valido.", "error");
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
      setFeedback(feedback, "Informe um CPF valido.", "error");
      return;
    }
    if (!Number.isInteger(data.idade) || data.idade < 14 || data.idade > 24) {
      setFeedback(feedback, "A idade do bolsista deve estar entre 14 e 24 anos.", "error");
      return;
    }
    if (data.diasSemana.length > 2) {
      setFeedback(feedback, "Selecione no maximo 2 dias de trabalho para o bolsista.", "error");
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
      setFeedback(feedback, "Informe titulo e data do evento.", "error");
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
  applyLogoPalette();
  setupTheme();
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
}

init();
