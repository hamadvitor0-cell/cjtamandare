const API_BASE_URL = window.CJ_API_BASE_URL || "";
let csrfToken = "";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || 20000);
  const requestOptions = {
    credentials: "include",
    ...options,
    headers,
    signal: controller.signal
  };
  delete requestOptions.timeout;

  if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  let response;
  try {
    response = await fetch(apiUrl(path), requestOptions);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("A API demorou demais para responder. Atualize a pagina e tente novamente em alguns segundos.");
    }
    throw new Error("Não foi possível conectar à API. Acesse pelo servidor Express, por exemplo http://localhost:3000/admin.html, e confirme se npm run dev está rodando.");
  } finally {
    window.clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof data === "object" && data.message
      ? data.message
      : "Não foi possível concluir a solicitação.";
    const error = new Error(message);
    error.status = response.status;
    error.details = data.errors || [];
    throw error;
  }

  return data;
}

export async function getCsrfToken(force = false) {
  if (csrfToken && !force) return csrfToken;
  const data = await apiRequest("/csrf-token");
  csrfToken = data.csrfToken;
  return csrfToken;
}

export async function secureRequest(path, options = {}) {
  const token = await getCsrfToken(options.forceCsrf === true);
  const headers = new Headers(options.headers || {});
  headers.set("X-CSRF-Token", token);
  const requestOptions = {
    ...options,
    headers
  };
  delete requestOptions.forceCsrf;

  try {
    return await apiRequest(path, requestOptions);
  } catch (error) {
    const isSecurityValidation = error.status === 403 && /seguran/i.test(error.message);
    if (!isSecurityValidation || options.forceCsrf) throw error;

    const refreshedToken = await getCsrfToken(true);
    const retryHeaders = new Headers(options.headers || {});
    retryHeaders.set("X-CSRF-Token", refreshedToken);
    const retryOptions = {
      ...options,
      headers: retryHeaders
    };
    delete retryOptions.forceCsrf;
    return apiRequest(path, retryOptions);
  }
}
