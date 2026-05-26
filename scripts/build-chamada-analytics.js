const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const sourceDir = process.argv[2] || "D:\\MODS\\CHAMADAS 2026 (CJ)-20260522T180055Z-3-001\\CHAMADAS 2026 (CJ)";
const outputPath = path.resolve(__dirname, "..", "backend", "data", "chamadas-2026-analytics.json");
const analyticsYear = 2026;
const monthNumbers = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12
};

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    return String(value.text || value.result || value.richText?.map((item) => item.text).join("") || "");
  }
  return String(value);
}

function cleanOfficeName(value, fallback) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const chosen = raw.length >= 3 && !/^[A-Z]?\/$/i.test(raw) ? raw : fallback;
  return String(chosen || "")
    .replace(/_/g, " ")
    .replace(/\.xlsx$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function statusKind(value) {
  const normalized = cellText(value).trim().toUpperCase();
  if (!normalized || normalized === "*") return "";
  if (normalized === "P") return "presencas";
  if (normalized === "FJ" || normalized === "J" || normalized.includes("JUST")) return "justificadas";
  if (normalized === "F") return "faltas";
  return "";
}

function normalizeText(value) {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function columnDate(sheet, columnIndex) {
  const dayMatch = normalizeText(sheet.getRow(2).getCell(columnIndex).value).match(/\d{1,2}/);
  const monthMatch = normalizeText(sheet.getRow(3).getCell(columnIndex).value).match(/[A-Z]{3}/);
  if (!dayMatch || !monthMatch) return "";
  const day = Number(dayMatch[0]);
  const month = monthNumbers[monthMatch[0]];
  if (!month || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(analyticsYear, month - 1, day, 12));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

function monthLabel(monthKey) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${monthKey}-01T12:00:00Z`));
}

function isoWeek(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekLabel(weekKey) {
  const [yearText, weekText] = String(weekKey).split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  if (!year || !week) return weekKey;
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7, 12));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const format = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return `${format.format(monday)} a ${format.format(sunday)}`;
}

function emptyRowStats(office) {
  return {
    oficinaId: "",
    oficina: office,
    categoria: "Planilhas 2026",
    inscritos: 0,
    chamadas: 0,
    presencas: 0,
    faltas: 0,
    justificadas: 0,
    totalPresencas: 0,
    frequenciaPercentual: 0
  };
}

function addStatus(row, kind) {
  row[kind] += 1;
  row.totalPresencas += 1;
}

function finalizeRow(row) {
  const clean = { ...row };
  delete clean.activeClassColumns;
  clean.frequenciaPercentual = clean.totalPresencas ? Math.round((clean.presencas / clean.totalPresencas) * 100) : 0;
  return clean;
}

function totalsFor(rows) {
  return rows.reduce((acc, row) => {
    acc.inscritos += row.inscritos;
    acc.chamadas += row.chamadas;
    acc.presencas += row.presencas;
    acc.faltas += row.faltas;
    acc.justificadas += row.justificadas;
    acc.totalPresencas += row.totalPresencas;
    return acc;
  }, { inscritos: 0, chamadas: 0, presencas: 0, faltas: 0, justificadas: 0, totalPresencas: 0 });
}

function resultFromRows(rows, extra = {}) {
  const ordered = rows.slice().sort((a, b) => b.inscritos - a.inscritos || a.oficina.localeCompare(b.oficina));
  return {
    ...extra,
    totals: totalsFor(ordered),
    byOficina: ordered,
    topInscritos: topBy(ordered, "inscritos"),
    topPresencas: topBy(ordered, "presencas"),
    topFaltas: topBy(ordered, "faltas"),
    topJustificadas: topBy(ordered, "justificadas")
  };
}

function periodRow(map, key, label, office) {
  const id = `${key}||${office}`;
  if (!map.has(id)) {
    map.set(id, {
      ...emptyRowStats(office),
      periodKey: key,
      periodLabel: label,
      activeClassColumns: new Set()
    });
  }
  return map.get(id);
}

function topBy(rows, key) {
  return rows
    .slice()
    .sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || a.oficina.localeCompare(b.oficina))
    .slice(0, 12);
}

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Diretório não encontrado: ${sourceDir}`);
  }
  const files = fs.readdirSync(sourceDir)
    .filter((file) => file.toLowerCase().endsWith(".xlsx"))
    .filter((file) => !/^~\$/.test(file))
    .filter((file) => !/inscritos cj|rota da van|agendamento de quadra|planilha sem título/i.test(file));

  const rows = [];
  const monthRows = new Map();
  const weekRows = new Map();
  for (const file of files) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(sourceDir, file));
    const sheet = workbook.worksheets.find((worksheet) => /chamada oficial/i.test(worksheet.name));
    if (!sheet) continue;
    const office = cleanOfficeName(sheet.getRow(1).getCell(1).value, file);
    const row = emptyRowStats(office);
    const activeClassColumns = new Set();
    const columnDates = new Map();
    for (let columnIndex = 3; columnIndex <= sheet.columnCount; columnIndex += 1) {
      const date = columnDate(sheet, columnIndex);
      if (date) columnDates.set(columnIndex, date);
    }
    for (let rowIndex = 4; rowIndex <= sheet.rowCount; rowIndex += 1) {
      const studentName = cellText(sheet.getRow(rowIndex).getCell(2).value).trim();
      if (!studentName) continue;
      row.inscritos += 1;
      for (let columnIndex = 3; columnIndex <= sheet.columnCount; columnIndex += 1) {
        const kind = statusKind(sheet.getRow(rowIndex).getCell(columnIndex).value);
        if (!kind) continue;
        addStatus(row, kind);
        activeClassColumns.add(columnIndex);
        const date = columnDates.get(columnIndex);
        if (date) {
          const monthKey = date.slice(0, 7);
          const month = periodRow(monthRows, monthKey, monthLabel(monthKey), office);
          addStatus(month, kind);
          month.activeClassColumns.add(`${file}:${columnIndex}`);

          const weekKey = isoWeek(date);
          const week = periodRow(weekRows, weekKey, weekLabel(weekKey), office);
          addStatus(week, kind);
          week.activeClassColumns.add(`${file}:${columnIndex}`);
        }
      }
    }
    row.chamadas = activeClassColumns.size;
    row.frequenciaPercentual = row.totalPresencas ? Math.round((row.presencas / row.totalPresencas) * 100) : 0;
    rows.push(row);
  }

  const inscritosByOffice = new Map(rows.map((row) => [row.oficina, row.inscritos]));
  const finalizePeriodRows = (map) => Array.from(map.values())
    .map((row) => {
      row.inscritos = inscritosByOffice.get(row.oficina) || 0;
      row.chamadas = row.activeClassColumns.size;
      return finalizeRow(row);
    })
    .filter((row) => row.totalPresencas || row.chamadas);
  const monthPeriodRows = finalizePeriodRows(monthRows);
  const weekPeriodRows = finalizePeriodRows(weekRows);
  const groupedPeriods = (periodRows, keyName) => Array.from(new Set(periodRows.map((row) => row.periodKey)))
    .sort()
    .map((key) => resultFromRows(periodRows.filter((row) => row.periodKey === key), {
      key,
      label: periodRows.find((row) => row.periodKey === key)?.periodLabel || key,
      type: keyName
    }));

  const payload = {
    source: "planilhas_chamadas_2026",
    generatedAt: new Date().toISOString(),
    sourceDir,
    files: files.length,
    ...resultFromRows(rows),
    periods: {
      months: groupedPeriods(monthPeriodRows, "mes"),
      weeks: groupedPeriods(weekPeriodRows, "semana")
    }
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Resumo gerado: ${outputPath}`);
  console.log(`Arquivos: ${files.length}; oficinas: ${rows.length}; registros de presença: ${payload.totals.totalPresencas}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
