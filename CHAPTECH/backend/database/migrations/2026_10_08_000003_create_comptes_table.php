<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comptes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('equipe_id')->nullable();
            $table->string('identifiant');
            $table->string('nom');
            $table->string('password_hash');
            $table->string('role', 20); // super_admin|admin|gestionnaire|chef|technicien
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->softDeletes();

            // Identifiant unique PAR entreprise parmi les comptes ACTIFS.
            // Colonne générée : NULL après soft-delete → recréation possible.
            $table->string('identifiant_actif')
                ->storedAs('IF(deleted_at IS NULL, identifiant, NULL)');
            $table->unique(['entreprise_id', 'identifiant_actif']);
            $table->unique(['entreprise_id', 'id']);
            // FK composite : un compte ne peut pas pointer vers une équipe
            // d'une autre entreprise, même en cas de bug (§2.3)
            $table->foreign(['entreprise_id', 'equipe_id'])
                ->references(['entreprise_id', 'id'])->on('equipes');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comptes');
    }
};
