package com.fibretrack.app

import android.Manifest
import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.location.Location
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.fibretrack.app.models.GpsPoint
import com.fibretrack.app.models.Intervention
import com.fibretrack.app.models.WhatsappPhoto
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.tabs.TabLayout
import com.google.gson.Gson
import kotlinx.coroutines.launch
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
    private var sigClientPad: SignaturePadView? = null
    private var sigTechPad: SignaturePadView? = null

    private var pendingPhotoUri: Uri? = null
    private var pendingPhotoMode: String = "gps"

    private val materielStandard = listOf(
        "rue" to "Rue", "pince" to "Pince", "crochets" to "Crochets",
        "susp" to "Suspente (Susp)", "piton" to "Piton", "closer" to "Closer",
        "rp1" to "RP1", "traverse_13t" to "Traverse 13T", "traverse_15t" to "Traverse 15T",
        "semelle_eq" to "Semelle Eq", "poteau_sbee_non_arme" to "Poteau SBEE non armé",
        "poteau_sbee_arme" to "Poteau SBEE armé"
    )
    private val materielViews = mutableMapOf<String, EditText>()

    private val autoSaveHandler = Handler(Looper.getMainLooper())
    private var autoSaveRunnable: Runnable? = null
    private var photosLoaded = false

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
        scrollView = findViewById(R.id.scrollView)

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        val interventionId = intent.getStringExtra("intervention_id") ?: ""
        intervention = ApiService.pendingIntervention ?: if (interventionId.isNotEmpty()) {
            ApiService.createEmptyIntervention(SessionManager.getUserName(this))
        } else {
            ApiService.createEmptyIntervention(SessionManager.getUserName(this))
        }
        ApiService.pendingIntervention = null

        toolbar.title = if (intervention.nom_client.isNotEmpty()) intervention.nom_client else "Nouvelle intervention"

        setupTabs()
        buildAllTabs()

        btnSave.setOnClickListener { save(showToast = true) }
        btnFinish.setOnClickListener { finishIntervention() }

        if (intervention.statut == "termine") {
            btnFinish.isEnabled = false
            btnFinish.text = "Terminé"
        }

        setupAutoSaveListeners()
    }

    private fun setupAutoSaveListeners() {
        val watcher = object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) { scheduleAutoSave() }
        }
        for ((_, v) in fieldMap) {
            when (v) {
                is EditText -> v.addTextChangedListener(watcher)
                is com.google.android.material.textfield.TextInputEditText -> v.addTextChangedListener(watcher)
                is Spinner -> v.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                    override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { scheduleAutoSave() }
                    override fun onNothingSelected(parent: AdapterView<*>?) {}
                }
                is CheckBox -> v.setOnCheckedChangeListener { _, _ -> scheduleAutoSave() }
                is RadioGroup -> v.setOnCheckedChangeListener { _, _ -> scheduleAutoSave() }
            }
        }
        for ((_, et) in materielViews) {
            et.addTextChangedListener(watcher)
        }
    }

    private fun setupTabs() {
        val tabLayout = findViewById<TabLayout>(R.id.tabLayout)
        val tabs = listOf("Rapport rapide", "GPS", "Mise en service", "Satisfaction")
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
        fieldMap["port_disponible"] = fh.check("port_disponible", "Port disponible", intervention.port_disponible)
        fieldMap["type_cable"] = fh.edit("type_cable", "Type de câble", intervention.type_cable)
        fieldMap["depart_m"] = fh.number("depart_m", "Départ (m)", intervention.depart_m)
        fieldMap["arrivee_m"] = fh.number("arrivee_m", "Arrivée (m)", intervention.arrivee_m)
        fieldMap["lineaire_m"] = fh.number("lineaire_m", "Linéaire (m, calculé)", intervention.lineaire_m)
        fieldMap["puissance_fat_dbm"] = fh.number("puissance_fat_dbm", "Puissance FAT (dBm)", intervention.puissance_fat_dbm)
        fieldMap["puissance_pto_dbm"] = fh.number("puissance_pto_dbm", "Puissance PTO (dBm)", intervention.puissance_pto_dbm)
        fieldMap["mac"] = fh.edit("mac", "MAC", intervention.mac)
        fieldMap["sn"] = fh.edit("sn", "SN (ONT)", intervention.sn)

        fh.addTextView("Poteaux traversés: ${String.format("%02d", intervention.nb_poteaux_traverses)} - Poteaux implantés: ${String.format("%02d", intervention.nb_poteaux_implantes)}", 0xFF666666.toInt(), 13f)

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
        val sousTypeLabel = TextView(this).apply { text = "Poteau traversé ou implanté ?"; setTextColor(0xFF333333.toInt()) }
        gpsSousTypeSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@InterventionFormActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf("Traversé", "Implanté"))
        }
        sousTypeRow.addView(sousTypeLabel)
        sousTypeRow.addView(gpsSousTypeSpinner!!)
        section.addView(sousTypeRow)

        val propLabel = TextView(this).apply { text = "Propriétaire du poteau (SBEE, Petit Jean...)"; setTextColor(0xFF333333.toInt()) }
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
        }
        val btnClearTech = MaterialButton(this, null, com.google.android.material.R.style.Widget_MaterialComponents_Button_OutlinedButton).apply {
            text = "Effacer"
        }
        btnClearTech.setOnClickListener { sigTechPad?.clear() }
        section.addView(sigTechPad!!)
        section.addView(btnClearTech)

        fh.section("Documents")
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

    private fun openGallery(mode: String) {
        pendingPhotoMode = mode
        galleryLauncher.launch("image/*")
    }

    private fun handlePhotoResult(uri: Uri, mode: String) {
        val statusTv = if (mode == "gps") gpsStatusText else waStatusText
        statusTv?.text = "Traitement de la photo et GPS…"

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 201)
            return
        }

        progressBar.visibility = View.VISIBLE
        fusedLocationClient.lastLocation.addOnSuccessListener { location: Location? ->
            if (location == null) {
                statusTv?.text = "GPS indisponible - réessayez"
                progressBar.visibility = View.GONE
                return@addOnSuccessListener
            }

            val lat = location.latitude
            val lng = location.longitude
            val precision = location.accuracy.toDouble()
            val horodatage = Date().toInstant().toString()

            try {
                val inputStream = contentResolver.openInputStream(uri)
                val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
                inputStream?.close()

                if (bitmap == null) {
                    statusTv?.text = "Erreur: photo illisible"
                    progressBar.visibility = View.GONE
                    return@addOnSuccessListener
                }

                val embeddedBitmap = embedGpsOnPhoto(bitmap, mode, lat, lng, precision, horodatage)
                val baos = java.io.ByteArrayOutputStream()
                embeddedBitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
                val photoBase64 = android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)
                val dataUrl = "data:image/jpeg;base64,$photoBase64"

                if (mode == "gps") {
                    val typeStr = gpsTypeSpinner?.selectedItem.toString() ?: "Point"
                    val sousType = if (typeStr == "Poteau") gpsSousTypeSpinner?.selectedItem.toString() ?: "" else ""
                    val proprietaire = if (typeStr == "Poteau" && sousType == "Traversé") gpsProprietaireEdit?.text?.toString()?.trim() ?: "" else ""
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
        }.addOnFailureListener {
            statusTv?.text = "Erreur GPS: ${it.message}"
            progressBar.visibility = View.GONE
        }
    }

    private fun embedGpsOnPhoto(bitmap: Bitmap, mode: String, lat: Double, lng: Double, precision: Double, horodatage: String): Bitmap {
        val result = bitmap.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(result)
        val w = result.width.toFloat()
        val h = result.height.toFloat()

        val fontSize = maxOf(14f, w * 0.022f)
        val lineGap = fontSize * 1.3f
        val pad = fontSize * 0.6f

        val typeLabel = if (mode == "gps") {
            val t = gpsTypeSpinner?.selectedItem.toString() ?: "Point"
            if (t == "Poteau") {
                val st = gpsSousTypeSpinner?.selectedItem.toString() ?: ""
                val prop = gpsProprietaireEdit?.text?.toString()?.trim() ?: ""
                "Poteau $st ${nextNumeroForType("Poteau", st)}${if (prop.isNotEmpty()) " ($prop)" else ""}"
            } else "$t ${nextNumeroForType(t, "")}"
        } else "Photo terrain - ${intervention.nom_client.ifEmpty { "intervention" }}"

        val dateStr = try {
            java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault()).format(Date.from(java.time.Instant.parse(horodatage)))
        } catch (e: Exception) { horodatage.take(16) }

        val lines = listOf(typeLabel, "Lat: ${String.format("%.6f", lat)}  Lng: ${String.format("%.6f", lng)}", "Précision: ±${String.format("%.1f", precision)}m - $dateStr")
        val bandHeight = pad * 2 + lineGap * lines.size

        val bgPaint = Paint().apply { color = Color.argb(160, 0, 0, 0) }
        canvas.drawRect(0f, h - bandHeight, w, h, bgPaint)

        val textPaint = Paint().apply {
            color = Color.WHITE
            textSize = fontSize
            typeface = Typeface.DEFAULT_BOLD
            isAntiAlias = true
        }

        var y = h - bandHeight + pad
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
            port_disponible = getBool("port_disponible"),
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

    private fun scheduleAutoSave() {
        autoSaveRunnable?.let { autoSaveHandler.removeCallbacks(it) }
        tvSaveStatus.visibility = View.VISIBLE
        tvSaveStatus.text = "Enregistrement…"
        autoSaveRunnable = Runnable {
            intervention = collectData()
            val lightIntervention = intervention.copy(
                points_gps = emptyList(),
                whatsapp_photos = emptyList(),
                signature_client = if (intervention.signature_client.length > 100) "" else intervention.signature_client,
                signature_technicien = if (intervention.signature_technicien.length > 100) "" else intervention.signature_technicien
            )
            lifecycleScope.launch {
                try {
                    ApiService.saveInterventionLight(lightIntervention)
                    tvSaveStatus.text = "Enregistré ${Date().toString().takeLast(8)}"
                } catch (e: Exception) {
                    tvSaveStatus.text = "Erreur: ${e.message}"
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
                if (!photosLoaded && intervention.id.isNotEmpty()) {
                    photosLoaded = true
                    val photos = ApiService.getInterventionPhotos(intervention.id)
                    intervention = intervention.copy(
                        points_gps = intervention.points_gps.ifEmpty { photos.points_gps },
                        whatsapp_photos = intervention.whatsapp_photos.ifEmpty { photos.whatsapp_photos },
                        signature_client = intervention.signature_client.ifEmpty { photos.signature_client },
                        signature_technicien = intervention.signature_technicien.ifEmpty { photos.signature_technicien }
                    )
                }
                ApiService.saveIntervention(intervention)
                tvSaveStatus.text = "Enregistré ${Date().toString().takeLast(8)}"
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

        lifecycleScope.launch {
            try {
                if (!photosLoaded && intervention.id.isNotEmpty()) {
                    photosLoaded = true
                    val photos = ApiService.getInterventionPhotos(intervention.id)
                    intervention = intervention.copy(
                        points_gps = intervention.points_gps.ifEmpty { photos.points_gps },
                        whatsapp_photos = intervention.whatsapp_photos.ifEmpty { photos.whatsapp_photos },
                        signature_client = intervention.signature_client.ifEmpty { photos.signature_client },
                        signature_technicien = intervention.signature_technicien.ifEmpty { photos.signature_technicien }
                    )
                }
                ApiService.saveIntervention(intervention)
                // Deduction automatique du stock
                val materiel = intervention.materiel_pose.filterValues { it > 0 }
                if (materiel.isNotEmpty()) {
                    try {
                        ApiService.deductStock(
                            intervention.id,
                            intervention.nom_client,
                            intervention.nom_technicien,
                            materiel
                        )
                    } catch (e: Exception) {
                        // Non bloquant si la deduction echoue
                    }
                }
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
        val url = ApiService.getPdfUrl(action, intervention.id)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            when (requestCode) {
                200 -> openCamera(pendingPhotoMode)
                201 -> handlePhotoResult(pendingPhotoUri!!, pendingPhotoMode)
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
        sb.appendLine("*Port disponible: ${if (d.port_disponible) 1 else 0}*")
        sb.appendLine("*Type de câble : ${d.type_cable}*")
        sb.appendLine("*Départ :${d.depart_m}m*")
        sb.appendLine("*Arrivée :${d.arrivee_m}m*")
        sb.appendLine("*Linéaire:${d.lineaire_m}m*")
        sb.appendLine("*Puissance FAT: ${d.puissance_fat_dbm} dBm*")
        sb.appendLine("*Puissance PTO: ${d.puissance_pto_dbm} dBm*")
        sb.appendLine("*MAC: ${d.mac}*")
        sb.appendLine("*SN : ${d.sn}*")
        sb.appendLine("*Nombre de poteaux traversés : ${fmt2(d.nb_poteaux_traverses)}*")
        sb.appendLine("*Nombre de poteaux implantés: ${fmt2(d.nb_poteaux_implantes)}*")
        sb.appendLine("*Rue: ${fmt2mat("rue")}*")
        sb.appendLine("*Pince:${fmt2mat("pince")}*")
        sb.appendLine("*Crochets:${fmt2mat("crochets")}*")
        sb.appendLine("*Susp: ${fmt2mat("susp")}*")
        sb.appendLine("*Piton: ${fmt2mat("piton")}*")
        sb.appendLine("*Closer: ${fmt2mat("closer")}*")
        sb.appendLine("*RP1: ${fmt2mat("rp1")}*")
        sb.appendLine("*Ligne: ${d.telephone_ligne}*")
        sb.appendLine("*Mobile:${d.mobile}*")
        sb.appendLine("*Traverse 13T: ${fmt2mat("traverse_13t")}*")
        sb.appendLine("*Traverse 15T: ${fmt2mat("traverse_15t")}*")
        sb.appendLine("*Semelle Eq: ${fmt2mat("semelle_eq")}*")
        sb.appendLine("*Poteau SBEE non armé : ${fmt2mat("poteau_sbee_non_arme")}*")
        sb.appendLine("*Poteau SBEE armé:${fmt2mat("poteau_sbee_arme")}*")
        sb.appendLine("*Poteaux armé: ${fmt2mat("poteau_sbee_arme")}*")
        sb.appendLine()
        sb.appendLine("*GPS Poteaux traversés*")

        for (prop in proprietairesOrder) {
            sb.appendLine("*GPS poteaux $prop*")
            for (p in poteauxTraverses.filter { (it.proprietaire.ifEmpty { "Autre" }) == prop }) {
                sb.appendLine("*GPS PT${p.numero}: ${p.lat},${p.lng}*")
            }
            sb.appendLine()
        }

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
}
