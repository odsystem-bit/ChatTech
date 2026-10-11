<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use Illuminate\Database\Seeder;

/**
 * Données de développement : une entreprise démo avec un admin,
 * une équipe avec chef + technicien, et quelques articles de stock.
 *
 * DEV UNIQUEMENT — la prod est seedée manuellement.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $entreprise = Entreprise::create([
            'nom' => 'Demo Telecom',
            'etat_abonnement' => 'actif',
            'fin_abonnement' => now()->addYear(),
            'limite_equipes' => 10,
        ]);

        Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id,
            'identifiant' => 'admin',
            'nom' => 'Admin Démo',
            'password_hash' => password_hash('admin123', PASSWORD_BCRYPT),
            'role' => 'admin',
            'actif' => true,
        ]);

        $chef = Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id,
            'identifiant' => 'chef1',
            'nom' => 'Chef Équipe 1',
            'password_hash' => password_hash('chef123', PASSWORD_BCRYPT),
            'role' => 'chef',
            'actif' => true,
        ]);

        $equipe = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id,
            'nom' => 'Équipe Démo 1',
            'chef_compte_id' => $chef->id,
            'actif' => true,
        ]);

        $chef->equipe_id = $equipe->id;
        $chef->save();

        Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id,
            'equipe_id' => $equipe->id,
            'identifiant' => 'tech1',
            'nom' => 'Technicien 1',
            'password_hash' => password_hash('tech123', PASSWORD_BCRYPT),
            'role' => 'technicien',
            'actif' => true,
        ]);

        // Deuxième entreprise pour tester l'isolation tenant (§2)
        $autre = Entreprise::create([
            'nom' => 'Autre SARL',
            'etat_abonnement' => 'essai',
        ]);
        Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $autre->id,
            'identifiant' => 'admin.autre', // unique globalement depuis la migration 000017
            'nom' => 'Admin Autre',
            'password_hash' => password_hash('admin123', PASSWORD_BCRYPT),
            'role' => 'admin',
            'actif' => true,
        ]);

        Article::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id,
            'code' => 'CAB-FO-24', 'libelle' => 'Câble fibre 24 brins', 'unite' => 'm',
        ]);
        Article::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id,
            'code' => 'POT-9M', 'libelle' => 'Poteau béton 9m', 'unite' => 'pièce',
        ]);
    }
}
