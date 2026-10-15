package com.fibretrack.app.models

import com.google.gson.annotations.SerializedName

data class User(
    val id: String = "",
    val nom: String = "",
    val isAdmin: Boolean = false
)

data class Intervention(
    val id: String = "",
    val date: String = "",
    val statut: String = "en_cours",
    val nom_technicien: String = "",
    val nom_equipe: String = "TELECOM BTP Services",
    val nom_client: String = "",
    val nom_dossier: String = "",
    val adresse_zone: String = "",
    val telephone_ligne: String = "",
    val mobile: String = "",
    val etat: String = "PON",
    val msan: String = "",
    val fat_ref: String = "",
    val port: String = "",
    val ports_disponibles: String = "",
    val port_disponible: Int = 0,
    val type_cable: String = "",
    val depart_m: Double = 0.0,
    val arrivee_m: Double = 0.0,
    val lineaire_m: Double = 0.0,
    val puissance_fat_dbm: Double = 0.0,
    val puissance_pto_dbm: Double = 0.0,
    val mac: String = "",
    val sn: String = "",
    val nb_poteaux_traverses: Int = 0,
    val nb_poteaux_implantes: Int = 0,
    val nb_poteaux_armes: Int = 0,
    val ont_sn: String = "",
    val pto_qte: Int = 0,
    val repeteur_wifi_qte: Int = 0,
    val emplacement_ont: String = "",
    val client_confirme_emplacement: Boolean = false,
    val offre_souscrite: String = "Fibre Pro",
    val remise_equipement_ok: Boolean = false,
    val appreciation_satisfaction_libre: String = "",
    val travaux_conformes: Boolean = false,
    val emplacement_valide: Boolean = false,
    val travail_propre: Boolean = false,
    val service_teste: Boolean = false,
    val service_fonctionne: Boolean = false,
    val explications_donnees: Boolean = false,
    val recommanderait: Boolean = false,
    val accepte_recontact: Boolean = false,
    val qualite: String = "Satisfait",
    val delais: String = "Satisfait",
    val professionnalisme: String = "Satisfait",
    val nom_client_declaration: String = "",
    val remarque_libre: String = "",
    val signature_client: String = "",
    val signature_technicien: String = "",
    val modifie_par: String = "",
    val modifie_le: String = "",
    val updated_at: String = "",
    val materiel_pose: Map<String, Int> = emptyMap(),
    val points_gps: List<GpsPoint> = emptyList(),
    val whatsapp_photos: List<WhatsappPhoto> = emptyList()
)

data class GpsPoint(
    val type: String = "",
    val sous_type: String = "",
    val numero: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val precision_m: Double = 0.0,
    val horodatage: String = "",
    val ajoute_par: String = "",
    val lieu: String = "",
    val proprietaire: String = "",
    val photo: String = ""
)

data class InterventionLight(
    val id: String = "",
    val date: String = "",
    val statut: String = "",
    val nom_technicien: String = "",
    val nom_equipe: String = "",
    val nom_client: String = "",
    val nom_dossier: String = "",
    val adresse_zone: String = "",
    val telephone_ligne: String = "",
    val etat: String = "",
    val msan: String = "",
    val fat_ref: String = "",
    val port: String = "",
    val offre_souscrite: String = ""
)

data class Account(
    val id: String = "",
    val nom: String = "",
    val code: String = ""
)

data class WhatsappPhoto(
    val id: String = "",
    val url: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val precision_m: Double = 0.0,
    val horodatage: String = "",
    val lieu: String = "",
    val from_gps: Boolean = false,
    val added: String = "",
    val name: String = ""
)

data class StockItem(
    val designation: String = "",
    val quantite: Int = 0
)

data class StockTemplateItem(
    val designation: String = "",
    val label: String = "",
    val quantite: Int = 0
)

data class StockImportResult(
    val ok: Boolean = false,
    val count: Int = 0,
    val not_found: List<String> = emptyList(),
    val error: String = ""
)

data class StockMovement(
    val id: Int = 0,
    val designation: String = "",
    val type: String = "",
    val quantite: Int = 0,
    val intervention_id: String? = null,
    val nom_client: String? = null,
    val nom_technicien: String? = null,
    val motif: String? = null,
    val date_mouvement: String = "",
    val int_nom_client: String? = null,
    val int_date: String? = null
)

data class ApiResponse(
    val ok: Boolean = false,
    val error: String = "",
    val id: String = ""
)

data class InterventionPhotos(
    val points_gps: List<GpsPoint> = emptyList(),
    val whatsapp_photos: List<WhatsappPhoto> = emptyList(),
    val signature_client: String = "",
    val signature_technicien: String = ""
)

data class InterventionMedia(
    val id: String = "",
    val intervention_id: String = "",
    val type: String = "",
    val file_path: String = "",
    val url: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val precision_m: Double = 0.0,
    val captured_at: String = "",
    val added_by: String = "",
    val created_at: String = ""
)
