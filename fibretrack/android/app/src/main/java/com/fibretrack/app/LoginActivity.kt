package com.fibretrack.app

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.launch
import androidx.lifecycle.lifecycleScope

class LoginActivity : AppCompatActivity() {

    private val digits = arrayOfNulls<EditText>(4)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (SessionManager.isLoggedIn(this) && SessionManager.getCode(this).isNotEmpty()) {
            ApiService.setAuthCode(SessionManager.getCode(this))
            startActivity(Intent(this, HomeActivity::class.java))
            finish()
            return
        }
        if (SessionManager.isLoggedIn(this)) SessionManager.logout(this)

        setContentView(R.layout.activity_login)
        applyBottomSystemBarInset(findViewById(android.R.id.content))

        findViewById<TextView>(R.id.tvVersion)?.text =
            "Version ${packageManager.getPackageInfo(packageName, 0).versionName}"

        digits[0] = findViewById(R.id.digit1)
        digits[1] = findViewById(R.id.digit2)
        digits[2] = findViewById(R.id.digit3)
        digits[3] = findViewById(R.id.digit4)

        val loginBtn = findViewById<MaterialButton>(R.id.loginBtn)

        for (i in 0..3) {
            digits[i]!!.addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) {
                    if (s?.length == 1 && i < 3) digits[i + 1]?.requestFocus()
                    if (s?.length == 1 && i == 3) doLogin()
                }
                override fun beforeTextChanged(s: CharSequence?, p1: Int, p2: Int, p3: Int) {}
                override fun onTextChanged(s: CharSequence?, p1: Int, p2: Int, p3: Int) {}
            })

            digits[i]!!.setOnKeyListener { _, keyCode, event ->
                if (keyCode == android.view.KeyEvent.KEYCODE_DEL &&
                    event.action == android.view.KeyEvent.ACTION_UP &&
                    digits[i]!!.text.isEmpty() && i > 0) {
                    digits[i - 1]?.requestFocus()
                    digits[i - 1]?.setText("")
                    true
                } else false
            }
        }

        loginBtn.setOnClickListener { doLogin() }
    }

    private fun doLogin() {
        val code = digits.joinToString("") { it?.text.toString() }
        if (code.length != 4) return

        val loginBtn = findViewById<MaterialButton>(R.id.loginBtn)
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        val errorCard = findViewById<MaterialCardView>(R.id.errorCard)
        val errorText = findViewById<TextView>(R.id.errorText)

        loginBtn.isEnabled = false
        loginBtn.text = "Vérification..."
        progressBar.visibility = View.VISIBLE
        errorCard.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val user = ApiService.validateCode(code)
                SessionManager.saveUser(this@LoginActivity, user.id, user.nom, user.isAdmin, code)
                ApiService.setAuthCode(code)
                startActivity(Intent(this@LoginActivity, HomeActivity::class.java))
                finish()
            } catch (e: Exception) {
                loginBtn.isEnabled = true
                loginBtn.text = "Se connecter"
                progressBar.visibility = View.GONE
                errorText.text = e.message ?: "Code invalide"
                errorCard.visibility = View.VISIBLE
                for (d in digits) d?.setText("")
                digits[0]?.requestFocus()
            }
        }
    }
}
