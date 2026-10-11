<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->string('nom');
            // FK ajoutée après la création de `comptes` (dépendance circulaire)
            $table->unsignedBigInteger('chef_compte_id')->nullable();
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->softDeletes();

            // Index composite pour les clés étrangères anti-fuite (§2.3)
            $table->unique(['entreprise_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipes');
    }
};
