<?php

namespace App\Models;

use App\Support\Tenant\Tenant;
use Illuminate\Database\Eloquent\Model;

/**
 * Journal d'audit §13 : une ligne par action sensible (connexion,
 * création/suppression en console, changement d'abonnement).
 * Jamais de update — append-only comme mouvements_stock.
 */
class AuditLog extends Model
{
    public const UPDATED_AT = null;
    protected $table = 'audit_log';

    protected $fillable = [
        'entreprise_id', 'compte_id', 'action',
        'cible_type', 'cible_id', 'details', 'ip',
    ];

    protected $casts = ['details' => 'array'];

    /**
     * Écrit une entrée. $entrepriseId explicite pour les actions
     * super-admin qui ciblent un AUTRE tenant que le leur.
     */
    public static function ecrire(
        string $action,
        ?string $cibleType = null,
        string|int|null $cibleId = null,
        array $details = [],
        ?int $entrepriseId = null,
    ): void {
        static::create([
            'entreprise_id' => $entrepriseId ?? Tenant::entrepriseId(),
            'compte_id' => Tenant::compte()?->id,
            'action' => $action,
            'cible_type' => $cibleType,
            'cible_id' => $cibleId === null ? null : (string) $cibleId,
            'details' => $details,
            'ip' => request()->ip(),
        ]);
    }
}
