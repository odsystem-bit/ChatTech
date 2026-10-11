<?php

namespace Tests;

use App\Models\AuthToken;
use App\Models\Compte;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    /**
     * Crée un jeton d'accès valide pour un compte (90 j).
     * Renvoie le jeton en clair — seul le hash est stocké.
     */
    protected function creerToken(Compte $compte): string
    {
        $plain = Str::random(64);
        AuthToken::create([
            'compte_id' => $compte->id,
            'token_hash' => hash('sha256', $plain),
            'expires_at' => now()->addDays(1),
        ]);
        return $plain;
    }
}
