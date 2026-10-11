<?php

namespace App\Http\Middleware;

use App\Models\Entreprise;
use App\Support\Tenant\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Contrôle central de l'état d'abonnement à chaque requête (§9) :
 * en lecture seule ou suspendu, toute écriture est refusée.
 */
class AbonnementMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $entrepriseId = Tenant::entrepriseId();
        if ($entrepriseId === null) {
            return $next($request); // pas de tenant = route publique ou super-admin
        }

        $entreprise = Entreprise::find($entrepriseId);
        if (!$entreprise || in_array($entreprise->etat_abonnement, ['suspendu'], true)) {
            return response()->json(['error' => 'Abonnement suspendu'], 403);
        }

        if ($entreprise->etat_abonnement === 'lecture_seule'
            && !in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return response()->json(['error' => 'Abonnement en lecture seule'], 403);
        }

        return $next($request);
    }
}
