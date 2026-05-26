const sensitiveQueryKeys = [
  "username",
  "email",
  "registrationCode",
  "password",
  "senha",
  "codigo",
  "code",
  "token",
  "access_token",
  "csrf_token",
  "cpf",
  "matricula",
  "telefone",
  "phone",
  "celular",
  "enrollment",
  "search"
];

const redactedFieldKeys = new Set([
  "password",
  "passwordhash",
  "registrationcode",
  "registrationcodehash",
  "senha",
  "codigo",
  "code",
  "token",
  "accesstoken",
  "studentaccesstoken",
  "csrftoken",
  "file",
  "filecontent",
  "imagemarquivo",
  "documentos",
  "document",
  "documents",
  "documentoslinks",
  "whatsappurl",
  "texto",
  "descricao",
  "mensagem",
  "message",
  "comentario",
  "resposta",
  "observacoes",
  "observations",
  "advertencias",
  "deficienciadescricao",
  "datanascimento",
  "responsavel",
  "guardian",
  "bairro",
  "endereco",
  "address",
  "nome",
  "name",
  "enrollment"
]);

function normalizedFieldKey(key = "") {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function maskCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 2 ? `***.***.***-${digits.slice(-2)}` : "[redacted]";
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? `*****-${digits.slice(-4)}` : "[redacted]";
}

function maskEmail(value) {
  const [local, domain] = String(value || "").split("@");
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : "[redacted]";
}

function redactSensitiveData(value, key = "") {
  const normalizedKey = normalizedFieldKey(key);
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return "[binary omitted]";
  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item, key));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([field, fieldValue]) => [field, redactSensitiveData(fieldValue, field)])
    );
  }
  if (/(^|.*)cpf$/.test(normalizedKey)) return maskCpf(value);
  if (/(telefone|phone|celular|contato)$/.test(normalizedKey)) return maskPhone(value);
  if (/(matricula|enrollment)$/.test(normalizedKey)) return "[redacted]";
  if (/email$/.test(normalizedKey)) return maskEmail(value);
  if (
    redactedFieldKeys.has(normalizedKey)
    || /(nome|name|responsavel|guardian|documento|document|mensagem|message|observacoes|observations|endereco|address)$/.test(normalizedKey)
  ) return "[redacted]";
  return value;
}

function redactUrl(value = "") {
  try {
    const url = new URL(value, "https://local.invalid");
    let changed = false;
    sensitiveQueryKeys.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, "[redacted]");
        changed = true;
      }
    });
    return changed ? `${url.pathname}${url.search}` : value;
  } catch (error) {
    return String(value).replace(/((?:registrationCode|password|senha|token|access_token|csrf_token)=)[^&\s]+/gi, "$1[redacted]");
  }
}

module.exports = {
  sensitiveQueryKeys,
  redactUrl,
  redactSensitiveData
};
