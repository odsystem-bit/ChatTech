import { formatDateFR } from "../lib/date.js";
import { getInterventionBadge, isInterventionTerminee } from "../lib/interventionFilters.js";

/**
 * Carte d'intervention compacte, professionnelle et responsive.
 * @param {{
 *   intervention: object,
 *   onOpen: (intv: object) => void,
 *   onDelete: (id: string, e: MouseEvent) => void,
 *   isOpening: boolean
 * }} props
 */
export default function InterventionCard({ intervention, onOpen, onDelete, isOpening }) {
  const badge = getInterventionBadge(intervention);
  const isDone = isInterventionTerminee(intervention);
  const shortId = (intervention.id || "").slice(0, 8).toUpperCase();
  const phone = intervention.mobile || intervention.telephone_ligne || "";
  const technician = (intervention.nom_technicien || "").trim();
  const rawClient = (intervention.nom_client || "").trim();
  const clientName = rawClient || (technician ? `Nouveau client (${technician})` : "Nouveau client");
  const zone = (intervention.adresse_zone || "").trim();
  const offer = (intervention.offre_souscrite || intervention.etat || "Raccordement").trim();

  return (
    <div className={`intv-card-wrapper ${isDone ? "is-done" : "is-progress"}`}>
      <div
        className="intv-card-main"
        role="button"
        tabIndex={0}
        onClick={() => { if (!isOpening) onOpen(intervention); }}
        onKeyDown={(e) => { if (!isOpening && (e.key === "Enter" || e.key === " ")) onOpen(intervention); }}
        aria-label={`Ouvrir l'intervention ${clientName}`}
      >
        <div className="intv-card-header">
          <div className="intv-card-title-group">
            <span className="intv-card-id">#{shortId}</span>
            <strong className="intv-card-client" title={clientName}>
              {clientName}
            </strong>
          </div>
          <span className={`badge badge-${badge.variant}`}>
            {isOpening ? "Ouverture…" : badge.label}
          </span>
        </div>

        <div className="intv-card-chips">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="intv-chip intv-chip-phone"
              title={`Appeler le client (${phone})`}
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>{phone}</span>
            </a>
          ) : null}

          {technician ? (
            <span className="intv-chip intv-chip-tech" title={`Technicien : ${technician}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{technician}</span>
            </span>
          ) : (
            <span className="intv-chip intv-chip-muted">
              <span>Non assigné</span>
            </span>
          )}

          {offer ? (
            <span className="intv-chip intv-chip-offer" title={`Type / Offre : ${offer}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <span>{offer}</span>
            </span>
          ) : null}
        </div>

        <div className="intv-card-footer">
          {zone ? (
            <span className="intv-card-loc" title={zone}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{zone}</span>
            </span>
          ) : (
            <span className="intv-card-loc-empty">Localisation non renseignée</span>
          )}

          <span className="intv-card-date">
            {isDone && intervention.modifie_le
              ? `Clôturée le ${formatDateFR(intervention.modifie_le)}`
              : `Créée le ${formatDateFR(intervention.date)}`}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="intv-card-delete-btn"
        onClick={(e) => onDelete(intervention.id, e)}
        title="Supprimer cette intervention"
        aria-label="Supprimer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
