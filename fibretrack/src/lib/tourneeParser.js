/**
 * Parseur de listing de dossiers pour la Tournée du Jour.
 *
 * Supporte le copier-coller brut depuis Excel, Word, Mail ou WhatsApp :
 * Format standard reçu :
 * OJUS MALIKI ET FILS\t0121257097\t0197923750\tFTTH\tSEM-PL02 FAT103
 * BLOUEDOU  SEIDOU \t0121293241\t0169659530\tFTTH\tSEM-PL165 FAT23
 * SANNI AKIMOU ADEDIRAN ADJAHO\t0121297613\t0197181647\tFTTH\tSEM-PL151 FAT47
 * ANAGONOU ALLELUIA DORCAS\t0121295715\t0141129211/140929302\tFTTH\tSEM-PL02 FAT215
 */

export function parseTourneeListing(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const parsed = parseTourneeLine(line);
    if (parsed && parsed.nom_client) {
      results.push({
        ...parsed,
        ordre: results.length + 1,
      });
    }
  }

  return results;
}

export function parseTourneeLine(line) {
  if (!line || !line.trim()) return null;

  // 1. Découpage par tabulation prioritaire (copier-coller de tableau Excel / Web)
  if (line.includes("\t")) {
    const parts = line.split("\t").map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const nom = parts[0].replace(/\s+/g, " ");
      const ligne = parts[1] || "";
      const mobile = parts[2] || "";
      const offre = parts[3] || "FTTH";
      const msanFatRaw = parts.slice(4).join(" ");
      const { msan, fat_ref } = extractMsanAndFat(msanFatRaw);

      return {
        nom_client: nom,
        telephone_ligne: cleanPhone(ligne),
        mobile: cleanPhone(mobile),
        offre_souscrite: offre || "FTTH",
        msan,
        fat_ref,
      };
    }
  }

  // 2. Découpage intelligent par colonnes multiples espaces (si les tabs ont été converties en espaces)
  const multiSpaceParts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (multiSpaceParts.length >= 3) {
    const nom = multiSpaceParts[0].replace(/\s+/g, " ");
    const ligne = multiSpaceParts[1] || "";
    const mobile = multiSpaceParts[2] || "";
    const offre = multiSpaceParts[3] || "FTTH";
    const msanFatRaw = multiSpaceParts.slice(4).join(" ") || multiSpaceParts[3] || "";
    const { msan, fat_ref } = extractMsanAndFat(msanFatRaw);

    return {
      nom_client: nom,
      telephone_ligne: cleanPhone(ligne),
      mobile: cleanPhone(mobile),
      offre_souscrite: /ftth/i.test(offre) ? "FTTH" : offre,
      msan,
      fat_ref,
    };
  }

  // 3. Fallback regex intelligent (repérage des numéros de téléphone)
  const phonePattern = /\b(01\d{8}(?:\s*\/\s*\d{8,10})?|\d{8,10}(?:\s*\/\s*\d{8,10})?)\b/g;
  const phones = [];
  let m;
  while ((m = phonePattern.exec(line)) !== null) {
    phones.push({ value: m[1].replace(/\s+/g, ""), index: m.index, end: m.index + m[0].length });
  }

  if (phones.length >= 1) {
    const firstPhone = phones[0];
    const nom = line.slice(0, firstPhone.index).trim().replace(/\s+/g, " ");
    const ligne = firstPhone.value;
    const mobile = phones[1] ? phones[1].value : "";
    const remainingStartIndex = phones[phones.length - 1].end;
    const rest = line.slice(remainingStartIndex).trim();
    const { msan, fat_ref, offre } = extractMsanAndFat(rest);

    return {
      nom_client: nom || "Client Tournée",
      telephone_ligne: cleanPhone(ligne),
      mobile: cleanPhone(mobile),
      offre_souscrite: offre || "FTTH",
      msan,
      fat_ref,
    };
  }

  // 4. Si la ligne ne contient qu'un nom
  return {
    nom_client: line.trim().replace(/\s+/g, " "),
    telephone_ligne: "",
    mobile: "",
    offre_souscrite: "FTTH",
    msan: "",
    fat_ref: "",
  };
}

function cleanPhone(str) {
  if (!str) return "";
  return str.trim().replace(/\s+/g, "");
}

function extractMsanAndFat(str) {
  if (!str) return { msan: "", fat_ref: "", offre: "FTTH" };
  const s = str.trim();

  let offre = "FTTH";
  if (/ftth/i.test(s)) offre = "FTTH";
  else if (/fibre\s*pro/i.test(s)) offre = "Fibre Pro";

  // MSAN : ex SEM-PL02, SEM-PL165, SEM-PL151, CO-MS01...
  const msanMatch = s.match(/\b([A-Z0-9]{2,10}-[A-Z0-9]{2,10})\b/i);
  const msan = msanMatch ? msanMatch[1].toUpperCase() : "";

  // FAT : ex FAT103, FAT 103, FAT23, FAT47, FAT215...
  const fatMatch = s.match(/\bFAT\s*(\d+)\b/i);
  let fat_ref = "";
  if (fatMatch) {
    fat_ref = `FAT${fatMatch[1]}`;
  } else {
    const numEndMatch = s.match(/\b(\d{1,4})\b$/);
    if (numEndMatch) fat_ref = `FAT${numEndMatch[1]}`;
  }

  return { msan, fat_ref, offre };
}
