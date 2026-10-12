<?php

namespace Tests\Feature;

use App\Models\AlerteStock;
use App\Models\Article;
use App\Models\Compte;
use App\Models\Entreprise;
use App\Models\Equipe;
use App\Models\Operation;
use App\Services\StockService;
use App\Support\Tenant\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Stock insuffisant §5 : la pose n'est jamais bloquée, mais le stock
 * négatif est signalé (une alerte ouverte par ligne) puis refermé
 * quand le solde est régularisé. Isolation entre entreprises.
 */
class AlerteStockTest extends TestCase
{
    use RefreshDatabase;

    private Entreprise $entrepriseA;
    private Entreprise $entrepriseB;
    private Equipe $equipe1;
    private Equipe $equipe2;
    private Article $article;

    protected function setUp(): void
    {
        parent::setUp();
        Tenant::setCompte(null);

        $this->entrepriseA = Entreprise::create(['nom' => 'A', 'etat_abonnement' => 'actif']);
        $this->entrepriseB = Entreprise::create(['nom' => 'B', 'etat_abonnement' => 'actif']);
        $this->equipe1 = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseA->id, 'nom' => 'Eq 1']);
        $this->equipe2 = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseA->id, 'nom' => 'Eq 2']);
        $this->article = Article::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseA->id, 'code' => 'CAB', 'libelle' => 'Câble',
        ]);
    }

    protected function tearDown(): void
    {
        Tenant::setCompte(null);
        parent::tearDown();
    }

    private function compte(Entreprise $e, string $role, ?Equipe $equipe = null): Compte
    {
        return Compte::withoutGlobalScopes()->create([
            'entreprise_id' => $e->id,
            'equipe_id' => $equipe?->id,
            'identifiant' => $role . '.' . Str::random(6),
            'nom' => ucfirst($role),
            'password_hash' => password_hash('x', PASSWORD_BCRYPT),
            'role' => $role,
        ]);
    }

    /** Un mouvement du journal, comme le ferait un contrôleur. */
    private function mouvement(Article $article, string $deType, int $deId, string $versType, int $versId, int $qte, Compte $par): void
    {
        $operation = Operation::create([
            'uuid' => (string) Str::uuid(),
            'entreprise_id' => $article->entreprise_id,
            'compte_id' => $par->id,
            'type' => 'mouvement_stock', 'payload' => [],
            'applique_le' => now(),
        ]);
        app(StockService::class)->mouvement(
            $article->id, $deType, $deId, $versType, $versId, $qte,
            $par->id, 'pose', $operation->id
        );
    }

    private function ouvertes(): int
    {
        return AlerteStock::withoutGlobalScopes()->whereNull('resolue_le')->count();
    }

    public function test_une_pose_sans_stock_ouvre_une_alerte_sans_bloquer(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');

        $this->mouvement($this->article, 'equipe', $this->equipe1->id, 'intervention', 0, 3, $admin);

        $alerte = AlerteStock::withoutGlobalScopes()->firstOrFail();
        $this->assertSame(-3, $alerte->quantite);
        $this->assertSame('equipe', $alerte->proprietaire_type);
        $this->assertSame($this->equipe1->id, $alerte->proprietaire_id);
        $this->assertSame(1, $this->ouvertes()); // la contrepartie 'intervention' n'alerte pas
    }

    public function test_pas_de_doublon_et_le_solde_est_mis_a_jour(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');

        $this->mouvement($this->article, 'equipe', $this->equipe1->id, 'intervention', 0, 3, $admin);
        $this->mouvement($this->article, 'equipe', $this->equipe1->id, 'intervention', 0, 2, $admin);

        $this->assertSame(1, AlerteStock::withoutGlobalScopes()->count());
        $this->assertSame(-5, AlerteStock::withoutGlobalScopes()->first()->quantite);
    }

    public function test_l_alerte_se_ferme_quand_le_stock_est_regularise(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');

        $this->mouvement($this->article, 'equipe', $this->equipe1->id, 'intervention', 0, 3, $admin);
        $this->assertSame(1, $this->ouvertes());

        // Le central reçoit 10, puis les attribue : l'équipe passe de -3 à +7
        $this->mouvement($this->article, 'exterieur', 0, 'central', 0, 10, $admin);
        $this->mouvement($this->article, 'central', 0, 'equipe', $this->equipe1->id, 10, $admin);

        $this->assertSame(0, $this->ouvertes());
        $this->assertNotNull(AlerteStock::withoutGlobalScopes()->first()->resolue_le);
    }

    public function test_un_import_en_stock_central_n_alerte_pas(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');

        $this->mouvement($this->article, 'exterieur', 0, 'central', 0, 10, $admin);

        $this->assertSame(0, AlerteStock::withoutGlobalScopes()->count());
    }

    public function test_un_central_negatif_alerte(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');

        $this->mouvement($this->article, 'central', 0, 'equipe', $this->equipe1->id, 4, $admin);

        $types = AlerteStock::withoutGlobalScopes()->pluck('quantite', 'proprietaire_type')->all();
        $this->assertSame(-4, $types['central']);
        $this->assertArrayNotHasKey('equipe', $types); // l'équipe a reçu +4
    }

    public function test_endpoint_chef_voit_son_equipe_admin_voit_tout(): void
    {
        $admin = $this->compte($this->entrepriseA, 'admin');
        $chef = $this->compte($this->entrepriseA, 'chef', $this->equipe1);

        $this->mouvement($this->article, 'equipe', $this->equipe1->id, 'intervention', 0, 1, $admin);
        $this->mouvement($this->article, 'equipe', $this->equipe2->id, 'intervention', 0, 2, $admin);

        $vuParChef = $this->withToken($this->creerToken($chef))->getJson('/api/v1/stock/alertes');
        $vuParChef->assertOk();
        $this->assertCount(1, $vuParChef->json());
        $this->assertSame('Eq 1', $vuParChef->json('0.proprietaire'));
        $this->assertSame(-1, $vuParChef->json('0.quantite'));

        $vuParAdmin = $this->withToken($this->creerToken($admin))->getJson('/api/v1/stock/alertes');
        $this->assertCount(2, $vuParAdmin->json());
    }

    public function test_les_alertes_de_B_sont_invisibles_pour_A(): void
    {
        $adminA = $this->compte($this->entrepriseA, 'admin');
        $adminB = $this->compte($this->entrepriseB, 'admin');
        $equipeB = Equipe::withoutGlobalScopes()->create(['entreprise_id' => $this->entrepriseB->id, 'nom' => 'Eq B']);
        $articleB = Article::withoutGlobalScopes()->create([
            'entreprise_id' => $this->entrepriseB->id, 'code' => 'PRB', 'libelle' => 'Pièce B',
        ]);

        $this->mouvement($articleB, 'equipe', $equipeB->id, 'intervention', 0, 9, $adminB);
        $this->mouvement($this->article, 'equipe', $this->equipe1->id, 'intervention', 0, 1, $adminA);

        $reponse = $this->withToken($this->creerToken($adminA))->getJson('/api/v1/stock/alertes');

        $this->assertCount(1, $reponse->json());
        $this->assertSame('CAB', $reponse->json('0.article.code'));
    }

    public function test_un_token_est_requis(): void
    {
        $this->getJson('/api/v1/stock/alertes')->assertStatus(401);
    }
}
