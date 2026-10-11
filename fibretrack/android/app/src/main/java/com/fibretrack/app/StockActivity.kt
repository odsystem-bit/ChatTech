package com.fibretrack.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fibretrack.app.models.StockImportResult
import com.fibretrack.app.models.StockMovement
import com.fibretrack.app.models.StockTemplateItem
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class StockActivity : AppCompatActivity() {

    private val stockItems = mutableListOf<Pair<String, Int>>()
    private lateinit var adapter: StockAdapter
    private var importProgressDialog: androidx.appcompat.app.AlertDialog? = null
    private var excelImportMode = "set"

    private val excelPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            importExcelFile(uri, excelImportMode)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_stock)
        applyBottomSystemBarInset(findViewById(android.R.id.content))

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        if (!SessionManager.isAdmin(this)) {
            findViewById<MaterialButton>(R.id.btnImportExcel).visibility = View.GONE
            findViewById<MaterialButton>(R.id.btnImportCanevas).visibility = View.GONE
        }

        val recycler = findViewById<RecyclerView>(R.id.recyclerStock)

        adapter = StockAdapter(stockItems,
            onInc = { pos -> moveQty(pos, 1) },
            onDec = { pos -> moveQty(pos, -1) }
        )
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        findViewById<MaterialButton>(R.id.btnAdd).setOnClickListener {
            val desig = findViewById<TextInputEditText>(R.id.editDesignation).text.toString().trim()
            val qty = findViewById<TextInputEditText>(R.id.editQty).text.toString().toIntOrNull() ?: 0
            if (desig.isEmpty()) {
                android.widget.Toast.makeText(this, "Désignation requise", android.widget.Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (qty <= 0) {
                android.widget.Toast.makeText(this, "Quantité positive requise", android.widget.Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            lifecycleScope.launch {
                try {
                    ApiService.moveStockItem(desig, qty, "entree", "Réception manuelle")
                    findViewById<TextInputEditText>(R.id.editDesignation).setText("")
                    findViewById<TextInputEditText>(R.id.editQty).setText("")
                    refreshStock()
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        findViewById<MaterialButton>(R.id.btnImportExcel).setOnClickListener {
            showExcelImportModeDialog()
        }

        findViewById<MaterialButton>(R.id.btnImportCanevas).setOnClickListener {
            showImportCanevasDialog()
        }

        findViewById<MaterialButton>(R.id.btnPdfStock).setOnClickListener {
            val url = ApiService.getStockPdfUrl("pdf_stock_view")
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }

        findViewById<MaterialButton>(R.id.btnMovements).setOnClickListener {
            showMovementsDialog()
        }

        val btnExportExcel = findViewById<MaterialButton>(R.id.btnExportExcel)
        val btnExportExcelHebdo = findViewById<MaterialButton>(R.id.btnExportExcelHebdo)
        if (SessionManager.isAdmin(this)) {
            btnExportExcel.visibility = View.VISIBLE
            btnExportExcel.setOnClickListener {
                val url = ApiService.getPointMaterielExcelUrl()
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                })
            }

            btnExportExcelHebdo.visibility = View.VISIBLE
            btnExportExcelHebdo.setOnClickListener {
                showWeeklyExportPicker()
            }
        }

        refreshStock()
    }

    private fun showWeeklyExportPicker() {
        val today = Calendar.getInstance()
        android.app.DatePickerDialog(this, { _, year, month, day ->
            val date = Calendar.getInstance().apply { set(year, month, day) }
            val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val url = ApiService.getExcelHebdoUrl(formatter.format(date.time))
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }, today.get(Calendar.YEAR), today.get(Calendar.MONTH), today.get(Calendar.DAY_OF_MONTH)).apply {
            setTitle("Choisir une date dans la semaine à exporter")
        }.show()
    }

    private fun showExcelImportModeDialog() {
        val modes = arrayOf(
            "Ajouter les quantités comme nouvelle livraison",
            "Définir le solde d’après STOCK RESTANT"
        )
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Mode d’import Excel")
            .setItems(modes) { _, which ->
                excelImportMode = if (which == 0) "add" else "set"
                excelPickerLauncher.launch("*/*")
            }
            .show()
    }

    private fun importExcelFile(uri: Uri, mode: String) {
        val progressDialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Import Excel en cours...")
            .setMessage("Lecture et envoi du fichier...")
            .setCancelable(false)
            .create()
        progressDialog.show()
        importProgressDialog = progressDialog

        lifecycleScope.launch {
            try {
                val inputStream = contentResolver.openInputStream(uri)
                    ?: throw Exception("Impossible d'ouvrir le fichier")
                val bytes = inputStream.use { it.readBytes() }
                val fileBase64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)

                val result = ApiService.importStockExcel(fileBase64, mode)
                progressDialog.dismiss()

                if (result.ok) {
                    val msg = if (result.not_found.isNotEmpty()) {
                        "Stock importé (${result.count} articles). Colonnes non trouvées: ${result.not_found.joinToString(", ")}"
                    } else {
                        "Stock importé avec succès (${result.count} articles)"
                    }
                    android.widget.Toast.makeText(this@StockActivity, msg, android.widget.Toast.LENGTH_LONG).show()
                    refreshStock()
                } else {
                    android.widget.Toast.makeText(this@StockActivity, "Erreur: ${result.error}", android.widget.Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                progressDialog.dismiss()
                android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun showImportCanevasDialog() {
        val progressBar = ProgressBar(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 32)
        }
        container.addView(progressBar)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Canevas d'import de stock")
            .setView(container)
            .setCancelable(true)
            .create()

        dialog.show()

        lifecycleScope.launch {
            try {
                val template = ApiService.getStockTemplate()
                container.removeView(progressBar)

                val editTexts = mutableMapOf<String, TextInputEditText>()

                for (item in template) {
                    val row = LinearLayout(this@StockActivity).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding(0, 8, 0, 8)
                    }

                    val label = TextView(this@StockActivity).apply {
                        text = item.label
                        textSize = 14f
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 2f)
                    }

                    val edit = TextInputEditText(this@StockActivity).apply {
                        hint = "Qté"
                        inputType = android.text.InputType.TYPE_CLASS_NUMBER
                        setText(item.quantite.toString())
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    editTexts[item.designation] = edit

                    row.addView(label)
                    row.addView(edit)
                    container.addView(row)
                }

                val btnImport = MaterialButton(this@StockActivity).apply {
                    text = "Ajouter ces quantités au stock"
                    cornerRadius = 8
                    setPadding(0, 24, 0, 24)
                    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    lp.topMargin = 24
                    layoutParams = lp
                }
                btnImport.setOnClickListener {
                    val items = template.map { it.copy(quantite = editTexts[it.designation]?.text.toString().toIntOrNull() ?: 0) }
                    lifecycleScope.launch {
                        try {
                            ApiService.importStock(items, "add")
                            android.widget.Toast.makeText(this@StockActivity, "Stock importé (${items.size} articles)", android.widget.Toast.LENGTH_SHORT).show()
                            dialog.dismiss()
                            refreshStock()
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }
                }
                container.addView(btnImport)

                dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

            } catch (e: Exception) {
                container.removeView(progressBar)
                val errText = TextView(this@StockActivity).apply {
                    text = "Erreur: ${e.message}"
                    setTextColor(0xFFFF0000.toInt())
                }
                container.addView(errText)
            }
        }
    }

    private fun showMovementsDialog() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 32)
        }
        val progressBar = ProgressBar(this)
        container.addView(progressBar)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Mouvements de stock")
            .setView(container)
            .setPositiveButton("Fermer", null)
            .create()

        dialog.show()

        lifecycleScope.launch {
            try {
                val movements = ApiService.getStockMovements()
                container.removeView(progressBar)

                if (movements.isEmpty()) {
                    container.addView(TextView(this@StockActivity).apply {
                        text = "Aucun mouvement"
                        setTextColor(0xFF999999.toInt())
                        textSize = 14f
                    })
                    return@launch
                }

                for (mv in movements.take(50)) {
                    val row = LinearLayout(this@StockActivity).apply {
                        orientation = LinearLayout.HORIZONTAL
                        setPadding(0, 4, 0, 4)
                    }

                    val typeColor = when (mv.type) {
                        "entree" -> 0xFF4CAF50.toInt()
                        "sortie" -> 0xFFF44336.toInt()
                        else -> 0xFFFF9800.toInt()
                    }
                    val typeLabel = when (mv.type) {
                        "entree" -> "+"
                        "sortie" -> "-"
                        else -> "~"
                    }

                    val tvType = TextView(this@StockActivity).apply {
                        text = typeLabel
                        setTextColor(typeColor)
                        textSize = 16f
                        setTypeface(typeface, android.graphics.Typeface.BOLD)
                        val lp = LinearLayout.LayoutParams(60, ViewGroup.LayoutParams.WRAP_CONTENT)
                        layoutParams = lp
                    }

                    val tvInfo = TextView(this@StockActivity).apply {
                        val dateStr = mv.date_mouvement.take(16).replace("T", " ")
                        val client = mv.int_nom_client ?: mv.nom_client ?: ""
                        text = "$dateStr\n${mv.designation} (${mv.quantite})" + (if (client.isNotEmpty()) "\n$client" else "")
                        textSize = 11f
                        val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                        layoutParams = lp
                    }

                    row.addView(tvType)
                    row.addView(tvInfo)
                    container.addView(row)
                }

                dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            } catch (e: Exception) {
                container.removeView(progressBar)
                container.addView(TextView(this@StockActivity).apply {
                    text = "Erreur: ${e.message}"
                    setTextColor(0xFFFF0000.toInt())
                })
            }
        }
    }

    private fun moveQty(pos: Int, delta: Int) {
        val desig = stockItems[pos].first
        if (delta < 0 && stockItems[pos].second <= 0) return
        lifecycleScope.launch {
            try {
                ApiService.moveStockItem(desig, kotlin.math.abs(delta), if (delta > 0) "entree" else "sortie", "Ajustement rapide")
                refreshStock()
            } catch (e: Exception) {
                android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun refreshStock() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        val emptyState = findViewById<LinearLayout>(R.id.emptyState)
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val stock = ApiService.listStock()
                stockItems.clear()
                stockItems.addAll(stock.entries.sortedBy { it.key }.map { it.key to it.value })
                adapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
                emptyState.visibility = if (stockItems.isEmpty()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }
}

class StockAdapter(
    private val items: List<Pair<String, Int>>,
    private val onInc: (Int) -> Unit,
    private val onDec: (Int) -> Unit
) : RecyclerView.Adapter<StockAdapter.VH>() {

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val tvDesig: TextView = v.findViewById(R.id.tvDesignation)
        val tvQty: TextView = v.findViewById(R.id.tvQty)
        val btnInc: ImageButton = v.findViewById(R.id.btnInc)
        val btnDec: ImageButton = v.findViewById(R.id.btnDec)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(LayoutInflater.from(parent.context).inflate(R.layout.item_stock, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val (desig, qty) = items[position]
        holder.tvDesig.text = desig
        holder.tvQty.text = "Quantité: $qty"
        if (qty == 0) {
            holder.tvQty.setTextColor(0xFFF44336.toInt())
        } else if (qty < 10) {
            holder.tvQty.setTextColor(0xFFFF9800.toInt())
        } else {
            holder.tvQty.setTextColor(0xFF4CAF50.toInt())
        }
        holder.btnInc.setOnClickListener { onInc(holder.bindingAdapterPosition) }
        holder.btnDec.setOnClickListener { onDec(holder.bindingAdapterPosition) }
    }

    override fun getItemCount() = items.size
}

