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
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fibretrack.app.models.StockMovement
import com.fibretrack.app.models.StockTemplateItem
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class StockActivity : AppCompatActivity() {

    private val stockItems = mutableListOf<Pair<String, Int>>()
    private lateinit var adapter: StockAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_stock)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        val recycler = findViewById<RecyclerView>(R.id.recyclerStock)

        adapter = StockAdapter(stockItems,
            onInc = { pos -> updateQty(pos, stockItems[pos].second + 1) },
            onDec = { pos -> updateQty(pos, (stockItems[pos].second - 1).coerceAtLeast(0)) }
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
            lifecycleScope.launch {
                try {
                    ApiService.saveStockItem(desig, qty)
                    findViewById<TextInputEditText>(R.id.editDesignation).setText("")
                    findViewById<TextInputEditText>(R.id.editQty).setText("")
                    refreshStock()
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
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

        refreshStock()
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
                    text = "Importer le stock"
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
                            ApiService.importStock(items)
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

    private fun updateQty(pos: Int, newQty: Int) {
        val desig = stockItems[pos].first
        lifecycleScope.launch {
            try {
                ApiService.saveStockItem(desig, newQty)
                stockItems[pos] = desig to newQty
                adapter.notifyItemChanged(pos)
            } catch (e: Exception) {
                android.widget.Toast.makeText(this@StockActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun refreshStock() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        val emptyText = findViewById<TextView>(R.id.emptyText)
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val stock = ApiService.listStock()
                stockItems.clear()
                stockItems.addAll(stock.entries.sortedBy { it.key }.map { it.key to it.value })
                adapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
                emptyText.visibility = if (stockItems.isEmpty()) View.VISIBLE else View.GONE
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

