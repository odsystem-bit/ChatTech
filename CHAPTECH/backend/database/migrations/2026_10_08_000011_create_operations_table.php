<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Idempotence §16.2 : chaque opération client a un UUID unique.
        // Un renvoi (réseau instable) est détecté via l'index unique et
        // renvoie le résultat de la première application au lieu de rejouer.
        Schema::create('operations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('compte_id');
            $table->uuid('intervention_id')->nullable();
            $table->string('type', 40); // set_champ|ajoute_point|supprime_photo|change_statut|mouvement_stock|...
            $table->json('payload');
            $table->json('resultat')->nullable(); // réponse stockée pour les renvois
            $table->timestamp('applique_le')->useCurrent();
            $table->timestamps();

            $table->unique(['entreprise_id', 'id']);
            $table->foreign(['entreprise_id', 'compte_id'])
                ->references(['entreprise_id', 'id'])->on('comptes');
            // Journal : RESTRICT (pas SET NULL — mettrait entreprise_id
            // à NULL). Inerte en pratique : interventions soft-deleted.
            $table->foreign(['entreprise_id', 'intervention_id'])
                ->references(['entreprise_id', 'id'])->on('interventions')
                ->restrictOnDelete();
            $table->index(['entreprise_id', 'intervention_id']);
            $table->index(['entreprise_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operations');
    }
};
