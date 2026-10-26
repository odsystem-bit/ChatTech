<?php

namespace App\Models;

use App\Support\Tenant\TenantModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Intervention extends TenantModel
{
    use SoftDeletes;

    public $incrementing = false;
    protected $keyType = 'string'; // UUID généré par l'app (§7)

    // Whitelist des champs modifiables via une opération set_champ (§16.2).
    // Tout champ hors liste est refusé — aucune écriture arbitraire.
    // NB : `statut` est volontairement ABSENT — il passe par l'op
    // `change_statut` qui déclenche la déduction de stock (§5).
    public const CHAMPS_EDITABLES = [
        // Client / rendez-vous
        'client_nom', 'client_tel', 'mobile', 'adresse', 'date', 'notes',
        // Technique ligne
        'etat', 'msan', 'fat_ref', 'port', 'ports_disponibles',
        'port_disponible', 'type_cable', 'depart_m', 'arrivee_m',
        'lineaire_m', 'puissance_fat_dbm', 'puissance_pto_dbm',
        'mac', 'sn', 'nb_poteaux_traverses', 'nb_poteaux_implantes',
        'nb_poteaux_armes',
        // Équipement posé
        'ont_sn', 'pto_qte', 'repeteur_wifi_qte', 'emplacement_ont',
        'client_confirme_emplacement', 'offre_souscrite',
        'remise_equipement_ok', 'materiel_pose',
        // Satisfaction
        'appreciation_satisfaction_libre', 'travaux_conformes',
        'emplacement_valide', 'travail_propre', 'service_teste',
        'service_fonctionne', 'explications_donnees', 'recommanderait',
        'accepte_recontact', 'qualite', 'delais', 'professionnalisme',
        'nom_client_declaration',
        // Signatures (uuid de la photo type 'signature')
        'signature_client', 'signature_technicien',
    ];

    protected $fillable = [
        'id', 'entreprise_id', 'ville_id', 'equipe_id', 'cree_par', 'chef_nom',
        'client_nom', 'client_tel', 'mobile', 'adresse', 'statut', 'statut_distribution',
        'date', 'date_dossier', 'notes', 'motif_non_traite', 'dispatche_par', 'dispatche_le',
        'etat', 'msan', 'fat_ref', 'port',
        'ports_disponibles', 'port_disponible', 'type_cable',
        'depart_m', 'arrivee_m', 'lineaire_m', 'puissance_fat_dbm',
        'puissance_pto_dbm', 'mac', 'sn', 'nb_poteaux_traverses',
        'nb_poteaux_implantes', 'nb_poteaux_armes', 'ont_sn', 'pto_qte',
        'repeteur_wifi_qte', 'emplacement_ont', 'client_confirme_emplacement',
        'offre_souscrite', 'remise_equipement_ok', 'materiel_pose',
        'appreciation_satisfaction_libre', 'travaux_conformes',
        'emplacement_valide', 'travail_propre', 'service_teste',
        'service_fonctionne', 'explications_donnees', 'recommanderait',
        'accepte_recontact', 'qualite', 'delais', 'professionnalisme',
        'nom_client_declaration', 'signature_client', 'signature_technicien',
        'revision', 'materiel_deduit', 'modifie_par',
    ];

    protected $casts = [
        'date' => 'datetime',
        'date_dossier' => 'date',
        'dispatche_le' => 'datetime',
        'materiel_deduit' => 'boolean',
        'materiel_pose' => 'array',
        'revision' => 'integer',
        'client_confirme_emplacement' => 'boolean',
        'remise_equipement_ok' => 'boolean',
        'travaux_conformes' => 'boolean',
        'emplacement_valide' => 'boolean',
        'travail_propre' => 'boolean',
        'service_teste' => 'boolean',
        'service_fonctionne' => 'boolean',
        'explications_donnees' => 'boolean',
        'recommanderait' => 'boolean',
        'accepte_recontact' => 'boolean',
        'depart_m' => 'float', 'arrivee_m' => 'float', 'lineaire_m' => 'float',
        'puissance_fat_dbm' => 'float', 'puissance_pto_dbm' => 'float',
        'ports_disponibles' => 'integer', 'port_disponible' => 'integer',
        'nb_poteaux_traverses' => 'integer', 'nb_poteaux_implantes' => 'integer',
        'nb_poteaux_armes' => 'integer', 'pto_qte' => 'integer',
        'repeteur_wifi_qte' => 'integer',
        'qualite' => 'integer', 'delais' => 'integer',
        'professionnalisme' => 'integer',
    ];

    public function ville()
    {
        return $this->belongsTo(Ville::class);
    }

    public function equipe()
    {
        return $this->belongsTo(Equipe::class);
    }

    public function dispatchePar()
    {
        return $this->belongsTo(Compte::class, 'dispatche_par');
    }

    public function pointsGps()
    {
        return $this->hasMany(PointGps::class);
    }

    public function photos()
    {
        return $this->hasMany(Photo::class);
    }

    public function scopeDuJour($query, ?string $date = null)
    {
        $d = $date ?: now()->toDateString();
        return $query->whereDate('date_dossier', $d);
    }

    public function scopeADispatcher($query)
    {
        return $query->where('statut_distribution', 'a_dispatcher');
    }

    public function scopePourVille($query, ?int $villeId)
    {
        if ($villeId) {
            return $query->where('ville_id', $villeId);
        }
        return $query;
    }

    public function scopeAnterieursNonClotures($query, ?string $date = null)
    {
        $d = $date ?: now()->toDateString();
        return $query->whereDate('date_dossier', '<', $d)
            ->whereNotIn('statut_distribution', ['termine']);
    }

    /**
     * Compare-and-swap §16.3 : incrémente la révision SEULEMENT si la
     * révision attendue correspond. Retourne false en cas de conflit —
     * le client devra refaire un pull de delta puis rejouer ses ops.
     */
    public function bumpRevision(int $expectedRevision, ?int $par = null): bool
    {
        $affected = static::where('id', $this->id)
            ->where('revision', $expectedRevision)
            ->update([
                'revision' => $expectedRevision + 1,
                'modifie_par' => $par,
            ]);
        if ($affected > 0) {
            $this->revision = $expectedRevision + 1;
            $this->modifie_par = $par;
            return true;
        }
        return false;
    }
}
