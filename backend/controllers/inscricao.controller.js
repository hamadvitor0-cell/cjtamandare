const InscricaoService = require("../services/inscricao.service");
const CsvService = require("../services/csv.service");
const Captcha = require("../services/captcha.service");
const ZipService = require("../services/zip.service");

async function create(req, res) {
  const payload = { ...req.validated.body };
  const fieldFiles = req.files && !Array.isArray(req.files) ? req.files : {};
  const documentos = Array.isArray(req.files) ? req.files : (fieldFiles.documentos || []);
  const termoAssinado = (fieldFiles.termoAssinado || [])[0] || null;
  const files = termoAssinado ? [...documentos, termoAssinado] : documentos;

  if (payload.website) {
    return res.status(200).json({
      message: "Inscrição recebida com sucesso."
    });
  }

  if (!documentos.length) {
    return res.status(400).json({ message: "Adicione os documentos obrigatórios para finalizar a inscrição." });
  }

  if (!termoAssinado) {
    return res.status(400).json({ message: "Anexe o termo de compromisso assinado eletronicamente pelo gov.br em PDF." });
  }

  if (termoAssinado.mimetype !== "application/pdf") {
    return res.status(400).json({ message: "O termo assinado deve ser enviado em PDF." });
  }

  if (Number(payload.idade) < 18) {
    if (!String(payload.responsavel || "").trim()) {
      return res.status(400).json({ message: "Informe o responsável legal para menor de idade." });
    }
    if (documentos.length < 2) {
      return res.status(400).json({ message: "Para menor de idade, envie documentos do aluno e do responsável." });
    }
  }

  await Captcha.verify({
    token: payload.captchaToken,
    position: payload.captchaX,
    moves: payload.captchaMoves
  }, req);

  delete payload.website;
  delete payload.captchaToken;
  delete payload.captchaX;
  delete payload.captchaMoves;
  const inscricao = await InscricaoService.create(payload, files);

  return res.status(201).json({
    message: "Inscrição realizada com sucesso.",
    inscricao
  });
}

async function list(req, res) {
  const inscricoes = await InscricaoService.list(req.validated.query);
  return res.json({ inscricoes });
}

async function legacyStatusRetired(req, res) {
  res.set("Cache-Control", "private, no-store");
  return res.status(410).json({
    message: "Consulta indisponível. Acesse o Portal do Aluno com CPF e matrícula."
  });
}

async function update(req, res) {
  const updated = await InscricaoService.update(req.validated.params.id, req.validated.body);

  if (!updated) {
    return res.status(404).json({ message: "Inscrição não encontrada." });
  }

  return res.json({
    message: "Inscrição atualizada com sucesso.",
    inscricao: updated
  });
}

async function remove(req, res) {
  const removed = await InscricaoService.remove(req.validated.params.id);

  if (!removed) {
    return res.status(404).json({ message: "Inscrição não encontrada." });
  }

  return res.status(204).send();
}

async function exportCsv(req, res) {
  const inscricoes = await InscricaoService.list(req.validated.query);
  const csv = CsvService.inscricoesToCsv(inscricoes);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=inscricoes-centro-da-juventude.csv");
  return res.send(`\uFEFF${csv}`);
}

async function listDocuments(req, res) {
  const documentos = (await InscricaoService.listDocuments(req.validated.params.id))
    .map(({ fileContent, ...documento }) => documento);
  return res.json({ documentos });
}

async function downloadDocument(req, res) {
  const documento = await InscricaoService.getDocument(req.validated.params.id);

  if (!documento) {
    return res.status(404).json({ message: "Documento não encontrado." });
  }

  if (!documento.fileContent) {
    return res.status(404).json({ message: "Arquivo do documento não encontrado." });
  }

  res.setHeader("Content-Type", documento.mimeType);
  res.setHeader("Content-Length", documento.sizeBytes);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(documento.originalName)}"`);
  return res.send(documento.fileContent);
}

function archiveName(base) {
  return `${ZipService.sanitizeZipPath(base)}.zip`;
}

async function downloadDocumentsZip(req, res) {
  const documentos = await InscricaoService.documentsArchive(req.validated.query);

  if (!documentos.length) {
    return res.status(404).json({ message: "Nenhum documento encontrado para baixar." });
  }

  const zip = ZipService.createZip(documentos);
  const suffix = req.validated.query.oficina || req.validated.query.search || "todos-documentos";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", zip.length);
  res.setHeader("Content-Disposition", `attachment; filename="${archiveName(`documentos-${suffix}`)}"`);
  return res.send(zip);
}

async function downloadInscricaoDocumentsZip(req, res) {
  const documentos = await InscricaoService.documentsArchive({ inscricaoId: req.validated.params.id });

  if (!documentos.length) {
    return res.status(404).json({ message: "Nenhum documento encontrado para esta inscrição." });
  }

  const zip = ZipService.createZip(documentos);
  const base = documentos[0]?.nome || req.validated.params.id;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", zip.length);
  res.setHeader("Content-Disposition", `attachment; filename="${archiveName(`documentos-${base}`)}"`);
  return res.send(zip);
}

module.exports = {
  create,
  list,
  legacyStatusRetired,
  update,
  remove,
  exportCsv,
  listDocuments,
  downloadDocument,
  downloadDocumentsZip,
  downloadInscricaoDocumentsZip
};
