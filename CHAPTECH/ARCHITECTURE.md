# CHAPTECH - Architecture

Objectif : **zéro fuite de données entre entreprises, zéro erreur de stock, même avec beaucoup d'équipes en parallèle.**
Statut : **décisions actées le 07/10/2026** (voir §15). Prêt pour l'étape 1.

## 1. Choix techniques
Hébergement actuel (Hostinger mutualisé, surchargé) : PHP 8.3, MariaDB 11.8, Composer 2.9. **Décision : VPS dédié** pour CHAPTECH (voir §15) — même stack, mais ressources réservées, pas de voisinage, cron/files d'attente natifs.

### Stack recommandée
| Couche | Choix | Pourquoi |
|---|---|---|
| API | **Laravel 11+ (PHP 8.3)** | Auth, routes, migrations, transactions, files d'attente, journaux et gestion d'erreurs fournis, au lieu de tout écrire à la main. Moins de bugs. |
| Base | **MariaDB** | Transactions + verrous de ligne pour le stock. Une seule base partagée (décision §15). |
| Console web | **React + Vite** + Tailwind | Page entreprises + page super-admin. |
| App mobile | **Flutter** (Android + iOS, un seul code) | Décision actée : couvre les deux plateformes, consomme l'API Laravel. Remplace l'APK Kotlin à terme (voir §1bis). |
| Paiement | Moneroo, puis Celtiis | |
| Suivi d'erreurs | **Journal interne puissant** (pas de service externe) | Voir §14. |

### App mobile : Flutter (décision actée)
**Un seul code pour Android et iOS**, qui consomme l'API Laravel. Le passage à Flutter se fait en parallèle : l'APK Kotlin actuelle (v3.2) reste en service tant que la version Flutter n'est pas prête — même API, même base.

| Point | Choix |
|---|---|
| UI/UX | Design inspiré de la maquette Celtiis fournie, **en respectant les codes couleur CHAPTECH** (bleu #123CCB etc.) |
| Caméra / GPS / fichiers | Plugins Flutter éprouvés (`camera`, `geolocator`, `image_picker`, `file_picker`) |
| iPhone | Oui — même base de code, build iOS séparé (nécessite un compte Apple Developer 99 $/an plus tard) |
| Session | Jeton persistant sur l'appareil (voir §4) |

### Structure de l'API cible
Le gros fichier `index.php` actuel est découpé en modules Laravel : contrôleurs `Entreprises`, `Equipes`, `Comptes`, `Interventions`, `Stock`, `Poteaux`, `Abonnements`, `Paiements` ; middleware `Tenant` et `Policy` ; migrations numérotées ; tests d'isolation et de stock.

## 2. Multi-entreprise : une base, `entreprise_id` partout
Une seule base de données, chaque table métier a `entreprise_id`. C'est le plus simple à héberger, mais le risque est d'**oublier le filtre** dans une requête. On le rend impossible à oublier :

1. **L'entreprise vient du jeton, jamais de la requête.** Le client ne dit jamais « je suis l'entreprise 5 ».
2. **Une seule porte d'accès aux données** : toutes les requêtes passent par une couche `Tenant` qui ajoute automatiquement `entreprise_id = ?`. Il est interdit d'écrire du SQL métier ailleurs.
3. **Protection par la base elle-même** : clés étrangères composites `(entreprise_id, id)`. Une intervention de l'entreprise A ne peut pas être liée à une équipe de l'entreprise B, même en cas de bug.
4. **Tests d'isolation automatiques** : pour chaque route, un test crée 2 entreprises et vérifie que A ne voit, ne modifie et ne supprime rien de B. Rien n'est déployé si ces tests échouent.

## 3. Équipes et rôles
- Le rôle et l'équipe viennent de la **base**, jamais du téléphone.
- Un fichier unique de règles `Policy` décrit qui peut faire quoi (la matrice du plan). Chaque route appelle `can($utilisateur, 'action', $ressource)`.
- Filtrage par équipe : chef et technicien ne voient que `equipe_id = la leur`. Admin, gestionnaire et **conformité** voient toute l'entreprise.
- **Rôle `conformite`** (12/10/2026) : gère les poteaux et tout le contrôle terrain sur toutes les équipes. Le **chef d'équipe n'a pas accès aux poteaux** (route `/poteaux` réservée à `admin` et `conformite`, vérifiée côté serveur).
- Le nom du chef est copié sur l'intervention à sa création, il ne change pas si le chef change plus tard.

## 3 bis. Photo EPI du matin (codé côté serveur et console)
Règles métier : voir `PLAN.md` §6 bis. Choix techniques :
- **Tables** : `epi_journaliers` (une ligne par équipe et par jour, unicité `(equipe_id, date)`, statut `en_attente|valide|rejete`, motif, `envoye_le` heure serveur) et `epi_delegations` (technicien autorisé à envoyer un jour donné). Colonne `entreprises.epi_obligatoire` (faux par défaut).
- **État calculé à la lecture** (`EpiService::statut`) : pas de cron. En attente depuis plus de 30 min = débloquée ; hors 06h-23h (heure `Africa/Porto-Novo`, sans changer `app.timezone`) = bloquée.
- **Blocage côté serveur** : middleware `epi` (code 423) sur la création de fiche, `ops` et l'envoi de médias, pour chef et technicien seulement. L'APK ne peut donc pas contourner le verrou ; elle doit traiter 423 comme « réessayer plus tard » (file locale).
- **API** : `GET /epi/statut`, `POST /epi` (chef ou technicien délégué), `GET /epi/jour` + `POST /epi/{id}/decision` + `GET /epi/{id}/photo` (admin, conformité), `POST /epi/delegations` (admin, conformité, chef pour sa propre équipe).
- Photo sur disque privé `uploads/{entreprise}/epi/{date}/`, servie par un endpoint qui vérifie le droit. À 8h30, la vue du jour marque `a_signaler` toute équipe sans photo ni délégation.
- Limite connue : la file locale de l'APK et le verrou côté appareil restent à faire.

## 4. Authentification
- Fini le code à 4 chiffres et le `9999` en dur : identifiant + mot de passe haché (`password_hash`).
- Connexion renvoie un **jeton de session longue durée** (stocké haché côté serveur, révocable). **Le technicien se connecte une fois et reste connecté** — pas de re-saisie du mot de passe à chaque ouverture de l'app. Le jeton n'est redemandé que s'il est révoqué (compte désactivé, changement de mot de passe) ou expiré après une longue période (ex. 90 jours glissants).
- Limitation des tentatives de connexion (anti-force brute).
- L'app garde le jeton chiffré ; si le compte est désactivé, il cesse de fonctionner au prochain appel.

## 5. Stock : le point le plus sensible
Règles pour qu'aucune quantité ne soit fausse :

- **Deux types d'emplacements** : le **stock central** de l'entreprise et le **stock de chaque équipe**.
- **Journal immuable** `mouvements_stock` : on n'écrit jamais « quantité = 12 », on enregistre « +5 », « -2 ». La quantité affichée est le résultat du journal. Ce journal ne se modifie ni ne se supprime.
- **Transactions** : une attribution (central vers équipe) écrit les deux mouvements et met à jour les deux soldes **dans une seule transaction**, avec verrou de ligne (`SELECT ... FOR UPDATE`). Tout réussit ou rien.
- **Anti-doublon (idempotence)** : chaque pose de matériel et chaque mouvement envoyé par l'APK porte un identifiant unique. Si le téléphone renvoie la requête (réseau coupé), le serveur reconnaît le doublon et ne déduit pas deux fois.
- **Deux équipes en même temps** : les verrous évitent que deux opérations lisent la même quantité et la dépassent.
- **Stock insuffisant** : la pose n'est pas bloquée sur le terrain, mais elle est signalée au chef et au gestionnaire.
- **Contrôle d'intégrité** : un script compare régulièrement les soldes et le journal, et alerte en cas d'écart.

## 6. Import et export
- **Import** : fichier au format fixe vers le stock central de l'entreprise, avec aperçu et validation avant application, rapport des lignes en erreur, journalisé.
- **Sortie / attribution** : le gestionnaire choisit l'équipe et les articles, en un clic ; le stock central diminue, celui de l'équipe augmente.
- **Export Excel** : inventaire **par équipe** ou **global** (entreprise entière). Liste des poteaux exportable par équipe ou globalement, **réservée à la conformité et à l'admin**.

## 7. Interventions et synchronisation
- Garder le contrôle de conflit actuel (`expected_updated_at`) : deux personnes qui modifient la même fiche ne s'écrasent pas.
- Identifiant unique généré par l'APK à la création (pas de doublon en cas de réessai).
- Le chef d'équipe crée la fiche ; les techniciens la complètent. Le serveur vérifie qu'ils sont bien dans la même équipe.

## 8. Fichiers (photos, vidéos, fiches)
- Rangés par entreprise : `uploads/{entreprise_id}/{intervention_id}/...`.
- Servis via un point d'accès qui vérifie le droit de l'utilisateur, au lieu d'URL publiques.

## 9. Abonnement
- État de l'entreprise : essai, actif, grâce, lecture seule, suspendu.
- **Activation manuelle par le super-admin** : il fixe la date de fin d'utilisation (donner du temps d'utilisation). Pas de renouvellement automatique pour l'instant.
- Un contrôle central vérifie l'état à **chaque requête** : en lecture seule, toute écriture est refusée.
- Limite d'équipes vérifiée à la création d'une équipe (5 ou 10 selon le palier).
- Paiement Moneroo (plus tard) : webhook avec signature vérifiée, traité une seule fois par référence, et confirmation auprès de Moneroo avant d'activer.

## 10. Déploiement sans casser l'existant
1. **Environnement de test séparé** (sous-domaine `test.` + base de test sur le VPS, décision actée) : tout passe par le test avant la production.
2. **Migrations SQL numérotées** appliquées par script, avec **sauvegarde de la base avant chaque migration**.
3. **API versionnée** : le nouveau service vit à côté de l'ancien le temps que tous les téléphones soient à jour.
4. **Version minimale de l'app** : le serveur peut imposer la mise à jour (le mécanisme existe déjà, étendu à Android + iOS).
5. Migration des données : TELECOM BTP Services devient l'entreprise n°1 avec ses interventions, ses comptes et son stock.

## 11. Sécurité et exploitation
- Journal d'audit : qui a fait quoi, quand (stock, comptes, paiements).
- Voir §14 pour la supervision des bugs.
- Sauvegardes quotidiennes de la base et des fichiers, test de restauration.
- Mots de passe et clés Moneroo hors du code (fichier d'environnement non versionné) ; le mot de passe du keystore actuel est en clair dans `build.gradle`, à sortir.
- HTTPS partout ; `usesCleartextTraffic` à désactiver dans l'APK.
- Suppression « douce » (archivage) plutôt que effacement définitif.

## 12. Les bugs qu'on veut éviter, et la parade

| Risque | Parade |
|---|---|
| Une entreprise voit les données d'une autre | Tenant dans le jeton + couche d'accès unique + clés composites + tests d'isolation |
| Stock faux après deux opérations simultanées | Transactions + verrous de ligne |
| Matériel déduit deux fois (réseau instable) | Identifiants uniques / idempotence |
| Un technicien se donne des droits | Rôle lu en base, `Policy` serveur |
| Fichier accessible par lien deviné | Accès contrôlé aux fichiers |
| Mise à jour qui casse les anciens téléphones | API versionnée + version minimale |
| Perte de données | Sauvegardes, migrations avec retour arrière |

## 13. Ordre de construction
1. Socle : structure de l'API, tenant, auth, `Policy`, tests d'isolation.
2. Entreprises, comptes, rôles, équipes, abonnement manuel.
3. Migration de FibreTrack vers l'entreprise n°1.
4. Stock central, import, attribution aux équipes, déduction automatique.
5. Console web (entreprise + super-admin).
6. Conformité (poteaux, puis photos EPI) et exports.
7. Moneroo, puis Celtiis.

## 14. Page super-admin « Supervision »
Page dédiée pour repérer et corriger vite, **100 % interne** (décision actée : puissance d'un Sentry, sans service externe ni abonnement) :

- **Capture automatique des erreurs** : handler d'exception Laravel + endpoint `POST /api/errors` pour la console web et l'app Flutter. Chaque plantage arrive avec fichier/ligne, stack trace, compte, entreprise, appareil, version de l'app, route appelée.
- **Regroupement intelligent** : chaque erreur a une empreinte (fichier + message + ligne) ; les occurrences identiques s'agrègent — comme Sentry. Tri par fréquence, « dernière fois », « première fois », « résolu » en un clic avec lien vers la donnée concernée.
- **Table de bord maison** dans la console super-admin : erreurs, tentatives de connexion échouées, échecs de synchronisation mobile, mouvements de stock refusés ou signalés, incohérences soldes/journal, échecs de paiement Moneroo plus tard.
- **Journal d'audit** : toute action sensible (création d'équipe, attribution de stock, paiement) enregistrée pour retracer un problème.
- **Santé de la plateforme** : nombre d'entreprises actives, requêtes lentes, espace disque, taille des uploads.

## 15. Décisions actées (07/10/2026)
1. **Une seule base partagée** avec `entreprise_id` partout — pas de base par entreprise.
2. **Identifiant + mot de passe** oui, mais **session persistante** : le technicien se connecte une fois et reste connecté, pas de re-saisie à chaque ouverture.
3. **Environnement de test** séparé avant toute mise en production.
4. **Hébergement : VPS dédié** — le mutualisé actuel est surchargé (partagé avec d'autres sites, limites strictes, cause des lenteurs). Un VPS (Hostinger VPS ~6 €/mois ou Hetzner ~5 €/mois) donne ressources réservées, cron et files d'attente natifs, test et prod sur la même machine sans se gêner. Le mutualisé reste pour l'API actuelle le temps de la migration.
5. **Journal interne** avec la puissance d'un Sentry — pas de service externe (voir §14).
6. **App mobile Flutter** : un seul code pour Android **et** iOS, relié à l'API Laravel. L'APK Kotlin actuelle reste en service pendant la transition.
7. **UI/UX** : design inspiré de la maquette Celtiis, en respectant les codes couleur CHAPTECH.

## 16. Synchronisation terrain : le protocole anti-bug

Chaque bug vécu sur l'ancien système (FibreTrack) devient ici une règle de conception qui le rend structurellement impossible.

### 16.1 Données fines en base — jamais de JSON géant, jamais de base64
| Ancien système (le bug) | CHAPTECH |
|---|---|
| `points_gps` / `whatsapp_photos` = JSON base64 dans la ligne intervention → chaque save réécrit des Mo sous verrou | **Une ligne par point GPS, une ligne par photo** (tables `points_gps`, `photos` rattachées à l'intervention). Ajouter un point = un petit INSERT |
| Photos dans le JSON | Photos/vidéos = **fichiers** sous `uploads/{entreprise_id}/{intervention_id}/` ; la base ne garde que les métadonnées |
| Réécriture de la liste = collision entre techniciens | Chaque technicien insère **ses propres lignes** → pas de merge, pas de conflit |

### 16.2 File d'opérations côté client (offline-first)
L'autosave « des fois ça n'enregistre pas » vient du modèle « envoyer toute la fiche, échec = tout perdu ».

- Chaque modification devient une **opération** : `set_champ`, `ajoute_point`, `supprime_photo`, `change_statut`.
- Les opérations partent d'une **file locale persistante** (SQLite côté Flutter) poussée **dans l'ordre, avec retry illimité** — réseau coupé ou app tuée = rien perdu.
- Chaque opération porte un **UUID d'idempotence** → le serveur détecte les renvois et n'applique qu'une fois (généralise le garde `materiel_deduit`).

### 16.3 Concurrence par révision — pas de verrou long
| Ancien système | CHAPTECH |
|---|---|
| `SELECT ... FOR UPDATE` tenu pendant un merge de Mo → timeouts et lenteurs à plusieurs | Colonne `revision` (entier) sur l'intervention + `expected_revision` envoyé par le client → **compare-and-swap atomique**, verrou d'une milliseconde |
| Poll lourd : corps complet toutes les 30 s | `GET /interventions/{id}/changes?since_rev=N` → l'app ne récupère que le **delta** |
| Conflit : le dernier écrit écrase tout | Champs scalaires : dernier écrit gagne. Collections : lignes séparées → **pas de conflit** |

### 16.4 Le serveur est la source de vérité
- L'app affiche la fiche depuis sa **base locale** (instantané, fonctionne hors-ligne) ; push des ops + pull des deltas → convergence automatique.
- Le « dirty » est implicite : une opération en file = pas encore synchronisé.

### 16.5 Travaux lourds en file d'attente
PDF, compression des photos, traitement EXIF : **jobs Laravel queued** (natif sur le VPS), pas dans la requête HTTP — fini les timeouts.

### 16.6 Tests qui simulent le terrain
Avant chaque déploiement : 2 techniciens sur la même fiche, opération envoyée en double, coupure réseau en plein save, isolation entreprise A/B — tout doit passer.

### 16.7 Ordre : ce protocole se définit **avant** de coder l'app Flutter
Tout l'app terrain en dépend ; le backend §17 commence par lui.

## 17. Structure du backend Laravel

Projet : `CHAPTECH/backend/` (Laravel, PHP 8.3+). Une seule règle d'or : **aucune requête SQL métier hors des modèles Tenant-scopés** (§2).

### 17.1 Arborescence cible
```
backend/
├── app/
│   ├── Models/           Entreprise, Compte, Equipe, Intervention, PointGps,
│   │                     Photo, Article, MouvementStock, Operation, AuditLog, Erreur
│   ├── Http/
│   │   ├── Controllers/Api/V1/   EntreprisesController, ComptesController,
│   │   │                         EquipesController, InterventionsController,
│   │   │                         SyncController, StockController, PoteauxController,
│   │   │                         AbonnementsController, MediaController, ErreursController
│   │   ├── Middleware/           TenantMiddleware (entreprise_id du jeton),
│   │   │                         AbonnementMiddleware (état actif/lecture seule)
│   │   └── Requests/             FormRequests = validation au bord, jamais dans les contrôleurs
│   ├── Policies/         Matrice de droits centralisée (§3) — une Policy par ressource
│   ├── Jobs/             GenererPdf, CompresserPhoto, TraiterExif, Notifier
│   ├── Services/         SyncService (ops + deltas), StockService (mouvements+verrous)
│   └── Support/Tenant/   TenantScope (global scope entreprise_id), TenantResolver
├── database/migrations/  numérotées, une table par fichier
├── routes/api.php        préfixe /api/v1 — l'ancien index.php reste vivant pendant la transition
└── tests/Feature/        IsolationEntrepriseTest, SyncConcurrenceTest, StockAtomicTest
```

### 17.2 Tables (toutes avec `entreprise_id` sauf référentiels globaux)
- `entreprises` — nom, état abonnement (`essai|actif|grace|lecture_seule|suspendu`), `fin_abonnement`, `limite_equipes`
- `equipes` — `entreprise_id`, nom, `chef_compte_id`
- `comptes` — `entreprise_id`, `equipe_id` (nullable), identifiant, `password_hash`, rôle (`super_admin|admin|gestionnaire|chef|technicien`), `actif`
- `auth_tokens` — `compte_id`, jeton haché, `expires_at` (90 j glissants), `revoked_at` (nommé ainsi car `sessions` est déjà une table Laravel)
- `interventions` — `entreprise_id`, `equipe_id`, `cree_par`, `chef_nom` (figé), champs métier, `statut`, **`revision` (int, incrémenté à chaque op)**, `materiel_deduit`
- `points_gps` — `entreprise_id`, `intervention_id`, `ajoute_par`, lat/lng/precision/horodatage/type/proprietaire, `photo_id` (nullable), `supprime_le` (soft-delete)
- `photos` — `entreprise_id`, `intervention_id`, `ajoute_par`, `fichier` (chemin disque), `type` (`gps|terrain|fiche|video`), métadonnées, `supprime_le`
- `articles` — `entreprise_id`, code, libellé
- `stocks` — `entreprise_id`, `article_id`, `proprietaire_type` (`central|equipe`), `proprietaire_id`, `quantite` (cache du journal)
- `mouvements_stock` — **journal immuable** : `entreprise_id`, `article_id`, `de`/`vers`, `quantite`, `par`, `operation_id`
- `operations` — **idempotence** : `uuid` unique, `entreprise_id`, `compte_id`, `type`, `intervention_id`, `applique_le` — doublon = réponse de la première application
- `audit_log` — qui/quoi/quand sur actions sensibles
- `erreurs` — journal interne §14 : empreinte, stack, compte, entreprise, appareil, version app, compteur d'occurrences

### 17.3 Routes API v1 (préfixe `/api/v1`)
- `POST /auth/login` → jeton ; `POST /auth/logout`
- `GET /interventions` (filtrée équipe/rôle), `GET /interventions/{id}`
- `POST /interventions/{id}/ops` — **le cœur du §16.2** : batch d'opérations `[{uuid,type,champ|ligne,valeur,expected_revision}]`, réponse `{revision, appliques:[uuid], conflits:[...]}`
- `GET /interventions/{id}/changes?since_rev=N` — delta §16.3
- `POST /media` (upload fichier) → job de compression/EXIF §16.5
- `POST /stock/mouvements`, `GET /stock?equipe=`, `POST /stock/import`
- `POST /errors` — remontée des plantages clients §14
- Console web : `entreprises`, `comptes`, `equipes`, `abonnements` (admin/super-admin)

### 17.4 Règles de codage
1. `intervention_id`, `equipe_id`, `compte_id` dans toute opération sont **vérifiés en base** contre le tenant du jeton — jamais de confiance client.
2. Toute écriture passe par `SyncService` ou `StockService` — les contrôleurs ne touchent pas la base directement pour les chemins critiques.
3. `revision` ne s'incrémente que via `UPDATE interventions SET revision = revision + 1 WHERE id = ? AND revision = ?` (compare-and-swap).
