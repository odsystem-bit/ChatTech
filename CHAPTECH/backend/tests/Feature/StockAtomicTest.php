<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\Operation;
use App\Models\Stock;
use App\Services\StockService;
use App\Support\Tenant\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * §5 / §16.6 : le stock est toujours cohérent — journal immuable,
 * soldes = cache du journal, zéro erreur même en parallèle.
 */
class StockAtomicTest extends TestCase
{
    use RefreshDatabase;

    private Entreprise $entreprise;
    private Compte $compte;
    private Article $article;

    protected function setUp(): void
    {
        parent::setUp();

        $this->entreprise = Entreprise::create(['nom' => 'Test', 'etat_abonnement' => 'actif']);
        $equipe = Equipe::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entreprise->id, 'nom' => 'Eq',
        ]);
        $this->compte = Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entreprise->id, 'equipe_id' => $equipe->id,
            'identifiant' => 'chef', 'nom' => 'Chef',
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => 'chef',
        ]);
        $this->article = Article::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entreprise->id,
            'code' => 'CAB', 'libelle' => 'Câble',
        ]);

        Tenant::setCompte($this->compte);
    }

    public function test_mouvement_met_a_jour_journal_et_soldes(): void
    {
        $service = app(StockService::class);

        // Central -> équipe : 10 pièces
        $op = Operation::create([
            'uuid' => (string) Str::uuid(),
            'entreprise_id' => $this->entreprise->id,
            'compte_id' => $this->compte->id,
            'type' => 'mouvement_stock', 'payload' => [],
            'applique_le' => now(),
        ]);
        $service->mouvement(
            $this->article->id, 'central', 0, 'equipe', $this->compte->equipe_id,
            10, $this->compte->id, 'attribution', $op->id
        );

        $central = Stock::where('article_id', $this->article->id)
            ->where('proprietaire_type', 'central')->first();
        $equipe = Stock::where('article_id', $this->article->id)
            ->where('proprietaire_type', 'equipe')->first();

        $this->assertEquals(-10, $central->quantite);
        $this->assertEquals(10, $equipe->quantite);
        $this->assertEquals(1, \App\Models\MouvementStock::count());
    }

    public function test_endpoint_mouvement_est_idempotent(): void
    {
        $token = $this->creerToken($this->compte);
        $uuid = (string) Str::uuid();
        $payload = [
            'uuid' => $uuid,
            'article_id' => $this->article->id,
            'de_type' => 'exterieur', 'de_id' => 0,
            'vers_type' => 'central', 'vers_id' => 0,
            'quantite' => 50, 'motif' => 'import',
        ];

        // Premier envoi → mouvement créé
        $this->withToken($token)
            ->postJson('/api/v1/stock/mouvements', $payload)
            ->assertStatus(201);

        // Renvoi réseau → même uuid, pas de double mouvement
        $this->withToken($token)
            ->postJson('/api/v1/stock/mouvements', $payload)
            ->assertStatus(200)
            ->assertJson(['statut' => 'deja_applique']);

        $this->assertEquals(1, \App\Models\MouvementStock::count());
        $this->assertEquals(50, Stock::where('proprietaire_type', 'central')
            ->first()->quantite);
    }

    public function test_import_refuse_a_un_technicien(): void
    {
        $tech = Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entreprise->id,
            'identifiant' => 'tech', 'nom' => 'Tech',
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => 'technicien',
        ]);

        $this->withToken($this->creerToken($tech))
            ->postJson('/api/v1/stock/import', [
                'uuid' => (string) Str::uuid(),
                'lignes' => [['article_id' => $this->article->id, 'quantite' => 10]],
            ])
            ->assertStatus(403);
    }

    public function test_journal_est_coherent_avec_les_soldes(): void
    {
        $service = app(StockService::class);
        $op = fn () => Operation::create([
            'uuid' => (string) Str::uuid(),
            'entreprise_id' => $this->entreprise->id,
            'compte_id' => $this->compte->id,
            'type' => 'mouvement_stock', 'payload' => [],
            'applique_le' => now(),
        ]);

        // Import initial + 2 attributions + 1 retour
        $service->mouvement($this->article->id, 'exterieur', 0, 'central', 0, 100, $this->compte->id, 'import', $op()->id);
        $service->mouvement($this->article->id, 'central', 0, 'equipe', $this->compte->equipe_id, 30, $this->compte->id, 'attribution', $op()->id);
        $service->mouvement($this->article->id, 'central', 0, 'equipe', $this->compte->equipe_id, 10, $this->compte->id, 'attribution', $op()->id);
        $service->mouvement($this->article->id, 'equipe', $this->compte->equipe_id, 'central', 0, 5, $this->compte->id, 'retour', $op()->id);

        // Le contrôle d'intégrité §5 ne doit trouver AUCUN écart
        $ecarts = $service->verifierCoherence($this->entreprise->id);
        $this->assertEmpty($ecarts, 'Écarts journal/cache : ' . json_encode($ecarts));
    }

    public function test_cloture_deduit_le_materiel_pose_une_seule_fois(): void
    {
        // §5 : change_statut → 'termine' déclenche deduirePose.
        // Le matériel sort du stock ÉQUIPE vers le bucket 'intervention'.
        $equipeId = $this->compte->equipe_id;
        Stock::create([
            'article_id' => $this->article->id,
            'proprietaire_type' => 'equipe', 'proprietaire_id' => $equipeId,
            'quantite' => 100,
        ]);

        $intervention = \App\Models\Intervention::withoutGlobalScopes()->create([
            'id' => (string) Str::uuid(),
            'entreprise_id' => $this->entreprise->id,
            'equipe_id' => $equipeId,
            'cree_par' => $this->compte->id,
            'statut' => 'en_cours',
            'materiel_pose' => [$this->article->id => 3],
        ]);

        $this->withToken($this->creerToken($this->compte))
            ->postJson("/api/v1/interventions/{$intervention->id}/ops", [
                'ops' => [[
                    'uuid' => (string) Str::uuid(),
                    'type' => 'change_statut',
                    'valeur' => 'termine',
                ]],
            ])->assertStatus(200);

        $this->assertEquals(97, Stock::where('proprietaire_type', 'equipe')
            ->where('proprietaire_id', $equipeId)->first()->quantite);
        $this->assertEquals(3, Stock::where('proprietaire_type', 'intervention')
            ->where('proprietaire_id', 0)->first()->quantite);
        $this->assertEquals(1, \App\Models\MouvementStock::count());
        $this->assertTrue($intervention->fresh()->materiel_deduit);

        // Renforcement : un second appel ne déduit plus rien
        app(StockService::class)->deduirePose($intervention->fresh());
        $this->assertEquals(97, Stock::where('proprietaire_type', 'equipe')
            ->where('proprietaire_id', $equipeId)->first()->quantite);
        $this->assertEquals(1, \App\Models\MouvementStock::count());
    }
}
