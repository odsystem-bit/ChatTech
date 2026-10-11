<?php

use App\Http\Controllers\Api\V1\AbonnementsController;
use App\Http\Controllers\Api\V1\ArticlesController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ComptesController;
use App\Http\Controllers\Api\V1\EntreprisesController;
use App\Http\Controllers\Api\V1\EquipesController;
use App\Http\Controllers\Api\V1\ErreursController;
use App\Http\Controllers\Api\V1\InterventionsController;
use App\Http\Controllers\Api\V1\MediaController;
use App\Http\Controllers\Api\V1\PoteauxController;
use App\Http\Controllers\Api\V1\StockController;
use App\Http\Controllers\Api\V1\SyncController;
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
        Route::post('interventions/{id}/ops', [SyncController::class, 'ops']);
        Route::get('interventions/{id}/changes', [SyncController::class, 'changes']);

        // Interventions
        Route::get('interventions', [InterventionsController::class, 'index']);
        Route::post('interventions', [InterventionsController::class, 'store']);
        Route::get('interventions/{id}', [InterventionsController::class, 'show']);

        // Médias : upload + téléchargement contrôlé §6.3
        Route::post('media', [MediaController::class, 'store']);
        Route::get('media/{id}', [MediaController::class, 'show']);

        // Journal interne §14 — remontée des plantages clients
        Route::post('errors', [ErreursController::class, 'store']);

        // Stock §5 — journal idempotent + soldes
        Route::get('stock', [StockController::class, 'index']);
        Route::post('stock/mouvements', [StockController::class, 'mouvement']);
        Route::post('stock/import', [StockController::class, 'import'])
            ->middleware('role:admin,gestionnaire');

        // Suivi des poteaux §3 — chef : son équipe uniquement (filtre serveur)
        Route::middleware('role:admin,poteaux,chef')->group(function () {
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
