const InscricaoService = require("../services/inscricao.service");
const CsvService = require("../services/csv.service");
const Captcha = require("../services/captcha.service");
const ZipService = require("../services/zip.service");

async function create(req, res) {
  const payload = { ...req.validated.body };

  if (payload.website) {
    return res.status(200).json({
      message: "Inscricao recebida com sucesso."
    });
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
  const inscricao = await InscricaoService.create(payload, req.files || []);

  return res.status(201).json({
    message: "Inscricao realizada com sucesso.",
    inscricao
  });
}

async function list(req, res) {
  const inscricoes = await InscricaoService.list(req.validated.query);
  return res.json({ inscricoes });
}

async function status(req, res) {
  const statusInfo = await InscricaoService.publicStatusByCpf(req.validated.body.cpf);
  return res.json({ status: statusInfo });
}

async function update(req, res) {
  const updated = await InscricaoService.update(req.validated.params.id, req.validated.body);

  if (!updated) {
    return res.status(404).json({ message: "Inscricao nao encontrada." });
  }

  return res.json({
    message: "Inscricao atualizada com sucesso.",
    inscricao: updated
  });
}

async function remove(req, res) {
  const removed = await InscricaoService.remove(req.validated.params.id);

  if (!removed) {
    return res.status(404).json({ message: "Inscricao nao encontrada." });
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
    return res.status(404).json({ message: "Documento nao encontrado." });
  }

  if (!documento.fileContent) {
    return res.status(404).json({ message: "Arquivo do documento nao encontrado." });
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
    return res.status(404).json({ message: "Nenhum documento encontrado para esta inscricao." });
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
  status,
  update,
  remove,
  exportCsv,
  listDocuments,
  downloadDocument,
  downloadDocumentsZip,
  downloadInscricaoDocumentsZip
};
