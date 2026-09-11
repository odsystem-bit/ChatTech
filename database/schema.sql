-- Schema de la base de donnees FibreTrack
-- A executer dans phpMyAdmin (Hostinger) ou en ligne de commande MySQL

CREATE DATABASE IF NOT EXISTS fibretrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fibretrack;

-- Table des comptes (techniciens)
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(36) PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des interventions
CREATE TABLE IF NOT EXISTS interventions (
  id VARCHAR(36) PRIMARY KEY,
  date DATETIME NOT NULL,
  statut ENUM('en_cours','termine') DEFAULT 'en_cours',
  nom_technicien VARCHAR(255),
  nom_equipe VARCHAR(255),

  nom_client VARCHAR(255),
  adresse_zone VARCHAR(255),
  telephone_ligne VARCHAR(50),
  mobile VARCHAR(50),

  etat VARCHAR(20),
  msan VARCHAR(100),
  fat_ref VARCHAR(100),
  port VARCHAR(20),
  port_disponible TINYINT(1) DEFAULT 0,
  type_cable VARCHAR(50),
  depart_m INT DEFAULT 0,
  arrivee_m INT DEFAULT 0,
  lineaire_m INT DEFAULT 0,
  puissance_fat_dbm DECIMAL(10,2) DEFAULT 0,
  puissance_pto_dbm DECIMAL(10,2) DEFAULT 0,
  mac VARCHAR(100),
  sn VARCHAR(100),
  nb_poteaux_traverses INT DEFAULT 0,
  nb_poteaux_implantes INT DEFAULT 0,

  materiel_pose JSON,

  points_gps JSON,

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

  modifie_par VARCHAR(255),
  modifie_le DATETIME,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table du stock de materiel
CREATE TABLE IF NOT EXISTS stock (
  designation VARCHAR(255) PRIMARY KEY,
  quantite INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table des mouvements de stock (entrees/sorties)
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  designation VARCHAR(255) NOT NULL,
  type ENUM('entree', 'sortie', 'ajustement') NOT NULL,
  quantite INT NOT NULL,
  intervention_id VARCHAR(36) NULL,
  nom_client VARCHAR(255) NULL,
  nom_technicien VARCHAR(255) NULL,
  motif VARCHAR(255) NULL,
  date_mouvement DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_designation (designation),
  INDEX idx_intervention (intervention_id),
  INDEX idx_date (date_mouvement)
);

-- Insertion des designations par defaut
INSERT INTO stock (designation, quantite) VALUES
  ('rue', 0),
  ('pince', 0),
  ('crochets', 0),
  ('susp', 0),
  ('piton', 0),
  ('closer', 0),
  ('rp1', 0),
  ('traverse_13t', 0),
  ('traverse_15t', 0),
  ('semelle_eq', 0),
  ('poteau_sbee_non_arme', 0),
  ('poteau_sbee_arme', 0),
  ('ont', 0),
  ('pto', 0),
  ('repeteur_wifi', 0),
  ('jarretiere', 0),
  ('cpc_50', 0),
  ('cpc_100', 0),
  ('cpc_150', 0),
  ('cpc_200', 0),
  ('cpc_300', 0),
  ('cpc_350', 0),
  ('connecteur', 0),
  ('boulon', 0),
  ('bouchon_feuillard', 0)
ON DUPLICATE KEY UPDATE quantite = quantite;

-- Index pour performances
CREATE INDEX idx_interventions_date ON interventions (date);
CREATE INDEX idx_interventions_statut ON interventions (statut);
CREATE INDEX idx_interventions_nom_client ON interventions (nom_client);
