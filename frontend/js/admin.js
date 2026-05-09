import { workshops as fallbackWorkshops } from "./data.js";
import { apiRequest, secureRequest, apiUrl } from "./api.js";
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
  attendanceRows: [],
  inscricoes: [],
  search: "",
  oficina: "",
  studentSearch: "",
  studentOffice: ""
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
const pageTitle = document.querySelector("[data-page-title]");

const pageTitles = {
  dashboard: "Dashboard",
  inscritos: "Inscritos",
  oficinas: "Oficinas",
  galeria: "Galeria",
  alunos: "Alunos",
  chamada: "Chamada"
};

const pageAliases = {
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
  await Promise.all([loadDashboard(), loadInscricoes(), loadAlunos(), loadAttendanceHistory()]);
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
    if (!isGrouped) {
      const del = createElement("button", {
        className: "icon-action danger",
        text: "Excluir",
        attrs: { type: "button" }
      });
      if (item.source === "aluno" || item.primarySource === "aluno") {
        del.textContent = "Excluir aluno";
        del.addEventListener("click", () => removeStudentFromEnrollment(item));
      } else {
        del.addEventListener("click", () => removeInscricao({ ...item, id: item.sourceId || item.id }));
      }
      actions.append(del);
    }
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
  if (student) {
    const editStudentButton = createElement("button", {
      className: "button button-primary",
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

  document.querySelector("[data-reset-office-form]")?.addEventListener("click", resetOfficeForm);
  document.querySelector("[data-reset-gallery-form]")?.addEventListener("click", resetGalleryForm);
  document.querySelector("[data-reset-student-form]")?.addEventListener("click", resetStudentForm);

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
  setupEvents();
  checkSession();
}

init();
