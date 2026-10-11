<?php

use App\Models\AuthToken;
use App\Models\Entreprise;
use App\Models\Erreur;
use Illuminate\Support\Facades\Schedule;

// Jetons expirés/révoqués purgés chaque nuit — la table ne gonfle pas.
Schedule::call(fn () => AuthToken::where('expires_at', '<', now()->subDay())
    ->delete())->daily()->name('purge-jetons')->withoutOverlapping();

// §5 : contrôle journal vs soldes cache, une fois par jour par tenant.
// Un écart est journalisé dans `erreurs` — jamais silencieux.
Schedule::call(function () {
    $service = app(\App\Services\StockService::class);
    foreach (Entreprise::pluck('id') as $entrepriseId) {
        foreach ($service->verifierCoherence($entrepriseId) as $ecart) {
            Erreur::create([
                'empreinte' => hash('sha256', "stock|{$ecart['article_id']}|{$ecart['proprietaire']}"),
                'source' => 'api',
                'fichier' => 'StockService::verifierCoherence',
                'message' => "Écart stock article {$ecart['article_id']} "
                    . "{$ecart['proprietaire']} : journal={$ecart['journal']} cache={$ecart['cache']}",
                'entreprise_id' => $entrepriseId,
                'premiere_fois' => now(),
                'derniere_fois' => now(),
            ]);
        }
    }
})->daily()->name('coherence-stock')->withoutOverlapping();
