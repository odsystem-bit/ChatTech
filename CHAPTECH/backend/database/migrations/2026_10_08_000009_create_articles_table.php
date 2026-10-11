<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('articles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->string('code');
            $table->string('libelle');
            $table->string('unite', 20)->default('pièce');
            $table->timestamps();
            $table->softDeletes();

            // Code unique par tenant parmi les actifs : NULL après
            // soft-delete → un code supprimé peut être recréé.
            $table->string('code_actif')
                ->storedAs('IF(deleted_at IS NULL, code, NULL)');
            $table->unique(['entreprise_id', 'code_actif']);
            $table->unique(['entreprise_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('articles');
    }
};
