// ✅ URL du Web App Google Apps Script (.../exec)
const APP_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwthW2_RxPABsfexou0YDzMxAPO-h-sdhDGc7HZ036-DQoqtBjKDh5ZfUb2fgAc-Er4/exec";

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

function clearAllErrors() {
  ["prenom", "nom", "telPortable", "email", "objet", "consent", "turnstile"].forEach((n) =>
    showError(n, false)
  );
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

function getTurnstileToken() {
  return document.querySelector('input[name="cf-turnstile-response"]')?.value || "";
}

function buildLeadPayload(formEl) {
  const utm = getUTMs();

  return {
    nom: formEl.nom?.value?.trim() || "",
    prenom: formEl.prenom?.value?.trim() || "",
    telFixe: formEl.telFixe?.value?.trim() || "",
    telPortable: formEl.telPortable?.value?.trim() || "",
    email: formEl.email?.value?.trim() || "",
    objet: formEl.objet?.value || "",
    message: formEl.message?.value?.trim() || "",
    consent: formEl.consent?.checked ? "oui" : "non",
    turnstileToken: getTurnstileToken(),
    source: "Site statique",
    pageUrl: window.location.href,
    ...utm
  };
}

function validateLead(data) {
  let ok = true;

  if (!data.prenom) {
    showError("prenom", true);
    ok = false;
  }
  if (!data.nom) {
    showError("nom", true);
    ok = false;
  }
  if (!phoneOk(data.telPortable)) {
    showError("telPortable", true);
    ok = false;
  }
  if (!emailOk(data.email)) {
    showError("email", true);
    ok = false;
  }
  if (!data.objet) {
    showError("objet", true);
    ok = false;
  }
  if (data.consent !== "oui") {
    showError("consent", true);
    ok = false;
  }

  if (!data.turnstileToken) {
    showError("turnstile", true);
    setStatus("bad", "Veuillez valider l’anti-robot (captcha) avant d’envoyer le formulaire.");
    ok = false;
  }

  if (!ok && (!statusBox || statusBox.style.display === "none")) {
    setStatus("bad", "Veuillez corriger les champs en erreur.");
  }

  return ok;
}

function toUrlEncoded(data) {
  const payload = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    payload.append(key, value ?? "");
  });
  return payload;
}

async function postLead(data) {
  const payload = toUrlEncoded(data);

  const response = await fetch(APP_SCRIPT_WEB_APP_URL, {
    method: "POST",
    body: payload
    // ⚠️ pas de headers Content-Type ici (évite le preflight CORS)
  });

  // Avec Apps Script, même en erreur métier, HTTP peut être 200.
  const raw = await response.text();
  console.log("HTTP status:", response.status, "raw:", raw);

  let result;
  try {
    result = JSON.parse(raw);
  } catch (_) {
    // Si Apps Script renvoie une page HTML d'erreur
    throw new Error(raw.slice(0, 300));
  }

  // Gestion des erreurs renvoyées par le backend
  if (result && (result.success === false || result.ok === false)) {
    throw new Error(result.error || "Erreur Apps Script");
  }

  return result;
}

function onLeadSuccess(data) {
  // Event GTM : succès
  window.dataLayer.push({
    event: "lead_form_submit_success",
    lead_object: data.objet || "",
    lead_source: data.utm_source || data.source || ""
  });

  form.reset();
  if (window.turnstile) window.turnstile.reset();

  // Redirection vers page merci
  const thanksUrl = new URL("merci.html", window.location.href);
  if (data.utm_source) thanksUrl.searchParams.set("utm_source", data.utm_source);
  if (data.utm_campaign) thanksUrl.searchParams.set("utm_campaign", data.utm_campaign);

  window.location.href = thanksUrl.toString();
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    clearAllErrors();
    if (statusBox) statusBox.style.display = "none";

    // Event GTM : tentative
    window.dataLayer.push({ event: "lead_form_submit_attempt" });

    // Honeypot anti-spam
    const honeypot = (form.website && form.website.value || "").trim();
    if (honeypot) {
      form.reset();
      setStatus("ok", "Merci ! Votre demande a bien été envoyée.");
      console.log("honeypot triggered");
      return;
    }

    const data = buildLeadPayload(form);

    // Validations front
    if (!validateLead(data)) {
      console.log("validation failed");
      return;
    }

    // Config
    if (!APP_SCRIPT_WEB_APP_URL || APP_SCRIPT_WEB_APP_URL.includes("PASTE_")) {
      setStatus(
        "bad",
        "Configuration manquante : ajoutez l’URL du Web App Google Apps Script dans assets/app.js."
      );
      console.log("missing app script URL");
      return;
    }

    // UI feedback pendant l’envoi (optionnel mais utile)
    const submitBtn = form.querySelector('[type="submit"]');
    const previousBtnText = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Envoi en cours...";
    }

    try {
      console.log("sending lead...", data);

      const result = await postLead(data);
      console.log("Apps Script response:", result);

      // Cas "ignored" (ex: consent côté serveur)
      if (result && result.ignored) {
        throw new Error("Demande ignorée par le serveur.");
      }

      onLeadSuccess(data);

    } catch (err) {
      console.error("erreur", err);

      // Message plus utile selon l’erreur
      const msg = String(err && err.message ? err.message : err);

      if (/Turnstile/i.test(msg)) {
        setStatus("bad", "Validation anti-robot échouée. Merci de réessayer.");
      } else if (/Champs obligatoires/i.test(msg)) {
        setStatus("bad", "Certains champs obligatoires sont manquants.");
      } else if (/Failed to fetch/i.test(msg)) {
        setStatus("bad", "Impossible de contacter le serveur. Vérifiez le déploiement Apps Script puis réessayez.");
      } else {
        setStatus("bad", "Une erreur est survenue. Réessayez ou contactez-nous directement.");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = previousBtnText || "Envoyer";
      }
    }
  });
}