function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const rawValue = String(value);
  const safeValue = /^[=+\-@]/.test(rawValue.trimStart()) ? `'${rawValue}` : rawValue;
  const stringValue = safeValue.replace(/"/g, '""');
  return /[",\n\r;]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}

function inscricoesToCsv(rows) {
  const headers = [
    "id",
    "nome",
    "cpf",
    "idade",
    "telefone",
    "responsavel",
    "email",
    "oficina",
    "oficinas",
    "possuiDeficiencia",
    "deficienciaDescricao",
    "source",
    "sourceId",
    "documentosCount",
    "observacoes",
    "created_at",
    "updated_at"
  ];

  const lines = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(";"));
  return [headers.join(";"), ...lines].join("\n");
}

module.exports = {
  inscricoesToCsv
};
