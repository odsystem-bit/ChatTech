package com.fibretrack.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fibretrack.app.models.Account
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class AdminActivity : AppCompatActivity() {

    private val accounts = mutableListOf<Account>()
    private lateinit var adapter: AccountAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_admin)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        val recycler = findViewById<RecyclerView>(R.id.recyclerAccounts)
        adapter = AccountAdapter(accounts) { pos -> deleteAccount(pos) }
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        findViewById<MaterialButton>(R.id.btnAdd).setOnClickListener {
            val name = findViewById<TextInputEditText>(R.id.editName).text.toString().trim()
            val code = findViewById<TextInputEditText>(R.id.editCode).text.toString().trim()
            if (name.isEmpty() || code.length != 4) {
                android.widget.Toast.makeText(this, "Nom et code à 4 chiffres requis", android.widget.Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            lifecycleScope.launch {
                try {
                    ApiService.addAccount(name, code)
                    findViewById<TextInputEditText>(R.id.editName).setText("")
                    findViewById<TextInputEditText>(R.id.editCode).setText("")
                    refreshAccounts()
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this@AdminActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        refreshAccounts()
    }

    private fun deleteAccount(pos: Int) {
        val account = accounts[pos]
        AlertDialog.Builder(this)
            .setTitle("Supprimer")
            .setMessage("Supprimer le compte ${account.nom} ?")
            .setPositiveButton("Oui") { _, _ ->
                lifecycleScope.launch {
                    try {
                        ApiService.deleteAccount(account.id)
                        refreshAccounts()
                    } catch (e: Exception) {
                        android.widget.Toast.makeText(this@AdminActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Non", null)
            .show()
    }

    private fun refreshAccounts() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val list = ApiService.listAccounts()
                accounts.clear()
                accounts.addAll(list)
                adapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                android.widget.Toast.makeText(this@AdminActivity, "Erreur: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }
}

class AccountAdapter(
    private val items: List<Account>,
    private val onDelete: (Int) -> Unit
) : RecyclerView.Adapter<AccountAdapter.VH>() {

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val tvName: TextView = v.findViewById(R.id.tvName)
        val tvCode: TextView = v.findViewById(R.id.tvCode)
        val btnDelete: ImageButton = v.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(LayoutInflater.from(parent.context).inflate(R.layout.item_account, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val a = items[position]
        holder.tvName.text = a.nom
        holder.tvCode.text = "Code: ${a.code}"
        holder.btnDelete.setOnClickListener { onDelete(holder.bindingAdapterPosition) }
    }

    override fun getItemCount() = items.size
}
