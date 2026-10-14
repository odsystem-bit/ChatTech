<USER_REQUEST>
# INSTRUCTION TECHNIQUE — AUDIT COMPLET DE LA BASE DE DONNÉES ET SYNCHRONISATION DE FIBRETRACK

## 1. Contexte et problème constaté

Je constate des anomalies importantes concernant la conservation des données dans Fibretrack, notamment au niveau des photos prises sur le terrain et de certaines interventions qui ne sont plus visibles dans l'application.

Certaines photos avaient déjà été prises et enregistrées, mais je ne les retrouve plus. De même, certaines interventions précédemment enregistrées semblent avoir disparu ou ne sont plus accessibles.

Je ne sais pas si ces problèmes sont liés aux dernières modifications apportées à l'application, à un problème de base de données, à un défaut de synchronisation ou à une mauvaise gestion du stockage des fichiers.

Un autre point important est que l'application mobile Android, installée sous forme d'APK, contient encore des données qui ne semblent pas toutes présentes dans la version actuelle de Fibretrack.

Il faut donc déterminer précisément où sont stockées les données de chaque version, comment elles sont synchronisées et pourquoi certaines informations sont absentes de l'application actuelle.

**Attention : les photos et les interventions de Fibretrack constituent des données opérationnelles importantes. Elles ne doivent jamais être supprimées, écrasées ou perdues à la suite d'une modification de l'application.**

L'objectif n'est pas simplement de corriger l'affichage, mais de garantir durablement l'intégrité, la persistance et la récupération des données.

## 2. Première étape : auditer l'architecture existante

Avant toute modification du code, effectue un audit complet de l'application et de son infrastructure.

Vérifie les éléments suivants :

- Quelle base de données est réellement utilisée par Fibretrack ?
- La base de données est-elle distante, locale ou hybride ?
- Si une base distante existe, l'application y est-elle effectivement connectée ?
- Quelle base de données utilise la version mobile Android (APK) ?
- La version web et l'application Android utilisent-elles la même base de données ?
- Si elles utilisent des bases différentes, existe-t-il un mécanisme de synchronisation opérationnel entre elles ?
- Où sont physiquement stockées les photos : dans la base de données, dans un espace de stockage distant, dans le téléphone ou dans le navigateur ?
- Les photos sont-elles conservées durablement ou simplement enregistrées dans un stockage temporaire ?
- Les interventions sont-elles correctement enregistrées dans la base de données ou seulement conservées dans l'état local de l'application ?
- Les dernières modifications ont-elles pu remplacer une configuration, une URL de connexion, un schéma de données ou un mécanisme de stockage ?

Examine également les variables d'environnement, les fichiers de configuration, les migrations, les API, les journaux d'erreurs, les mécanismes d'authentification et les scripts de déploiement.

Ne te contente pas de vérifier que des paramètres de connexion existent dans le code. Il faut confirmer que les connexions fonctionnent réellement et que les opérations de lecture et d'écriture aboutissent.

## 3. Deuxième étape : rechercher les données manquantes

Effectue un inventaire précis des données disponibles dans tous les emplacements accessibles.

Examine notamment :

- Les photos enregistrées sur le téléphone.
- Les photos présentes dans le stockage local de l'application Android.
- Les photos présentes dans le stockage de la version web.
- Les enregistrements de photos dans la base de données.
- Les éventuels espaces de stockage de fichiers distants.
- Les interventions existantes dans les différentes bases de données.
- Les données locales en attente de synchronisation.
- Les sauvegardes disponibles et les éventuelles versions antérieures des données.

Pour chaque photo, vérifie si le fichier existe encore, si son chemin ou son URL est valide, si son enregistrement en base de données est présent et si l'utilisateur dispose des autorisations nécessaires pour y accéder.

Pour chaque intervention, vérifie son existence réelle en base, son identifiant, ses relations avec les photos, son statut de synchronisation et sa visibilité dans l'interface.

Il faut distinguer clairement les situations suivantes :

1. La donnée existe, mais elle ne s'affiche plus dans l'interface.
2. L'enregistrement existe, mais le fichier photo a disparu.
3. Le fichier photo existe, mais sa référence en base de données est incorrecte.
4. La donnée existe uniquement sur le téléphone.
5. La donnée existe uniquement dans une ancienne base ou une sauvegarde.
6. La donnée n'existe plus dans les emplacements actuellement accessibles.

Ne conclus pas qu'une donnée a été définitivement perdue avant d'avoir examiné les différentes sources disponibles.

Produis un rapport indiquant les données retrouvées, les données manquantes, les causes probables et les possibilités de récupération.

## 4. Troisième étape : vérifier si les dernières modifications ont écrasé des données

Analyse l'historique des modifications récentes du projet.

Vérifie notamment si des changements ont affecté :

- La configuration de la base de données.
- Les URL des API et les paramètres de connexion.
- Les noms des tables, des colonnes ou des collections.
- Les migrations et scripts d'initialisation.
- Les fonctions d'enregistrement et de suppression des photos.
- Les chemins de stockage des fichiers.
- Les mécanismes de synchronisation mobile/web.
- Les filtres d'affichage des interventions.
- Les procédures de réinitialisation des données.
- Les déploiements susceptibles d'avoir recréé ou remplacé une base de données.

Recherche particulièrement les opérations susceptibles de supprimer ou de remplacer des données existantes : réinitialisation de tables, suppression en cascade, remplacement de collections, écrasement de fichiers, nettoyage du stockage ou recréation de la base.

Ne suppose pas que les dernières modifications sont nécessairement responsables. Identifie la cause à partir des preuves disponibles.

## 5. Quatrième étape : sécuriser les données avant toute correction

Avant d'effectuer une migration, une restauration ou une modification importante :

- Réalise une sauvegarde de chaque base de données accessible.
- Sauvegarde les fichiers photos et leurs métadonnées.
- Préserve les données locales disponibles sur le téléphone.
- Conserve les configurations actuelles et l'historique des modifications.
- Vérifie que les sauvegardes sont exploitables.
- Documente les emplacements d'origine de chaque sauvegarde.

Ne supprime, ne fusionne et ne remplace aucune donnée avant d'avoir établi un plan de récupération et de rapprochement.

Ne désinstalle pas l'application Android et n'efface pas ses données locales tant que les éventuelles données non synchronisées n'ont pas été récupérées.

Si une restauration est nécessaire, privilégie une restauration contrôlée vers un environnement de test avant toute intervention sur la production.

## 6. Cinquième étape : rétablir une architecture de données fiable

Après l'audit, propose et mets en œuvre la correction la plus adaptée à l'architecture réellement existante.

L'objectif est de disposer d'une source de données de référence clairement identifiée, accessible par les différentes versions autorisées de Fibretrack.

Si la version web et l'application Android doivent partager les mêmes données, elles doivent utiliser une base de données commune et un espace de stockage de fichiers durable, ou un mécanisme de synchronisation fiable si l'architecture retenue nécessite plusieurs stockages.

La solution doit respecter les exigences suivantes :

- Les interventions sont enregistrées durablement dans une base de données persistante.
- Les photos sont conservées dans un stockage durable adapté aux fichiers.
- Chaque photo possède une référence stable associée à son intervention.
- Les identifiants des interventions et des photos restent cohérents entre les plateformes.
- Les données ne dépendent pas uniquement de la mémoire du navigateur ou du téléphone.
- Les opérations d'écriture disposent d'une confirmation explicite de réussite.
- Les erreurs de connexion ou d'enregistrement sont signalées clairement.
- Les données en attente de synchronisation sont conservées jusqu'à leur confirmation.
- Les conflits de synchronisation sont détectés et traités sans écrasement silencieux.
- Les opérations répétées ne créent pas de doublons.
- Les utilisateurs ne peuvent accéder qu'aux données autorisées.
- Les sauvegardes et les procédures de restauration sont documentées et testées.

Si une synchronisation hors ligne existe ou est nécessaire, mets en place une file d'attente persistante avec identifiants uniques, tentatives de reprise, suivi des erreurs et confirmation côté serveur.

Ne supprime pas une photo locale avant d'avoir confirmé que son transfert distant est terminé et que le fichier distant est accessible.

## 7. Sixième étape : définir une politique stricte de conservation des photos

Les photos de terrain sont des preuves opérationnelles. Leur conservation doit être traitée comme une exigence fondamentale.

Lors de l'enregistrement d'une photo :

1. Générer un identifiant unique.
2. Enregistrer le fichier dans le stockage prévu.
3. Vérifier que le fichier a bien été transféré et qu'il est accessible.
4. Enregistrer en base les métadonnées nécessaires : identifiant, intervention associée, chemin de stockage, date de prise de vue et informations utiles disponibles.
5. Confirmer la réussite de l'ensemble de l'opération.
6. En cas d'échec, conserver le fichier local et signaler que la synchronisation reste à effectuer.

La suppression d'une intervention ne doit pas entraîner automatiquement la suppression définitive de ses photos, sauf si une règle métier explicite l'autorise et qu'un mécanisme de conservation approprié a été défini.

Privilégie une suppression logique lorsque cela est adapté, avec traçabilité des opérations et possibilité de restauration.

Aucune modification de l'interface ne doit pouvoir supprimer involontairement les fichiers déjà enregistrés.

## 8. Septième étape : réconcilier les données de l'APK avec celles de la version actuelle

L'application Android semble contenir des données qui ne sont pas toutes visibles dans la version actuelle.

Il faut donc établir une comparaison entre les données locales du téléphone, les données distantes et celles affichées dans l'application actuelle.

Si certaines données existent uniquement sur le téléphone :

- Récupère-les sans effacer leur source.
- Identifie les interventions et photos concernées.
- Vérifie leur intégrité et leurs relations.
- Compare les identifiants pour éviter les doublons.
- Détermine si elles doivent être importées dans la base de référence.
- Prépare une procédure de migration contrôlée.
- Vérifie ensuite leur présence et leur accessibilité depuis les deux plateformes.

Si les données sont dans une base locale SQLite ou dans un autre stockage embarqué, identifie précisément le mécanisme de récupération possible.

Si les données ne sont accessibles qu'au moyen de l'application installée, indique clairement les accès ou éléments techniques nécessaires pour les extraire. N'affirme pas qu'elles ont été récupérées tant que leur intégrité n'a pas été vérifiée.

## 9. Huitième étape : effectuer des tests de non-régression

Après les corrections, exécute une série de tests concrets sur un environnement de test, puis valide les changements en production selon une procédure sécurisée.

Les tests doivent notamment couvrir les scénarios suivants :

**Test A — Enregistrement d'une intervention**

Créer une intervention, fermer l'application, la rouvrir et vérifier que l'intervention est toujours présente.

**Test B — Enregistrement d'une photo**

Prendre une photo, vérifier son enregistrement, fermer l'application, puis contrôler que la photo est toujours accessible et correctement associée à l'intervention.

**Test C — Synchronisation mobile/web**

Créer une intervention et une photo depuis le téléphone, puis vérifier leur disponibilité dans la version web. Effectuer également le test dans le sens inverse si cette fonctionnalité est prévue.

**Test D — Connexion interrompue**

Simuler une perte de connexion pendant un enregistrement. Vérifier que la donnée n'est pas perdue et que la synchronisation reprend correctement.

**Test E — Modification de l'application**

Déployer une nouvelle version et vérifier que les données précédemment enregistrées restent accessibles.

**Test F — Gestion des erreurs**

Simuler un échec de transfert ou d'enregistrement et vérifier qu'aucune confirmation trompeuse n'est affichée.

**Test G — Récupération**

Restaurer une sauvegarde dans un environnement de test et vérifier que les interventions, les photos et leurs associations sont bien récupérées.

**Test H — Doublons et conflits**

Synchroniser plusieurs fois la même opération et vérifier qu'elle ne génère pas de doublons ni d'écrasements silencieux.

## 10. Neuvième étape : livrer un rapport d'audit avant de conclure

À la fin de l'intervention, fournis un rapport structuré avec les rubriques suivantes :

1. Architecture actuelle de Fibretrack.
2. Base de données réellement utilisée par chaque plateforme.
3. Emplacement réel des photos.
4. État de la connexion et de la synchronisation.
5. Nombre d'interventions retrouvées, lorsque les données disponibles permettent de le déterminer.
6. Nombre de photos retrouvées, manquantes ou inaccessibles, lorsque cela peut être vérifié.
7. Causes identifiées ou hypothèses restant à confirmer.
8. Données récupérées et méthode utilisée.
9. Corrections réalisées dans le code et l'infrastructure.
10. Résultats détaillés des tests.
11. Sauvegardes effectuées et procédure de restauration.
12. Risques résiduels et recommandations pour prévenir une nouvelle perte de données.

Distingue les faits vérifiés des hypothèses. Si un accès à la base distante, au téléphone ou à l'infrastructure manque, indique précisément ce qui reste à vérifier.

## 11. Consignes impératives

- Ne modifie pas le fonctionnement existant avant d'avoir compris l'architecture.
- Ne recrée pas une base de données sans vérifier si une base existante contient déjà des données importantes.
- Ne remplace pas une configuration fonctionnelle par une nouvelle configuration sans justification.
- Ne supprime aucun fichier ou enregistrement dans le cadre du diagnostic.
- Ne considère pas une donnée comme enregistrée simplement parce qu'elle apparaît à l'écran.
- Ne considère pas la synchronisation comme fonctionnelle sans l'avoir testée dans les deux sens lorsqu'elle est prévue.
- Ne masque pas une erreur d'enregistrement en affichant un succès.
- Ne déploie pas de correction destructive sans sauvegarde vérifiée et procédure de retour arrière.

**Priorité absolue : retrouver et sécuriser les données existantes, comprendre la cause réelle du problème, puis corriger durablement l'architecture de stockage et de synchronisation.**

Commence par l'audit et le rapport de diagnostic. Ensuite, propose un plan de correction précis, en distinguant les actions sans risque des opérations nécessitant une sauvegarde ou une validation préalable. Une fois les données sécurisées et la stratégie validée, procède aux corrections nécessaires et démontre leur efficacité par des tests reproductibles.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-14T12:54:46+01:00.
</ADDITIONAL_METADATA>