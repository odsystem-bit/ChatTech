<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Equipe;
use App\Models\Intervention;
use App\Models\Ville;
use App\Support\Tenant\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DispatchingController extends Controller
{
    /**
     * GET /api/v1/dispatching — tableau de bord de dispatching du jour et reliquats.
     * Accessible par superviseur et admin.
     */
    public function index(Request $request)
    {
        $compte = Tenant::compte();
        $date = $request->query('date', now()->toDateString());
        $villeId = $request->query('ville_id');

        // Isolation par ville (§2, §3 PLAN.md)
        if ($compte->isDeVille()) {
            $villeId = $compte->ville_id;
        }

        // Dossiers du jour
        $dossiersQuery = Intervention::with([
            'ville:id,nom,code',
            'equipe:id,nom,chef_compte_id',
            'equipe.chef:id,nom',
            'dispatchePar:id,nom',
        ])
        ->whereDate('date_dossier', $date);

        if ($villeId) {
            $dossiersQuery->where('ville_id', $villeId);
        }

        $tousDossiers = $dossiersQuery->get();
        $aDispatcher = $tousDossiers->where('statut_distribution', 'a_dispatcher')->values();
        $dispatches = $tousDossiers->where('statut_distribution', '!=', 'a_dispatcher')->values();

        // Équipes disponibles de la ville (ou toutes si de base)
        $equipesQuery = Equipe::with('chef:id,nom')
            ->where('actif', true);

        if ($villeId) {
            $equipesQuery->where('ville_id', $villeId);
        }

        $equipes = $equipesQuery->get()->map(function ($eq) use ($date) {
            $charge = Intervention::where('equipe_id', $eq->id)
                ->whereDate('date_dossier', $date)
                ->where('statut_distribution', '!=', 'non_traite')
                ->count();

            return [
                'id' => $eq->id,
                'nom' => $eq->nom,
                'ville_id' => $eq->ville_id,
                'chef' => $eq->chef ? ['id' => $eq->chef->id, 'nom' => $eq->chef->nom] : null,
                'charge_jour' => $charge,
            ];
        });

        // Dossiers antérieurs non terminés (Bascule automatique §6 bis)
        $anterieursQuery = Intervention::with([
            'ville:id,nom,code',
            'equipe:id,nom',
            'equipe.chef:id,nom',
        ])
        ->whereDate('date_dossier', '<', $date)
        ->whereNotIn('statut_distribution', ['termine'])
        ->orderBy('date_dossier', 'desc');

        if ($villeId) {
            $anterieursQuery->where('ville_id', $villeId);
        }

        $anterieurs = $anterieursQuery->get();

        return response()->json([
            'date' => $date,
            'ville_id' => $villeId ? (int) $villeId : null,
            'a_dispatcher' => $aDispatcher,
            'dispatches' => $dispatches,
            'equipes' => $equipes,
            'anterieurs_non_termines' => $anterieurs,
            'totaux' => [
                'a_dispatcher' => $aDispatcher->count(),
                'dispatches' => $dispatches->count(),
                'anterieurs' => $anterieurs->count(),
            ],
        ]);
    }

    /**
     * POST /api/v1/dispatching/{id}/assigner — affecte un dossier du jour à une équipe en 1 clic.
     */
    public function assigner(Request $request, string $id)
    {
        $compte = Tenant::compte();
        $dossier = Intervention::findOrFail($id);

        // Vérification droit sur la ville du dossier
        if (!$compte->peutAgirSurVille($dossier->ville_id)) {
            return response()->json(['error' => 'Dossier hors de votre ville d\'affectation'], 403);
        }

        $data = $request->validate([
            'equipe_id' => [
                'required', 'integer',
                Rule::exists('equipes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
        ]);

        $equipe = Equipe::with('chef')->findOrFail($data['equipe_id']);

        // Règle stricte d'étanchéité par ville (§6 bis) :
        // Un dossier d'une ville ne peut JAMAIS être confié à une équipe d'une autre ville.
        if ($dossier->ville_id && $equipe->ville_id && (int) $dossier->ville_id !== (int) $equipe->ville_id) {
            return response()->json([
                'error' => "L'équipe {$equipe->nom} n'appartient pas à la même ville que le dossier.",
            ], 422);
        }

        $dossier->update([
            'equipe_id' => $equipe->id,
            'chef_nom' => $equipe->chef?->nom,
            'statut_distribution' => 'dispatche',
            'dispatche_par' => $compte->id,
            'dispatche_le' => now(),
        ]);

        AuditLog::ecrire('dispatching_dossier', 'intervention', $dossier->id, [
            'equipe' => $equipe->nom,
            'client' => $dossier->client_nom,
            'superviseur' => $compte->nom,
        ]);

        return response()->json($dossier->load('equipe:id,nom', 'equipe.chef:id,nom', 'ville:id,nom'));
    }

    /**
     * POST /api/v1/dispatching/{id}/reassigner — réaffecte un dossier (notamment antérieur non traité).
     */
    public function reassigner(Request $request, string $id)
    {
        $compte = Tenant::compte();
        $dossier = Intervention::findOrFail($id);

        if (!$compte->peutAgirSurVille($dossier->ville_id)) {
            return response()->json(['error' => 'Dossier hors de votre ville d\'affectation'], 403);
        }

        $data = $request->validate([
            'equipe_id' => [
                'required', 'integer',
                Rule::exists('equipes', 'id')->where('entreprise_id', Tenant::entrepriseId()),
            ],
            'reprogrammer_aujourdhui' => 'sometimes|boolean',
        ]);

        $equipe = Equipe::with('chef')->findOrFail($data['equipe_id']);

        if ($dossier->ville_id && $equipe->ville_id && (int) $dossier->ville_id !== (int) $equipe->ville_id) {
            return response()->json([
                'error' => "L'équipe {$equipe->nom} n'appartient pas à la même ville que le dossier.",
            ], 422);
        }

        $champs = [
            'equipe_id' => $equipe->id,
            'chef_nom' => $equipe->chef?->nom,
            'statut_distribution' => 'dispatche',
            'dispatche_par' => $compte->id,
            'dispatche_le' => now(),
        ];

        // Si le dossier venait d'une date passée et qu'on le reprogramme pour aujourd'hui
        if (!empty($data['reprogrammer_aujourdhui'])) {
            $champs['date_dossier'] = now()->toDateString();
        }

        $dossier->update($champs);

        AuditLog::ecrire('reassignation_dossier', 'intervention', $dossier->id, [
            'nouvelle_equipe' => $equipe->nom,
            'superviseur' => $compte->nom,
        ]);

        return response()->json($dossier->load('equipe:id,nom', 'equipe.chef:id,nom', 'ville:id,nom'));
    }

    /**
     * POST /api/v1/dispatching/{id}/declarer-non-traite — classe une intervention comme non traitée (0 stock).
     */
    public function declarerNonTraite(Request $request, string $id)
    {
        $compte = Tenant::compte();
        $dossier = Intervention::findOrFail($id);

        if (!$compte->peutAgirSurVille($dossier->ville_id)) {
            return response()->json(['error' => 'Dossier hors de votre ville d\'affectation'], 403);
        }

        $data = $request->validate([
            'motif' => 'required|string|max:1000',
        ]);

        $dossier->update([
            'statut_distribution' => 'non_traite',
            'motif_non_traite' => trim($data['motif']),
            'materiel_deduit' => false, // Aucun matériel déduit
        ]);

        AuditLog::ecrire('dossier_non_traite', 'intervention', $dossier->id, [
            'motif' => $data['motif'],
            'auteur' => $compte->nom,
        ]);

        return response()->json($dossier);
    }
}
