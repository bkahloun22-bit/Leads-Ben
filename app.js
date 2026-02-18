// ✅ Colle ici l’URL de ton Apps Script (Web App) : .../exec
const APP_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwthW2_RxPABsfexou0YDzMxAPO-h-sdhDGc7HZ036-DQoqtBjKDh5ZfUb2fgAc-Er4/exec";

const form = document.getElementById("leadForm");
const statusBox = document.getElementById("status");

// Validations simples
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const phoneOk = (v) => String(v || "").replace(/\D/g, "").length >= 8;

function showError(name, show) {
  const el = document.querySelector(`[data-err-for="${name}"]`);
  if (el) el.style.display = show ? "block" : "none";
}

function setStatus(type, msg) {
  statusBox.className = "status " + (type === "ok" ? "ok" : "bad");
  statusBox.textContent = msg;
  statusBox.style.display = "block";
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    ["prenom","nom","telPortable","email","objet","consent","turnstile"].forEach(n => showError(n,false));
    statusBox.style.display = "none";

    // Honeypot anti-spam
    const honeypot = (form.website && form.website.value || "").trim();
    if (honeypot) {
      form.reset();
      setStatus("ok", "Merci ! Votre demande a bien été envoyée.");
      return;
    }

    // ✅ Turnstile token (injecté par Cloudflare)
    const turnstileToken =
      document.querySelector('input[name="cf-turnstile-response"]')?.value || "";

    const data = {
      nom: form.nom.value.trim(),
      prenom: form.prenom.value.trim(),
      telFixe: form.telFixe.value.trim(),
      telPortable: form.telPortable.value.trim(),
      email: form.email.value.trim(),
      objet: form.objet.value,
      message: (form.message?.value || "").trim(),
      consent: form.consent.checked ? "oui" : "non",
      turnstileToken: turnstileToken,
      source: "Site statique",
      pageUrl: window.location.href
    };

    let ok = true;
    if (!data.prenom) { showError("prenom", true); ok = false; }
    if (!data.nom) { showError("nom", true); ok = false; }
    if (!phoneOk(data.telPortable)) { showError("telPortable", true); ok = false; }
    if (!emailOk(data.email)) { showError("email", true); ok = false; }
    if (!data.objet) { showError("objet", true); ok = false; }
    if (data.consent !== "oui") { showError("consent", true); ok = false; }
    if (!data.turnstileToken) {
      showError("turnstile", true);
      setStatus("bad", "Veuillez valider l’anti-robot (captcha) avant d’envoyer le formulaire.");
      ok = false;
    }


    if (!ok) {
      setStatus("bad", "Veuillez corriger les champs en erreur.");
      return;
    }

    if (!APP_SCRIPT_WEB_APP_URL || APP_SCRIPT_WEB_APP_URL.includes("PASTE_")) {
      setStatus("bad", "Configuration manquante : ajoutez l’URL du Web App Google Apps Script dans assets/app.js.");
      return;
    }

    try {
      // GitHub Pages = statique → envoi robuste en no-cors
      await fetch(APP_SCRIPT_WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Reset formulaire + Turnstile
      form.reset();
      if (window.turnstile) window.turnstile.reset();

      setStatus("ok", "Merci ! Votre demande a bien été envoyée. Nous vous recontactons sous 24h.");
    } catch (err) {
      console.error(err);
      setStatus("bad", "Une erreur est survenue. Réessayez ou contactez-nous directement.");
    }
  });
}
