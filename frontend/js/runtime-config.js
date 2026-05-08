(() => {
  if (window.CJ_API_BASE_URL) return;

  const localDevPorts = new Set(["5500", "5501", "5173", "8080"]);
  const openedAsFile = window.location.protocol === "file:";
  const openedByStaticServer = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && localDevPorts.has(window.location.port);

  window.CJ_API_BASE_URL = openedAsFile || openedByStaticServer
    ? "http://localhost:3000"
    : "";
})();
