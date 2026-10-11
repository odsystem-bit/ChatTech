<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interventions', function (Blueprint $table) {
            // UUID généré par l'app à la création (§7) : anti-doublon au réessai
            $table->uuid('id')->primary();
            $table->foreignId('entreprise_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('equipe_id');
            $table->unsignedBigInteger('cree_par');
            $table->string('chef_nom')->nullable(); // figé à la création (§3)

            // Champs métier — liste reprise de la fiche terrain v1
            // (fibretrack/api/index.php). Renommages v2 :
            //   nom_client→client_nom, adresse_zone→adresse,
            //   telephone_ligne→client_tel, remarque_libre→notes,
            //   nom_technicien/nom_equipe→cree_par+equipe_id,
            //   signatures→uuid photo, points/photos→tables normalisées.
            $table->string('client_nom')->nullable();
            $table->string('client_tel')->nullable();   // ligne fixe
            $table->string('mobile')->nullable();
            $table->string('adresse')->nullable();
            $table->string('statut', 20)->default('en_cours'); // en_cours|termine
            $table->dateTime('date')->nullable();
            $table->text('notes')->nullable();

            // Technique ligne
            $table->string('etat')->nullable();
            $table->string('msan')->nullable();
            $table->string('fat_ref')->nullable();
            $table->string('port')->nullable();
            $table->unsignedSmallInteger('ports_disponibles')->nullable();
            $table->unsignedSmallInteger('port_disponible')->nullable();
            $table->string('type_cable')->nullable();
            $table->double('depart_m')->nullable();
            $table->double('arrivee_m')->nullable();
            $table->double('lineaire_m')->nullable();
            $table->double('puissance_fat_dbm')->nullable();
            $table->double('puissance_pto_dbm')->nullable();
            $table->string('mac')->nullable();
            $table->string('sn')->nullable();
            $table->unsignedSmallInteger('nb_poteaux_traverses')->nullable();
            $table->unsignedSmallInteger('nb_poteaux_implantes')->nullable();
            $table->unsignedSmallInteger('nb_poteaux_armes')->nullable();

            // Équipement posé / matériel
            $table->string('ont_sn')->nullable();
            $table->unsignedSmallInteger('pto_qte')->nullable();
            $table->unsignedSmallInteger('repeteur_wifi_qte')->nullable();
            $table->string('emplacement_ont')->nullable();
            $table->boolean('client_confirme_emplacement')->nullable();
            $table->string('offre_souscrite')->nullable();
            $table->boolean('remise_equipement_ok')->nullable();
            // {article_id: quantite} — consommé par deduirePose à la clôture
            $table->json('materiel_pose')->nullable();

            // Satisfaction client
            $table->text('appreciation_satisfaction_libre')->nullable();
            $table->boolean('travaux_conformes')->nullable();
            $table->boolean('emplacement_valide')->nullable();
            $table->boolean('travail_propre')->nullable();
            $table->boolean('service_teste')->nullable();
            $table->boolean('service_fonctionne')->nullable();
            $table->boolean('explications_donnees')->nullable();
            $table->boolean('recommanderait')->nullable();
            $table->boolean('accepte_recontact')->nullable();
            $table->unsignedTinyInteger('qualite')->nullable();
            $table->unsignedTinyInteger('delais')->nullable();
            $table->unsignedTinyInteger('professionnalisme')->nullable();
            $table->string('nom_client_declaration')->nullable();
            // Signatures = lignes photos type 'signature', on garde l'uuid
            $table->uuid('signature_client')->nullable();
            $table->uuid('signature_technicien')->nullable();

            // Concurrence §16.3 : compare-and-swap, pas de verrou long
            $table->unsignedBigInteger('revision')->default(0);
            // Garde anti-double-déduction du stock (§5)
            $table->boolean('materiel_deduit')->default(false);
            $table->unsignedBigInteger('modifie_par')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['entreprise_id', 'id']);
            $table->foreign(['entreprise_id', 'equipe_id'])
                ->references(['entreprise_id', 'id'])->on('equipes');
            // FK composites (§2.3) : cree_par/modifie_par doivent être
            // des comptes du MÊME tenant — la base refuse sinon.
            $table->foreign(['entreprise_id', 'cree_par'])
                ->references(['entreprise_id', 'id'])->on('comptes');
            $table->foreign(['entreprise_id', 'modifie_par'])
                ->references(['entreprise_id', 'id'])->on('comptes');
            $table->index(['entreprise_id', 'statut']);
            $table->index(['entreprise_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interventions');
    }
};
