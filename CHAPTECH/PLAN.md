# CHAPTECH - Plan produit SaaS

Statut (11/10/2026) : **étapes 1 à 5 codées** (fondations, stock par équipe, attribution et déduction, console web, suivi des poteaux). **Reste** : alerte de stock insuffisant (TODO dans `StockService`), page Supervision, exports d'inventaire, abonnements/Moneroo, Celtiis.
Point de départ : l'application actuelle FibreTrack (`../fibretrack`), utilisée par une seule entreprise (TELECOM BTP Services).

## 1. Vision
Une plateforme où **chaque entreprise s'abonne** pour gérer ses techniciens, ses chefs d'équipe, ses interventions, son inventaire et l'attribution du matériel. Les données d'une entreprise sont **totalement isolées** de celles des autres.

## 2. Hiérarchie

```
Plateforme CHAPTECH (super-admin : nous)
 └── Entreprise (client abonné)
      ├── Admin entreprise
      ├── Gestionnaire de stock (magasinier)
      ├── Responsable poteaux (implantation / armement)
      └── Équipe
           ├── Chef d'équipe (gère le matériel de l'équipe)
           └── Techniciens (membres)
```

## 3. Rôles et droits

| Action | Super-admin | Admin entreprise | Gestionnaire stock | Resp. poteaux | Chef d'équipe | Technicien |
|---|---|---|---|---|---|---|
| Créer / suspendre une entreprise, gérer les abonnements | oui | non | non | non | non | non |
| Créer des équipes, nommer les chefs, créer des comptes | - | oui | non | non | non | non |
| Voir les interventions | - | toutes | lecture | lecture | son équipe | son équipe |
| Créer une intervention | - | oui | non | non | oui | non |
| Compléter une intervention (photos, GPS, matériel, signatures) | - | oui | non | non | oui | oui |
| Importer / gérer le stock central | - | oui | oui | non | non | non |
| Attribuer du matériel aux équipes en un clic | - | oui | oui | non | non | non |
| Suivre la consommation du matériel en temps réel | - | oui | oui | non | son équipe | non |
| Télécharger l'inventaire d'une équipe | - | oui | oui | non | son équipe | non |
| Suivre les poteaux implantés / armés / traversés | - | oui | non | oui | son équipe | non |
| Rapports et exports | - | tous | stock | poteaux | son équipe | non |

Un technicien appartient à **une seule équipe**.

Règle d'affichage : le **nom du chef d'équipe** apparaît toujours sur l'intervention (fiche, PDF, rapport WhatsApp), enregistré à la création de la fiche.

Les droits sont vérifiés **côté serveur**, jamais seulement masqués dans l'application.

## 4. Modèle de données (multi-entreprise)
Toutes les tables métier portent `entreprise_id`. Chaque requête est filtrée par l'entreprise du compte connecté.

- `entreprises` : id, nom, statut (essai / actif / suspendu), date de création
- `abonnements` : entreprise_id, formule, nb_equipes_max, prix_mensuel, début, fin, statut
- `comptes` : id, entreprise_id, nom, rôle, équipe_id (null pour l'admin), code ou mot de passe
- `equipes` : id, entreprise_id, nom, chef_id
- `interventions` : champs actuels + entreprise_id, equipe_id, chef_nom
- `articles` : id, entreprise_id, désignation, unité, seuil d'alerte
- `stock` : equipe_id, article_id, quantité
- `mouvements_stock` : entrée / sortie / ajustement / attribution / retour, avec auteur, intervention, motif, date
- `attributions` : article_id, equipe_id, quantité, date, auteur (stock central vers équipe)
- `paiements` : entreprise_id, montant, période couverte, référence Moneroo, statut (en attente / payé / échoué), date
- `imports_stock` : fichier, auteur, équipe, mode, résumé, date

## 5. Stock et attribution
- **Stock central** de l'entreprise géré par le **gestionnaire de stock**, qui **attribue en un clic** du matériel aux différentes équipes (sortie du central, entrée dans le stock de l'équipe).
- **Suivi en temps réel** : chaque matériel posé par un technicien met à jour le stock de son équipe, et le gestionnaire voit la consommation de toutes les équipes.
- **Inventaire téléchargeable** (Excel) par équipe ou pour toute l'entreprise.
- L'admin voit et gère tout.
- **Import automatique** : fichier Excel/CSV au format fixe (`designation`, `quantite`, `equipe` optionnel), modèle téléchargeable.
  - Mode « remplacer » ou « ajouter ».
  - Aperçu et validation avant application, lignes en erreur signalées.
  - Chaque import est journalisé.
- **Le stock appartient à l'équipe** : pas d'avoir personnel par technicien. Le chef et les techniciens de l'équipe posent du matériel depuis le même stock d'équipe.
- **Déduction automatique** : à la fin d'une intervention, le matériel posé est déduit du stock de l'équipe. L'intervention garde le nom du technicien et le chef voit qui a consommé quoi.
- **Attribution** : stock central vers équipe, faite par le gestionnaire.
- **Stock insuffisant** : l'app prévient le technicien et le chef, la pose reste possible mais est signalée (stock négatif à régulariser) pour ne pas bloquer le terrain.
- **Retour / transfert** : le chef peut rendre du matériel au stock central, et le gestionnaire peut transférer d'une équipe à une autre.
- **Alertes** : seuil minimal par article.

## 6. Abonnements
### Tarif
- **1 à 5 équipes : 10 000 FCFA/mois.** **6 à 10 équipes : 20 000 FCFA/mois**, et ainsi de suite par blocs de 5.
- L'entreprise ne peut pas créer plus d'équipes que son palier ne le permet. Elle peut passer au palier supérieur à tout moment.
- **Activation manuelle** : le super-admin fixe la durée d'utilisation (date de fin) de chaque entreprise. Essai gratuit, remise annuelle et détails de facturation : plus tard.

### Paiement (Moneroo)
- **Phase 1 (manuelle)** : on crée l'entreprise, l'abonnement et un **lien de paiement Moneroo**. Dès le paiement confirmé, on active l'abonnement (ou automatiquement via notification Moneroo).
- **Phase 2** : l'admin entreprise **renouvelle depuis sa page web** : bouton « Renouveler » qui ouvre le paiement Moneroo, puis activation automatique par webhook.
- Les paiements sont enregistrés (table `paiements`) avec la référence Moneroo ; on vérifie toujours côté serveur que le paiement est réellement confirmé avant d'activer.
- Rappels automatiques avant expiration (7 jours, 1 jour).

### Cycle de vie
- Actif, puis **période de grâce de 5 jours** après expiration (tout fonctionne, bandeau d'avertissement).
- Ensuite **lecture seule** : consultation et export possibles, plus de création ni de modification.
- Les données ne sont jamais supprimées à l'expiration.
- Les entreprises **nous contactent** : c'est le super-admin qui crée l'entreprise et la configure la première fois.

## 7. Application et interfaces
- **Console web** pour les **entreprises** (admin, gestionnaire de stock, responsable poteaux) et pour le **super-admin** : équipes, comptes, stock, attribution, import, inventaires, suivi des poteaux, rapports, abonnements.
- **App Android (APK)** pour les **chefs d'équipe et techniciens** : interventions, photos, GPS, matériel posé. Mise à jour automatique déjà en place.
- Domaine : on garde `fibretrack.mantota.com` pour l'instant, changement de domaine plus tard (prévoir une URL configurable).
- Authentification : le code à 4 chiffres est trop faible pour un SaaS. Prévoir identifiant + mot de passe (ou code long) par entreprise.

## 8. Intégration Celtiis (CelPros)
Objectif : envoyer automatiquement les données d'une intervention terminée à `https://celpros.celtiis.bj/` pour que Celtiis active le client.

Constat après vérification :
- CelPros est une application **JHipster** (Spring Boot). La page d'accueil renvoie une erreur d'interface.
- Sa documentation d'API (`/v3/api-docs`) exige une authentification (401) : **aucune API publique documentée**.
- On ne peut donc pas connaître les champs ni le format de soumission sans accès.

À obtenir de Celtiis ou de l'entreprise partenaire :
- Un compte de test et la documentation de leur API (ou confirmation qu'une API existe pour partenaires).
- Les champs obligatoires de la soumission et le mode d'authentification (jeton, clé).
- Les règles de validation (formats MAC / SN, puissances, photos, etc.).

Plan : si l'API existe, ajouter un module « Soumission Celtiis » (envoi, statut, relance en cas d'échec, journal). Sinon, fournir un **export prêt à saisir** (copier-coller / fichier) avec les champs déjà alignés sur leur formulaire. Ne pas automatiser leur interface web sans accord écrit de Celtiis.

## 9. Migration depuis FibreTrack
1. Créer l'entreprise « TELECOM BTP Services » et son équipe.
2. Rattacher les 46 interventions, les 4 comptes et le stock actuel.
3. Remplacer le code admin `9999` écrit en dur par un vrai compte admin.
4. Aucune perte de données, retour arrière possible.

## 10. Étapes proposées
1. **Fondations** : entreprises, comptes, rôles, équipes, isolation des données.
2. **Stock par équipe** et import Excel.
3. **Attribution du matériel** et déduction automatique.
4. **Console web** admin.
5. **Suivi des poteaux** (implantés, armés, traversés) pour le responsable poteaux.
6. **Abonnements** (limite d'équipes) et facturation.
7. **Intégration Celtiis**, selon l'accès à leur API.
8. **Sécurité et production** : sauvegardes, journal d'audit, mots de passe.

Chaque étape est livrable séparément et testable avec l'équipe actuelle.

## 11. Décisions prises
- Un technicien = une seule équipe.
- Les entreprises nous contactent, nous les créons.
- Abonnement par paliers de 5 équipes : 1 à 5 = 10 000 FCFA/mois, 6 à 10 = 20 000, etc.
- Pour l'instant, le super-admin active et fixe la durée d'utilisation à la main.
- Le stock de l'entreprise (central) est distinct de celui des équipes ; le gestionnaire fait les sorties/attributions vers les équipes.
- Exports (inventaire, poteaux) : par équipe ou global.
- Un seul métier (fibre) pour l'instant.
- L'architecture est décrite dans `ARCHITECTURE.md`.
- Paiement via liens Moneroo ; configuration initiale par nous, renouvellement depuis la page admin ensuite.
- Le stock appartient à l'équipe (pas d'avoir par technicien).
- Celtiis : on prendra contact plus tard.
- Domaine changé plus tard.
- Entreprises et super-admin sur le web, chefs d'équipe et techniciens sur l'APK.

## 12. Questions ouvertes
- Questions d'architecture : voir `ARCHITECTURE.md`, section 14.
- Reporter plus tard : essai gratuit, remise annuelle, période de grâce, Moneroo, Celtiis.
