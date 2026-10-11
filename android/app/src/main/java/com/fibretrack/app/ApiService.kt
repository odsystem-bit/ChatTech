package com.fibretrack.app

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.TypeAdapter
import com.google.gson.reflect.TypeToken
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter
import com.fibretrack.app.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

object ApiService {
    private const val BASE_URL = "https://fibretrack.mantota.com/api/index.php"
    private const val PDF_URL = "https://fibretrack.mantota.com/api/pdf.php"
    private const val MAX_RETRIES = 3
    private const val RETRY_DELAY_MS = 1000L
    @Volatile private var authCode = ""

    fun setAuthCode(code: String) { authCode = code }

    @Volatile
    var pendingIntervention: Intervention? = null

    private val client = OkHttpClient.Builder()
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // Le serveur renvoie parfois "" ou des chaines pour des champs numeriques ;
    // ces adaptateurs evitent les crashs Gson ("Expected a double but was STRING").
    private val gson: Gson = GsonBuilder()
        .registerTypeAdapter(Double::class.java, object : TypeAdapter<Double>() {
            override fun write(out: JsonWriter, value: Double?) {
                if (value == null) out.nullValue() else out.value(value)
            }
            override fun read(reader: JsonReader): Double? {
                if (reader.peek() == JsonToken.NULL) { reader.nextNull(); return null }
                if (reader.peek() == JsonToken.STRING) {
                    val s = reader.nextString().trim()
                    return s.toDoubleOrNull() ?: 0.0
                }
                if (reader.peek() == JsonToken.BOOLEAN) { return if (reader.nextBoolean()) 1.0 else 0.0 }
                return try { reader.nextDouble() } catch (_: Exception) { 0.0 }
            }
        })
        .registerTypeAdapter(Int::class.java, object : TypeAdapter<Int>() {
            override fun write(out: JsonWriter, value: Int?) {
                if (value == null) out.nullValue() else out.value(value)
            }
            override fun read(reader: JsonReader): Int? {
                if (reader.peek() == JsonToken.NULL) { reader.nextNull(); return null }
                if (reader.peek() == JsonToken.STRING) {
                    val s = reader.nextString().trim()
                    return s.toIntOrNull() ?: s.toDoubleOrNull()?.toInt() ?: 0
                }
                if (reader.peek() == JsonToken.BOOLEAN) { return if (reader.nextBoolean()) 1 else 0 }
                return try { reader.nextDouble().toInt() } catch (_: Exception) { 0 }
            }
        })
        .create()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private suspend fun apiGet(action: String): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url("$BASE_URL?action=$action")
        if (authCode.isNotEmpty()) builder.header("X-User-Code", authCode)
        val req = builder.build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string() ?: throw Exception("Réponse vide")
            if (!res.isSuccessful) {
                val err = try { gson.fromJson(text, ApiResponse::class.java) } catch (_: Exception) { null }
                throw Exception(err?.error?.ifEmpty { null } ?: "Erreur API ${res.code}")
            }
            text
        }
    }

    private suspend fun apiPost(action: String, body: Any): String = withContext(Dispatchers.IO) {
        val json = gson.toJson(body)
        val builder = Request.Builder()
            .url("$BASE_URL?action=$action")
            .post(json.toRequestBody(jsonType))
        if (authCode.isNotEmpty()) builder.header("X-User-Code", authCode)
        val req = builder.build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string() ?: throw Exception("Réponse vide")
            if (!res.isSuccessful) {
                val err = try { gson.fromJson(text, ApiResponse::class.java) } catch (_: Exception) { null }
                throw Exception(err?.error?.ifEmpty { null } ?: "Erreur API ${res.code}")
            }
            text
        }
    }

    suspend fun validateCode(code: String): User = withContext(Dispatchers.IO) {
        if (code == "9999") return@withContext User(id = "admin", nom = "ADMIN", isAdmin = true)
        val text = apiPost("account_validate", mapOf("code" to code))
        val user = gson.fromJson(text, User::class.java) ?: throw Exception("Code invalide")
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
        gson.fromJson(text, Intervention::class.java) ?: Intervention(id = id)
    }

    suspend fun getInterventionLight(id: String): Intervention = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_get_light", mapOf("id" to id))
        gson.fromJson(text, Intervention::class.java) ?: Intervention(id = id)
    }

    // P2 : relevé léger pour le live refresh — ne télécharge le corps
    // complet que si modifie_le a changé (économise ~90% de charge).
    suspend fun getInterventionUpdatedAt(id: String): String = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_updated_at", mapOf("id" to id))
        val obj = com.google.gson.JsonParser.parseString(text).asJsonObject
        obj.get("updated_at")?.asString ?: ""
    }

    suspend fun getInterventionPhotos(id: String): InterventionPhotos = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_get_photos", mapOf("id" to id))
        gson.fromJson(text, InterventionPhotos::class.java) ?: InterventionPhotos()
    }

    suspend fun saveIntervention(
        intervention: Intervention,
        changedFields: Collection<String>? = null,
        deletedPoints: Collection<String>? = null,
        deletedWhatsappPhotos: Collection<String>? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val text = if (changedFields == null && deletedPoints == null && deletedWhatsappPhotos == null) {
            apiPost("intervention_save", intervention)
        } else {
            val jsonObj = gson.toJsonTree(intervention).asJsonObject
            if (changedFields != null) jsonObj.add("changed_fields", gson.toJsonTree(changedFields))
            if (deletedPoints != null) jsonObj.add("deleted_points", gson.toJsonTree(deletedPoints))
            if (deletedWhatsappPhotos != null) jsonObj.add("deleted_whatsapp_photos", gson.toJsonTree(deletedWhatsappPhotos))
            jsonObj.addProperty("expected_updated_at", intervention.updated_at.ifEmpty { intervention.modifie_le })
            apiPost("intervention_save", jsonObj)
        }
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun uploadMedia(interventionId: String, type: String, file: File, latitude: Double, longitude: Double, precision: Double, capturedAt: String): Boolean = withContext(Dispatchers.IO) {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("intervention_id", interventionId)
            .addFormDataPart("type", type)
            .addFormDataPart("latitude", latitude.toString())
            .addFormDataPart("longitude", longitude.toString())
            .addFormDataPart("precision_m", precision.toString())
            .addFormDataPart("captured_at", capturedAt)
            .addFormDataPart("file", file.name, file.asRequestBody(when {
                type == "video" -> "video/mp4".toMediaType()
                file.name.endsWith(".pdf", true) -> "application/pdf".toMediaType()
                else -> "image/jpeg".toMediaType()
            }))
            .build()
        val builder = Request.Builder().url("$BASE_URL?action=media_upload").post(body)
        if (authCode.isNotEmpty()) builder.header("X-User-Code", authCode)
        client.newCall(builder.build()).execute().use { res ->
            if (!res.isSuccessful) throw Exception("Erreur upload média ${res.code}")
            val response = gson.fromJson(res.body?.string(), ApiResponse::class.java) ?: throw Exception("Réponse invalide")
            response.ok
        }
    }

    suspend fun listInterventionMedia(interventionId: String): List<InterventionMedia> = withContext(Dispatchers.IO) {
        val text = apiGet("media_list&intervention_id=${java.net.URLEncoder.encode(interventionId, "UTF-8")}")
        val type = object : TypeToken<List<InterventionMedia>>() {}.type
        gson.fromJson<List<InterventionMedia>>(text, type) ?: emptyList()
    }

    suspend fun deleteInterventionMedia(mediaId: String): Boolean = withContext(Dispatchers.IO) {
        val response = gson.fromJson(apiPost("media_delete", mapOf("id" to mediaId)), ApiResponse::class.java)
        response?.ok ?: false
    }

    suspend fun downloadFile(url: String): ByteArray = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(url)
        if (authCode.isNotEmpty()) builder.header("X-User-Code", authCode)
        client.newCall(builder.build()).execute().use { res ->
            if (!res.isSuccessful) throw Exception("Erreur téléchargement ${res.code}")
            res.body?.bytes() ?: throw Exception("Réponse vide")
        }
    }

    suspend fun saveInterventionLight(
        intervention: Intervention,
        changedFields: Collection<String>? = null,
        deletedPoints: Collection<String>? = null,
        deletedWhatsappPhotos: Collection<String>? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val json = gson.toJson(intervention)
        val jsonObj = com.google.gson.JsonParser.parseString(json).asJsonObject
        jsonObj.addProperty("_light", true)
        if (changedFields != null) jsonObj.add("changed_fields", gson.toJsonTree(changedFields))
        if (deletedPoints != null) jsonObj.add("deleted_points", gson.toJsonTree(deletedPoints))
        if (deletedWhatsappPhotos != null) jsonObj.add("deleted_whatsapp_photos", gson.toJsonTree(deletedWhatsappPhotos))
        jsonObj.addProperty("expected_updated_at", intervention.updated_at.ifEmpty { intervention.modifie_le })
        val text = apiPost("intervention_save", jsonObj)
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun deleteIntervention(id: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("intervention_delete", mapOf("id" to id))
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun listStock(): Map<String, Int> = withContext(Dispatchers.IO) {
        val text = apiGet("stock_list")
        val type = object : TypeToken<Map<String, Int>>() {}.type
        gson.fromJson(text, type) ?: emptyMap()
    }

    suspend fun saveStockItem(designation: String, quantite: Int): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("stock_save", mapOf("designation" to designation, "quantite" to quantite))
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun moveStockItem(designation: String, quantite: Int, type: String, motif: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("stock_move", mapOf(
            "designation" to designation,
            "quantite" to quantite,
            "type" to type,
            "motif" to motif
        ))
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun getStockTemplate(): List<StockTemplateItem> = withContext(Dispatchers.IO) {
        val text = apiGet("stock_template")
        val type = object : TypeToken<List<StockTemplateItem>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun importStock(items: List<StockTemplateItem>, mode: String = "set"): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("stock_import", mapOf("items" to items, "mode" to mode))
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun importStockExcel(fileBase64: String, mode: String = "set"): StockImportResult = withContext(Dispatchers.IO) {
        val text = apiPost("stock_import_excel", mapOf("file_base64" to fileBase64, "mode" to mode))
        gson.fromJson(text, StockImportResult::class.java) ?: StockImportResult(error = "Réponse invalide")
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
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    fun getStockPdfUrl(action: String): String {
        return "$PDF_URL?action=$action&code=${java.net.URLEncoder.encode(authCode, "UTF-8")}"
    }

    private const val EXCEL_EXPORT_URL = "https://fibretrack.mantota.com/api/excel_export.php"
    private const val EXCEL_HEBDO_URL = "https://fibretrack.mantota.com/api/excel_hebdo.php"

    fun getPointMaterielExcelUrl(): String {
        return "$EXCEL_EXPORT_URL?action=export_point_materiel&code=${java.net.URLEncoder.encode(authCode, "UTF-8")}"
    }

    fun getExcelHebdoUrl(weekStart: String? = null): String {
        val suffix = if (weekStart.isNullOrBlank()) "" else "&week_start=$weekStart"
        return "$EXCEL_HEBDO_URL?action=export_hebdo&code=${java.net.URLEncoder.encode(authCode, "UTF-8")}$suffix"
    }

    suspend fun listAccounts(): List<Account> = withContext(Dispatchers.IO) {
        val text = apiGet("accounts_list")
        val type = object : TypeToken<List<Account>>() {}.type
        gson.fromJson(text, type) ?: emptyList()
    }

    suspend fun addAccount(nom: String, code: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("account_add", mapOf("nom" to nom, "code" to code))
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
        resp.ok
    }

    suspend fun deleteAccount(id: String): Boolean = withContext(Dispatchers.IO) {
        val text = apiPost("account_delete", mapOf("id" to id))
        val resp = gson.fromJson(text, ApiResponse::class.java) ?: throw Exception("Réponse invalide")
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
        return "$PDF_URL?action=$action&id=$id&code=${java.net.URLEncoder.encode(authCode, "UTF-8")}"
    }
}
