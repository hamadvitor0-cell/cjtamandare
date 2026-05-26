(function registerDeveloperCredit() {
  const portfolioUrl = "https://vitorhamad.vercel.app/";

  class DeveloperCredit extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready === "true") return;
      const compact = this.getAttribute("variant") === "compact";
      this.dataset.ready = "true";
      this.classList.add("developer-credit", compact ? "developer-credit-compact" : "developer-credit-footer");
      this.setAttribute("aria-label", "Créditos do desenvolvedor do site");
      this.innerHTML = `
        <a class="developer-credit-card" href="${portfolioUrl}" target="_blank" rel="noopener noreferrer" aria-label="Ver portfólio de Vitor Hamad">
          <span class="developer-credit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M8.5 8 5 12l3.5 4"/>
              <path d="m15.5 8 3.5 4-3.5 4"/>
              <path d="m13.5 6-3 12"/>
            </svg>
          </span>
          <span class="developer-credit-copy">
            <strong>Sistema desenvolvido por Vitor Hamad</strong>
            ${compact ? "" : "<small>Quer um site ou sistema parecido para sua empresa?</small>"}
          </span>
          <span class="developer-credit-link">Ver portfólio <span aria-hidden="true">→</span></span>
        </a>
      `;
    }
  }

  if (!customElements.get("developer-credit")) {
    customElements.define("developer-credit", DeveloperCredit);
  }
}());
