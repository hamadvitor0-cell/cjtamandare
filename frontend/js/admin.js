(() => {
  "use strict";

  const legacyTrap = {
    status: "legacy-disabled",
    panel: "adm-classico",
    endpoints: [
      "/admin/debug-login",
      "/admin/backup",
      "/admin/exportar-banco"
    ]
  };

  window.__CJ_LEGACY_ADMIN__ = legacyTrap;

  const payload = JSON.stringify({
    source: "legacy-admin-js",
    path: window.location.pathname,
    at: new Date().toISOString()
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/admin/debug-login", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/admin/debug-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {});
  }
})();
