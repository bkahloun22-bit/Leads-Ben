// ✅ Colle ici l’URL de ton Apps Script (Web App) : .../exec
const APP_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwthW2_RxPABsfexou0YDzMxAPO-h-sdhDGc7HZ036-DQoqtBjKDh5ZfUb2fgAc-Er4/exec";

const form = document.getElementById("leadForm");
const statusBox = document.getElementById("status");
window.dataLayer = window.dataLayer || [];

// Validations simples
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const phoneOk = (v) => String(v || "").replace(/\D/g, "").length >= 8;

function showError(name, show) {
  const el = document.querySelector(`[data-err-for="${name}"]`);
  if (el) el.style.display = show ? "block" : "none";
}

function setStatus(type, msg) {
  if (!statusBox) return;
  statusBox.className = "status " + (type === "ok" ? "ok" : "bad");
  statusBox.textContent = msg;
  statusBox.style.display = "block";
}

function getUTMs() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source") || "",
    utm_medium: p.get("utm_medium") || "",
    utm_campaign: p.get("utm_campaign") || "",
    utm_term: p.get("utm_term") || "",
    utm_content: p.get("utm_content") || "",
    gclid: p.get("gclid") || "",
    fbclid: p.get("fbclid") || ""
  };
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    ["prenom","nom","telPortable","email","objet","consent","turnstile"].forEach(n => showError(n,false));
    if (statusBox) statusBox.style.display = "none";

    // Event GTM : tentative
    window.dataLayer.push({
      event: "lead_form_submit_attempt"
    });

    // Honeypot anti-spam
    const honeypot = (form.website && form.website.value || "").trim();
    if (honeypot) {
      form.reset();
      setStatus("ok", "Merci ! Votre demande a bien été envoyée.");
      console.log("honeypot");
      return;
    }

    // Turnstile token
    const turnstileToken =
      document.querySelector('input[name="cf-turnstile-response"]')?.value || "";

    const utm = getUTMs();

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
      pageUrl: window.location.href,
      ...utm
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
      if (!statusBox || statusBox.style.display === "none") {
        setStatus("bad", "Veuillez corriger les champs en erreur.");
      }
      console.log("not ok");
      return;
    }

    if (!APP_SCRIPT_WEB_APP_URL || APP_SCRIPT_WEB_APP_URL.includes("PASTE_")) {
      setStatus("bad", "Configuration manquante : ajoutez l’URL du Web App Google Apps Script dans assets/app.js.");
      console.log("app script");
      return;
    }

    try {
      console.log("azerty");
      await fetch(APP_SCRIPT_WEB_APP_URL, {
        method: "POST",
        mode: "no-cors", // robuste sur GitHub Pages
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Event GTM : succès
      window.dataLayer.push({
        event: "lead_form_submit_success",
        lead_object: data.objet || "",
        lead_source: data.utm_source || data.source || ""
      });

      form.reset();
      if (window.turnstile) window.turnstile.reset();

      // Redirection vers page merci (avec quelques infos utiles)
      const thanksUrl = new URL("merci.html", window.location.href);
      if (data.utm_source) thanksUrl.searchParams.set("utm_source", data.utm_source);
      if (data.utm_campaign) thanksUrl.searchParams.set("utm_campaign", data.utm_campaign);

      window.location.href = thanksUrl.toString();

    } catch (err) {
      console.error(err);
      setStatus("bad", "Une erreur est survenue. Réessayez ou contactez-nous directement.");
    }
  });
}
