-- Schema de la base de donnees FibreTrack (Plateforme SaaS Multi-Equipes)
-- Collation harmonisee : utf8mb4_unicode_ci

CREATE DATABASE IF NOT EXISTS fibretrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fibretrack;

-- Table des equipes (espaces de travail isoles)
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(64) PRIMARY KEY,
  nom_equipe VARCHAR(255) NOT NULL,
  chef_nom VARCHAR(255) NOT NULL,
  telephone VARCHAR(50) DEFAULT '',
  entreprise_id VARCHAR(64) NULL,
  chaptech_equipe_id VARCHAR(64) NULL,
  revision INT DEFAULT 1,
  actif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des comptes (super_admin, chef_equipe, technicien)
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(64) PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001',
  nom VARCHAR(255) NOT NULL,
  identifiant VARCHAR(100) NULL UNIQUE,
  telephone VARCHAR(50) NULL,
  code VARCHAR(10) NULL,
  password_hash VARCHAR(255) NULL,
  api_token VARCHAR(128) NULL,
  role ENUM('super_admin', 'chef_equipe', 'technicien') NOT NULL DEFAULT 'technicien',
  actif TINYINT(1) NOT NULL DEFAULT 1,
  entreprise_id VARCHAR(64) NULL,
  chaptech_equipe_id VARCHAR(64) NULL,
  chaptech_compte_id VARCHAR(64) NULL,
  revision INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_accounts_team (team_id),
  INDEX idx_accounts_code (code),
  INDEX idx_accounts_token (api_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des interventions
CREATE TABLE IF NOT EXISTS interventions (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001',
  date DATETIME NOT NULL,
  statut VARCHAR(30) DEFAULT 'en_cours',
  nom_technicien VARCHAR(255),
  nom_equipe VARCHAR(255),

  nom_client VARCHAR(255),
  nom_dossier VARCHAR(255),
  adresse_zone VARCHAR(255),
  telephone_ligne VARCHAR(50),
  mobile VARCHAR(50),

  etat VARCHAR(20),
  msan VARCHAR(100),
  fat_ref VARCHAR(100),
  port VARCHAR(20),
  ports_disponibles VARCHAR(100) DEFAULT '',
  port_disponible TINYINT UNSIGNED DEFAULT 0,
  type_cable VARCHAR(50),
  depart_m INT DEFAULT 0,
  arrivee_m INT DEFAULT 0,
  lineaire_m INT DEFAULT 0,
  puissance_fat_dbm DECIMAL(10,2) DEFAULT 0,
  puissance_pto_dbm DECIMAL(10,2) DEFAULT 0,
  debit_descendant VARCHAR(50) DEFAULT '',
  debit_montant VARCHAR(50) DEFAULT '',
  debit_ping VARCHAR(50) DEFAULT '',
  mac VARCHAR(100),
  sn VARCHAR(100),
  nb_poteaux_traverses INT DEFAULT 0,
  nb_poteaux_implantes INT DEFAULT 0,
  nb_poteaux_armes INT DEFAULT 0,

  materiel_pose JSON,
  points_gps JSON,
  whatsapp_photos LONGTEXT,
  videos_terrain LONGTEXT,

  ont_sn VARCHAR(100),
  pto_qte INT DEFAULT 0,
  repeteur_wifi_qte INT DEFAULT 0,
  emplacement_ont VARCHAR(255),
  client_confirme_emplacement TINYINT(1) DEFAULT 0,
  offre_souscrite VARCHAR(50),
  remise_equipement_ok TINYINT(1) DEFAULT 0,
  appreciation_satisfaction_libre TEXT,

  travaux_conformes TINYINT(1) DEFAULT 0,
  emplacement_valide TINYINT(1) DEFAULT 0,
  travail_propre TINYINT(1) DEFAULT 0,
  service_teste TINYINT(1) DEFAULT 0,
  service_fonctionne TINYINT(1) DEFAULT 0,
  explications_donnees TINYINT(1) DEFAULT 0,
  recommanderait TINYINT(1) DEFAULT 0,
  accepte_recontact TINYINT(1) DEFAULT 0,
  qualite VARCHAR(30),
  delais VARCHAR(30),
  professionnalisme VARCHAR(30),
  nom_client_declaration VARCHAR(255),
  remarque_libre TEXT,
  signature_client LONGTEXT,
  signature_technicien LONGTEXT,

  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  client_gps_recu TINYINT(1) DEFAULT 0,
  client_repere VARCHAR(255) NULL,

  tournee_du_jour VARCHAR(20) NULL,
  tournee_ordre INT DEFAULT 0,
  tournee_verrouille TINYINT(1) DEFAULT 0,
  motif_non_traite VARCHAR(255) NULL,

  modifie_par VARCHAR(255),
  modifie_le DATETIME,

  materiel_deduit TINYINT(1) DEFAULT 0,

  entreprise_id VARCHAR(64) NULL,
  chaptech_equipe_id VARCHAR(64) NULL,
  chaptech_compte_id VARCHAR(64) NULL,
  chaptech_intervention_id VARCHAR(64) NULL,
  revision INT DEFAULT 1,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_interventions_team (team_id),
  INDEX idx_interventions_team_date (team_id, date),
  INDEX idx_interventions_date (date),
  INDEX idx_interventions_statut (statut),
  INDEX idx_interventions_nom_client (nom_client)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table du stock de materiel par equipe
CREATE TABLE IF NOT EXISTS stock (
  team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001',
  designation VARCHAR(255) NOT NULL,
  quantite INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, designation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des mouvements de stock (entrees/sorties) par equipe
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001',
  designation VARCHAR(255) NOT NULL,
  type ENUM('entree', 'sortie', 'ajustement') NOT NULL,
  quantite INT NOT NULL,
  intervention_id VARCHAR(36) NULL,
  nom_client VARCHAR(255) NULL,
  nom_technicien VARCHAR(255) NULL,
  motif VARCHAR(255) NULL,
  date_mouvement DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sm_team (team_id),
  INDEX idx_designation (designation),
  INDEX idx_intervention (intervention_id),
  INDEX idx_date (date_mouvement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des medias d'intervention par equipe
CREATE TABLE IF NOT EXISTS intervention_media (
  id CHAR(36) PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001',
  intervention_id VARCHAR(36) NOT NULL,
  type ENUM('photo', 'video', 'fiche') NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  precision_m DECIMAL(10,2) NULL,
  captured_at DATETIME NULL,
  added_by VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_media_team (team_id),
  INDEX idx_media_intervention (intervention_id),
  INDEX idx_media_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des interventions supprimees par equipe
CREATE TABLE IF NOT EXISTS deleted_interventions (
  id VARCHAR(64) NOT NULL,
  team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001',
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_del_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
