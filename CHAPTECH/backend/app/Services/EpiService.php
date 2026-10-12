<?php

namespace App\Services;

use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\EpiDelegation;
use App\Models\EpiJournalier;
use Illuminate\Support\Carbon;

/**
 * Photo EPI du matin : l'équipe n'accède à l'APK que si elle est débloquée.
 *  - validée par la conformité : débloquée ;
 *  - sans décision après 30 min : débloquée d'elle-même ;
 *  - rejetée (motif obligatoire) : bloquée, la conformité peut aussi
 *    révoquer plus tard une photo déjà acceptée ;
 *  - jamais débloquée hors de la fenêtre 06h00-23h00 (heure locale).
 * Ne s'applique que si l'entreprise a activé `epi_obligatoire`.
 */
class EpiService
{
    public const FUSEAU = 'Africa/Porto-Novo';
    public const HEURE_DEBUT = 6;
    public const HEURE_FIN = 23;
    public const DELAI_AUTO_MINUTES = 30;
    public const ALERTE_HEURE = 8;
    public const ALERTE_MINUTE = 30;

    public function maintenant(): Carbon
    {
        return now(self::FUSEAU);
    }

    public function aujourdhui(): string
    {
        return $this->maintenant()->toDateString();
    }

    /** Vrai à partir de 08h30 locale : une équipe sans photo ni délégation est à signaler. */
    public function alerteActive(): bool
    {
        $n = $this->maintenant();
        return $n >= $n->copy()->setTime(self::ALERTE_HEURE, self::ALERTE_MINUTE);
    }

    public function photoDuJour(int $entrepriseId, int $equipeId): ?EpiJournalier
    {
        return EpiJournalier::withoutGlobalScopes()
            ->where('entreprise_id', $entrepriseId)
            ->where('equipe_id', $equipeId)
            ->whereDate('date', $this->aujourdhui())
            ->first();
    }

    /** L'équipe peut-elle travailler maintenant ? */
    public function statut(int $entrepriseId, int $equipeId, ?EpiJournalier $epi = null, ?Entreprise $entreprise = null): array
    {
        $entreprise ??= Entreprise::find($entrepriseId);
        $epi ??= $this->photoDuJour($entrepriseId, $equipeId);

        $base = [
            'fenetre' => ['debut' => '06:00', 'fin' => '23:00'],
            'epi' => $epi ? [
                'id' => $epi->id,
                'statut' => $epi->statut,
                'motif' => $epi->motif,
                'envoye_le' => $epi->envoye_le,
            ] : null,
            'auto_a' => null,
        ];

        if (!$entreprise?->epi_obligatoire) {
            return $base + ['debloque' => true, 'raison' => 'non_requis'];
        }

        $n = $this->maintenant();
        $dansFenetre = $n >= $n->copy()->setTime(self::HEURE_DEBUT, 0)
            && $n < $n->copy()->setTime(self::HEURE_FIN, 0);
        if (!$dansFenetre) {
            return $base + ['debloque' => false, 'raison' => 'hors_horaires'];
        }

        if (!$epi) {
            return $base + ['debloque' => false, 'raison' => 'photo_manquante'];
        }
        if ($epi->statut === 'valide') {
            return $base + ['debloque' => true, 'raison' => 'valide'];
        }
        if ($epi->statut === 'rejete') {
            return $base + ['debloque' => false, 'raison' => 'rejete'];
        }

        $autoA = $epi->envoye_le->copy()->addMinutes(self::DELAI_AUTO_MINUTES);
        $base['auto_a'] = $autoA;
        return now() >= $autoA
            ? $base + ['debloque' => true, 'raison' => 'auto']
            : $base + ['debloque' => false, 'raison' => 'en_attente'];
    }

    /** Le chef de l'équipe, ou un technicien délégué pour ce jour. */
    public function peutEnvoyer(Compte $compte, ?string $date = null): bool
    {
        if (!$compte->equipe_id) {
            return false;
        }
        if ($compte->role === 'chef') {
            return true;
        }
        if ($compte->role !== 'technicien') {
            return false;
        }

        return EpiDelegation::withoutGlobalScopes()
            ->where('entreprise_id', $compte->entreprise_id)
            ->where('equipe_id', $compte->equipe_id)
            ->where('compte_id', $compte->id)
            ->whereDate('date', $date ?? $this->aujourdhui())
            ->exists();
    }
}
