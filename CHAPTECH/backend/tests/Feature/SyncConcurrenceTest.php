<?php

namespace Tests\Feature;

use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\Intervention;
use App\Models\Operation;
use App\Models\PointGps;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * §16.6 : simule le terrain — 2 techniciens sur la même fiche,
 * opérations renvoyées en double, idempotence, delta.
 */
class SyncConcurrenceTest extends TestCase
{
    use RefreshDatabase;

    private string $tokenTech1;
    private string $tokenTech2;
    private Compte $tech1;
    private Compte $tech2;
    private Intervention $intervention;

    protected function setUp(): void
    {
        parent::setUp();

        $entreprise = Entreprise::create(['nom' => 'Test', 'etat_abonnement' => 'actif']);
        $equipe = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $entreprise->id, 'nom' => 'Eq',
        ]);

        $this->tech1 = $this->creerCompte($entreprise, $equipe, 'tech1');
        $this->tech2 = $this->creerCompte($entreprise, $equipe, 'tech2');
        $this->tokenTech1 = $this->creerToken($this->tech1);
        $this->tokenTech2 = $this->creerToken($this->tech2);

        $this->intervention = Intervention::withoutGlobalScopes()->create([
            'id' => (string) Str::uuid(),
            'entreprise_id' => $entreprise->id,
            'equipe_id' => $equipe->id,
            'cree_par' => $this->tech1->id,
            'statut' => 'en_cours',
        ]);
    }

    private function creerCompte($e, $eq, string $identifiant): Compte
    {
        return Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $e->id, 'equipe_id' => $eq->id,
            'identifiant' => $identifiant, 'nom' => $identifiant,
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => 'technicien',
        ]);
    }

    public function test_deux_techniciens_ajoutent_des_points_sans_conflit(): void
    {
        $pointTech1 = (string) Str::uuid();
        $pointTech2 = (string) Str::uuid();

        // Tech1 ajoute son point
        $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'ajoute_point',
                    'ligne_id' => $pointTech1,
                    'data' => ['lat' => 6.37, 'lng' => 2.42, 'horodatage' => now()],
                ]],
            ])->assertStatus(200);

        // Tech2 ajoute le sien en parallèle — aucun ne perd sa saisie
        $this->withToken($this->tokenTech2)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'ajoute_point',
                    'ligne_id' => $pointTech2,
                    'data' => ['lat' => 6.38, 'lng' => 2.43, 'horodatage' => now()],
                ]],
            ])->assertStatus(200);

        $this->assertEquals(2, PointGps::withoutGlobalScopes()
            ->where('intervention_id', $this->intervention->id)->count());
    }

    public function test_meme_operation_renvoyee_deux_fois_appliquee_une_fois(): void
    {
        $uuid = (string) Str::uuid();
        $pointId = (string) Str::uuid();

        $payload = [
            'ops' => [[
                'uuid' => $uuid,
                'type' => 'ajoute_point',
                'ligne_id' => $pointId,
                'data' => ['lat' => 6.37, 'lng' => 2.42, 'horodatage' => now()],
            ]],
        ];

        // Premier envoi OK
        $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", $payload)
            ->assertStatus(200);

        // Renvoi réseau : même UUID → ignoré, pas de doublon
        $response = $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", $payload)
            ->assertStatus(200);

        $this->assertEquals(1, PointGps::withoutGlobalScopes()
            ->where('intervention_id', $this->intervention->id)->count());
        $this->assertEquals(1, Operation::where('uuid', $uuid)->count());
        $this->assertContains($uuid, $response->json('ignores'));
    }

    public function test_delta_renvoie_ce_qui_a_change(): void
    {
        $rev0 = $this->intervention->revision;

        $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'set_champ',
                    'champ' => 'client_nom',
                    'valeur' => 'Client Test',
                ]],
            ])->assertStatus(200);

        // Pas de changement depuis la nouvelle révision → réponse légère
        $rev1 = $this->intervention->fresh()->revision;
        $this->assertGreaterThan($rev0, $rev1);

        $this->withToken($this->tokenTech2)
            ->getJson("/api/v1/interventions/{$this->intervention->id}/changes?since_rev={$rev1}")
            ->assertStatus(200)
            ->assertJson(['changed' => false]);

        // Depuis rev0 → delta complet
        $this->withToken($this->tokenTech2)
            ->getJson("/api/v1/interventions/{$this->intervention->id}/changes?since_rev={$rev0}")
            ->assertStatus(200)
            ->assertJson(['changed' => true])
            ->assertJsonPath('intervention.client_nom', 'Client Test');
    }

    public function test_champ_non_editable_refuse(): void
    {
        $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'set_champ',
                    'champ' => 'entreprise_id', // tentative de changement de tenant !
                    'valeur' => 999,
                ]],
            ])->assertStatus(422); // erreur métier → 422, jamais 500
    }

    public function test_data_ne_peut_pas_ejecter_les_cles_serveur(): void
    {
        // §2 : le payload client ne doit JAMAIS écraser entreprise_id,
        // intervention_id ou ajoute_par — sinon fuite cross-tenant.
        $pointId = (string) Str::uuid();

        $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'ajoute_point',
                    'ligne_id' => $pointId,
                    'data' => [
                        'lat' => 6.37, 'lng' => 2.42, 'horodatage' => now(),
                        'entreprise_id' => 999,      // tentative d'injection
                        'ajoute_par' => 999,
                        'intervention_id' => (string) Str::uuid(),
                    ],
                ]],
            ])->assertStatus(200);

        $point = PointGps::withoutGlobalScopes()->findOrFail($pointId);
        $this->assertEquals($this->intervention->entreprise_id, $point->entreprise_id);
        $this->assertEquals($this->intervention->id, $point->intervention_id);
        $this->assertEquals($this->tech1->id, $point->ajoute_par);
    }

    public function test_expected_revision_stale_donne_un_conflit(): void
    {
        // CAS §16.2 : la fiche a bougé depuis ce que le client a vu →
        // l'op n'est pas appliquée, elle part en conflits.
        $uuid = (string) Str::uuid();
        $revStale = $this->intervention->revision + 5;

        $response = $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$this->intervention->id}/ops", [
                'ops' => [[
                    'uuid' => $uuid,
                    'type' => 'set_champ',
                    'champ' => 'client_nom',
                    'valeur' => 'Écrasement illégal',
                    'expected_revision' => $revStale,
                ]],
            ])->assertStatus(200);

        $this->assertContains($uuid, $response->json('conflits'));
        $this->assertEmpty($response->json('appliques'));
        $this->assertNull($this->intervention->fresh()->client_nom);
    }

    public function test_technicien_ne_peut_pas_ecrire_hors_son_equipe(): void
    {
        // §3 : un technicien ne touche que la fiche de SA propre équipe.
        $autreEquipe = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->intervention->entreprise_id,
            'nom' => 'Autre équipe',
        ]);
        $interventionAutre = Intervention::withoutGlobalScopes()->create([
            'id' => (string) Str::uuid(),
            'entreprise_id' => $this->intervention->entreprise_id,
            'equipe_id' => $autreEquipe->id,
            'cree_par' => $this->tech2->id,
            'statut' => 'en_cours',
        ]);

        $this->withToken($this->tokenTech1)
            ->postJson("/api/v1/interventions/{$interventionAutre->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'set_champ',
                    'champ' => 'client_nom',
                    'valeur' => 'PIRATÉ',
                ]],
            ])->assertStatus(403);

        $this->withToken($this->tokenTech1)
            ->getJson("/api/v1/interventions/{$interventionAutre->id}/changes?since_rev=0")
            ->assertStatus(403);
    }
}
