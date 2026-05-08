const path = require("path");
const multer = require("multer");

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8
  },
  fileFilter: fileFilterFor(allowedTypes, "Envie documentos em PDF, JPG, PNG ou WEBP.")
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: fileFilterFor(allowedImageTypes, "Envie imagem em JPG, PNG ou WEBP.")
});

module.exports = upload;
module.exports.imageUpload = imageUpload;
