<?php

namespace App\Support\Tenant;

use App\Models\Compte;

/**
 * Résout le tenant courant depuis le compte authentifié.
 * L'entreprise vient toujours du jeton en base (§2.1), jamais de la requête.
 */
class Tenant
{
    private static ?int $entrepriseId = null;
    private static ?Compte $compte = null;

    public static function setCompte(?Compte $compte): void
    {
        self::$compte = $compte;
        self::$entrepriseId = $compte?->entreprise_id;
    }

    public static function compte(): ?Compte
    {
        return self::$compte;
    }

    public static function entrepriseId(): ?int
    {
        return self::$entrepriseId;
    }
}
