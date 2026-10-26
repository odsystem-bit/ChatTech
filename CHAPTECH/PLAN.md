# CHAPTECH - Plan produit SaaS

**Mise à jour du 13/10/2026 : conception en cours, aucun code tant que les rôles et le périmètre ne sont pas validés (§2, §3, §6 ter, §12).**

Statut (12/10/2026) : **étapes 1 à 5 codées** (fondations, stock par équipe, attribution et déduction, console web, poteaux). Alerte de stock insuffisant faite. Poteaux corrigés : ils relèvent du rôle **Conformité**, pas du chef d'équipe. Photo EPI du matin codée côté serveur et console (§6 bis). **Reste** : APK pour l'EPI (envoi, verrou, file locale), dossiers du jour (§6 bis, à concevoir), page Supervision, exports d'inventaire, abonnements/Moneroo, Celtiis.
Point de départ : l'application actuelle FibreTrack (`../fibretrack`), utilisée par une seule entreprise (TELECOM BTP Services).

## 1. Vision
Une plateforme où **chaque entreprise s'abonne** pour gérer ses techniciens, ses chefs d'équipe, ses interventions, son inventaire et l'attribution du matériel. Les données d'une entreprise sont **totalement isolées** de celles des autres.

## 2. Hiérarchie

```
Plateforme CHAPTECH (super-admin : nous)
 └── Entreprise (client abonné)
      ├── Admin entreprise
      ├── Gestionnaire de stock DE BASE (voit tout le stock de l'entreprise)
      │    └── Gestionnaires de stock de ville (matériel déposé et confié dans leur ville)
      ├── Conformité DE BASE (voit toute la conformité de l'entreprise)
      │    └── Conformité de ville (une par ville)
      ├── Coordonnateur DE BASE (met les dossiers, dans n'importe quelle ville) et Superviseur DE BASE (dispatche aux équipes de n'importe quelle ville)
      │    └── Coordonnateur de ville (met les dossiers de sa ville) et Superviseur de ville (dispatche aux équipes de sa ville)
      └── Villes (Cotonou, Porto-Novo, Parakou, ...)
           └── Équipe
                ├── Chef d'équipe (gère le matériel de l'équipe)
                └── Techniciens (membres, peuvent compléter les interventions)
```

Principe multi-villes (validé le 13/10/2026) : une entreprise a plusieurs **villes** (objet « ville ») ; chaque équipe, gestionnaire de stock de ville, conformité de ville, **superviseur et coordonnateur** est rattaché à une ville. Le responsable de base voit tout, quelle que soit la ville ; le responsable de ville ne voit que sa ville.

## 3. Rôles et droits

| Action | Super-admin | Admin entreprise | Gestionnaire stock | Conformité | Chef d'équipe | Technicien |
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
| Suivre les poteaux implantés / armés / traversés | - | oui | non | oui, toutes les équipes | **non** | non |
| Voir les photos EPI du matin et la conformité terrain | - | oui | non | oui, toutes les équipes | envoie la photo de son équipe | non |
| Envoyer la photo EPI qui ouvre l'APK de l'équipe | - | - | - | - | oui | non |
| Rapports et exports | - | tous | stock | conformité (poteaux, EPI) | son équipe (hors poteaux) | non |

**Rôles ajoutés le 13/10/2026** (le périmètre par ville est validé ; les points marqués « à valider » restent ouverts)

| Action | Superviseur | Coordonnateur | Gestionnaire stock de base | Gestionnaire stock de ville | Conformité de base | Conformité de ville |
|---|---|---|---|---|---|---|
| Voir tous les dossiers et interventions | oui | oui | lecture | lecture (sa ville) | lecture | lecture (sa ville) |
| Mettre (saisir) des dossiers dans une ville | non | oui, **sa ville** (de base : toutes villes) | non | non | non | non |
| Dispatcher les dossiers aux équipes | oui, équipes de **sa ville** (de base : toutes villes) | non | non | non | non | non |
| Voir le stock | non | non | tout, toutes villes | sa ville | non | non |
| Gérer le stock, attribuer le matériel | non | non | oui, à toute équipe, **toutes villes** | oui, aux équipes de **sa ville** | non | non |
| Poteaux, photos EPI (voir, valider, rejeter, révoquer) | non | non | non | non | toutes villes | sa ville |
| Messagerie interne | oui | oui | oui | oui | oui | oui |

**Superviseur et coordonnateur** : deux rôles distincts (décision du 14/10/2026) :
- le **coordonnateur met les dossiers** dans le système, par ville : celui de Parakou ne voit et ne met que les dossiers de Parakou, celui de Cotonou ceux de Cotonou ;
- le **superviseur dispatche** ces dossiers aux équipes de sa ville.

Chacun existe en **version de base** (sans ville, agit sur n'importe quelle ville) et en **version de ville** (sa ville seulement). D'autres fonctions propres à chacun seront ajoutées plus tard.

**Stock multi-villes** (décision du 13/10/2026) : le gestionnaire de base est **le seul** à alimenter les villes ; il donne le stock à chaque ville, et tout transfert entre villes passe **obligatoirement** par lui. Il y a un **stock par ville** (confié au gestionnaire de ville) en plus du stock central. Le gestionnaire de ville distribue aux équipes de sa ville ; le gestionnaire de base voit et attribue partout.

Tous les rôles (admin, chef, technicien inclus) ont accès à la **messagerie de leur entreprise** (§6 ter).

Un technicien appartient à **une seule équipe**. **Le technicien peut compléter les interventions** de son équipe (confirmé le 13/10/2026) ; il ne les crée pas.

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

## 6 bis. Conformité et photo EPI du matin
### Rôle Conformité
Un rôle d'entreprise gère **tout ce qui est conformité sur le terrain** : poteaux, photos, respect des règles. Il **voit toutes les équipes de son entreprise**. Le chef d'équipe n'a **pas** accès au suivi des poteaux (correction du 12/10/2026). La section est destinée à s'enrichir.

### Photo EPI chaque matin
Codé (backend + console, 12/10/2026). Activable **par entreprise** (`epi_obligatoire`, désactivé par défaut pour ne rien imposer aux entreprises existantes).

- Chaque matin, le **chef d'équipe prend une photo de l'équipe en EPI** et l'envoie depuis l'APK.
- **La Conformité valide** : l'équipe est débloquée. **Elle peut aussi rejeter, avec un motif obligatoire** : l'équipe reste bloquée et le chef peut renvoyer une photo (le délai de 30 min repart).
- **Sans décision au bout de 30 minutes, l'équipe se débloque d'elle-même.**
- **Plus tard, la Conformité peut revoir la photo et révoquer** le déblocage si l'EPI n'est pas respecté.
- **Le déblocage ne vaut que de 6h à 23h** (heure locale, Africa/Porto-Novo). Hors de cette plage, l'équipe est bloquée.
- Tant que l'équipe est bloquée, le serveur refuse (code 423) la création de fiche, la synchronisation des opérations et l'envoi de médias. L'APK garde ses opérations en file locale et les renvoie une fois débloquée.
- **Chef absent** : l'admin ou la Conformité donne le droit d'envoi à un technicien de l'équipe ; le chef peut aussi prévenir à l'avance (avant minuit) en désignant un technicien. Si personne n'a prévenu, **la Conformité voit l'équipe « à signaler » à partir de 8h30** (sans photo ni délégation) et autorise un technicien.
- **Hors réseau** : internet est nécessaire, mais l'APK met la photo en file locale (avec l'heure de prise de vue) et l'envoie dès que la connexion revient. Le délai de 30 min part de la réception par le serveur.
- **Tout se passe dans l'APK** (décision du 13/10/2026) : envoi de la photo, verrouillage, alertes et notifications, sans SMS ni WhatsApp. Le **chef peut renvoyer sa photo sans limite**, y compris après une révocation.
- Reste à faire : côté APK (envoi de la photo, verrouillage, file locale, gestion du code 423, notification à 8h30 pour la conformité ; pour l'instant : bandeau dans la console).

### Dossiers du jour et Dispatching (codé le 26/10/2026)
- **Un dossier est une intervention** : statut de distribution `statut_distribution` (`a_dispatcher`, `dispatche`, `en_cours`, `termine`, `non_traite`) et date `date_dossier`.
- Les **coordonnateurs créent les dossiers** (par ville, unitaire ou lot de 4-5) : contrôleur `DossiersController` + écran console [`Dossiers.jsx`](file:///C:/Users/Davyh/.gemini/antigravity/scratch/ChatTech/CHAPTECH/console/src/pages/Dossiers.jsx).
- Les **superviseurs dispatchent** ces dossiers aux équipes **de leur ville** en 1 clic : contrôleur `DispatchingController` + écran console [`Dispatching.jsx`](file:///C:/Users/Davyh/.gemini/antigravity/scratch/ChatTech/CHAPTECH/console/src/pages/Dispatching.jsx).
- **Indicateur de charge en temps réel** : visualisation du nombre de dossiers déjà assignés à chaque équipe aujourd'hui.
- **Étanchéité par ville** : le serveur refuse toute attribution hors de la ville du dossier (code 422).
- **Bascule automatique en fin de journée** : les dossiers non finalisés ou non traités basculent dans l'onglet des reliquats antérieurs et peuvent être reprogrammés en 1 clic pour aujourd'hui.
- **Déclaration non traité** avec motif obligatoire : 0 stock déduit.

## 6 ter. Messagerie interne (nouveau, à concevoir)
Idée du 13/10/2026 : un système de messagerie où **tous les membres d'une même entreprise peuvent échanger**. Isolation stricte : jamais de message entre entreprises.

Règles validées le 13/10/2026 :
- **Chaque équipe a son groupe**. Y sont : le chef, les techniciens, **les superviseurs, les conformités et l'admin** de l'entreprise.
- **Le super-admin est dans tous les groupes mais caché** : personne ne voit qu'il est là (ni dans la liste des membres, ni dans les compteurs).
- **Messages individuels** : tout membre de l'entreprise peut écrire à tout autre membre, y compris d'une équipe à une autre (technicien, chef, admin, conformité, superviseur, coordonnateur, gestionnaire de stock).
- Tout reste **dans l'entreprise** ; jamais d'échange entre deux entreprises.

Règles ajoutées le 14/10/2026 :
- **Un groupe par ville** et **un groupe pour toute l'entreprise**, en plus des groupes d'équipe.
- **Pièces jointes (photos) autorisées.**
- **Suppression de message : l'auteur et l'admin** seulement.

Proposition (à valider) :
- **Phase 1** : discussions 1 à 1 et groupes (équipe, ville, entreprise).
- La suppression garde une trace côté serveur (à confirmer).
- Messages texte, avec photo en pièce jointe. Envoi possible hors réseau (file locale), comme pour les opérations terrain.
- Lien possible d'un message vers un dossier ou une intervention.
- Statuts : envoyé, lu. Notifications poussées plus tard (liées au point de l'alerte 8h30).
- Données : `conversations`, `conversation_membres`, `messages`, toutes avec `entreprise_id`.
- **Phase 2** : API temps réel (WebSocket) ; la phase 1 peut se contenter d'un rafraîchissement régulier.

## 7. Application et interfaces
- **Console web** pour les **entreprises** (admin, gestionnaire de stock, conformité) et pour le **super-admin** : équipes, comptes, stock, attribution, import, inventaires, suivi des poteaux, rapports, abonnements.
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
5. **Conformité** : suivi des poteaux (implantés, armés, traversés) pour le rôle Conformité, puis photos EPI et contrôle terrain (voir §6 bis).
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
- Les poteaux sont gérés par le rôle **Conformité** (toutes les équipes), jamais par le chef d'équipe.
- Photo EPI du matin prise par le chef : elle débloque l'APK de toute son équipe pour la journée.
- 13/10/2026 : rôles superviseur et coordonnateur (voir 14/10 pour le partage des tâches) ; objet ville ; gestionnaires de stock et conformités de ville rattachés à ceux de base ; le gestionnaire de base attribue partout.
- 13/10/2026 : un dossier est une intervention ; chaque ville a ses dossiers, aucun passage d'une ville à une autre sauf par les rôles de base.
- 13/10/2026 : superviseur et coordonnateur sont deux rôles distincts, en version de base et de ville.
- 13/10/2026 : le gestionnaire de base alimente les villes, transferts entre villes uniquement par lui, stock par ville.
- 14/10/2026 : le coordonnateur met les dossiers, le superviseur les dispatche aux équipes, chaque ville ne voit que ses dossiers.
- 14/10/2026 : messagerie avec pièces jointes ; suppression par l'auteur et l'admin ; groupes d'équipe, de ville et d'entreprise.
- 13/10/2026 : EPI et alertes dans l'APK, renvoi de la photo sans limite.
- 13/10/2026 : la conformité de base peut valider l'EPI (toutes villes) ; la conformité de ville valide celui des équipes de sa ville.
- 13/10/2026 : messagerie interne par entreprise, groupe par équipe, messages individuels libres dans l'entreprise, super-admin invisible.

## 12. Questions ouvertes
- Questions d'architecture : voir `ARCHITECTURE.md`, section 14.
- **Version de base** : coordonnateur et superviseur de base existent-ils bien (compris ainsi) ?
- **Dossiers** : qui réattribue le lendemain, dans la même ville (proposé : le superviseur de la ville, plus l'admin) ? Un dossier non traité garde-t-il son historique en passant à une autre équipe de la même ville (proposé : oui) ?
- **Membres des groupes** : qui est dans le groupe de ville (proposé : toutes les équipes et responsables de la ville) et dans le groupe d'entreprise (proposé : tous les membres) ?
- Reporter plus tard : essai gratuit, remise annuelle, période de grâce, Moneroo, Celtiis.
