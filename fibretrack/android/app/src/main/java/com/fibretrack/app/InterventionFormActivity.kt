package com.fibretrack.app

import android.Manifest
import android.app.Activity
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.app.AlertDialog
import android.location.Location
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import com.google.android.gms.tasks.CancellationToken
import com.google.android.gms.tasks.CancellationTokenSource
import android.provider.MediaStore
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.fibretrack.app.models.GpsPoint
import com.fibretrack.app.models.Intervention
import com.fibretrack.app.models.InterventionMedia
import com.fibretrack.app.models.InterventionPhotos
import com.fibretrack.app.models.WhatsappPhoto
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.tabs.TabLayout
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.*

class InterventionFormActivity : AppCompatActivity() {

    private lateinit var intervention: Intervention
    private lateinit var container: LinearLayout
    private lateinit var tvSaveStatus: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var btnFinish: MaterialButton
    private lateinit var btnSave: MaterialButton
    private lateinit var btnPhotoGps: MaterialButton
    private lateinit var btnVideoGps: MaterialButton
    private lateinit var scrollView: androidx.core.widget.NestedScrollView
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var finishing = false

    private val fieldMap = mutableMapOf<String, View>()
    private val tabSections = mutableListOf<LinearLayout>()

    private var gpsContainer: LinearLayout? = null
    private var waPhotosContainer: LinearLayout? = null
    private var gpsTypeSpinner: Spinner? = null
    private var gpsSousTypeSpinner: Spinner? = null
    private var gpsProprietaireEdit: EditText? = null
    private var gpsStatusText: TextView? = null
    private var waStatusText: TextView? = null
    private var portsDisponiblesText: TextView? = null
    private var portsDisponiblesContainer: LinearLayout? = null
    private val portsDisponibles = linkedSetOf<String>()
    private var sigClientPad: SignaturePadView? = null
    private var sigTechPad: SignaturePadView? = null

    private var pendingPhotoUri: Uri? = null
    private var pendingPhotoMode: String = "gps"

    private val materielStandard = listOf(
        "ont" to "ONT", "pto" to "PTO", "jarretiere" to "Jarretière",
        "piton" to "Piton", "cheville" to "Cheville", "connecteur" to "Connecteur",
        "closer" to "Closer", "fibre_1fo" to "Câble Fibre 1FO",
        "cpc_50" to "Câble CPC 50", "cpc_100" to "Câble CPC 100",
        "cpc_150" to "Câble CPC 150", "cpc_200" to "Câble CPC 200",
        "cpc_250" to "Câble CPC 250", "cpc_300" to "Câble CPC 300",
        "cpc_350" to "Câble CPC 350", "crochets" to "Crochets",
        "pince" to "Pince", "susp" to "Suspente (Susp)",
        "traverse_13t" to "Traverse 13T", "traverse_15t" to "Traverse 15T"
    )
    private val materielViews = mutableMapOf<String, EditText>()

    private val autoSaveHandler = Handler(Looper.getMainLooper())
    private var autoSaveRunnable: Runnable? = null
    private var photosLoaded = false

    // --- Médias partagés (onglet Galerie) ---
    private var serverMediaContainer: LinearLayout? = null
    private var serverMediaLoaded = false
    private var serverMedia: List<InterventionMedia> = emptyList()

    // --- Rafraîchissement en direct (collaboration multi-techniciens) ---
    private var remoteRefreshJob: Job? = null
    private var applyingRemoteChanges = false
    private val dirtyFields = linkedSetOf<String>()
    private val deletedGpsPoints = linkedSetOf<String>()
    private val deletedWhatsappPhotoIds = linkedSetOf<String>()

    // Champs lourds (JSON base64 / LONGTEXT) exclus du patch d'autosave :
    // ils ne sont envoyés qu'au save complet pour éviter de réécrire des Mo.
    private val HEAVY_DIRTY_FIELDS = setOf(
        "points_gps", "whatsapp_photos", "signature_client", "signature_technicien"
    )

    // --- Suivi des envois de médias ---
    private var autoSaveInFlight = false
    private var pendingMediaUploads = 0
    private var mediaUploadDialog: AlertDialog? = null

    private val cameraLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success && pendingPhotoUri != null) {
            handlePhotoResult(pendingPhotoUri!!, pendingPhotoMode)
        }
    }

    private val galleryLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            handlePhotoResult(uri, pendingPhotoMode)
        }
    }

    // CaptureVideo() standard n'accepte pas d'extras : la caméra
    // plafonnait la vidéo bien avant 2 min selon l'appareil.
    // Contrat maison qui impose EXTRA_DURATION_LIMIT = 120 s.
    private class CaptureVideoMax2min : ActivityResultContract<Uri, Boolean>() {
        override fun createIntent(context: Context, input: Uri): Intent =
            Intent(MediaStore.ACTION_VIDEO_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, input)
                .putExtra(MediaStore.EXTRA_DURATION_LIMIT, 120) // 2 minutes
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)

        override fun parseResult(resultCode: Int, intent: Intent?): Boolean =
            resultCode == Activity.RESULT_OK
    }

    private val videoLauncher = registerForActivityResult(CaptureVideoMax2min()) { success ->
        if (success && pendingPhotoUri != null) {
            saveVideoToGallery(pendingPhotoUri!!, "CHAPTECH_${System.currentTimeMillis()}.mp4")
            Toast.makeText(this, "Vidéo enregistrée dans Pictures/CHAPTECH", Toast.LENGTH_SHORT).show()
            uploadVideoWithGps(pendingPhotoUri!!)
        }
    }

    private val ficheScannerLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
            val pdf = scanResult?.pdf
            if (pdf != null) {
                uploadFichePdfToServer(pdf.uri)
                return@registerForActivityResult
            }
            val firstPage = scanResult?.pages?.firstOrNull()?.imageUri
            if (firstPage == null) {
                Toast.makeText(this, "Scan annulé ou vide", Toast.LENGTH_SHORT).show()
            } else {
                uploadFicheToServer(firstPage)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_intervention_form)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }
        tvSaveStatus = findViewById(R.id.tvSaveStatus)
        progressBar = findViewById(R.id.progressBar)
        container = findViewById(R.id.formContainer)
        btnFinish = findViewById(R.id.btnFinish)
        btnSave = findViewById(R.id.btnSave)
        btnPhotoGps = findViewById(R.id.btnPhotoGps)
        btnVideoGps = findViewById(R.id.btnVideoGps)
        scrollView = findViewById(R.id.scrollView)

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        val interventionId = intent.getStringExtra("intervention_id") ?: ""
        val hadPending = ApiService.pendingIntervention != null
        intervention = ApiService.pendingIntervention ?: ApiService.createEmptyIntervention(SessionManager.getUserName(this))
        ApiService.pendingIntervention = null

        toolbar.title = if (intervention.nom_client.isNotEmpty()) intervention.nom_client else "Nouvelle intervention"

        setupTabs()
        buildAllTabs()

        btnSave.setOnClickListener { save(showToast = true) }
        btnFinish.setOnClickListener { finishIntervention() }
        btnPhotoGps.setOnClickListener {
            findViewById<TabLayout>(R.id.tabLayout).getTabAt(1)?.select()
            openCamera("gps")
        }
        btnVideoGps.setOnClickListener { openVideoCamera() }

        if (intervention.statut == "termine") {
            btnFinish.isEnabled = false
            btnFinish.text = "Terminé"
        }

        if (!hadPending && interventionId.isNotEmpty()) {
            progressBar.visibility = View.VISIBLE
            lifecycleScope.launch {
                try {
                    val loaded = ApiService.getInterventionLight(interventionId)
                    intervention = loaded
                    runOnUiThread {
                        toolbar.title = if (intervention.nom_client.isNotEmpty()) intervention.nom_client else "Nouvelle intervention"
                        if (intervention.statut == "termine") {
                            btnFinish.isEnabled = false
                            btnFinish.text = "Terminé"
                        }
                        buildAllTabs() // Reconstruire les tabs avec les données chargées
                        progressBar.visibility = View.GONE
                        setupAutoSaveListeners() // Activer auto-save après chargement
                    }
                } catch (e: Exception) {
                    progressBar.visibility = View.GONE
                    android.widget.Toast.makeText(this@InterventionFormActivity, "Erreur chargement: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
                    setupAutoSaveListeners() // Activer auto-save même en cas d'erreur
                }
            }
        } else {
            setupAutoSaveListeners() // Activer auto-save pour nouvelle intervention
        }
        startLiveRefresh()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Nettoyer le handler pour éviter les memory leaks
        autoSaveRunnable?.let { autoSaveHandler.removeCallbacks(it) }
        autoSaveRunnable = null
        remoteRefreshJob?.cancel()
        mediaUploadDialog?.dismiss()
    }

    private fun setupAutoSaveListeners() {
        fun watcher(field: String) = object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) { markDirty(field); scheduleAutoSave() }
        }
        for ((key, v) in fieldMap) {
            when (v) {
                is EditText -> v.addTextChangedListener(watcher(key))
                is com.google.android.material.textfield.TextInputEditText -> v.addTextChangedListener(watcher(key))
                is Spinner -> {
                    var first = true
                    v.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                            // Le listener se déclenche une fois à l'attachement : ne pas marquer dirty pour ça
                            if (first) { first = false; return }
                            markDirty(key); scheduleAutoSave()
                        }
                        override fun onNothingSelected(parent: AdapterView<*>?) {}
                    }
                }
                is CheckBox -> v.setOnCheckedChangeListener { _, _ -> markDirty(key); scheduleAutoSave() }
                is RadioGroup -> v.setOnCheckedChangeListener { _, _ -> markDirty(key); scheduleAutoSave() }
            }
        }
        for ((key, et) in materielViews) {
            et.addTextChangedListener(watcher("materiel_pose.$key"))
        }
    }

    private fun markDirty(field: String) {
        if (!applyingRemoteChanges) dirtyFields.add(field)
    }

    private fun setupTabs() {
        val tabLayout = findViewById<TabLayout>(R.id.tabLayout)
        val tabs = listOf("Rapport rapide", "GPS", "Mise en service", "Satisfaction", "Galerie")
        for (t in tabs) tabLayout.addTab(tabLayout.newTab().setText(t))

        for (i in tabs.indices) {
            val section = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                visibility = if (i == 0) View.VISIBLE else View.GONE
            }
            container.addView(section)
            tabSections.add(section)
        }

        tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                for (i in tabSections.indices) {
                    tabSections[i].visibility = if (i == tab.position) View.VISIBLE else View.GONE
                }
                scrollView.scrollTo(0, 0)
                if (tab.position == 4) {
                    loadInterventionMedia()
                }
                if (tab.position == 1 && !photosLoaded && intervention.id.isNotEmpty()) {
                    photosLoaded = true
                    lifecycleScope.launch {
                        try {
                            val photos = ApiService.getInterventionPhotos(intervention.id)
                            intervention = intervention.copy(
                                points_gps = photos.points_gps,
                                whatsapp_photos = photos.whatsapp_photos,
                                signature_client = photos.signature_client,
                                signature_technicien = photos.signature_technicien
                            )
                            refreshGpsList()
                            refreshWhatsappPhotos()
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(this@InterventionFormActivity, "Photos: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
    }

    private fun buildAllTabs() {
        buildRapportTab(tabSections[0])
        buildGpsTab(tabSections[1])
        buildMiseEnServiceTab(tabSections[2])
        buildSatisfactionTab(tabSections[3])
        buildGalleryTab(tabSections[4])
    }

    private fun buildRapportTab(section: LinearLayout) {
        val fh = FormHelper(section)

        fh.section("Informations client")
        fieldMap["nom_client"] = fh.edit("nom_client", "Nom du client", intervention.nom_client)
        fieldMap["adresse_zone"] = fh.edit("adresse_zone", "Adresse / Zone", intervention.adresse_zone)
        fieldMap["telephone_ligne"] = fh.edit("telephone_ligne", "Téléphone / Ligne", intervention.telephone_ligne, inputType = InputType.TYPE_CLASS_PHONE)
        fieldMap["mobile"] = fh.edit("mobile", "Mobile", intervention.mobile, inputType = InputType.TYPE_CLASS_PHONE)

        fh.section("Données techniques")
        fieldMap["etat"] = fh.spinner("etat", "État", listOf("PON", "Cuivre", "Autre"), intervention.etat)
        fieldMap["msan"] = fh.edit("msan", "MSAN", intervention.msan)
        fieldMap["fat_ref"] = fh.edit("fat_ref", "Référence FAT", intervention.fat_ref)
        fieldMap["port"] = fh.edit("port", "Port", intervention.port)
        portsDisponibles.clear()
        portsDisponibles.addAll(normalizePortSelections(intervention.ports_disponibles))
        portsDisponiblesText = TextView(this).apply {
            text = "Ports disponibles : ${portsDisponibles.joinToString(", ").ifEmpty { "Aucun" }}"
            setTextColor(0xFF333333.toInt())
            setPadding(0, 12.dp(), 0, 12.dp())
            setOnClickListener { showPortsDisponiblesDialog() }
        }
        portsDisponiblesContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 8.dp())
        }
        section.addView(portsDisponiblesText)
        section.addView(portsDisponiblesContainer)
        renderPortsDisponiblesSelection()
        fieldMap["type_cable"] = fh.edit("type_cable", "Type de câble", intervention.type_cable)
        fieldMap["depart_m"] = fh.number("depart_m", "Départ (m)", intervention.depart_m)
        fieldMap["arrivee_m"] = fh.number("arrivee_m", "Arrivée (m)", intervention.arrivee_m)
        fieldMap["lineaire_m"] = fh.number("lineaire_m", "Linéaire (m, calculé)", intervention.lineaire_m)
        fieldMap["puissance_fat_dbm"] = fh.number("puissance_fat_dbm", "Puissance FAT (dBm)", intervention.puissance_fat_dbm)
        fieldMap["puissance_pto_dbm"] = fh.number("puissance_pto_dbm", "Puissance PTO (dBm)", intervention.puissance_pto_dbm)
        fieldMap["mac"] = fh.edit("mac", "MAC", intervention.mac)
        fieldMap["sn"] = fh.edit("sn", "SN (ONT)", intervention.sn)

        val nbArmes = intervention.points_gps.count { it.type == "Poteau" && it.sous_type == "Armé" }
        fh.addTextView("Poteaux armés: ${String.format("%02d", nbArmes)} - Poteaux implantés: ${String.format("%02d", intervention.nb_poteaux_implantes)}", 0xFF666666.toInt(), 13f)

        fh.section("Matériel posé")
        val matGrid = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        for ((key, label) in materielStandard) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 4.dp() }
            }
            val tv = TextView(this).apply {
                text = label
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setTextColor(0xFF333333.toInt())
            }
            val et = EditText(this).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                hint = "0"
                text.insert(0, (intervention.materiel_pose[key] ?: 0).toString())
                layoutParams = LinearLayout.LayoutParams(120.dp(), ViewGroup.LayoutParams.WRAP_CONTENT)
            }
            row.addView(tv)
            row.addView(et)
            matGrid.addView(row)
            materielViews[key] = et
        }
        section.addView(matGrid)

        fh.section("Autre matériel (facultatif)")
        val newMatName = EditText(this).apply { hint = "Matériau (existant ou nouveau)"; setSingleLine() }
        val newMatQty = EditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER; hint = "Qté"; setSingleLine() }
        val btnAddMat = MaterialButton(this).apply { text = "+ Ajouter" }
        val customMatContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val addMatRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 2f)
            newMatName.layoutParams = lp
            newMatQty.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            addView(newMatName)
            addView(newMatQty)
            addView(btnAddMat)
        }
        section.addView(addMatRow)
        section.addView(customMatContainer)

        btnAddMat.setOnClickListener {
            val name = newMatName.text.toString().trim()
            val qty = newMatQty.text.toString().toIntOrNull() ?: 0
            if (name.isEmpty() || qty == 0) return@setOnClickListener
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 4.dp() }
            }
            val tv = TextView(this).apply {
                text = name
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setTextColor(0xFF333333.toInt())
            }
            val et = EditText(this).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                text.insert(0, qty.toString())
                layoutParams = LinearLayout.LayoutParams(120.dp(), ViewGroup.LayoutParams.WRAP_CONTENT)
            }
            val btnRemove = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
                text = "Retirer"
                cornerRadius = 8.dp()
            }
            btnRemove.setOnClickListener { customMatContainer.removeView(row) }
            row.addView(tv)
            row.addView(et)
            row.addView(btnRemove)
            customMatContainer.addView(row)
            materielViews[name] = et
            newMatName.setText("")
            newMatQty.setText("1")
        }

        for ((d, q) in intervention.materiel_pose) {
            if (materielStandard.any { it.first == d }) continue
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 4.dp() }
            }
            val tv = TextView(this).apply {
                text = d
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setTextColor(0xFF333333.toInt())
            }
            val et = EditText(this).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                text.insert(0, q.toString())
                layoutParams = LinearLayout.LayoutParams(120.dp(), ViewGroup.LayoutParams.WRAP_CONTENT)
            }
            val btnRemove = MaterialButton(this).apply { text = "Retirer" }
            btnRemove.setOnClickListener { customMatContainer.removeView(row) }
            row.addView(tv)
            row.addView(et)
            row.addView(btnRemove)
            customMatContainer.addView(row)
            materielViews[d] = et
        }
    }

    private fun buildGpsTab(section: LinearLayout) {
        val fh = FormHelper(section)

        fh.addTextView("Type de point", 0xFF333333.toInt(), 14f)
        gpsTypeSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@InterventionFormActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf("Poteau", "Chambre", "FAT", "Abonné", "Autre"))
        }
        section.addView(gpsTypeSpinner!!)

        val sousTypeRow = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val sousTypeLabel = TextView(this).apply { text = "Type de poteau"; setTextColor(0xFF333333.toInt()) }
        gpsSousTypeSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@InterventionFormActivity, android.R.layout.simple_spinner_dropdown_item,
            listOf("Traversé", "Armé", "Implanté"))
        }
        sousTypeRow.addView(sousTypeLabel)
        sousTypeRow.addView(gpsSousTypeSpinner!!)
        section.addView(sousTypeRow)

        val propLabel = TextView(this).apply { text = "Poteau rencontré (SBEE ou Petit Jean)"; setTextColor(0xFF333333.toInt()) }
        gpsProprietaireEdit = EditText(this).apply { hint = "Propriétaire"; setSingleLine() }
        section.addView(propLabel)
        section.addView(gpsProprietaireEdit!!)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp() }
        }
        val btnCamera = MaterialButton(this).apply {
            text = "📷 Prendre une photo"
            cornerRadius = 8.dp()
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val btnGallery = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "🖼️ Galerie"
            cornerRadius = 8.dp()
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        btnCamera.setOnClickListener { openCamera("gps") }
        btnGallery.setOnClickListener { openGallery("gps") }
        btnRow.addView(btnCamera)
        btnRow.addView(btnGallery)
        section.addView(btnRow)

        gpsStatusText = TextView(this).apply {
            textSize = 13f
            setTextColor(0xFF666666.toInt())
            setPadding(0, 8.dp(), 0, 8.dp())
        }
        section.addView(gpsStatusText!!)

        fh.section("Points enregistrés (${intervention.points_gps.size})")
        gpsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        section.addView(gpsContainer!!)
        refreshGpsList()

        fh.section("Photos terrain (hors rapport)")
        fh.addTextView("Photos géolocalisées, non incluses dans le rapport. Sélectionnez-en pour les envoyer via WhatsApp.", 0xFF999999.toInt(), 13f)

        val waBtnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp() }
        }
        val btnWaCamera = MaterialButton(this).apply {
            text = "📷 Prendre une photo"
            cornerRadius = 8.dp()
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val btnWaGallery = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "🖼️ Galerie"
            cornerRadius = 8.dp()
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        btnWaCamera.setOnClickListener { openCamera("whatsapp") }
        btnWaGallery.setOnClickListener { openGallery("whatsapp") }
        waBtnRow.addView(btnWaCamera)
        waBtnRow.addView(btnWaGallery)
        section.addView(waBtnRow)

        waStatusText = TextView(this).apply {
            textSize = 13f
            setTextColor(0xFF666666.toInt())
            setPadding(0, 8.dp(), 0, 8.dp())
        }
        section.addView(waStatusText!!)

        waPhotosContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        section.addView(waPhotosContainer!!)
        refreshWhatsappPhotos()
    }

    private fun buildMiseEnServiceTab(section: LinearLayout) {
        val fh = FormHelper(section)

        fh.section("Mise en service")
        fieldMap["ont_sn"] = fh.edit("ont_sn", "ONT / SN", intervention.ont_sn)
        fieldMap["pto_qte"] = fh.number("pto_qte", "Qté PTO", intervention.pto_qte)
        fieldMap["repeteur_wifi_qte"] = fh.number("repeteur_wifi_qte", "Qté répéteur WiFi", intervention.repeteur_wifi_qte)
        fieldMap["emplacement_ont"] = fh.edit("emplacement_ont", "Emplacement ONT", intervention.emplacement_ont)
        fieldMap["client_confirme_emplacement"] = fh.check("client_confirme_emplacement", "Client confirme l'emplacement", intervention.client_confirme_emplacement)
        fieldMap["offre_souscrite"] = fh.spinner("offre_souscrite", "Offre souscrite",
            listOf("Fibre Pro", "Pro Max", "Pro Mega", "Office Max", "Office Mega"), intervention.offre_souscrite)
        fieldMap["remise_equipement_ok"] = fh.check("remise_equipement_ok", "Remise d'équipement OK", intervention.remise_equipement_ok)
        fieldMap["appreciation_satisfaction_libre"] = fh.edit("appreciation_satisfaction_libre", "Appréciation satisfaction (libre)", intervention.appreciation_satisfaction_libre)
    }

    private fun buildSatisfactionTab(section: LinearLayout) {
        val fh = FormHelper(section)

        fh.section("Satisfaction client")
        fieldMap["travaux_conformes"] = fh.check("travaux_conformes", "Travaux conformes", intervention.travaux_conformes)
        fieldMap["emplacement_valide"] = fh.check("emplacement_valide", "Emplacement validé", intervention.emplacement_valide)
        fieldMap["travail_propre"] = fh.check("travail_propre", "Travail propre", intervention.travail_propre)
        fieldMap["service_teste"] = fh.check("service_teste", "Service testé", intervention.service_teste)
        fieldMap["service_fonctionne"] = fh.check("service_fonctionne", "Service fonctionne", intervention.service_fonctionne)
        fieldMap["explications_donnees"] = fh.check("explications_donnees", "Explications données", intervention.explications_donnees)
        fieldMap["recommanderait"] = fh.check("recommanderait", "Recommanderait", intervention.recommanderait)
        fieldMap["accepte_recontact"] = fh.check("accepte_recontact", "Accepte recontact", intervention.accepte_recontact)

        val niveaux = listOf("Très satisfait", "Satisfait", "Peu satisfait", "Insatisfait")
        fieldMap["qualite"] = fh.spinner("qualite", "Qualité", niveaux, intervention.qualite)
        fieldMap["delais"] = fh.spinner("delais", "Délais", niveaux, intervention.delais)
        fieldMap["professionnalisme"] = fh.spinner("professionnalisme", "Professionnalisme", niveaux, intervention.professionnalisme)

        fieldMap["nom_client_declaration"] = fh.edit("nom_client_declaration", "Nom du client (déclaration)", intervention.nom_client_declaration)
        fieldMap["remarque_libre"] = fh.edit("remarque_libre", "Remarque libre", intervention.remarque_libre)

        fh.section("Signature du client")
        sigClientPad = SignaturePadView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 200.dp()
            )
            onChanged = { markDirty("signature_client"); scheduleAutoSave() }
        }
        val btnClearClient = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "Effacer"
        }
        btnClearClient.setOnClickListener { sigClientPad?.clear() }
        section.addView(sigClientPad!!)
        section.addView(btnClearClient)

        fh.section("Signature du technicien")
        sigTechPad = SignaturePadView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 200.dp()
            )
            onChanged = { markDirty("signature_technicien"); scheduleAutoSave() }
        }
        val btnClearTech = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "Effacer"
        }
        btnClearTech.setOnClickListener { sigTechPad?.clear() }
        section.addView(sigTechPad!!)
        section.addView(btnClearTech)

        fh.section("Documents")
        fh.addButton("scan_fiche", "📄 Scanner une fiche") { openFicheScanner() }
        fh.addButton("pdf_fiches", "Voir les fiches (PDF)") { openPdf("pdf_fiches_view") }
        fh.addButton("pdf_rapport", "Voir le rapport (PDF)") { openPdf("pdf_rapport_view") }
        fh.addButton("download_fiches", "Télécharger les fiches") { openPdf("pdf_fiches") }
        fh.addButton("download_rapport", "Télécharger le rapport") { openPdf("pdf_rapport") }
        fh.addButton("whatsapp_report", "Rapport WhatsApp") { showWhatsAppReportDialog() }
        fh.addButton("conformite_report", "Rapport de conformité") { showConformiteReportDialog() }
        fh.addButton("stock_usage", "Fiche matériel (PDF)") { openPdf("pdf_stock_usage_view") }
        fh.addButton("download_stock_usage", "Télécharger fiche matériel") { openPdf("pdf_stock_usage") }
    }

    private fun openCamera(mode: String) {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION), 200)
            return
        }
        pendingPhotoMode = mode
        val photoFile = File(cacheDir, "photo_${System.currentTimeMillis()}.jpg")
        pendingPhotoUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", photoFile)
        cameraLauncher.launch(pendingPhotoUri!!)
    }

    private fun openVideoCamera() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 200)
            return
        }
        val videoFile = File(cacheDir, "video_${System.currentTimeMillis()}.mp4")
        pendingPhotoUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", videoFile)
        videoLauncher.launch(pendingPhotoUri!!)
    }

    private fun openGallery(mode: String) {
        pendingPhotoMode = mode
        galleryLauncher.launch("image/*")
    }

    private fun handlePhotoResult(uri: Uri, mode: String) {
        pendingPhotoUri = uri
        pendingPhotoMode = mode
        if (mode == "fiche") {
            confirmScanFiche(uri)
            return
        }
        val statusTv = if (mode == "gps") gpsStatusText else waStatusText
        statusTv?.text = "Acquisition GPS en temps réel…"

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 201)
            return
        }

        progressBar.visibility = View.VISIBLE

        val locationRequest = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(15000)
            .build()

        val cts = CancellationTokenSource()
        val timeoutHandler = Handler(Looper.getMainLooper())
        var locationReceived = false

        val timeoutRunnable = Runnable {
            if (!locationReceived) {
                locationReceived = true
                cts.cancel()
                progressBar.visibility = View.GONE
                statusTv?.text = "GPS: délai dépassé (15s). Réessayez à l'extérieur."
            }
        }
        timeoutHandler.postDelayed(timeoutRunnable, 16000)

        fusedLocationClient.getCurrentLocation(locationRequest, cts.token)
            .addOnSuccessListener { location: Location? ->
                if (locationReceived) return@addOnSuccessListener
                locationReceived = true
                timeoutHandler.removeCallbacks(timeoutRunnable)

                if (location == null) {
                    statusTv?.text = "GPS indisponible - réessayez"
                    progressBar.visibility = View.GONE
                    return@addOnSuccessListener
                }

                val lat = location.latitude
                val lng = location.longitude
                val precision = location.accuracy.toDouble()
                val horodatage = Date().toInstant().toString()

                val accuracyStr = String.format("%.1f", precision)
                val warning = if (precision > 25) {
                    "\n\n⚠️ Précision faible. Idéalement < 10m. Reprenez la photo si nécessaire."
                } else {
                    "\n\n✓ Précision correcte."
                }
                val msg = "Position GPS obtenue:\nLat: ${String.format("%.6f", lat)}\nLng: ${String.format("%.6f", lng)}\nPrécision: ±${accuracyStr}m$warning"

                AlertDialog.Builder(this)
                    .setTitle("Valider le point GPS ?")
                    .setMessage(msg)
                    .setPositiveButton("Valider") { _, _ ->
                        if (mode == "gps") {
                            chooseGpsPointType(uri, lat, lng, precision, horodatage, statusTv)
                        } else {
                            processPhotoWithGps(uri, mode, lat, lng, precision, horodatage, statusTv)
                        }
                    }
                    .setNegativeButton("Recommencer") { _, _ ->
                        progressBar.visibility = View.GONE
                        statusTv?.text = "GPS: point rejeté. Reprenez la photo."
                    }
                    .setCancelable(false)
                    .show()
            }
            .addOnFailureListener { e ->
                if (locationReceived) return@addOnFailureListener
                locationReceived = true
                timeoutHandler.removeCallbacks(timeoutRunnable)
                statusTv?.text = "Erreur GPS: ${e.message}"
                progressBar.visibility = View.GONE
            }
    }

    private fun chooseGpsPointType(uri: Uri, lat: Double, lng: Double, precision: Double, horodatage: String, statusTv: TextView?) {
        val types = arrayOf("Poteau", "FAT", "Abonné", "Autre")
        AlertDialog.Builder(this)
            .setTitle("Cette capture concerne")
            .setItems(types) { _, which ->
                val type = types[which]
                val typeIndex = (gpsTypeSpinner?.adapter as? ArrayAdapter<*>)?.let { adapter ->
                    (0 until adapter.count).firstOrNull { adapter.getItem(it) == type }
                }
                if (typeIndex != null) gpsTypeSpinner?.setSelection(typeIndex)
                if (type == "Poteau") {
                    choosePoteauDetails(uri, lat, lng, precision, horodatage, statusTv)
                } else {
                    processPhotoWithGps(uri, "gps", lat, lng, precision, horodatage, statusTv)
                }
            }
            .setCancelable(false)
            .show()
    }

    private fun choosePoteauDetails(uri: Uri, lat: Double, lng: Double, precision: Double, horodatage: String, statusTv: TextView?) {
        val proprietaires = arrayOf("SBEE", "Petit Jean")
        AlertDialog.Builder(this)
            .setTitle("Poteau rencontré")
            .setItems(proprietaires) { _, which ->
                gpsProprietaireEdit?.setText(proprietaires[which])
                choosePoteauSubtype(uri, lat, lng, precision, horodatage, statusTv)
            }
            .setCancelable(false)
            .show()
    }

    private fun choosePoteauSubtype(uri: Uri, lat: Double, lng: Double, precision: Double, horodatage: String, statusTv: TextView?) {
        val subtypes = arrayOf("Traversé", "Armé", "Implanté")
        AlertDialog.Builder(this)
            .setTitle("État du poteau")
            .setItems(subtypes) { _, which ->
                val subtype = subtypes[which]
                val subtypeIndex = (gpsSousTypeSpinner?.adapter as? ArrayAdapter<*>)?.let { adapter ->
                    (0 until adapter.count).firstOrNull { adapter.getItem(it) == subtype }
                }
                if (subtypeIndex != null) gpsSousTypeSpinner?.setSelection(subtypeIndex)
                processPhotoWithGps(uri, "gps", lat, lng, precision, horodatage, statusTv)
            }
            .setCancelable(false)
            .show()
    }

    private fun processPhotoWithGps(uri: Uri, mode: String, lat: Double, lng: Double, precision: Double, horodatage: String, statusTv: TextView?) {
        progressBar.visibility = View.VISIBLE
        try {
            savePhotoToGallery(uri, "CHAPTECH_${System.currentTimeMillis()}.jpg")
            val inputStream = contentResolver.openInputStream(uri)
            val rawBitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
            inputStream?.close()

            if (rawBitmap == null) {
                statusTv?.text = "Erreur: photo illisible"
                progressBar.visibility = View.GONE
                return
            }

            // Les JPEG de l'appareil photo portent leur orientation en EXIF :
            // sans rotation explicite, les photos portrait s'enregistrent couchées.
            val bitmap = rotateBitmapForExif(rawBitmap, uri)
            val resizedBitmap = resizeBitmap(bitmap, 1280)
            val embeddedBitmap = embedGpsOnPhoto(resizedBitmap, mode, lat, lng, precision, horodatage)
            val baos = java.io.ByteArrayOutputStream()
            embeddedBitmap.compress(Bitmap.CompressFormat.JPEG, 75, baos)
            val photoBase64 = android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)
            val dataUrl = "data:image/jpeg;base64,$photoBase64"

            if (mode == "gps") {
                val typeStr = gpsTypeSpinner?.selectedItem.toString() ?: "Point"
                val selectedSousType = if (typeStr == "Poteau") gpsSousTypeSpinner?.selectedItem.toString() ?: "" else ""
                val sousType = selectedSousType
                val proprietaire = if (typeStr == "Poteau") gpsProprietaireEdit?.text?.toString()?.trim() ?: "" else ""
                val numero = nextNumeroForType(typeStr, sousType)
                val photoName = "$typeStr${if (sousType.isNotEmpty()) " $sousType" else ""} $numero"

                val point = GpsPoint(
                    type = typeStr,
                    sous_type = sousType,
                    numero = numero,
                    lat = lat, lng = lng,
                    precision_m = precision,
                    horodatage = horodatage,
                    ajoute_par = SessionManager.getUserName(this),
                    proprietaire = proprietaire,
                    photo = dataUrl
                )
                markDirty("points_gps")
                intervention = intervention.copy(points_gps = intervention.points_gps + point)
                refreshGpsList()
                gpsStatusText?.text = "Point ajouté: $photoName"

                val waPhoto = WhatsappPhoto(
                    id = UUID.randomUUID().toString(),
                    url = dataUrl, lat = lat, lng = lng,
                    precision_m = precision, horodatage = horodatage,
                    from_gps = true, added = horodatage,
                    name = photoName
                )
                markDirty("whatsapp_photos")
                intervention = intervention.copy(whatsapp_photos = intervention.whatsapp_photos + waPhoto)
                refreshWhatsappPhotos()
            } else {
                val photoName = "Photo terrain ${intervention.whatsapp_photos.size + 1}"
                val waPhoto = WhatsappPhoto(
                    id = UUID.randomUUID().toString(),
                    url = dataUrl, lat = lat, lng = lng,
                    precision_m = precision, horodatage = horodatage,
                    added = horodatage,
                    name = photoName
                )
                markDirty("whatsapp_photos")
                intervention = intervention.copy(whatsapp_photos = intervention.whatsapp_photos + waPhoto)
                refreshWhatsappPhotos()
                waStatusText?.text = "Photo géolocalisée ajoutée: $photoName"
            }

            scheduleAutoSave()
            progressBar.visibility = View.GONE
        } catch (e: Exception) {
            statusTv?.text = "Erreur: ${e.message}"
            progressBar.visibility = View.GONE
        }
    }

    private fun savePhotoToGallery(uri: Uri, displayName: String) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/CHAPTECH")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }
        val galleryUri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw Exception("Impossible d'enregistrer la photo dans la galerie")
        try {
            contentResolver.openOutputStream(galleryUri)?.use { output ->
                contentResolver.openInputStream(uri)?.use { input -> input.copyTo(output) }
            } ?: throw Exception("Impossible d'écrire la photo dans la galerie")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentResolver.update(galleryUri, ContentValues().apply {
                    put(MediaStore.Images.Media.IS_PENDING, 0)
                }, null, null)
            }
        } catch (error: Exception) {
            contentResolver.delete(galleryUri, null, null)
            throw error
        }
    }

    private fun saveVideoToGallery(uri: Uri, displayName: String) {
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/CHAPTECH")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
        }
        val galleryUri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw Exception("Impossible d'enregistrer la vidéo dans la galerie")
        try {
            contentResolver.openOutputStream(galleryUri)?.use { output ->
                contentResolver.openInputStream(uri)?.use { input -> input.copyTo(output) }
            } ?: throw Exception("Impossible d'écrire la vidéo dans la galerie")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentResolver.update(galleryUri, ContentValues().apply {
                    put(MediaStore.Video.Media.IS_PENDING, 0)
                }, null, null)
            }
        } catch (error: Exception) {
            contentResolver.delete(galleryUri, null, null)
            throw error
        }
    }

    private fun uploadVideoWithGps(uri: Uri) {
        if (intervention.id.isEmpty() || ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val source = File(cacheDir, "video_upload_${System.currentTimeMillis()}.mp4")
        contentResolver.openInputStream(uri)?.use { input -> source.outputStream().use { output -> input.copyTo(output) } } ?: return
        val request = CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setDurationMillis(15000).build()
        fusedLocationClient.getCurrentLocation(request, CancellationTokenSource().token).addOnSuccessListener { location ->
            if (location == null) { source.delete(); return@addOnSuccessListener }
            lifecycleScope.launch {
                beginMediaUpload()
                try {
                    ApiService.uploadMedia(intervention.id, "video", source, location.latitude, location.longitude, location.accuracy.toDouble(), java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(Date()))
                    endMediaUpload()
                    Toast.makeText(this@InterventionFormActivity, "Vidéo envoyée au serveur", Toast.LENGTH_SHORT).show()
                    if (serverMediaLoaded) loadInterventionMedia(force = true)
                } catch (error: Exception) {
                    endMediaUpload()
                    Toast.makeText(this@InterventionFormActivity, "Vidéo gardée sur le téléphone : ${error.message}", Toast.LENGTH_LONG).show()
                } finally {
                    source.delete()
                }
            }
        }
    }

    // Applique la rotation EXIF du fichier au bitmap décodé (BitmapFactory
    // l'ignore : les JPEG portrait de l'appareil sortent couchés sinon).
    private fun rotateBitmapForExif(bitmap: Bitmap, uri: Uri): Bitmap {
        val exif = try {
            contentResolver.openInputStream(uri)?.use {
                androidx.exifinterface.media.ExifInterface(it)
            }
        } catch (_: Exception) { null } ?: return bitmap
        val matrix = android.graphics.Matrix()
        when (exif.getAttributeInt(
            androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,
            androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL
        )) {
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            androidx.exifinterface.media.ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            androidx.exifinterface.media.ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            else -> return bitmap
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun resizeBitmap(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= maxDimension && height <= maxDimension) return bitmap
        val ratio = maxDimension.toFloat() / maxOf(width, height)
        val newWidth = (width * ratio).toInt()
        val newHeight = (height * ratio).toInt()
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun embedGpsOnPhoto(bitmap: Bitmap, mode: String, lat: Double, lng: Double, precision: Double, horodatage: String): Bitmap {
        val w = bitmap.width.toFloat()
        val h = bitmap.height.toFloat()

        val fontSize = maxOf(14f, w * 0.022f)
        val lineGap = fontSize * 1.3f
        val pad = fontSize * 0.6f

        val typeLabel = if (mode == "gps") {
            val t = gpsTypeSpinner?.selectedItem.toString() ?: "Point"
            if (t == "Poteau") {
                val selectedSt = gpsSousTypeSpinner?.selectedItem.toString() ?: ""
                val prop = gpsProprietaireEdit?.text?.toString()?.trim() ?: ""
                "Poteau $selectedSt ${nextNumeroForType("Poteau", selectedSt)}${if (prop.isNotEmpty()) " ($prop)" else ""}"
            } else "$t ${nextNumeroForType(t, "")}"
        } else "Photo terrain"

        val dateStr = try {
            java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault()).format(Date.from(java.time.Instant.parse(horodatage)))
        } catch (e: Exception) { horodatage.take(16) }

        val lines = mutableListOf(typeLabel)
        if (intervention.nom_client.isNotEmpty()) lines.add("Client: ${intervention.nom_client}")
        if (intervention.nom_technicien.isNotEmpty()) lines.add("Technicien: ${intervention.nom_technicien}")
        lines.add("Lat: ${String.format("%.6f", lat)}  Lng: ${String.format("%.6f", lng)}")
        lines.add("Précision: ±${String.format("%.1f", precision)}m - $dateStr")
        val bandHeight = pad * 2 + lineGap * lines.size

        val result = Bitmap.createBitmap(bitmap.width, (h + bandHeight).toInt(), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        canvas.drawBitmap(bitmap, 0f, 0f, null)
        val bgPaint = Paint().apply { color = Color.rgb(20, 20, 20) }
        canvas.drawRect(0f, h, w, h + bandHeight, bgPaint)

        val textPaint = Paint().apply {
            color = Color.WHITE
            textSize = fontSize
            typeface = Typeface.DEFAULT_BOLD
            isAntiAlias = true
        }

        var y = h + pad
        for (line in lines) {
            canvas.drawText(line, pad, y + fontSize, textPaint)
            y += lineGap
        }
        return result
    }

    private fun nextNumeroForType(type: String, sousType: String): String {
        val count = intervention.points_gps.count {
            it.type == type && (type != "Poteau" || it.sous_type == sousType)
        }
        return (count + 1).toString()
    }

    private fun refreshGpsList() {
        gpsContainer?.removeAllViews()
        for ((idx, point) in intervention.points_gps.withIndex()) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.TOP
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 8.dp() }
            }
            // Photo thumbnail
            val photoSize = 80.dp()
            if (point.photo.isNotEmpty()) {
                try {
                    val base64Part = point.photo.substringAfter("base64,")
                    val imageBytes = android.util.Base64.decode(base64Part, android.util.Base64.DEFAULT)
                    val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = 4 }
                    val bitmap = android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size, opts)
                    if (bitmap != null) {
                        val imgView = ImageView(this).apply {
                            setImageBitmap(bitmap)
                            scaleType = ImageView.ScaleType.CENTER_CROP
                            layoutParams = LinearLayout.LayoutParams(photoSize, photoSize)
                        }
                        imgView.setOnClickListener { openPhotoBytes(imageBytes, "${point.type} ${point.numero}") }
                        row.addView(imgView)
                    }
                } catch (e: Exception) {}
            }
            // Text info
            val tv = TextView(this).apply {
                val propStr = if (point.proprietaire.isNotEmpty()) " - ${point.proprietaire}" else ""
                val sousStr = if (point.sous_type.isNotEmpty()) " (${point.sous_type})" else ""
                text = "• ${point.type}$sousStr ${point.numero}$propStr\n  ${String.format("%.5f", point.lat)}, ${String.format("%.5f", point.lng)} ±${point.precision_m.toInt()}m\n  ${point.horodatage.take(16)}\n  ${point.ajoute_par}"
                textSize = 12f
                setTextColor(0xFF333333.toInt())
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = 8.dp() }
            }
            val btnDel = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_TextButton).apply {
                text = "✕"
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                setTextColor(0xFFFF6B6B.toInt())
            }
            btnDel.setOnClickListener {
                markDirty("points_gps")
                intervention.points_gps.getOrNull(idx)?.let { deletedGpsPoints.add(it.horodatage) }
                intervention = intervention.copy(points_gps = intervention.points_gps.filterIndexed { i, _ -> i != idx })
                refreshGpsList()
                scheduleAutoSave()
            }
            row.addView(tv)
            row.addView(btnDel)
            gpsContainer?.addView(row)
        }
    }

    private val selectedWaPhotos = mutableSetOf<String>()

    private fun refreshWhatsappPhotos() {
        waPhotosContainer?.removeAllViews()
        selectedWaPhotos.clear()

        for ((idx, photo) in intervention.whatsapp_photos.withIndex()) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.TOP
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 8.dp() }
            }
            // Selection checkbox
            val cb = CheckBox(this).apply {
                tag = photo.id
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            }
            cb.setOnCheckedChangeListener { _, isChecked ->
                if (isChecked) selectedWaPhotos.add(photo.id) else selectedWaPhotos.remove(photo.id)
            }
            row.addView(cb)

            // Photo thumbnail
            val photoSize = 80.dp()
            if (photo.url.isNotEmpty()) {
                try {
                    val base64Part = photo.url.substringAfter("base64,")
                    val imageBytes = android.util.Base64.decode(base64Part, android.util.Base64.DEFAULT)
                    val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = 4 }
                    val bitmap = android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size, opts)
                    if (bitmap != null) {
                        val imgView = ImageView(this).apply {
                            setImageBitmap(bitmap)
                            scaleType = ImageView.ScaleType.CENTER_CROP
                            layoutParams = LinearLayout.LayoutParams(photoSize, photoSize)
                        }
                        imgView.setOnClickListener { openPhotoBytes(imageBytes, photo.name.ifEmpty { "Photo ${idx + 1}" }) }
                        row.addView(imgView)
                    }
                } catch (e: Exception) {}
            }
            val displayName = photo.name.ifEmpty { "Photo ${idx + 1}" }
            val tv = TextView(this).apply {
                text = "📷 $displayName\n  ${String.format("%.5f", photo.lat)}, ${String.format("%.5f", photo.lng)} ±${photo.precision_m.toInt()}m\n  ${photo.horodatage.take(16)}"
                textSize = 12f
                setTextColor(0xFF333333.toInt())
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = 8.dp() }
            }
            val btnDel = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_TextButton).apply {
                text = "✕"
                setTextColor(0xFFFF6B6B.toInt())
            }
            btnDel.setOnClickListener {
                markDirty("whatsapp_photos")
                intervention.whatsapp_photos.getOrNull(idx)?.let { deletedWhatsappPhotoIds.add(it.id) }
                intervention = intervention.copy(whatsapp_photos = intervention.whatsapp_photos.filterIndexed { i, _ -> i != idx })
                refreshWhatsappPhotos()
                scheduleAutoSave()
            }
            row.addView(tv)
            row.addView(btnDel)
            waPhotosContainer?.addView(row)
        }

        // Add share button if there are photos
        if (intervention.whatsapp_photos.isNotEmpty()) {
            val btnShare = MaterialButton(this).apply {
                text = "📤 Partager la sélection via WhatsApp"
                cornerRadius = 8.dp()
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = 8.dp() }
            }
            btnShare.setOnClickListener { shareSelectedPhotosViaWhatsApp() }
            waPhotosContainer?.addView(btnShare)
        }
    }

    private fun shareSelectedPhotosViaWhatsApp() {
        val photosToShare = if (selectedWaPhotos.isNotEmpty()) {
            intervention.whatsapp_photos.filter { it.id in selectedWaPhotos }
        } else {
            intervention.whatsapp_photos
        }
        if (photosToShare.isEmpty()) {
            android.widget.Toast.makeText(this, "Aucune photo à partager", android.widget.Toast.LENGTH_SHORT).show()
            return
        }

        val shareIntent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "image/jpeg"
            putExtra(Intent.EXTRA_SUBJECT, "Photos terrain - ${intervention.nom_client}")
            val uris = ArrayList<Uri>()
            for (photo in photosToShare) {
                try {
                    val base64Part = photo.url.substringAfter("base64,")
                    val imageBytes = android.util.Base64.decode(base64Part, android.util.Base64.DEFAULT)
                    val photoName = photo.name.ifEmpty { "photo" }.replace(" ", "_")
                    val file = File(cacheDir, "${photoName}_${photo.id.take(6)}.jpg")
                    java.io.FileOutputStream(file).use { it.write(imageBytes) }
                    val uri = FileProvider.getUriForFile(this@InterventionFormActivity, "$packageName.fileprovider", file)
                    uris.add(uri)
                } catch (e: Exception) {}
            }
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            setPackage("com.whatsapp")
        }
        try {
            startActivity(shareIntent)
        } catch (e: Exception) {
            android.widget.Toast.makeText(this, "WhatsApp non disponible", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun collectData(): Intervention {
        fun getText(id: String): String {
            val v = fieldMap[id]
            return when (v) {
                is com.google.android.material.textfield.TextInputEditText -> v.text.toString()
                is EditText -> v.text.toString()
                is Spinner -> v.selectedItem.toString()
                else -> ""
            }
        }
        fun getNumber(id: String): Int = getText(id).toIntOrNull() ?: 0
        fun getDouble(id: String): Double = getText(id).toDoubleOrNull() ?: 0.0
        fun getBool(id: String): Boolean = (fieldMap[id] as? CheckBox)?.isChecked == true

        val depart = getDouble("depart_m")
        val arrivee = getDouble("arrivee_m")
        val lineaire = maxOf(0.0, arrivee - depart)

        val nbTraverses = intervention.points_gps.count { it.type == "Poteau" && it.sous_type == "Traversé" }
        val nbArmes = intervention.points_gps.count { it.type == "Poteau" && it.sous_type == "Armé" }
        val nbImplantes = intervention.points_gps.count { it.type == "Poteau" && it.sous_type == "Implanté" }

        val materielPose = mutableMapOf<String, Int>()
        for ((key, et) in materielViews) {
            val q = et.text.toString().toIntOrNull() ?: 0
            if (q > 0) materielPose[key] = q
        }
        val sigClient = if (sigClientPad?.isEmpty() == false) sigClientPad!!.toBase64Png() else intervention.signature_client
        val sigTech = if (sigTechPad?.isEmpty() == false) sigTechPad!!.toBase64Png() else intervention.signature_technicien

        return intervention.copy(
            nom_client = getText("nom_client"),
            adresse_zone = getText("adresse_zone"),
            telephone_ligne = getText("telephone_ligne"),
            mobile = getText("mobile"),
            etat = getText("etat"),
            msan = getText("msan"),
            fat_ref = getText("fat_ref"),
            port = getText("port"),
            ports_disponibles = portsDisponibles.joinToString(", "),
            port_disponible = portsDisponibles.size,
            type_cable = getText("type_cable"),
            depart_m = depart,
            arrivee_m = arrivee,
            lineaire_m = lineaire,
            puissance_fat_dbm = getDouble("puissance_fat_dbm"),
            puissance_pto_dbm = getDouble("puissance_pto_dbm"),
            mac = getText("mac"),
            sn = getText("sn"),
            nb_poteaux_traverses = nbTraverses,
            nb_poteaux_implantes = nbImplantes,
            nb_poteaux_armes = nbArmes,
            ont_sn = getText("ont_sn"),
            pto_qte = getNumber("pto_qte"),
            repeteur_wifi_qte = getNumber("repeteur_wifi_qte"),
            emplacement_ont = getText("emplacement_ont"),
            client_confirme_emplacement = getBool("client_confirme_emplacement"),
            offre_souscrite = getText("offre_souscrite"),
            remise_equipement_ok = getBool("remise_equipement_ok"),
            appreciation_satisfaction_libre = getText("appreciation_satisfaction_libre"),
            travaux_conformes = getBool("travaux_conformes"),
            emplacement_valide = getBool("emplacement_valide"),
            travail_propre = getBool("travail_propre"),
            service_teste = getBool("service_teste"),
            service_fonctionne = getBool("service_fonctionne"),
            explications_donnees = getBool("explications_donnees"),
            recommanderait = getBool("recommanderait"),
            accepte_recontact = getBool("accepte_recontact"),
            qualite = getText("qualite"),
            delais = getText("delais"),
            professionnalisme = getText("professionnalisme"),
            nom_client_declaration = getText("nom_client_declaration"),
            remarque_libre = getText("remarque_libre"),
            signature_client = sigClient,
            signature_technicien = sigTech,
            materiel_pose = materielPose,
            modifie_par = SessionManager.getUserName(this),
            modifie_le = Date().toInstant().toString()
        )
    }

    private fun normalizePortSelections(raw: String): List<String> {
        if (raw.isBlank()) return emptyList()
        return raw.split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .mapNotNull { value ->
                val cleaned = value.removePrefix("Port").trim()
                val port = cleaned.toIntOrNull() ?: return@mapNotNull null
                if (port in 1..8) "Port $port" else null
            }
            .distinct()
    }

    private fun renderPortsDisponiblesSelection() {
        val container = portsDisponiblesContainer ?: return
        container.removeAllViews()
        val options = (1..8).map { "Port $it" }
        for (option in options) {
            val checkBox = CheckBox(this).apply {
                text = option
                isChecked = portsDisponibles.contains(option)
                setTextColor(0xFF333333.toInt())
                setOnCheckedChangeListener { _, isChecked ->
                    markDirty("ports_disponibles")
                    if (isChecked) portsDisponibles.add(option) else portsDisponibles.remove(option)
                    portsDisponiblesText?.text = "Ports disponibles : ${portsDisponibles.joinToString(", ").ifEmpty { "Aucun" }}"
                    scheduleAutoSave()
                }
            }
            container.addView(checkBox)
        }
    }

    private fun showPortsDisponiblesDialog() {
        val options = (1..8).map { "Port $it" }.toTypedArray()
        val checked = options.map { portsDisponibles.contains(it) }.toBooleanArray()
        AlertDialog.Builder(this)
            .setTitle("Ports disponibles")
            .setMultiChoiceItems(options, checked) { _, which, isChecked ->
                markDirty("ports_disponibles")
                if (isChecked) portsDisponibles.add(options[which]) else portsDisponibles.remove(options[which])
                renderPortsDisponiblesSelection()
            }
            .setPositiveButton("Valider") { _, _ ->
                portsDisponiblesText?.text = "Ports disponibles : ${portsDisponibles.joinToString(", ").ifEmpty { "Aucun" }}"
                renderPortsDisponiblesSelection()
                scheduleAutoSave()
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    /**
     * Fusionne l'intervention locale avec les photos complètes du serveur.
     * IMPORTANT: intervention_get_light() vide les champs photo/url pour
     * alléger le chargement (voir api/index.php), donc la liste locale
     * points_gps/whatsapp_photos n'est PAS vide mais contient des photos
     * vides. Un simple .ifEmpty{} sur la liste ne détecte pas ce cas et
     * écraserait les vraies photos en base par des chaînes vides lors du
     * save() suivant. On fusionne donc élément par élément, en ne
     * remplaçant que les photos manquantes localement.
     */
    private fun mergeWithServerPhotos(current: Intervention, photos: InterventionPhotos): Intervention {
        val mergedGps = if (current.points_gps.isEmpty()) {
            photos.points_gps
        } else {
            current.points_gps.map { local ->
                if (local.photo.isBlank()) {
                    val remote = photos.points_gps.find { it.horodatage == local.horodatage }
                    if (remote != null) local.copy(photo = remote.photo) else local
                } else local
            }
        }
        val mergedWa = if (current.whatsapp_photos.isEmpty()) {
            photos.whatsapp_photos
        } else {
            current.whatsapp_photos.map { local ->
                if (local.url.isBlank()) {
                    val remote = photos.whatsapp_photos.find { it.id == local.id }
                    if (remote != null) local.copy(url = remote.url) else local
                } else local
            }
        }
        return current.copy(
            points_gps = mergedGps,
            whatsapp_photos = mergedWa,
            signature_client = current.signature_client.ifEmpty { photos.signature_client },
            signature_technicien = current.signature_technicien.ifEmpty { photos.signature_technicien }
        )
    }

    private fun scheduleAutoSave() {
        autoSaveRunnable?.let { autoSaveHandler.removeCallbacks(it) }
        tvSaveStatus.visibility = View.VISIBLE
        tvSaveStatus.text = "Enregistrement…"
        autoSaveRunnable = Runnable {
            // Deux sauvegardes ne doivent jamais se chevaucher : la seconde
            // attendrait le verrou DB de la première puis échouerait en timeout.
            if (autoSaveInFlight) {
                autoSaveHandler.postDelayed(autoSaveRunnable!!, 5000)
                return@Runnable
            }
            intervention = collectData()
            val lightIntervention = intervention.copy(
                points_gps = emptyList(),
                whatsapp_photos = emptyList(),
                signature_client = if (intervention.signature_client.length > 100) "" else intervention.signature_client,
                signature_technicien = if (intervention.signature_technicien.length > 100) "" else intervention.signature_technicien
            )
            // Patch léger : les champs lourds (listes photos/GPS, signatures)
            // sont exclus — ils partent uniquement au save complet, sinon
            // chaque autosave réécrirait des Mo de base64. Leurs flags dirty
            // sont conservés jusqu'au prochain save complet.
            val sentFields = dirtyFields.filterNot { it in HEAVY_DIRTY_FIELDS }
            autoSaveInFlight = true
            lifecycleScope.launch {
                try {
                    ApiService.saveInterventionLight(lightIntervention, sentFields)
                    tvSaveStatus.text = "Enregistré ${Date().toString().takeLast(8)}"
                    dirtyFields.removeAll(sentFields.toSet())
                } catch (e: Exception) {
                    tvSaveStatus.text = "Erreur: ${e.message}"
                    // Retry : sans ça, un simple blip réseau laissait la fiche
                    // non enregistrée jusqu'à la prochaine saisie. Les flags
                    // dirty sont conservés donc le retry renverra les champs.
                    autoSaveHandler.postDelayed(autoSaveRunnable!!, 8000)
                } finally {
                    autoSaveInFlight = false
                }
            }
        }
        autoSaveHandler.postDelayed(autoSaveRunnable!!, 3000)
    }

    private fun save(showToast: Boolean = false) {
        intervention = collectData()
        tvSaveStatus.visibility = View.VISIBLE
        tvSaveStatus.text = "Enregistrement…"
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                // L'API préserve automatiquement les photos/signatures si vides
                // Pas besoin de les recharger à chaque save (trop lent)
                val sentFields = dirtyFields.toList()
                val sentPoints = deletedGpsPoints.toList()
                val sentPhotos = deletedWhatsappPhotoIds.toList()
                ApiService.saveIntervention(intervention, sentFields, sentPoints, sentPhotos)
                tvSaveStatus.text = "Enregistré ${Date().toString().takeLast(8)}"
                dirtyFields.removeAll(sentFields.toSet())
                deletedGpsPoints.removeAll(sentPoints.toSet())
                deletedWhatsappPhotoIds.removeAll(sentPhotos.toSet())
                startLiveRefresh()
                if (showToast) android.widget.Toast.makeText(this@InterventionFormActivity, "Enregistré", android.widget.Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                tvSaveStatus.text = "Erreur: ${e.message}"
                if (showToast) android.widget.Toast.makeText(this@InterventionFormActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
            }
            progressBar.visibility = View.GONE
        }
    }

    private fun finishIntervention() {
        if (finishing) return
        finishing = true
        btnFinish.isEnabled = false
        btnFinish.text = "Finalisation…"
        progressBar.visibility = View.VISIBLE

        intervention = collectData().copy(statut = "termine")
        markDirty("statut")

        lifecycleScope.launch {
            try {
                // L'API préserve automatiquement les photos/signatures si vides.
                // La déduction du stock se fait désormais automatiquement et de manière
                // atomique côté serveur (dans intervention_save) dès que statut='termine',
                // avec garde anti-double-déduction (colonne materiel_deduit). Plus besoin
                // d'un second appel réseau fragile ici.
                ApiService.saveIntervention(
                    intervention,
                    (dirtyFields + "statut").toList(),
                    deletedGpsPoints.toList(),
                    deletedWhatsappPhotoIds.toList()
                )
                android.widget.Toast.makeText(this@InterventionFormActivity, "Intervention terminée", android.widget.Toast.LENGTH_SHORT).show()
                startActivity(Intent(this@InterventionFormActivity, HomeActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
                })
                finish()
            } catch (e: Exception) {
                android.widget.Toast.makeText(this@InterventionFormActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
                finishing = false
                btnFinish.isEnabled = true
                btnFinish.text = "Terminer"
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun openPdf(action: String) {
        lifecycleScope.launch {
            try {
                intervention = collectData()
                ApiService.saveIntervention(
                    intervention,
                    dirtyFields.toList(),
                    deletedGpsPoints.toList(),
                    deletedWhatsappPhotoIds.toList()
                )
                val url = ApiService.getPdfUrl(action, intervention.id)
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                })
            } catch (e: Exception) {
                android.widget.Toast.makeText(this@InterventionFormActivity, "Impossible de préparer la fiche : ${e.message}", android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            when (requestCode) {
                200 -> openCamera(pendingPhotoMode)
                201 -> {
                    val uri = pendingPhotoUri
                    if (uri != null) handlePhotoResult(uri, pendingPhotoMode)
                }
            }
        } else {
            android.widget.Toast.makeText(this, "Permission refusée", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun Int.dp(): Int = (this * resources.displayMetrics.density).toInt()

    private fun fmt2(n: Int): String = if (n < 10) "0$n" else n.toString()

    // DELETE_ME_START
    private fun generateWhatsAppReport(intervention: Intervention, realises: Int, recus: Int): String {
        val d = intervention
        val dateStr = try {
            val sdf = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
            val dts = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault())
            sdf.format(dts.parse(d.date) ?: Date())
        } catch (e: Exception) {
            d.date.take(10)
        }
        val mp = d.materiel_pose
        val poteauxArmes = d.points_gps.filter { it.type == "Poteau" && it.sous_type == "Armé" }
        val poteauxTraverses = d.points_gps.filter { it.type == "Poteau" && it.sous_type == "Traversé" }
        val poteauxImplantes = d.points_gps.filter { it.type == "Poteau" && it.sous_type == "Implanté" }
        val abonne = d.points_gps.find { it.type == "Abonné" }
        val fat = d.points_gps.find { it.type == "FAT" }

        val proprietairesOrder = mutableListOf<String>()
        for (p in poteauxTraverses) {
            val prop = p.proprietaire.ifEmpty { "Autre" }
            if (prop !in proprietairesOrder) proprietairesOrder.add(prop)
        }

        fun fmt2mat(key: String): String = fmt2(mp[key] ?: 0)

        val sb = StringBuilder()
        sb.appendLine("*Chef d'Équipe : ${d.nom_technicien}*")
        sb.appendLine()
        sb.appendLine("*${fmt2(realises)} Réalisés / ${fmt2(recus)} Reçus*")
        sb.appendLine()
        sb.appendLine("*RACCORDEMENT*")
        sb.appendLine()
        sb.appendLine("*${dateStr}*")
        sb.appendLine()
        sb.appendLine("*Client: ${d.nom_client}*")
        sb.appendLine()
        sb.appendLine("*Etat:${d.etat}*")
        sb.appendLine()
        sb.appendLine("*Msan: ${d.msan} ${d.fat_ref}*")
        sb.appendLine()
        sb.appendLine("*Port:${d.port}*")
        val portsDisponiblesText = d.ports_disponibles.ifEmpty {
            if (d.port_disponible > 0) "${d.port_disponible} port(s)" else "Aucun"
        }
        sb.appendLine("*Ports disponibles: $portsDisponiblesText*")
        sb.appendLine("*Type de câble : ${d.type_cable}*")
        sb.appendLine("*Départ :${d.depart_m}m*")
        sb.appendLine("*Arrivée :${d.arrivee_m}m*")
        sb.appendLine("*Linéaire:${d.lineaire_m}m*")
        sb.appendLine("*Puissance FAT: ${d.puissance_fat_dbm} dBm*")
        sb.appendLine("*Puissance PTO: ${d.puissance_pto_dbm} dBm*")
        sb.appendLine("*MAC: ${d.mac}*")
        sb.appendLine("*SN : ${d.sn}*")
        sb.appendLine("*Nombre de poteaux armés : ${fmt2(poteauxArmes.size)}*")
        sb.appendLine("*Nombre de poteaux traversés : ${fmt2(poteauxTraverses.size)}*")
        sb.appendLine("*Nombre de poteaux implantés: ${fmt2(d.nb_poteaux_implantes)}*")
        sb.appendLine("*ONT: ${fmt2mat("ont")}*")
        sb.appendLine("*PTO: ${fmt2mat("pto")}*")
        sb.appendLine("*Jarretière: ${fmt2mat("jarretiere")}*")
        sb.appendLine("*Pince:${fmt2mat("pince")}*")
        sb.appendLine("*Crochets:${fmt2mat("crochets")}*")
        sb.appendLine("*Susp: ${fmt2mat("susp")}*")
        sb.appendLine("*Piton: ${fmt2mat("piton")}*")
        sb.appendLine("*Cheville: ${fmt2mat("cheville")}*")
        sb.appendLine("*Connecteur: ${fmt2mat("connecteur")}*")
        sb.appendLine("*Closer: ${fmt2mat("closer")}*")
        sb.appendLine("*Câble Fibre 1FO: ${fmt2mat("fibre_1fo")}*")
        sb.appendLine("*Ligne: ${d.telephone_ligne}*")
        sb.appendLine("*Mobile:${d.mobile}*")
        sb.appendLine("*Traverse 13T: ${fmt2mat("traverse_13t")}*")
        sb.appendLine("*Traverse 15T: ${fmt2mat("traverse_15t")}*")
        sb.appendLine("*CPC 50: ${fmt2mat("cpc_50")}*")
        sb.appendLine("*CPC 100: ${fmt2mat("cpc_100")}*")
        sb.appendLine("*CPC 150: ${fmt2mat("cpc_150")}*")
        sb.appendLine("*CPC 200: ${fmt2mat("cpc_200")}*")
        sb.appendLine("*CPC 250: ${fmt2mat("cpc_250")}*")
        sb.appendLine("*CPC 300: ${fmt2mat("cpc_300")}*")
        sb.appendLine("*CPC 350: ${fmt2mat("cpc_350")}*")
        sb.appendLine()
        sb.appendLine("*GPS Poteaux traversés*")

        for (prop in proprietairesOrder) {
            sb.appendLine("*GPS poteaux $prop*")
            for (p in poteauxTraverses.filter { (it.proprietaire.ifEmpty { "Autre" }) == prop }) {
                sb.appendLine("*GPS PT${p.numero}: ${p.lat},${p.lng}*")
            }
            sb.appendLine()
        }

        sb.appendLine("*Poteaux armés : ${fmt2(poteauxArmes.size)}*")
        if (poteauxArmes.isNotEmpty()) {
            sb.appendLine("*GPS poteaux armés*")
            for (p in poteauxArmes) {
                sb.appendLine("*GPS PT${p.numero}: ${p.lat},${p.lng}*")
            }
        }
        sb.appendLine()

        sb.appendLine("*Poteaux implanté : ${fmt2(d.nb_poteaux_implantes)}*")
        if (poteauxImplantes.isNotEmpty()) {
            sb.appendLine("*GPS poteaux implantés*")
            for (p in poteauxImplantes) {
                sb.appendLine("*GPS PT${p.numero}: ${p.lat},${p.lng}*")
            }
        }
        sb.appendLine()

        val abonneTxt = if (abonne != null) "${abonne.lat},${abonne.lng}" else ""
        val fatTxt = if (fat != null) "${fat.lat},${fat.lng}" else ""
        sb.appendLine("*GPS abonné: $abonneTxt*")
        sb.appendLine()
        sb.appendLine("*GPS FAT: $fatTxt*")

        return sb.toString()
    }

    private fun showWhatsAppReportDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 16, 32, 16)
        }

        val etRealises = EditText(this).apply {
            hint = "Réalisés (aujourd'hui)"
            inputType = InputType.TYPE_CLASS_NUMBER
            setText("0")
        }
        val etRecus = EditText(this).apply {
            hint = "Reçus (dossiers donnés)"
            inputType = InputType.TYPE_CLASS_NUMBER
            setText("0")
        }
        val tvReport = TextView(this).apply {
            textSize = 14f
            setTextIsSelectable(true)
            setPadding(0, 16, 0, 16)
        }

        fun updateReport() {
            val r = etRealises.text.toString().toIntOrNull() ?: 0
            val re = etRecus.text.toString().toIntOrNull() ?: 0
            tvReport.text = generateWhatsAppReport(intervention, r, re)
        }

        val tw = object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { updateReport() }
            override fun afterTextChanged(s: android.text.Editable?) {}
        }
        etRealises.addTextChangedListener(tw)
        etRecus.addTextChangedListener(tw)

        val btnCopy = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "Copier"
            setOnClickListener {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("Rapport", tvReport.text))
                android.widget.Toast.makeText(this@InterventionFormActivity, "Copié !", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
        val btnSend = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_TextButton).apply {
            text = "Envoyer sur WhatsApp"
            setOnClickListener {
                val text = tvReport.text.toString()
                val waIntent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse("https://wa.me/?text=" + Uri.encode(text))
                }
                try {
                    startActivity(waIntent)
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this@InterventionFormActivity, "WhatsApp non disponible", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(etRealises, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = 8.dp() })
            addView(etRecus, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        layout.addView(row)
        layout.addView(tvReport)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(btnCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = 8.dp() })
            addView(btnSend, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        layout.addView(btnRow)

        val scroll = ScrollView(this).apply { addView(layout) }
        updateReport()

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Rapport WhatsApp")
            .setView(scroll)
            .setPositiveButton("Fermer", null)
            .show()
    }

    private fun generateConformiteReport(d: Intervention): String {
        val dateStr = try {
            val sdf = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
            val dts = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault())
            sdf.format(dts.parse(d.date) ?: Date())
        } catch (e: Exception) {
            d.date.take(10)
        }

        val fat = d.points_gps.find { it.type == "FAT" }
        val abonne = d.points_gps.find { it.type == "Abonné" }
        val poteauxArmes = d.points_gps.count { it.type == "Poteau" && it.sous_type == "Armé" }
        val poteauxTraverses = d.points_gps.count { it.type == "Poteau" && it.sous_type == "Traversé" }
        val poteauxImplantes = d.points_gps.count { it.type == "Poteau" && it.sous_type == "Implanté" }

        val fatGps = if (fat != null) "${fat.lat},${fat.lng}" else ""
        val abonneGps = if (abonne != null) "${abonne.lat},${abonne.lng}" else ""

        val sb = StringBuilder()
        sb.appendLine("*Équipe : ${d.nom_equipe.ifEmpty { d.nom_technicien }}*")
        sb.appendLine()
        sb.appendLine("*${dateStr}*")
        sb.appendLine()
        sb.appendLine("*RACCORDEMENT*")
        sb.appendLine()
        sb.appendLine("*Client : ${d.nom_client}*")
        sb.appendLine()
        sb.appendLine("*Ligne : ${d.telephone_ligne}*")
        sb.appendLine()
        sb.appendLine("*MSAN : ${d.msan}*")
        sb.appendLine()
        sb.appendLine("*Linéaire : ${d.lineaire_m}m*")
        sb.appendLine()
        sb.appendLine("*GPS FAT : $fatGps*")
        sb.appendLine()
        sb.appendLine("*GPS abonné : $abonneGps*")
        sb.appendLine()
        sb.appendLine("*Poteaux armés : ${fmt2(poteauxArmes)}*")
        sb.appendLine("*Poteaux traversés : ${fmt2(poteauxTraverses)}*")
        sb.appendLine()
        sb.appendLine("*Nb : ${fmt2(poteauxImplantes)} poteau implanté*")
        sb.appendLine()
        val implanteGpsList = d.points_gps.filter { it.type == "Poteau" && it.sous_type == "Implanté" }
        if (implanteGpsList.isNotEmpty()) {
            sb.appendLine("*GPS poteau implanté :*")
            for (p in implanteGpsList) {
                sb.appendLine("*GPS PT${p.numero}: ${p.lat},${p.lng}*")
            }
        } else {
            sb.appendLine("*GPS poteau implanté : 00*")
        }

        return sb.toString()
    }

    private fun showConformiteReportDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 16, 32, 16)
        }

        val tvReport = TextView(this).apply {
            textSize = 14f
            setTextIsSelectable(true)
            setPadding(0, 16, 0, 16)
            text = generateConformiteReport(intervention)
        }

        val btnCopy = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "Copier"
            setOnClickListener {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("Rapport de conformité", tvReport.text))
                android.widget.Toast.makeText(this@InterventionFormActivity, "Copié !", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
        val btnSend = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_TextButton).apply {
            text = "Envoyer sur WhatsApp"
            setOnClickListener {
                val text = tvReport.text.toString()
                val waIntent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse("https://wa.me/?text=" + Uri.encode(text))
                }
                try {
                    startActivity(waIntent)
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this@InterventionFormActivity, "WhatsApp non disponible", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        layout.addView(tvReport)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(btnCopy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = 8.dp() })
            addView(btnSend, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        layout.addView(btnRow)

        val scroll = ScrollView(this).apply { addView(layout) }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Rapport de conformité")
            .setView(scroll)
            .setPositiveButton("Fermer", null)
            .show()
    }

    // ================== Scanner de fiches (ML Kit Document Scanner) ==================

    private fun openFicheScanner() {
        if (intervention.id.isEmpty()) {
            Toast.makeText(this, "Intervention non enregistrée — sauvegardez d'abord", Toast.LENGTH_LONG).show()
            return
        }
        val options = GmsDocumentScannerOptions.Builder()
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_BASE)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF, GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setGalleryImportAllowed(true)
            .build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(this)
            .addOnSuccessListener { intentSender ->
                ficheScannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener { error ->
                android.util.Log.e("FibreTrackMedia", "Document scanner unavailable", error)
                Toast.makeText(this, "Scanner indisponible — photo simple à la place", Toast.LENGTH_SHORT).show()
                openCamera("fiche")
            }
    }

    private fun confirmScanFiche(uri: Uri) {
        AlertDialog.Builder(this)
            .setTitle("Fiche scannée")
            .setMessage("Envoyer cette fiche au serveur ?\nElle sera visible dans la Galerie par tous les techniciens.")
            .setCancelable(false)
            .setPositiveButton("Envoyer") { _, _ -> uploadFicheToServer(uri) }
            .setNegativeButton("Reprendre") { _, _ -> openFicheScanner() }
            .setNeutralButton("Annuler", null)
            .show()
    }

    private fun uploadFicheToServer(uri: Uri) {
        if (intervention.id.isEmpty()) {
            Toast.makeText(this, "Intervention non enregistrée — sauvegardez d'abord", Toast.LENGTH_LONG).show()
            return
        }
        val source = File(cacheDir, "fiche_upload_${System.currentTimeMillis()}.jpg")
        contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(source).use { output -> input.copyTo(output) }
        } ?: return
        uploadFicheFileToServer(source)
    }

    private fun uploadFichePdfToServer(pdfUri: Uri) {
        if (intervention.id.isEmpty()) return
        val source = File(cacheDir, "fiche_scan_${System.currentTimeMillis()}.pdf")
        contentResolver.openInputStream(pdfUri)?.use { input ->
            FileOutputStream(source).use { output -> input.copyTo(output) }
        } ?: return
        uploadFicheFileToServer(source)
    }

    private fun uploadFicheFileToServer(source: File) {
        beginMediaUpload()
        lifecycleScope.launch {
            try {
                ApiService.uploadMedia(
                    intervention.id, "fiche", source, 0.0, 0.0, 0.0,
                    java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(Date())
                )
                source.delete()
                endMediaUpload()
                Toast.makeText(this@InterventionFormActivity, "Fiche envoyée au serveur", Toast.LENGTH_SHORT).show()
                if (serverMediaLoaded) loadInterventionMedia(force = true)
            } catch (e: Exception) {
                android.util.Log.e("FibreTrackMedia", "Fiche upload failed for ${intervention.id}", e)
                endMediaUpload()
                if (!isFinishing && !isDestroyed) {
                    AlertDialog.Builder(this@InterventionFormActivity)
                        .setTitle("Échec de l'envoi")
                        .setMessage("La fiche n'a pas pu être envoyée au serveur.\n${e.message}")
                        .setCancelable(false)
                        .setPositiveButton("Réessayer") { _, _ -> uploadFicheFileToServer(source) }
                        .setNegativeButton("Annuler") { _, _ -> source.delete() }
                        .show()
                }
            }
        }
    }

    // ================== Suivi des envois de médias ==================

    private fun beginMediaUpload() {
        pendingMediaUploads++
        if (mediaUploadDialog == null) {
            mediaUploadDialog = AlertDialog.Builder(this)
                .setTitle("Envoi en cours")
                .setMessage("Envoi du média au serveur…\nNe quittez pas cette page avant la fin de l'envoi.")
                .setCancelable(false)
                .create()
        }
        if (!isFinishing && !isDestroyed && mediaUploadDialog?.isShowing == false) {
            mediaUploadDialog?.show()
        }
    }

    private fun endMediaUpload() {
        pendingMediaUploads = (pendingMediaUploads - 1).coerceAtLeast(0)
        if (pendingMediaUploads == 0) {
            mediaUploadDialog?.dismiss()
        }
    }

    // ================== Onglet Galerie (médias partagés serveur) ==================

    private fun buildGalleryTab(section: LinearLayout) {
        val fh = FormHelper(section)
        fh.section("Médias de cette intervention")
        fh.addTextView("Photos et vidéos partagées par les techniciens. Touchez un élément pour l'ouvrir.", 0xFF777777.toInt(), 13f)
        serverMediaContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(serverMediaContainer)
        renderServerMedia()
        loadInterventionMedia()
    }

    private fun loadInterventionMedia(force: Boolean = false) {
        if (serverMediaLoaded && !force) return
        if (intervention.id.isEmpty()) return
        serverMediaLoaded = true
        lifecycleScope.launch {
            try {
                serverMedia = ApiService.listInterventionMedia(intervention.id)
                renderServerMedia()
            } catch (e: Exception) {
                serverMediaLoaded = false
                android.util.Log.e("FibreTrackMedia", "Unable to load intervention media for ${intervention.id}", e)
                Toast.makeText(this@InterventionFormActivity, "Médias serveur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun renderServerMedia() {
        val container = serverMediaContainer ?: return
        container.removeAllViews()
        if (serverMedia.isEmpty()) {
            container.addView(TextView(this).apply {
                text = "Aucun média partagé (photo, vidéo, fiche) pour cette intervention."
                textSize = 13f
                setTextColor(0xFF777777.toInt())
                setPadding(0, 8.dp(), 0, 8.dp())
            })
            return
        }
        for (media in serverMedia) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 6.dp(), 0, 6.dp())
            }
            val date = media.captured_at.ifEmpty { media.created_at }
            val label = when {
                media.type == "video" -> "Vidéo"
                media.type == "fiche" -> if (media.file_path.endsWith(".pdf", true)) "Fiche PDF" else "Fiche"
                else -> "Photo"
            }
            val tv = TextView(this).apply {
                text = "$label • ${media.added_by}\n$date"
                textSize = 13f
                setTextColor(0xFF333333.toInt())
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }
            val btnOpen = MaterialButton(this).apply {
                text = if (media.type == "video") "Lire" else "Ouvrir"
                setOnClickListener {
                    when {
                        media.type == "video" -> playServerVideo(media)
                        media.file_path.endsWith(".pdf", true) -> openServerPdf(media)
                        else -> showRemotePhoto(media)
                    }
                }
            }
            val btnDelete = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_TextButton).apply {
                text = "Supprimer"
                setTextColor(0xFFB3261E.toInt())
                setOnClickListener { confirmDeleteServerMedia(media) }
            }
            row.addView(tv)
            row.addView(btnOpen)
            row.addView(btnDelete)
            container.addView(row)
        }
    }

    private fun openServerPdf(media: InterventionMedia) {
        lifecycleScope.launch {
            try {
                val pdfFile = withContext(Dispatchers.IO) {
                    val file = File(cacheDir, "fiche_${media.id.ifEmpty { System.currentTimeMillis().toString() }}.pdf")
                    file.writeBytes(ApiService.downloadFile(media.url))
                    file
                }
                val uri = FileProvider.getUriForFile(this@InterventionFormActivity, "$packageName.fileprovider", pdfFile)
                try {
                    startActivity(Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/pdf")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    })
                } catch (e: android.content.ActivityNotFoundException) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(media.url)))
                }
            } catch (e: Exception) {
                android.util.Log.e("FibreTrackMedia", "Unable to open pdf ${media.id}", e)
                Toast.makeText(this@InterventionFormActivity, "Impossible d'ouvrir le PDF : ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun confirmDeleteServerMedia(media: InterventionMedia) {
        AlertDialog.Builder(this)
            .setTitle("Supprimer ce média ?")
            .setMessage("Ce fichier sera supprimé du serveur pour tous les techniciens.")
            .setNegativeButton("Annuler", null)
            .setPositiveButton("Supprimer") { _, _ ->
                lifecycleScope.launch {
                    try {
                        ApiService.deleteInterventionMedia(media.id)
                        Toast.makeText(this@InterventionFormActivity, "Média supprimé", Toast.LENGTH_SHORT).show()
                        loadInterventionMedia(force = true)
                    } catch (e: Exception) {
                        android.util.Log.e("FibreTrackMedia", "Unable to delete media ${media.id}", e)
                        Toast.makeText(this@InterventionFormActivity, "Suppression impossible : ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .show()
    }

    private fun playServerVideo(media: InterventionMedia) {
        val player = ExoPlayer.Builder(this).build()
        val playerView = PlayerView(this).apply {
            this.player = player
            useController = true
            setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        val statusTv = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 13f
            setPadding(16.dp(), 8.dp(), 16.dp(), 8.dp())
        }
        var videoDialog: android.app.Dialog? = null
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(12.dp(), 6.dp(), 12.dp(), 6.dp())
        }
        controls.addView(MaterialButton(this).apply {
            text = "Télécharger"
            setOnClickListener { downloadServerVideo(media) }
        })
        controls.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        controls.addView(MaterialButton(this).apply {
            text = "Fermer"
            setOnClickListener { videoDialog?.dismiss() }
        })
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            addView(TextView(this@InterventionFormActivity).apply {
                text = "Vidéo de ${media.added_by}"
                textSize = 16f
                setTextColor(Color.WHITE)
                setPadding(16.dp(), 12.dp(), 16.dp(), 8.dp())
            })
            addView(playerView)
            addView(statusTv)
            addView(controls)
        }
        val dialog = android.app.Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
        videoDialog = dialog
        dialog.setContentView(root)
        dialog.setOnDismissListener { player.release() }
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                statusTv.text = "Lecture impossible : ${error.errorCodeName}"
                android.util.Log.e("FibreTrackMedia", "Video playback failed: ${error.errorCodeName}", error)
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) statusTv.text = ""
            }
        })
        dialog.show()
        dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        player.setMediaItem(MediaItem.fromUri(media.url))
        player.prepare()
        player.playWhenReady = true
    }

    private fun downloadServerVideo(media: InterventionMedia) {
        lifecycleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    val displayName = "CHAPTECH_video_${System.currentTimeMillis()}.mp4"
                    val tmp = File(cacheDir, displayName)
                    try {
                        tmp.writeBytes(ApiService.downloadFile(media.url))
                        saveVideoToGallery(Uri.fromFile(tmp), displayName)
                    } finally {
                        tmp.delete()
                    }
                    displayName
                }
                Toast.makeText(this@InterventionFormActivity, "Vidéo téléchargée : $result", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                android.util.Log.e("FibreTrackMedia", "Unable to download server media ${media.id}", e)
                Toast.makeText(this@InterventionFormActivity, "Téléchargement impossible : ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun showRemotePhoto(media: InterventionMedia) {
        lifecycleScope.launch {
            try {
                val bitmap = withContext(Dispatchers.IO) {
                    val bytes = ApiService.downloadFile(media.url)
                    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                } ?: throw Exception("Image illisible")
                showPhotoViewer(bitmap, "Photo de ${media.added_by}")
            } catch (e: Exception) {
                Toast.makeText(this@InterventionFormActivity, "Impossible d'ouvrir l'image : ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    // ================== Visionneuse photo plein écran (zoom + téléchargement) ==================

    private fun openPhotoBytes(imageBytes: ByteArray, title: String) {
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
            }
            if (bitmap != null) {
                showPhotoViewer(bitmap, title)
            } else {
                Toast.makeText(this@InterventionFormActivity, "Image illisible", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setPhotoFitMatrix(matrix: android.graphics.Matrix, imageView: ImageView, bitmap: Bitmap, scale: Float) {
        val dx = (imageView.width - bitmap.width * scale) / 2f
        val dy = (imageView.height - bitmap.height * scale) / 2f
        matrix.setScale(scale, scale)
        matrix.postTranslate(dx, dy)
        imageView.imageMatrix = matrix
    }

    private fun showPhotoViewer(bitmap: Bitmap, title: String) {
        val imageMatrix = android.graphics.Matrix()
        var fitScale = 1f
        var currentScale = 1f
        var lastX = 0f
        var lastY = 0f
        val imageView = ImageView(this).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.MATRIX
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        val dialog = android.app.Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
        val scaleDetector = android.view.ScaleGestureDetector(this, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {
                val nextScale = (currentScale * detector.scaleFactor).coerceIn(fitScale, fitScale * 8f)
                val factor = nextScale / currentScale
                imageMatrix.postScale(factor, factor, detector.focusX, detector.focusY)
                currentScale = nextScale
                imageView.imageMatrix = imageMatrix
                return true
            }
        })
        imageView.setOnTouchListener { v, event ->
            scaleDetector.onTouchEvent(event)
            when (event.actionMasked) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    lastX = event.x
                    lastY = event.y
                }
                android.view.MotionEvent.ACTION_MOVE -> if (!scaleDetector.isInProgress && event.pointerCount == 1 && currentScale > fitScale) {
                    imageMatrix.postTranslate(event.x - lastX, event.y - lastY)
                    imageView.imageMatrix = imageMatrix
                    lastX = event.x
                    lastY = event.y
                }
                android.view.MotionEvent.ACTION_UP -> v.performClick()
            }
            true
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(0xFF222222.toInt())
            addView(TextView(this@InterventionFormActivity).apply {
                text = title
                setTextColor(Color.WHITE)
                textSize = 16f
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setPadding(12.dp(), 0, 0, 0)
            })
            addView(TextView(this@InterventionFormActivity).apply {
                text = "Ajuster"
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(12.dp(), 12.dp(), 12.dp(), 12.dp())
                setOnClickListener {
                    currentScale = fitScale
                    imageView.post { setPhotoFitMatrix(imageMatrix, imageView, bitmap, fitScale) }
                }
            })
            addView(TextView(this@InterventionFormActivity).apply {
                text = "Télécharger"
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(12.dp(), 12.dp(), 12.dp(), 12.dp())
                setOnClickListener {
                    saveBitmapToGallery(bitmap, "CHAPTECH_${System.currentTimeMillis()}.jpg")
                    Toast.makeText(this@InterventionFormActivity, "Image enregistrée dans Pictures/CHAPTECH", Toast.LENGTH_SHORT).show()
                }
            })
            addView(TextView(this@InterventionFormActivity).apply {
                text = "Fermer"
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(12.dp(), 12.dp(), 12.dp(), 12.dp())
                setOnClickListener { dialog.dismiss() }
            })
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            addView(header, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(imageView)
        }
        dialog.setContentView(root)
        dialog.show()
        dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        imageView.post {
            fitScale = minOf(imageView.width.toFloat() / bitmap.width, imageView.height.toFloat() / bitmap.height)
            currentScale = fitScale
            setPhotoFitMatrix(imageMatrix, imageView, bitmap, fitScale)
        }
    }

    private fun saveBitmapToGallery(bitmap: Bitmap, displayName: String) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/CHAPTECH")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }
        val galleryUri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return
        try {
            contentResolver.openOutputStream(galleryUri)?.use { output ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 95, output)
            } ?: throw Exception("Impossible d'écrire l'image dans la galerie")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentResolver.update(galleryUri, ContentValues().apply {
                    put(MediaStore.Images.Media.IS_PENDING, 0)
                }, null, null)
            }
        } catch (e: Exception) {
            contentResolver.delete(galleryUri, null, null)
        }
    }

    // ================== Rafraîchissement en direct (multi-techniciens) ==================

    private fun startLiveRefresh() {
        if (remoteRefreshJob?.isActive == true) return
        if (intervention.id.isEmpty()) return
        remoteRefreshJob = lifecycleScope.launch {
            while (isActive) {
                delay(30_000)
                try {
                    if (intervention.id.isEmpty()) break
                    // Relevé léger d'abord : le corps complet n'est téléchargé
                    // que si l'intervention a réellement changé côté serveur.
                    val stamp = ApiService.getInterventionUpdatedAt(intervention.id)
                    if (stamp.isEmpty() || stamp == intervention.updated_at || stamp == intervention.modifie_le) continue
                    val remote = ApiService.getInterventionLight(intervention.id)
                    applyRemoteIntervention(remote)
                } catch (e: Exception) {
                    android.util.Log.w("FibreTrackMedia", "Live refresh failed", e)
                }
            }
        }
    }

    private fun applyRemoteIntervention(remote: Intervention) {
        val current = intervention
        // Fusion des points GPS : le serveur gagne sur les métadonnées,
        // mais on préserve les photos locales non encore synchronisées.
        val currentGps = current.points_gps.associateBy { it.horodatage }.toMutableMap()
        val mergedGps = (remote.points_gps + current.points_gps)
            .filter { it.horodatage !in deletedGpsPoints }
            .associateBy { it.horodatage }
            .map { (key, remoteOrLocal) ->
                val serverPoint = remote.points_gps.firstOrNull { it.horodatage == key }
                val localPoint = currentGps[key]
                if (serverPoint != null && localPoint != null && localPoint.photo.isNotEmpty()) {
                    serverPoint.copy(photo = localPoint.photo)
                } else {
                    remoteOrLocal
                }
            }
        // Idem pour les photos WhatsApp : on préserve l'URL/base64 locale.
        val currentWa = current.whatsapp_photos.associateBy { it.id }
        val mergedPhotos = (remote.whatsapp_photos + current.whatsapp_photos)
            .filter { it.id !in deletedWhatsappPhotoIds }
            .associateBy { it.id }
            .map { (key, remoteOrLocal) ->
                val serverPhoto = remote.whatsapp_photos.firstOrNull { it.id == key }
                val localPhoto = currentWa[key]
                if (serverPhoto != null && localPhoto != null && localPhoto.url.isNotEmpty()) {
                    serverPhoto.copy(url = localPhoto.url)
                } else {
                    remoteOrLocal
                }
            }
        applyingRemoteChanges = true
        try {
            val json = JsonParser.parseString(Gson().toJson(remote)).asJsonObject
            for ((key, view) in fieldMap) {
                try {
                    if (key in dirtyFields || !json.has(key) || json.get(key).isJsonNull) continue
                    val value = json.get(key)
                    when (view) {
                        is EditText -> {
                            val text = if (value.isJsonPrimitive) value.asString else ""
                            if (view.text.toString() != text) view.setText(text)
                        }
                        is Spinner -> {
                            val text = value.asString
                            val adapter = view.adapter ?: continue
                            val index = (0 until adapter.count).firstOrNull { adapter.getItem(it)?.toString() == text }
                            if (index != null && view.selectedItemPosition != index) view.setSelection(index)
                        }
                        is CheckBox -> view.isChecked = value.asBoolean
                        else -> {}
                    }
                } catch (_: Throwable) {}
            }
            for ((key, et) in materielViews) {
                if ("materiel_pose.$key" in dirtyFields) continue
                val quantity = remote.materiel_pose[key] ?: 0
                if (et.text.toString() != quantity.toString()) et.setText(quantity.toString())
            }
            if ("ports_disponibles" !in dirtyFields) {
                portsDisponibles.clear()
                portsDisponibles.addAll(normalizePortSelections(remote.ports_disponibles))
                portsDisponiblesText?.text = "Ports disponibles : ${portsDisponibles.joinToString(", ").ifEmpty { "Aucun" }}"
                renderPortsDisponiblesSelection()
            }
        } finally {
            applyingRemoteChanges = false
        }
        val gpsChanged = mergedGps.map { it.horodatage } != current.points_gps.map { it.horodatage }
        val photosChanged = mergedPhotos.map { it.id } != current.whatsapp_photos.map { it.id }
        intervention = remote.copy(
            points_gps = mergedGps,
            whatsapp_photos = mergedPhotos,
            signature_client = current.signature_client.ifEmpty { remote.signature_client },
            signature_technicien = current.signature_technicien.ifEmpty { remote.signature_technicien }
        )
        if (gpsChanged) refreshGpsList()
        if (photosChanged) refreshWhatsappPhotos()
        if (dirtyFields.isEmpty() && remote.modifie_par.isNotBlank()) {
            tvSaveStatus.text = "Mis à jour par ${remote.modifie_par}"
        }
    }
}
