const path = require("path");
const multer = require("multer");

const MB = 1024 * 1024;

const allowedTypes = new Map([
  ["application/pdf", [".pdf"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]]
]);

const allowedImageTypes = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]]
]);

function uploadError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function rejectLargeMultipart(maxBytes) {
  return function contentLengthGuard(req, res, next) {
    const rawLength = req.get("content-length");
    const contentLength = Number(rawLength || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return next(uploadError(`Envio muito grande. O limite total e de ${Math.floor(maxBytes / MB)} MB.`, 413));
    }
    return next();
  };
}

function fileFilterFor(allowed, message) {
  return function fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const validExtensions = allowed.get(file.mimetype);

    if (!validExtensions || !validExtensions.includes(extension)) {
      return callback(uploadError(message, 415));
    }

    return callback(null, true);
  };
}

function hasValidSignature(file) {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  if (file.mimetype === "application/pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }

  if (file.mimetype === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (file.mimetype === "image/png") {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer.subarray(1, 4).toString("ascii") === "PNG"
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }

  if (file.mimetype === "image/webp") {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  return false;
}

function validateUploadedFiles(req, res, next) {
  const files = [
    ...(Array.isArray(req.files) ? req.files : []),
    ...(req.file ? [req.file] : [])
  ];
  const invalid = files.find((file) => !hasValidSignature(file));
  if (invalid) {
    return next(uploadError("O conteúdo do arquivo não corresponde ao tipo informado.", 415));
  }
  return next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * MB,
    files: 8
  },
  fileFilter: fileFilterFor(allowedTypes, "Envie documentos em PDF, JPG, PNG ou WEBP.")
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * MB,
    files: 1
  },
  fileFilter: fileFilterFor(allowedImageTypes, "Envie imagem em JPG, PNG ou WEBP.")
});

module.exports = upload;
module.exports.imageUpload = imageUpload;
module.exports.rejectLargeMultipart = rejectLargeMultipart;
module.exports.validateUploadedFiles = validateUploadedFiles;
