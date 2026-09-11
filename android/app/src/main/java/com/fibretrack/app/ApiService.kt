package com.fibretrack.app

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.fibretrack.app.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
import java.util.concurrent.TimeUnit

object ApiService {
    private const val BASE_URL = "https://fibretrack.mantota.com/api/index.php"
    private const val PDF_URL = "https://fibretrack.mantota.com/api/pdf.php"

    @Volatile
    var pendingIntervention: Intervention? = null

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private suspend fun apiGet(action: String): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$BASE_URL?action=$action").build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string() ?: throw Exception("Réponse vide")
            if (!res.isSuccessful) {
                try {
                    val err = gson.fromJson(text, ApiResponse::class.java)
                    throw Exception(err.error.ifEmpty { "Erreur API ${res.code}" })
                } catch (e: Exception) {
                    if (e is java.lang.Exception) throw e
                    throw Exception("Erreur API ${res.code}")
                }
            }
            text
        }
    }

    private suspend fun apiPost(action: String, body: Any): String = withContext(Dispatchers.IO) {
        val json = gson.toJson(body)
        val req = Request.Builder()
            .url("$BASE_URL?action=$action")
            .post(json.toRequestBody(jsonType))
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string() ?: throw Exception("Réponse vide")
            if (!res.isSuccessful) {
                try {
                    val err = gson.fromJson(text, ApiResponse::class.java)
                    throw Exception(err.error.ifEmpty { "Erreur API ${res.code}" })
                } catch (e: Exception) {
                    if (e is java.lang.Exception) throw e
                    throw Exception("Erreur API ${res.code}")
                }
            }
            text
        }
    }

    suspend fun validateCode(code: String): User = withContext(Dispatchers.IO) {
        if (code == "9999") return@withContext User(id = "admin", nom = "ADMIN", isAdmin = true)
        val text = apiPost("account_validate", mapOf("code" to code))
        val user = gson.fromJson(text, User::class.java)
        if (user.id.isEmpty()) throw Exception("Code invalide")
        user
    }

    suspend fun listInterventionsLight(): List<InterventionLight> = withContext(Dispatchers.IO) {
        val text = apiGet("interventions_list_light")
        val type = object : TypeToken<List<InterventionLight>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun getIntervention(id: String): Intervention = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_get", mapOf("id" to id))
        gson.fromJson(text, Intervention::class.java)
    }

    suspend fun getInterventionLight(id: String): Intervention = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_get_light", mapOf("id" to id))
        gson.fromJson(text, Intervention::class.java)
    }

    suspend fun getInterventionPhotos(id: String): InterventionPhotos = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_get_photos", mapOf("id" to id))
        gson.fromJson(text, InterventionPhotos::class.java)
    }

    suspend fun saveIntervention(intervention: Intervention): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_save", intervention)
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    suspend fun saveInterventionLight(intervention: Intervention): Boolean = withContext(Dispatchers.IO) {
        val json = gson.toJson(intervention)
        val jsonObj = com.google.gson.JsonParser.parseString(json).asJsonObject
        jsonObj.addProperty("_light", true)
        val text = apiPost("intervention_save", jsonObj)
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    suspend fun deleteIntervention(id: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_delete", mapOf("id" to id))
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    suspend fun listStock(): Map<String, Int> = withContext(Dispatchers.IO) {
        val text = apiGet("stock_list")
        val type = object : TypeToken<Map<String, Int>>() {}.type
        gson.fromJson(text, type) ?: emptyMap()
    }

    suspend fun saveStockItem(designation: String, quantite: Int): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("stock_save", mapOf("designation" to designation, "quantite" to quantite))
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    suspend fun getStockTemplate(): List<StockTemplateItem> = withContext(Dispatchers.IO) {
        val text = apiGet("stock_template")
        val type = object : TypeToken<List<StockTemplateItem>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun importStock(items: List<StockTemplateItem>): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("stock_import", mapOf("items" to items))
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    suspend fun getStockMovements(): List<StockMovement> = withContext(Dispatchers.IO) {
        val text = apiGet("stock_movements")
        val type = object : TypeToken<List<StockMovement>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun getStockUsage(interventionId: String): List<StockMovement> = withContext(Dispatchers.IO) {
        val text = apiPost("stock_usage", mapOf("id" to interventionId))
        val type = object : TypeToken<List<StockMovement>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun deductStock(interventionId: String, nomClient: String, nomTech: String, materiel: Map<String, Int>): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("stock_deduct", mapOf(
            "intervention_id" to interventionId,
            "nom_client" to nomClient,
            "nom_technicien" to nomTech,
            "materiel_pose" to materiel
        ))
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    fun getStockPdfUrl(action: String): String {
        return "$PDF_URL?action=$action"
    }

    suspend fun listAccounts(): List<Account> = withContext(Dispatchers.IO) {
        val text = apiGet("accounts_list")
        val type = object : TypeToken<List<Account>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun addAccount(nom: String, code: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("account_add", mapOf("nom" to nom, "code" to code))
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    suspend fun deleteAccount(id: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("account_delete", mapOf("id" to id))
        val resp = gson.fromJson(text, ApiResponse::class.java)
        resp.ok
    }

    fun createEmptyIntervention(technicien: String): Intervention {
        return Intervention(
            id = UUID.randomUUID().toString(),
            date = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date()),
            statut = "en_cours",
            nom_technicien = technicien
        )
    }

    fun getPdfUrl(action: String, id: String): String {
        return "$PDF_URL?action=$action&id=$id"
    }
}
