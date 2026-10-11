<?php

namespace App\Http\Middleware;

use App\Models\AuthToken;
use App\Support\Tenant\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Résout le compte depuis le jeton Bearer, puis fixe le tenant (§2.1).
 * L'entreprise vient de la base via le jeton — jamais de la requête.
 * Sans jeton valide : 401, aucune donnée exposée.
 */
class TenantMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Ne jamais hériter du tenant d'une requête précédente (état
        // statique partagé : tests, workers Octane). On repart de zéro.
        Tenant::setCompte(null);

        $token = $request->bearerToken();
        if (!$token) {
            return response()->json(['error' => 'Non authentifié'], 401);
        }

        $authToken = AuthToken::where('token_hash', hash('sha256', $token))
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->first();

        if (!$authToken) {
            return response()->json(['error' => 'Session expirée ou révoquée'], 401);
        }

        $compte = $authToken->compte;
        if (!$compte || !$compte->actif) {
            return response()->json(['error' => 'Compte désactivé'], 403);
        }

        // Session glissante (§4) : on prolonge la date d'expiration
        $authToken->update(['expires_at' => now()->addDays(90)]);

        Tenant::setCompte($compte);
        $request->attributes->set('compte', $compte);

        return $next($request);
    }
}
