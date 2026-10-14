/**
 * Logique de calcul dynamique des ports disponibles pour FAT (8 ports).
 * Dès qu'un numéro de port accordé est renseigné (1 à 8),
 * tous les ports situés après ce numéro sont automatiquement sélectionnés comme disponibles.
 * Les ports précédant ou correspondant au port accordé sont considérés comme déjà utilisés.
 */

export const TOTAL_FAT_PORTS = 8;
export const ALL_FAT_PORTS = Array.from({ length: TOTAL_FAT_PORTS }, (_, index) => `Port ${index + 1}`);

/**
 * Extrait le numéro entier de port accordé depuis une valeur brute (ex: "3", "Port 3", "port 5", 4)
 * @param {string|number} rawPort
 * @returns {number|null} Le numéro entre 1 et 8, ou null si non valide
 */
export function extractPortNumber(rawPort) {
  if (rawPort === undefined || rawPort === null) return null;
  const str = String(rawPort).trim();
  if (!str) return null;

  // Chercher d'abord un chiffre isolé de 1 à 8 (ex: "Port 3" ou "3")
  const match = str.match(/\b([1-8])\b/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Repli : premier chiffre trouvé
  const digits = str.replace(/[^0-9]/g, "");
  if (digits) {
    const num = parseInt(digits, 10);
    if (num >= 1 && num <= TOTAL_FAT_PORTS) {
      return num;
    }
  }

  return null;
}

/**
 * Calcule dynamiquement la liste et la chaîne des ports disponibles à partir du port accordé.
 * Exemples :
 * - Port accordé 3 -> ["Port 4", "Port 5", "Port 6", "Port 7", "Port 8"] (5 ports)
 * - Port accordé 5 -> ["Port 6", "Port 7", "Port 8"] (3 ports)
 * - Port accordé 7 -> ["Port 8"] (1 port)
 * - Port accordé 8 -> [] (0 port)
 *
 * @param {string|number} portValue
 * @returns {{ portsList: string[], ports_disponibles: string, port_disponible: number }}
 */
export function computeAvailablePorts(portValue) {
  const portNum = extractPortNumber(portValue);

  if (portNum === null) {
    return {
      portsList: [],
      ports_disponibles: "",
      port_disponible: 0,
    };
  }

  const portsList = [];
  for (let p = portNum + 1; p <= TOTAL_FAT_PORTS; p++) {
    portsList.push(`Port ${p}`);
  }

  return {
    portsList,
    ports_disponibles: portsList.join(", "),
    port_disponible: portsList.length,
  };
}
