<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Stock négatif à régulariser §5 : la pose n'est jamais bloquée
        // sur le terrain, mais l'écart est signalé tant qu'il existe.
        Schema::create('alertes_stock', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('article_id');
            $table->string('proprietaire_type', 15); // equipe|central
            $table->unsignedBigInteger('proprietaire_id')->default(0);
            $table->integer('quantite'); // solde courant (négatif) tant que l'alerte est ouverte
            $table->timestamp('resolue_le')->nullable();
            $table->timestamps();

            $table->index(['entreprise_id', 'resolue_le']);
            $table->foreign(['entreprise_id', 'article_id'])
                ->references(['entreprise_id', 'id'])->on('articles');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alertes_stock');
    }
};
