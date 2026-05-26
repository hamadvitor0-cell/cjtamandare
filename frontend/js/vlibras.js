(() => {
  const scriptSources = [
    "https://vlibras.gov.br/app/vlibras-plugin.js",
    "https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@sgd/app/vlibras-plugin.js"
  ];

  function initVlibras() {
    if (!window.VLibras?.Widget) return;
    try {
      new window.VLibras.Widget("https://vlibras.gov.br/app");
    } catch (error) {
      console.warn("VLibras não pode ser iniciado neste navegador.", error);
    }
  }

  function loadScript(index = 0) {
    if (window.VLibras?.Widget) {
      initVlibras();
      return;
    }

    const src = scriptSources[index];
    if (!src) {
      console.warn("VLibras indisponivel no momento.");
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = initVlibras;
    script.onerror = () => loadScript(index + 1);
    document.head.append(script);
  }

  function scheduleLoad() {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => loadScript(), { timeout: 3000 });
      return;
    }
    setTimeout(loadScript, 0);
  }

  if (document.readyState === "complete") {
    scheduleLoad();
  } else {
    window.addEventListener("load", scheduleLoad, { once: true });
  }
})();
