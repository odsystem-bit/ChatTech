<?php

namespace App\Http\Middleware;

use App\Support\Tenant\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Contrôle de rôle APRÈS TenantMiddleware — usage : ->middleware('role:admin,gestionnaire')
 */
class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $compte = Tenant::compte();

        if (!$compte || !in_array($compte->role, $roles, true)) {
            return response()->json(['error' => 'Accès refusé'], 403);
        }

        return $next($request);
    }
}
