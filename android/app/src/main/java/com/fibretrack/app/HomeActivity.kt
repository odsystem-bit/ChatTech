package com.fibretrack.app

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fibretrack.app.models.InterventionLight
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private lateinit var adapter: InterventionAdapter
    private val interventions = mutableListOf<InterventionLight>()
    private var openingId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)

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

        adapter = InterventionAdapter(interventions, onDelete = { item -> deleteIntervention(item) }, onClick = { item ->
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
        val emptyText = findViewById<TextView>(R.id.emptyText)
        progressBar.visibility = View.VISIBLE
        emptyText.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val list = ApiService.listInterventionsLight()
                interventions.clear()
                interventions.addAll(list)
                adapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
                emptyText.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                android.widget.Toast.makeText(this@HomeActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }
}

class InterventionAdapter(
    private val items: List<InterventionLight>,
    private val onDelete: (InterventionLight) -> Unit,
    private val onClick: (InterventionLight) -> Unit
) : RecyclerView.Adapter<InterventionAdapter.VH>() {

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val tvClient: TextView = v.findViewById(R.id.tvClient)
        val tvAddress: TextView = v.findViewById(R.id.tvAddress)
        val tvDate: TextView = v.findViewById(R.id.tvDate)
        val tvTech: TextView = v.findViewById(R.id.tvTech)
        val chipStatus: Chip = v.findViewById(R.id.chipStatus)
        val btnDelete: ImageButton = v.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_intervention, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.tvClient.text = item.nom_client.ifEmpty { "Sans nom" }
        holder.tvAddress.text = item.adresse_zone.ifEmpty { "—" }
        holder.tvDate.text = item.date.take(10)
        holder.tvTech.text = item.nom_technicien

        if (item.statut == "termine") {
            holder.chipStatus.text = "Terminé"
            holder.chipStatus.chipBackgroundColor = android.content.res.ColorStateList.valueOf(0xFF4CAF50.toInt())
            holder.chipStatus.setTextColor(0xFFFFFFFF.toInt())
        } else {
            holder.chipStatus.text = "En cours"
            holder.chipStatus.chipBackgroundColor = android.content.res.ColorStateList.valueOf(0xFFFF9800.toInt())
            holder.chipStatus.setTextColor(0xFFFFFFFF.toInt())
        }

        holder.itemView.setOnClickListener { onClick(item) }
        holder.btnDelete.visibility = View.VISIBLE
        holder.btnDelete.setOnClickListener { onDelete(item) }
    }

    override fun getItemCount() = items.size
}
