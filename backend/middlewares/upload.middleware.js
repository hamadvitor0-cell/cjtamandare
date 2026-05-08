const path = require("path");
const multer = require("multer");

const allowedTypes = new Map([
  ["application/pdf", [".pdf"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]]
]);

function uploadError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8
  },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const validExtensions = allowedTypes.get(file.mimetype);

    if (!validExtensions || !validExtensions.includes(extension)) {
      return callback(uploadError("Envie documentos em PDF, JPG, PNG ou WEBP.", 415));
    }

    return callback(null, true);
  }
});

module.exports = upload;
