# ⚡ ChapTech CelPros Autofill - Extension Celtiis Fibre

> **Extension de navigateur Manifest V3 (Chrome, Microsoft Edge, Kiwi Browser sur Android)** pour l'automatisation complète et le pré-remplissage intelligent des formulaires d'intervention fibre sur **Celtiis CelPros** (`https://celpros.celtiis.bj/`) et **FAT Automation** (`https://fatautomation.celtiis.bj/`), synchronisée en temps réel avec la base de données **ChapTech / FibreTrack**.

---

## 🎯 Objectif & Bénéfices

Sur le terrain, les techniciens fibre saisissent leurs relevés dans **FibreTrack / ChapTech** (mesures optiques, linéaire, poteaux, matériel posé, conformité, SN/MAC de l'ONT). Ils devaient ensuite recopier manuellement chaque champ dans les formulaires de l'opérateur Celtiis sur **CelPros**.

Cette extension élimine les erreurs de saisie et fait gagner un temps précieux :
- ⏱️ **Remplissage en 1 clic** de plus de 40 champs (client, réseau, FAT, câblage, puissance, conformité).
- 🧩 **100% compatible SPA** : déclenche les événements natifs (`focus`, `input`, `change`, `blur`) nécessaires aux formulaires réactifs Angular / JHipster de CelPros.
- 📱 **Prête pour mobile Android** via **Kiwi Browser** directement sur le smartphone du technicien.
- 🔄 **Mode hors-ligne / Import JSON** : utilisable même en zone blanche sans connexion à l'API.
- 📋 **Export & Copie rapide** : génération du rapport textuel prêt à envoyer sur WhatsApp.

---

## 🚀 Installation Pas à Pas

### 1. Sur Google Chrome (Ordinateur)
1. Ouvrez Google Chrome et rendez-vous sur : `chrome://extensions/`
2. En haut à droite de la page, activez le bouton bascule **« Mode développeur »**.
3. Cliquez sur le bouton **« Charger l'extension non empaquetée »** (Load unpacked).
4. Sélectionnez le dossier contenant l'extension :  
   `C:\Users\Davyh\.gemini\antigravity\scratch\ChatTech\extension-celpros`
5. L'icône de l'extension **ChapTech CelPros** apparaît dans la barre d'outils Chrome. Épinglez-la pour un accès rapide.

---

### 2. Sur Microsoft Edge (Ordinateur)
1. Ouvrez Edge et rendez-vous sur : `edge://extensions/`
2. Dans la colonne de gauche, activez **« Mode développeur »**.
3. Cliquez sur **« Charger les fichiers décompressés »**.
4. Sélectionnez le dossier `ChatTech/extension-celpros`.

---

### 3. Sur Smartphone Android via Kiwi Browser (Sur le terrain)
Les techniciens sur le terrain peuvent utiliser cette extension directement sur leur smartphone Android :
1. Installez **Kiwi Browser** depuis le [Google Play Store](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser). *(Kiwi Browser est basé sur Chromium et prend en charge nativement les extensions Chrome Manifest V3).*
2. Copiez le dossier `extension-celpros` sur le smartphone (ou compressez-le en `.zip`).
3. Dans Kiwi Browser, touchez le menu **⋮** (trois points en haut à droite) puis sélectionnez **Extensions**.
4. Activez le **Mode développeur** en haut à droite.
5. Touchez **+(from .zip/.crx/.user.js)** et sélectionnez le fichier zip, ou importez le dossier.
6. Connectez-vous sur `https://celpros.celtiis.bj/` : le widget flottant **⚡ ChapTech** apparaît automatiquement en bas de l'écran !

---

## ⚙️ Configuration de l'Extension

Cliquez sur l'icône de l'extension dans votre navigateur pour ouvrir la **Popup de configuration** :

1. **URL de l'API ChapTech** :  
   `https://fibretrack.mantota.com/api/index.php` *(valeur par défaut, modifiable si besoin)*.
2. **Code technicien / Clé d'accès** :  
   Entrez votre code d'accès (`9999` pour l'administrateur ou votre code personnel à 4 chiffres).
3. **Tester la connexion** :  
   Cliquez sur **Tester**. L'extension vérifie la communication avec le backend et affiche le nombre de fiches disponibles (`Connecté (XX fiches)`).
4. Cliquez sur **💾 Enregistrer les paramètres**.

---

## 📖 Guide d'Utilisation sur CelPros & FAT Automation

### 1. Sur Celtiis CelPros
1. Ouvrez votre fiche d'intervention sur CelPros :  
   `https://celpros.celtiis.bj/technicien/intervention/{id}/fibre/installation`
2. Le widget flottant **⚡ ChapTech CelPros** s'affiche en bas à droite de votre écran.
   - S'il est replié, cliquez sur le badge **⚡ ChapTech CelPros** pour le déplier.
3. Dans la liste déroulante, tapez le nom du client ou la référence du FAT pour filtrer et sélectionner votre intervention.
4. Les informations récapitulatives de l'intervention s'affichent (Client, FAT, Puissances, Linéaire, ONT).
5. Cliquez sur le bouton vert :  
   **🚀 Remplir le formulaire CelPros**
6. **Magie !** Tous les champs correspondants sur la page sont automatiquement remplis et s'illuminent brièvement en vert :
   - Inputs texte & nombres
   - Menus déroulants (Offre, État PON, Qualité)
   - Cases à cocher (Travaux conformes, Service testé, etc.)
   - Radios Oui/Non
7. Un bandeau vous informe du nombre exact de champs remplis (ex: `24 champs remplis avec succès !`).
8. Cliquez sur la section **🔍 Champs détectés sur cette page** pour inspecter le détail si besoin.
9. Vérifiez visuellement les données, puis cliquez sur le bouton de soumission standard de CelPros.

---

### 2. Sur FAT Automation (`https://fatautomation.celtiis.bj/`)
Le widget détecte automatiquement la page FAT Automation et pré-remplit :
- Référence FAT / PBO
- MSAN / OLT
- Numéro de port
- Ports disponibles (liste et nombre)
- Puissance optique FAT (dBm)

---

### 3. Outils Additionnels dans le Widget
- **📋 Copier WhatsApp** : Copie dans votre presse-papiers le rapport complet d'intervention proprement formaté pour être collé directement dans une discussion WhatsApp d'équipe ou de supervision.
- **📦 Copier JSON** : Copie l'objet JSON complet de l'intervention.
- **📥 Importer (Mode Hors-ligne)** : Si vous êtes en zone blanche et n'avez pas de réseau pour interroger l'API, vous pouvez coller directement le JSON d'une intervention pour la pré-remplir instantanément !

---

## 🧪 Tester l'Extension sans accès VPN Celtiis (Démo locale)

Deux pages de simulation réalistes sont intégrées à l'extension pour des tests immédiats :
- **Démo CelPros** : Ouvrez dans votre navigateur :  
  `extension-celpros/demo/celpros-mock.html`
- **Démo FAT Automation** : Ouvrez dans votre navigateur :  
  `extension-celpros/demo/fatautomation-mock.html`

Ces pages simulent la structure HTML/Angular exacte de CelPros et affichent un journal temps réel de tous les événements réactifs déclenchés par l'autofill.

---

## 📊 Table de Correspondance des Champs (Mapping)

| Catégorie | Donnée ChapTech | Sélecteurs CelPros reconnus | Type d'élément |
| :--- | :--- | :--- | :--- |
| **Client** | `nom_client` | `nomClient`, `field_nomClient`, `client`, labels "Nom du client" | Text input |
| **Client** | `adresse_zone` | `adresse`, `field_adresse`, `zone`, labels "Adresse / Zone" | Text input |
| **Client** | `telephone_ligne` | `telephone`, `field_telephone`, `numeroLigne`, "Ligne fixe" | Text input |
| **Client** | `mobile` | `mobile`, `field_mobile`, `contact`, labels "Mobile / Contact" | Text input |
| **Client** | `offre_souscrite` | `offre`, `field_offre`, `formule`, labels "Offre souscrite" | Select / Radio |
| **Réseau** | `etat` | `etat`, `field_etat`, `etatPon`, labels "État PON" | Select / Radio |
| **Réseau** | `msan` | `msan`, `field_msan`, `olt`, `nro`, labels "MSAN" | Text input |
| **Réseau** | `fat_ref` | `fat`, `field_fat`, `fatRef`, `pbo`, labels "Réf FAT / PBO" | Text input |
| **Réseau** | `port` | `port`, `field_port`, `numeroPort`, labels "Port raccordé" | Text input |
| **Réseau** | `ports_disponibles` | `portsDisponibles`, `field_portsDisponibles`, "Ports dispo" | Text input |
| **Réseau** | `port_disponible` | `portDisponible`, `field_portDisponible`, "Nb ports dispo" | Number input |
| **Réseau** | `puissance_fat_dbm` | `puissanceFat`, `field_puissanceFat`, labels "Puissance FAT (dBm)" | Number input |
| **Câblage** | `type_cable` | `typeCable`, `field_typeCable`, labels "Type de câble" | Text input |
| **Câblage** | `depart_m` | `depart`, `field_depart`, labels "Départ (m)" | Number input |
| **Câblage** | `arrivee_m` | `arrivee`, `field_arrivee`, labels "Arrivée (m)" | Number input |
| **Câblage** | `lineaire_m` | `lineaire`, `field_lineaire`, labels "Linéaire (m)" | Number input |
| **Câblage** | `nb_poteaux_traverses`| `poteauxTraverses`, `field_poteauxTraverses` | Number input |
| **Câblage** | `nb_poteaux_implantes`| `poteauxImplantes`, `field_poteauxImplantes` | Number input |
| **Câblage** | `nb_poteaux_armes` | `poteauxArmes`, `field_poteauxArmes` | Number input |
| **Mesures** | `puissance_pto_dbm` | `puissancePto`, `field_puissancePto`, labels "Puissance PTO" | Number input |
| **Mesures** | `pto_qte` | `ptoQte`, `field_ptoQte`, labels "Qté PTO" | Number input |
| **Mesures** | `repeteur_wifi_qte` | `repeteurWifi`, `field_repeteurWifi`, "Répéteur WiFi" | Number input |
| **Matériel**| `emplacement_ont` | `emplacementOnt`, `field_emplacementOnt`, "Emplacement ONT" | Text input |
| **Matériel**| `mac` | `mac`, `field_mac`, `adresseMac`, labels "Adresse MAC" | Text input |
| **Matériel**| `sn` / `ont_sn` | `sn`, `field_sn`, `ontSn`, `serialNumber`, labels "SN (ONT)" | Text input |
| **Contrôle**| `travaux_conformes` | `travauxConformes`, `field_travauxConformes` | Checkbox / Radio |
| **Contrôle**| `emplacement_valide` | `emplacementValide`, `field_emplacementValide` | Checkbox / Radio |
| **Contrôle**| `travail_propre` | `travailPropre`, `field_travailPropre` | Checkbox / Radio |
| **Contrôle**| `service_teste` | `serviceTeste`, `field_serviceTeste` | Checkbox / Radio |
| **Contrôle**| `service_fonctionne` | `serviceFonctionne`, `field_serviceFonctionne` | Checkbox / Radio |
| **Contrôle**| `explications_donnees`| `explicationsDonnees`, `field_explicationsDonnees` | Checkbox / Radio |
| **Contrôle**| `qualite` | `qualite`, `field_qualite`, labels "Qualité globale" | Select |
| **Contrôle**| `remarque_libre` | `remarques`, `field_remarques`, labels "Observations" | Textarea |
| **GPS** | Coordonnées / Lat / Lng | `latitude`, `longitude`, `gps`, `coordonneesGps` | Text / Number |

---

## 🛠️ Architecture du Code & Tests

```
extension-celpros/
├── manifest.json              # Déclaration Manifest V3 Chrome & Edge
├── background/
│   └── service-worker.js      # Service Worker (CORS bypass, cache & communication)
├── content/
│   ├── field-mapping.js       # Dictionnaire de correspondance intelligent & normalisation
│   ├── form-filler.js         # Moteur de remplissage réactif (dispatch d'événements SPA)
│   ├── ui-widget.js           # Widget flottant interactif (repliable, sélecteur, toasts)
│   ├── content.js             # Script d'injection et gestionnaire du cycle de vie
│   └── content.css            # Feuilles de style (widget, surbrillance verte, toasts)
├── popup/
│   ├── popup.html             # Interface de configuration dans la barre d'outils
│   ├── popup.js               # Contrôleur de configuration & statut de connexion
│   └── popup.css              # Styles de la popup
├── demo/
│   ├── celpros-mock.html      # Page de simulation CelPros pour tests locaux
│   └── fatautomation-mock.html# Page de simulation FAT Automation
├── icons/                     # Icônes PNG (16, 32, 48, 128) & SVG
├── tests/
│   ├── field-mapping.test.js  # Tests unitaires du dictionnaire de mapping
│   └── form-filler.test.js    # Tests unitaires du moteur de remplissage et du DOM
├── generate-icons.js          # Générateur d'icônes PNG sans dépendance externe
└── package.json               # Métadonnées et scripts de test
```

### Lancement des Tests Automatisés
Les tests unitaires utilisent le moteur natif Node.js (`node:test`) :
```bash
npm test
```
Résultat attendu :
```
✔ FieldMapping - normalizeText removes accents, punctuation, and trims
✔ FieldMapping - FIELD_DEFINITIONS contains all critical intervention keys
✔ FieldMapping - valueExtractors correctly extract data from intervention object
✔ FieldMapping - matchElementToField matches JHipster style input attributes
✔ FormFiller - setNativeInputValue sets value and dispatches focus, input, change, blur
✔ FormFiller - setNativeCheckboxValue checks element and dispatches events
✔ FormFiller - setNativeSelectValue matches by value or text
✔ FormFiller - handleRadioGroup selects matching radio button
✔ FormFiller - autofillPage matches and fills complete simulated CelPros form
✔ FormFiller - formatWhatsAppReport outputs well-formatted text report
ℹ tests 10
ℹ pass 10
ℹ fail 0
```
