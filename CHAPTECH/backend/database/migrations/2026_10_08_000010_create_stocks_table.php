<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cache matérialisé du journal mouvements_stock (§5).
        // Mis à jour uniquement dans StockService, sous transaction + verrou.
        Schema::create('stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('article_id');
            // proprietaire = l'entreprise elle-même ('central') ou une équipe
            $table->string('proprietaire_type', 15); // central|equipe|intervention
            $table->unsignedBigInteger('proprietaire_id')->default(0); // 0 = central
            $table->integer('quantite')->default(0);
            $table->timestamps();

            $table->unique(['entreprise_id', 'article_id', 'proprietaire_type', 'proprietaire_id'], 'stocks_unique_ligne');
            $table->unique(['entreprise_id', 'id']);
            $table->foreign(['entreprise_id', 'article_id'])
                ->references(['entreprise_id', 'id'])->on('articles');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stocks');
    }
};
