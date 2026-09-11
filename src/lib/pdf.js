// Generation PDF - cote serveur via API PHP
// L'APK/WebView ne fait qu'ouvrir les URLs, le serveur genere le PDF

const PDF_URL = "https://fibretrack.mantota.com/api/pdf.php";

function isInWebView() {
  return typeof window !== "undefined" && window.AndroidBridge && window.AndroidBridge.isWebView && window.AndroidBridge.isWebView();
}

export async function generateInterventionPdf(intervention) {
  const url = `${PDF_URL}?action=pdf_fiches&id=${encodeURIComponent(intervention.id)}`;
  if (isInWebView()) {
    window.AndroidBridge.downloadUrl(url, `fiches_${intervention.nom_client || intervention.id}.pdf`);
    return;
  }
  window.location.href = url;
}

export async function previewInterventionPdf(intervention) {
  const url = `${PDF_URL}?action=pdf_fiches_view&id=${encodeURIComponent(intervention.id)}`;
  if (isInWebView()) {
    window.AndroidBridge.openUrl(url);
    return null;
  }
  window.open(url, "_blank");
  return null;
}

export async function generateSummaryReportPdf(intervention) {
  const url = `${PDF_URL}?action=pdf_rapport&id=${encodeURIComponent(intervention.id)}`;
  if (isInWebView()) {
    window.AndroidBridge.downloadUrl(url, `rapport_${intervention.nom_client || intervention.id}.pdf`);
    return;
  }
  window.location.href = url;
}

export async function previewSummaryReportPdf(intervention) {
  const url = `${PDF_URL}?action=pdf_rapport_view&id=${encodeURIComponent(intervention.id)}`;
  if (isInWebView()) {
    window.AndroidBridge.openUrl(url);
    return null;
  }
  window.open(url, "_blank");
  return null;
}

export async function shareInterventionPdf(intervention) {
  const url = `${PDF_URL}?action=pdf_fiches&id=${encodeURIComponent(intervention.id)}`;
  if (isInWebView()) {
    window.AndroidBridge.shareUrl(url, `Fiches d'intervention - ${intervention.nom_client || ""}`);
    return "shared";
  }
  window.location.href = url;
  return "downloaded";
}
