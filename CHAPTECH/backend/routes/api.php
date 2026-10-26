<?php

use App\Http\Controllers\Api\V1\AbonnementsController;
use App\Http\Controllers\Api\V1\AlertesStockController;
use App\Http\Controllers\Api\V1\ArticlesController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ComptesController;
use App\Http\Controllers\Api\V1\DispatchingController;
use App\Http\Controllers\Api\V1\DossiersController;
use App\Http\Controllers\Api\V1\EntreprisesController;
use App\Http\Controllers\Api\V1\EpiController;
use App\Http\Controllers\Api\V1\EquipesController;
use App\Http\Controllers\Api\V1\ErreursController;
use App\Http\Controllers\Api\V1\InterventionsController;
use App\Http\Controllers\Api\V1\MediaController;
use App\Http\Controllers\Api\V1\MessagerieController;
use App\Http\Controllers\Api\V1\PoteauxController;
use App\Http\Controllers\Api\V1\StockController;
use App\Http\Controllers\Api\V1\SyncController;
use App\Http\Controllers\Api\V1\VillesController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 CHAPTECH — voir ARCHITECTURE.md §17.3
| L'ancien index.php (FibreTrack) reste vivant pendant la transition.
|--------------------------------------------------------------------------
*/

Route::prefix('v1')->group(function () {
    // Public
    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:5,1'); // anti force-brute §4
    Route::post('auth/plateforme/login', [AuthController::class, 'loginPlateforme'])
        ->middleware('throttle:5,1');

    // Authentifié + tenant résolu + abonnement vérifié
    Route::middleware(['tenant', 'abonnement'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);

        // Sync terrain §16 — le cœur
        Route::post('interventions/{id}/ops', [SyncController::class, 'ops'])->middleware('epi');
        Route::get('interventions/{id}/changes', [SyncController::class, 'changes']);

        // Interventions
        Route::get('interventions', [InterventionsController::class, 'index']);
        Route::post('interventions', [InterventionsController::class, 'store'])->middleware('epi');
        Route::get('interventions/{id}', [InterventionsController::class, 'show']);

        // Médias : upload + téléchargement contrôlé §6.3
        Route::post('media', [MediaController::class, 'store'])->middleware('epi');
        Route::get('media/{id}', [MediaController::class, 'show']);

        // Journal interne §14 — remontée des plantages clients
        Route::post('errors', [ErreursController::class, 'store']);

        // Stock §5 — journal idempotent + soldes
        Route::get('stock', [StockController::class, 'index']);
        Route::get('stock/alertes', [AlertesStockController::class, 'index']);
        Route::post('stock/mouvements', [StockController::class, 'mouvement']);
        Route::post('stock/import', [StockController::class, 'import'])
            ->middleware('role:admin,gestionnaire');

        // Photo EPI du matin : statut/envoi pour l'équipe, décision pour la conformité
        Route::get('epi/statut', [EpiController::class, 'statut']);
        Route::post('epi', [EpiController::class, 'envoyer'])->middleware('role:chef,technicien');
        Route::get('epi/jour', [EpiController::class, 'jour'])->middleware('role:admin,conformite');
        Route::post('epi/delegations', [EpiController::class, 'deleguer'])->middleware('role:admin,conformite,chef');
        Route::post('epi/{id}/decision', [EpiController::class, 'decision'])->middleware('role:admin,conformite');
        Route::get('epi/{id}/photo', [EpiController::class, 'photo'])->middleware('role:admin,conformite,chef');

        // Conformité terrain §3 (poteaux...) — toute l'entreprise, jamais le chef
        Route::middleware('role:admin,conformite')->group(function () {
            Route::get('poteaux', [PoteauxController::class, 'index']);
            Route::get('poteaux/export', [PoteauxController::class, 'export']);
        });

        // Catalogue articles — lecture tous, écriture console
        Route::get('articles', [ArticlesController::class, 'index']);
        Route::middleware('role:admin,gestionnaire')->group(function () {
            Route::post('articles', [ArticlesController::class, 'store']);
            Route::put('articles/{id}', [ArticlesController::class, 'update']);
            Route::delete('articles/{id}', [ArticlesController::class, 'destroy']);
        });

        // Villes — lecture pour tous les rôles du tenant, gestion par l'admin (§2 PLAN.md)
        Route::get('villes', [VillesController::class, 'index']);
        Route::middleware('role:admin')->group(function () {
            Route::post('villes', [VillesController::class, 'store']);
            Route::put('villes/{id}', [VillesController::class, 'update']);
            Route::delete('villes/{id}', [VillesController::class, 'destroy']);
        });

        // Dossiers du jour (Coordonnateur & Admin) §6 bis
        Route::middleware('role:admin,coordonnateur,superviseur,conformite')->group(function () {
            Route::get('dossiers/du-jour', [DossiersController::class, 'duJour']);
        });
        Route::middleware('role:admin,coordonnateur')->group(function () {
            Route::post('dossiers', [DossiersController::class, 'store']);
            Route::put('dossiers/{id}', [DossiersController::class, 'update']);
            Route::delete('dossiers/{id}', [DossiersController::class, 'destroy']);
        });

        // Dispatching (Superviseur & Admin) §6 bis
        Route::middleware('role:admin,superviseur')->group(function () {
            Route::get('dispatching', [DispatchingController::class, 'index']);
            Route::post('dispatching/{id}/assigner', [DispatchingController::class, 'assigner']);
            Route::post('dispatching/{id}/reassigner', [DispatchingController::class, 'reassigner']);
            Route::post('dispatching/{id}/declarer-non-traite', [DispatchingController::class, 'declarerNonTraite']);
        });

        // Messagerie collaborative interne ChatTech (§6 ter) — accessible à TOUS les acteurs de l'entreprise
        Route::get('messagerie/conversations', [MessagerieController::class, 'index']);
        Route::post('messagerie/conversations/directe', [MessagerieController::class, 'ouvrirDiscussionDirecte']);
        Route::get('messagerie/conversations/{id}/messages', [MessagerieController::class, 'messages']);
        Route::post('messagerie/conversations/{id}/messages', [MessagerieController::class, 'envoyerMessage']);
        Route::delete('messagerie/messages/{id}', [MessagerieController::class, 'supprimerMessage']);

        // Console admin — gestion du tenant (§17.3)
        Route::middleware('role:admin')->group(function () {
            Route::apiResource('equipes', EquipesController::class)
                ->only(['index', 'store', 'update', 'destroy']);
            Route::apiResource('comptes', ComptesController::class)
                ->only(['index', 'store', 'update', 'destroy']);
        });

        // Console super-admin plateforme (§17.3)
        Route::middleware('role:super_admin')->group(function () {
            Route::apiResource('entreprises', EntreprisesController::class)
                ->only(['index', 'store', 'show', 'update', 'destroy']);
            Route::get('abonnements', [AbonnementsController::class, 'index']);
            Route::put('abonnements/{id}', [AbonnementsController::class, 'update']);
        });
    });
});
