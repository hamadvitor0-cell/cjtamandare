const xss = require("xss");

function cleanString(value) {
  return xss(String(value))
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function sanitizeObject(input) {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item));
  }

  if (input && typeof input === "object") {
    return Object.entries(input).reduce((acc, [key, value]) => {
      if (key.startsWith("$") || key.includes(".")) return acc;
      acc[key] = sanitizeObject(value);
      return acc;
    }, {});
  }

  if (typeof input === "string") {
    return cleanString(input);
  }

  return input;
}

module.exports = {
  cleanString,
  sanitizeObject
};
