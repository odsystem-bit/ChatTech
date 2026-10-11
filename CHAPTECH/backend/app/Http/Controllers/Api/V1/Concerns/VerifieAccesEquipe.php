<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Models\Intervention;
use App\Support\Tenant\Tenant;

/**
 * Garde rôle métier §3 : chef/technicien n'agissent que sur
 * les interventions de LEUR équipe. admin/gestionnaire/super_admin
 * passent. Utilisé par tout endpoint qui touche une intervention.
 */
trait VerifieAccesEquipe
{
    private function assertAccesIntervention(Intervention $intervention): void
    {
        $compte = Tenant::compte();
        if (in_array($compte->role, ['chef', 'technicien'], true)
            && $intervention->equipe_id !== $compte->equipe_id) {
            abort(403, 'Intervention hors de votre équipe');
        }
    }
}
