/**
 * Association photo <-> catégorie CelPros (source de vérité unique).
 * Utilisée par l'écran d'intervention ET par l'envoi du rapport WhatsApp,
 * afin que la photo envoyée pour une catégorie soit toujours la bonne.
 */

function isAdditional(p) {
  return Boolean(
    p.additionnelle || p.is_additionnelle || p.exclude_celpros || p.slot === "additionnelle" || p.type === "additionnelle"
  );
}

function findLegacyByName(whatsappPhotos, regex) {
  return (
    whatsappPhotos.find((p) => p && !isAdditional(p) && p.name && regex.test(String(p.name).trim())) || null
  );
}

/**
 * Retourne la photo correspondant STRICTEMENT à une catégorie, ou null.
 * Jamais de repli flou : une catégorie vide reste vide.
 */
export function findPhotoForSlot(whatsappPhotos, pointsGps, slotKey) {
  if (!slotKey) return null;
  const photos = Array.isArray(whatsappPhotos) ? whatsappPhotos : [];
  const points = Array.isArray(pointsGps) ? pointsGps : [];

  const direct = photos.find((p) => p && !isAdditional(p) && (p.slot === slotKey || p.type === slotKey));
  if (direct) return direct;

  if (slotKey === "fat") {
    const fatPt = points.find((p) => p && String(p.type).trim().toUpperCase() === "FAT" && p.photo);
    if (fatPt) {
      return {
        id: `gps_fat_${fatPt.numero || 1}`,
        slot: "fat",
        type: "fat",
        label: "Boîtier FAT",
        url: fatPt.photo,
        lat: fatPt.lat,
        lng: fatPt.lng,
        precision_m: fatPt.precision_m,
        horodatage: fatPt.horodatage,
        lieu: fatPt.lieu,
        from_gps: true,
      };
    }
    return findLegacyByName(photos, /^(fat|boitier\s*fat)(\s*\d+)?$/i);
  }

  if (slotKey === "ont_sn") {
    const abonnePt = points.find((p) => {
      if (!p || !p.photo) return false;
      const t = String(p.type).trim().toUpperCase();
      return t === "ABONNÉ" || t === "ONT";
    });
    if (abonnePt) {
      return {
        id: `gps_abonne_${abonnePt.numero || 1}`,
        slot: "ont_sn",
        type: "ont_sn",
        label: "Photo numéro de série",
        url: abonnePt.photo,
        lat: abonnePt.lat,
        lng: abonnePt.lng,
        precision_m: abonnePt.precision_m,
        horodatage: abonnePt.horodatage,
        lieu: abonnePt.lieu,
        from_gps: true,
      };
    }
    return findLegacyByName(photos, /^(abonn[eé]|ont|box)(\s*\d+)?$/i);
  }

  if (slotKey === "scan_fat") {
    return findLegacyByName(photos, /^(image\s*scan\s*fat|scan\s*fat|code[- ]barres?\s*fat)(\s*\d+)?$/i);
  }

  return null;
}

/**
 * Liste ordonnée de TOUTES les photos terrain CelPros d'une intervention :
 * catégories (dans l'ordre CelPros) puis photos de chaque poteau.
 * Les photos additionnelles sont exclues. Chaque entrée : { key, label, url, photo }.
 */
export function collectCelprosPhotos(data, slotDefs = []) {
  const whatsappPhotos = data?.whatsapp_photos || [];
  const points = data?.points_gps || [];
  const result = [];
  const seenUrls = new Set();

  const push = (key, label, photo) => {
    const url = photo?.url || photo?.photo || "";
    if (!url || typeof url !== "string" || seenUrls.has(url)) return;
    seenUrls.add(url);
    result.push({ key, label, url, photo });
  };

  for (const slot of slotDefs) {
    if (slot.key === "autre_poteau") {
      const autres = whatsappPhotos.filter(
        (p) => p && !isAdditional(p) && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")
      );
      if (autres.length > 0) {
        autres.forEach((p, idx) => {
          push(
            autres.length > 1 ? `autre_poteau_${idx + 1}` : "autre_poteau",
            autres.length > 1 ? `Autre poteau (${idx + 1})` : "Autre poteau",
            p
          );
        });
        continue;
      }
    }
    if (slot.key === "contrat_client") {
      const contrats = whatsappPhotos.filter(
        (p) => p && !isAdditional(p) && (p.slot === "contrat_client" || p.slot?.startsWith("contrat_client") || p.type === "contrat_client")
      );
      if (contrats.length > 0) {
        contrats.forEach((p, idx) => {
          push(
            contrats.length > 1 ? `contrat_client_${idx + 1}` : "contrat_client",
            contrats.length > 1 ? `Photo contrat client (${idx + 1})` : "Photo contrat client",
            p
          );
        });
        continue;
      }
    }
    const photo = findPhotoForSlot(whatsappPhotos, points, slot.key);
    if (photo) push(slot.key, slot.label, photo);
  }

  const poleNums = new Set();
  points.forEach((p) => {
    if (p && p.type === "Poteau" && Number(p.numero) > 0) poleNums.add(Number(p.numero));
  });
  whatsappPhotos.forEach((wa) => {
    const m = wa?.slot?.match(/^poteau_(\d+)$/);
    if (m) poleNums.add(Number(m[1]));
  });
  const sortedNums = Array.from(poleNums).sort((a, b) => a - b);
  for (const num of sortedNums) {
    const pt = points.find((p) => p && p.type === "Poteau" && Number(p.numero) === num);
    const wa = whatsappPhotos.find((p) => p && p.slot === `poteau_${num}`);
    const url = wa?.url || pt?.photo || "";
    if (url) {
      push(`poteau_${num}`, `Poteau ${num}`, { ...(pt || {}), ...(wa || {}), url, photo: url, numero: num });
    }
  }

  return result;
}
