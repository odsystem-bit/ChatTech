<?php

namespace App\Http\Middleware;

use App\Services\EpiService;
use App\Support\Tenant\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloque le travail terrain d'une équipe tant que son EPI n'est pas
 * accepté (423 Locked). Ne concerne que chef et technicien, et seulement
 * si l'entreprise a activé l'EPI. À mettre APRÈS 'tenant'.
 * L'APK doit traiter 423 comme « à renvoyer plus tard » : sa file locale
 * garde les opérations et les envoie dès que l'équipe est débloquée.
 */
class ExigeEpiMiddleware
{
    public function __construct(private EpiService $epi)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $compte = Tenant::compte();

        if ($compte && in_array($compte->role, ['chef', 'technicien'], true) && $compte->equipe_id) {
            $statut = $this->epi->statut($compte->entreprise_id, $compte->equipe_id);
            if (!$statut['debloque']) {
                return response()->json([
                    'error' => 'epi_requis',
                    'raison' => $statut['raison'],
                    'message' => "Photo EPI requise : l'équipe est bloquée ({$statut['raison']}).",
                ], 423);
            }
        }

        return $next($request);
    }
}
