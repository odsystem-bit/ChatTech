<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Signatures = lignes photos du MÊME tenant (FK composite §2.3).
        // Migration séparée : `photos` est créée après `interventions`.
        // RESTRICT et non SET NULL — ce dernier mettrait entreprise_id
        // à NULL, interdit par le NOT NULL.
        Schema::table('interventions', function (Blueprint $table) {
            $table->foreign(['entreprise_id', 'signature_client'])
                ->references(['entreprise_id', 'id'])->on('photos')
                ->restrictOnDelete();
            $table->foreign(['entreprise_id', 'signature_technicien'])
                ->references(['entreprise_id', 'id'])->on('photos')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('interventions', function (Blueprint $table) {
            $table->dropForeign(['entreprise_id', 'signature_client']);
            $table->dropForeign(['entreprise_id', 'signature_technicien']);
        });
    }
};
