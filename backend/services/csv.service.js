function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value).replace(/"/g, '""');
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
