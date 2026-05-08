const fs = require("fs/promises");
const { sanitizeObject } = require("../utils/sanitize");

function cleanupUploadedFiles(req) {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return;
  Promise.allSettled(files.filter((file) => file.path).map((file) => fs.unlink(file.path))).catch(() => undefined);
}

function validate(schema, property = "body") {
  return function validator(req, res, next) {
    const sanitized = sanitizeObject(req[property] || {});
    const { value, error } = schema.validate(sanitized, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      cleanupUploadedFiles(req);
      return res.status(422).json({
        message: "Confira os campos informados.",
        errors: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message
        }))
      });
    }

    req.validated = req.validated || {};
    req.validated[property] = value;
    return next();
  };
}

module.exports = validate;
