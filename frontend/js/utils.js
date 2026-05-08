export function createElement(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
  }
  return node;
}

export function debounce(fn, wait = 180) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function maskPhoneValue(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function setupPhoneMasks(root = document) {
  root.querySelectorAll("[data-phone-mask]").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = maskPhoneValue(input.value);
    });
  });
}

export function setFeedback(node, message, type = "") {
  if (!node) return;
  node.textContent = message;
  node.classList.remove("is-success", "is-error");
  if (type) node.classList.add(`is-${type}`);
}

export function showToast(message, type = "success") {
  const region = document.querySelector("[data-toast-region]");
  if (!region) return;
  const toast = createElement("div", {
    className: `toast toast-${type}`,
    text: message,
    attrs: { role: "status" }
  });
  region.append(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
