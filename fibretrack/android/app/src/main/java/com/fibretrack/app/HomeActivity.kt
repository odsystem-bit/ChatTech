package com.fibretrack.app

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.fibretrack.app.models.InterventionLight
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private lateinit var adapter: InterventionAdapter
    private val rows = mutableListOf<InterventionRow>()
    private var openingId: String? = null
    private var latestInterventions: List<InterventionLight> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)
        AppUpdater.checkForUpdate(this)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.title = "CHAPTECH"
        toolbar.inflateMenu(R.menu.menu_home)
        toolbar.setOnMenuItemClickListener { item ->
            if (item.itemId == R.id.menu_logout) {
                SessionManager.logout(this)
                startActivity(Intent(this, LoginActivity::class.java))
                finish()
                true
            } else false
        }

        val userInfo = findViewById<TextView>(R.id.userInfo)
        val userName = SessionManager.getUserName(this)
        userInfo.text = "Bonjour, $userName"

        val btnAdmin = findViewById<MaterialButton>(R.id.btnAdmin)
        if (SessionManager.isAdmin(this)) btnAdmin.visibility = View.VISIBLE

        val recycler = findViewById<RecyclerView>(R.id.recyclerInterventions)

        adapter = InterventionAdapter(rows, onDelete = { item -> deleteIntervention(item) }, onClick = { item ->
            if (openingId != null) return@InterventionAdapter
            openingId = item.id
            lifecycleScope.launch {
                try {
                    val full = ApiService.getInterventionLight(item.id)
                    ApiService.pendingIntervention = full
                    val intent = Intent(this@HomeActivity, InterventionFormActivity::class.java)
                    intent.putExtra("intervention_id", full.id)
                    startActivity(intent)
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this@HomeActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
                }
                openingId = null
            }
        })
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        findViewById<MaterialButton>(R.id.btnNew).setOnClickListener {
            val intervention = ApiService.createEmptyIntervention(userName)
            ApiService.pendingIntervention = intervention
            val intent = Intent(this, InterventionFormActivity::class.java)
            intent.putExtra("intervention_id", intervention.id)
            startActivity(intent)
        }

        findViewById<MaterialButton>(R.id.btnStock).setOnClickListener {
            startActivity(Intent(this, StockActivity::class.java))
        }

        btnAdmin.setOnClickListener {
            startActivity(Intent(this, AdminActivity::class.java))
        }

        findViewById<MaterialButton>(R.id.btnGlobalConformite).setOnClickListener {
            showGlobalConformiteReport(false)
        }
        findViewById<MaterialButton>(R.id.btnDailyConformite).setOnClickListener {
            showGlobalConformiteReport(true)
        }

        // SwipeRefresh pour rafraîchir la liste
        val swipeRefresh = findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        swipeRefresh.setColorSchemeResources(R.color.primary, R.color.secondary)
        swipeRefresh.setOnRefreshListener {
            refreshList()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshList()
    }

    private fun deleteIntervention(item: InterventionLight) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Supprimer")
            .setMessage("Supprimer l'intervention de ${item.nom_client.ifEmpty { "sans nom" }} ?")
            .setPositiveButton("Oui") { _, _ ->
                lifecycleScope.launch {
                    try {
                        ApiService.deleteIntervention(item.id)
                        refreshList()
                    } catch (e: Exception) {
                        android.widget.Toast.makeText(this@HomeActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Non", null)
            .show()
    }

    private fun refreshList() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        val emptyState = findViewById<LinearLayout>(R.id.emptyState)
        val swipeRefresh = findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)

        if (!swipeRefresh.isRefreshing) {
            progressBar.visibility = View.VISIBLE
        }
        emptyState.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val list = ApiService.listInterventionsLight()
                latestInterventions = list
                rows.clear()
                rows.addAll(buildWeeklyRows(list))
                adapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false
                emptyState.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false
                android.widget.Toast.makeText(this@HomeActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun buildWeeklyRows(items: List<InterventionLight>): List<InterventionRow> {
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val labelFormatter = SimpleDateFormat("dd/MM/yyyy", Locale.FRANCE)
        val grouped = linkedMapOf<String, MutableList<InterventionLight>>()
        items.sortedByDescending { it.date }.forEach { item ->
            val date = runCatching { formatter.parse(item.date.take(10)) }.getOrNull() ?: return@forEach
            val monday = Calendar.getInstance().apply {
                time = date
                firstDayOfWeek = Calendar.MONDAY
                set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
            }.time
            val key = formatter.format(monday)
            grouped.getOrPut(key) { mutableListOf() }.add(item)
        }
        return grouped.flatMap { (mondayKey, weekItems) ->
            val monday = formatter.parse(mondayKey)!!
            val sunday = Calendar.getInstance().apply {
                time = monday
                add(Calendar.DAY_OF_MONTH, 6)
            }.time
            listOf<InterventionRow>(
                InterventionRow.WeekHeader("Semaine du ${labelFormatter.format(monday)} au ${labelFormatter.format(sunday)}")
            ) + weekItems.map { InterventionRow.Item(it) }
        }
    }

    private fun showGlobalConformiteReport(daily: Boolean) {
        val report = generateGlobalConformiteReport(latestInterventions, daily)
        val view = TextView(this).apply {
            text = report
            textSize = 14f
            setTextIsSelectable(true)
            setPadding(32, 16, 32, 16)
        }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(if (daily) "Rapport conformité du jour" else "Rapport global conformité semaine")
            .setView(view)
            .setNeutralButton("Copier") { _, _ ->
                val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Rapport global conformité", report))
                android.widget.Toast.makeText(this, "Rapport copié", android.widget.Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("WhatsApp") { _, _ ->
                startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://wa.me/?text=" + android.net.Uri.encode(report))))
            }
            .setPositiveButton("Fermer", null)
            .show()
    }

    private fun generateGlobalConformiteReport(items: List<InterventionLight>, daily: Boolean): String {
        val date = SimpleDateFormat("dd/MM/yy", Locale.FRANCE).format(java.util.Date())
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = Calendar.getInstance()
        today.firstDayOfWeek = Calendar.MONDAY
        val monday = Calendar.getInstance().apply {
            timeInMillis = today.timeInMillis
            set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val sunday = Calendar.getInstance().apply {
            timeInMillis = monday.timeInMillis
            add(Calendar.DAY_OF_MONTH, 7)
        }
        val todayKey = formatter.format(java.util.Date())
        val sorted = items.filter { item ->
            val itemDate = runCatching { formatter.parse(item.date.take(10)) }.getOrNull() ?: return@filter false
            if (daily) formatter.format(itemDate) == todayKey else itemDate >= monday.time && itemDate < sunday.time
        }.sortedBy { it.date }
        val sb = StringBuilder()
        sb.appendLine(if (daily) "*RAPPORT CONFORMITÉ DU JOUR*" else "*RAPPORT GLOBAL CONFORMITÉ*")
        sb.appendLine()
        sb.appendLine("Equipe : ${SessionManager.getUserName(this)}")
        sb.appendLine()
        sb.appendLine("*Date* : $date")
        sb.appendLine()
        sb.appendLine("👉 *Dossiers traités* : ${sorted.size}/${sorted.size}")
        sb.appendLine()
        sorted.forEachIndexed { index, item ->
            sb.appendLine("${index + 1}_ ${item.telephone_ligne} ${item.nom_client}".trim())
            sb.appendLine()
        }
        val validated = sorted.filter { it.statut == "termine" }
        sb.appendLine("👉 *Dossiers Validés* : ${validated.size}/${sorted.size}")
        sb.appendLine()
        validated.forEachIndexed { index, item ->
            sb.appendLine("${index + 1}_ ${item.telephone_ligne} ${item.nom_client}".trim())
            sb.appendLine()
        }
        return sb.toString().trim()
    }
}

sealed class InterventionRow {
    data class WeekHeader(val label: String) : InterventionRow()
    data class Item(val intervention: InterventionLight) : InterventionRow()
}

class InterventionAdapter(
    private val rows: List<InterventionRow>,
    private val onDelete: (InterventionLight) -> Unit,
    private val onClick: (InterventionLight) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_WEEK = 0
        private const val TYPE_ITEM = 1
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val tvClient: TextView = v.findViewById(R.id.tvClient)
        val tvAddress: TextView = v.findViewById(R.id.tvAddress)
        val tvDate: TextView = v.findViewById(R.id.tvDate)
        val tvTech: TextView = v.findViewById(R.id.tvTech)
        val chipStatus: Chip = v.findViewById(R.id.chipStatus)
        val btnDelete: ImageButton = v.findViewById(R.id.btnDelete)
    }

    class WeekVH(v: View) : RecyclerView.ViewHolder(v) {
        val label: TextView = v.findViewById(android.R.id.text1)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        if (viewType == TYPE_WEEK) {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_week_header, parent, false)
            return WeekVH(v)
        }
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_intervention, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val row = rows[position]
        if (row is InterventionRow.WeekHeader) {
            (holder as WeekVH).label.text = row.label
            return
        }
        val itemHolder = holder as VH
        val item = (row as InterventionRow.Item).intervention
        itemHolder.tvClient.text = item.nom_client.ifEmpty { "Sans nom" }
        itemHolder.tvAddress.text = item.adresse_zone.ifEmpty { "—" }
        itemHolder.tvDate.text = item.date.take(10)
        itemHolder.tvTech.text = item.nom_technicien

        if (item.statut == "termine") {
            itemHolder.chipStatus.text = "Terminé"
            itemHolder.chipStatus.chipBackgroundColor = android.content.res.ColorStateList.valueOf(0xFF4CAF50.toInt())
            itemHolder.chipStatus.setTextColor(0xFFFFFFFF.toInt())
        } else {
            itemHolder.chipStatus.text = "En cours"
            itemHolder.chipStatus.chipBackgroundColor = android.content.res.ColorStateList.valueOf(0xFFFF9800.toInt())
            itemHolder.chipStatus.setTextColor(0xFFFFFFFF.toInt())
        }

        itemHolder.itemView.setOnClickListener { onClick(item) }
        itemHolder.btnDelete.visibility = View.VISIBLE
        itemHolder.btnDelete.setOnClickListener { onDelete(item) }
    }

    override fun getItemViewType(position: Int) = if (rows[position] is InterventionRow.WeekHeader) TYPE_WEEK else TYPE_ITEM

    override fun getItemCount() = rows.size
}
