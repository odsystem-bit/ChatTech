<?php

namespace Tests\Feature;

use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\Intervention;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * §2 / §16.6 : zéro fuite de données entre entreprises.
 * Un compte de l'entreprise A ne doit JAMAIS voir ni toucher
 * une ressource de l'entreprise B — même en devinant un ID.
 */
class IsolationEntrepriseTest extends TestCase
{
    use RefreshDatabase;

    private Entreprise $entrepriseA;
    private Entreprise $entrepriseB;
    private Compte $adminA;
    private Compte $adminB;
    private Equipe $equipeA;
    private string $tokenA;
    private string $tokenB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->entrepriseA = Entreprise::create(['nom' => 'Entreprise A', 'etat_abonnement' => 'actif']);
        $this->entrepriseB = Entreprise::create(['nom' => 'Entreprise B', 'etat_abonnement' => 'actif']);

        $this->equipeA = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseA->id, 'nom' => 'Eq A',
        ]);

        $this->adminA = Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseA->id,
            'identifiant' => 'admin.a', 'nom' => 'Admin A',
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => 'admin',
        ]);
        $this->adminB = Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseB->id,
            'identifiant' => 'admin.b', 'nom' => 'Admin B',
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => 'admin',
        ]);

        $this->tokenA = $this->creerToken($this->adminA);
        $this->tokenB = $this->creerToken($this->adminB);
    }

    private function interventionDe(Entreprise $e, Equipe $equipe, Compte $par): Intervention
    {
        return Intervention::withoutGlobalScopes()->create([
            'id' => (string) Str::uuid(),
            'entreprise_id' => $e->id,
            'equipe_id' => $equipe->id,
            'cree_par' => $par->id,
            'statut' => 'en_cours',
        ]);
    }

    public function test_un_token_est_requis(): void
    {
        $this->getJson('/api/v1/interventions')->assertStatus(401);
    }

    public function test_A_ne_voit_pas_les_interventions_de_B(): void
    {
        $equipeB = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B',
        ]);
        $iA = $this->interventionDe($this->entrepriseA, $this->equipeA, $this->adminA);
        $iB = $this->interventionDe($this->entrepriseB, $equipeB, $this->adminB);

        $response = $this->withToken($this->tokenA)->getJson('/api/v1/interventions');
        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertContains($iA->id, $ids);
        $this->assertNotContains($iB->id, $ids);
    }

    public function test_A_ne_peut_pas_lire_une_intervention_de_B_par_id(): void
    {
        $equipeB = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B',
        ]);
        $iB = $this->interventionDe($this->entrepriseB, $equipeB, $this->adminB);

        $this->withToken($this->tokenA)
            ->getJson("/api/v1/interventions/{$iB->id}")
            ->assertStatus(404); // pas 403 — on ne révèle même pas l'existence
    }

    public function test_A_ne_peut_pas_pusher_d_ops_sur_une_intervention_de_B(): void
    {
        $equipeB = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B',
        ]);
        $iB = $this->interventionDe($this->entrepriseB, $equipeB, $this->adminB);

        $this->withToken($this->tokenA)
            ->postJson("/api/v1/interventions/{$iB->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'set_champ',
                    'champ' => 'client_nom',
                    'valeur' => 'PIRATÉ',
                ]],
            ])
            ->assertStatus(404);

        $this->assertNull(
            Intervention::withoutGlobalScopes()->find($iB->id)->client_nom
        );
    }

    public function test_un_compte_ne_peut_pas_appartenir_a_une_equipe_etrangere(): void
    {
        // FK composite (§2.3) : la base elle-même refuse
        $equipeB = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B',
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseA->id, // A
            'equipe_id' => $equipeB->id,               // équipe de B !
            'identifiant' => 'pirate', 'nom' => 'Pirate',
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => 'technicien',
        ]);
    }
}
