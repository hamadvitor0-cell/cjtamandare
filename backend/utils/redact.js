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
  "csrf_token"
];

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
  redactUrl
};
