<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Journal IMMUABLE (§5) : on n'écrit jamais "quantité = X",
        // on enregistre "+5 / -2". Jamais de update ni de delete.
        Schema::create('mouvements_stock', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('article_id');
            $table->string('de_type', 15);        // central|equipe|exterieur
            $table->unsignedBigInteger('de_id')->default(0);
            // 'intervention' = 12 car. ; l'uuid de la fiche est dans
            // intervention_id, vers_id reste 0 pour ce type.
            $table->string('vers_type', 15);      // central|equipe|intervention
            $table->unsignedBigInteger('vers_id')->default(0);
            $table->integer('quantite');          // signé : +5 vers, -5 de
            $table->string('motif', 40);          // attribution|pose|retour|import
            $table->unsignedBigInteger('par');
            $table->uuid('intervention_id')->nullable();
            $table->unsignedBigInteger('operation_id');
            $table->timestamp('created_at')->useCurrent(); // immuable, jamais d'update

            // FK composites (§2.3) : le journal ne peut pointer que vers
            // des lignes du même tenant, même en cas de bug applicatif.
            $table->foreign(['entreprise_id', 'article_id'])
                ->references(['entreprise_id', 'id'])->on('articles');
            $table->foreign(['entreprise_id', 'par'])
                ->references(['entreprise_id', 'id'])->on('comptes');
            // RESTRICT et non SET NULL — ce dernier mettrait aussi
            // entreprise_id à NULL, interdit par le NOT NULL.
            $table->foreign(['entreprise_id', 'intervention_id'])
                ->references(['entreprise_id', 'id'])->on('interventions')
                ->restrictOnDelete();
            $table->foreign(['entreprise_id', 'operation_id'])
                ->references(['entreprise_id', 'id'])->on('operations');
            $table->index(['entreprise_id', 'article_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mouvements_stock');
    }
};
