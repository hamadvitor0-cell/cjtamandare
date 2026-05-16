const Audit = require("../models/audit.model");

function pickEntityId(body) {
  return body?.id || body?.oficina?.id || body?.item?.id || body?.aluno?.id || body?.bolsista?.id || body?.evento?.id || "";
}

function defaultLabel(req, body) {
  return body?.oficina?.nome
    || body?.item?.titulo
    || body?.item?.nome
    || body?.aluno?.nome
    || body?.bolsista?.nome
    || body?.evento?.titulo
    || req.body?.nome
    || req.body?.titulo
    || req.body?.username
    || req.body?.email
    || req.params?.id
    || "";
}

function auditAction(action, entityType) {
  return function audit(req, res, next) {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseBody = null;

    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };
    res.send = (body) => {
      if (body && typeof body === "object" && !Buffer.isBuffer(body)) responseBody = body;
      return originalSend(body);
    };

    res.on("finish", () => {
      if (!req.user || res.statusCode >= 400) return;
      Audit.create({
        admin: req.user,
        action,
        entityType,
        entityId: req.params?.id || pickEntityId(responseBody),
        entityLabel: defaultLabel(req, responseBody),
        metadata: {
          method: req.method,
          path: req.originalUrl,
          body: req.body || {}
        },
        ip: req.ip
      }).catch(() => {});
    });

    next();
  };
}

module.exports = {
  auditAction
};
