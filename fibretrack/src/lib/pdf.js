// Generation PDF - cote serveur via API PHP
// L'APK/WebView ne fait qu'ouvrir les URLs, le serveur genere le PDF

import { getApiCode, getSessionToken, getTeamId } from "../models/Account";

const PDF_URL = "https://fibretrack.mantota.com/api/pdf.php";
const EXCEL_EXPORT_URL = "https://fibretrack.mantota.com/api/excel_export.php";
const EXCEL_HEBDO_URL = "https://fibretrack.mantota.com/api/excel_hebdo.php";

function authSuffix() {
  const code = getApiCode();
  const token = getSessionToken();
  const teamId = getTeamId();
  let suffix = "";
  if (code) suffix += `&code=${encodeURIComponent(code)}`;
  if (token) suffix += `&token=${encodeURIComponent(token)}`;
  if (teamId) suffix += `&team_id=${encodeURIComponent(teamId)}`;
  return suffix;
}

function isInWebView() {
  return typeof window !== "undefined" && window.AndroidBridge && window.AndroidBridge.isWebView && window.AndroidBridge.isWebView();
}

export function getPdfUrl(action, id) {
  return `${PDF_URL}?action=${action}&id=${encodeURIComponent(id)}${authSuffix()}`;
}

export function getStockPdfUrl(action) {
  return `${PDF_URL}?action=${action}${authSuffix()}`;
}

export function getPointMaterielExcelUrl() {
  return `${EXCEL_EXPORT_URL}?action=export_point_materiel${authSuffix()}`;
}

export function getExcelHebdoUrl(weekStart = null) {
  const suffix = weekStart ? `&week_start=${encodeURIComponent(weekStart)}` : "";
  return `${EXCEL_HEBDO_URL}?action=export_hebdo${authSuffix()}${suffix}`;
}

export function getExcelMoisUrl(mois) {
  return `${EXCEL_HEBDO_URL}?action=export_mois&mois=${encodeURIComponent(mois)}${authSuffix()}`;
}

export function getHistoriqueUrl() {
  return `${EXCEL_HEBDO_URL}?action=export_historique${authSuffix()}`;
}

export function getListeMoisUrl(mois) {
  return `${PDF_URL}?action=liste_mois&mois=${encodeURIComponent(mois)}${authSuffix()}`;
}

export function getPdfMoisUrl(mois) {
  return `${PDF_URL}?action=pdf_mois&mois=${encodeURIComponent(mois)}${authSuffix()}`;
}

export async function generateInterventionPdf(intervention) {
  const url = getPdfUrl("pdf_fiches", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.downloadUrl(url, `fiches_${intervention.nom_client || intervention.id}.pdf`);
    return;
  }
  window.location.href = url;
}

export async function previewInterventionPdf(intervention) {
  const url = getPdfUrl("pdf_fiches_view", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.openUrl(url);
    return null;
  }
  window.open(url, "_blank");
  return null;
}

export async function generateSummaryReportPdf(intervention) {
  const url = getPdfUrl("pdf_rapport", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.downloadUrl(url, `rapport_${intervention.nom_client || intervention.id}.pdf`);
    return;
  }
  window.location.href = url;
}

export async function previewSummaryReportPdf(intervention) {
  const url = getPdfUrl("pdf_rapport_view", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.openUrl(url);
    return null;
  }
  window.open(url, "_blank");
  return null;
}

export async function shareInterventionPdf(intervention) {
  const url = getPdfUrl("pdf_fiches", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.shareUrl(url, `Fiches d'intervention - ${intervention.nom_client || ""}`);
    return "shared";
  }
  window.location.href = url;
  return "downloaded";
}

export async function generateSatisfactionPdf(intervention) {
  const url = getPdfUrl("pdf_satisfaction", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.downloadUrl(url, `satisfaction_${intervention.nom_client || intervention.id}.pdf`);
    return;
  }
  window.location.href = url;
}

export async function previewSatisfactionPdf(intervention) {
  const url = getPdfUrl("pdf_satisfaction_view", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.openUrl(url);
    return null;
  }
  window.open(url, "_blank");
  return null;
}

export async function generateSbinPdf(intervention) {
  const url = getPdfUrl("pdf_sbin", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.downloadUrl(url, `fiche_sbin_${intervention.nom_client || intervention.id}.pdf`);
    return;
  }
  window.location.href = url;
}

export async function previewSbinPdf(intervention) {
  const url = getPdfUrl("pdf_sbin_view", intervention.id);
  if (isInWebView()) {
    window.AndroidBridge.openUrl(url);
    return null;
  }
  window.open(url, "_blank");
  return null;
}

export const generateFichesPdf = generateInterventionPdf;
export const previewFichesPdf = previewInterventionPdf;

