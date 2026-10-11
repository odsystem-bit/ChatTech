package com.fibretrack.app

import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.*
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputLayout
import com.google.android.material.textfield.TextInputEditText

class FormHelper(private val container: LinearLayout) {

    private val context = container.context
    private var currentCard: MaterialCardView? = null
    private var currentInner: LinearLayout? = null

    fun section(title: String): FormHelper {
        val card = MaterialCardView(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 12.dp() }
            cardElevation = 2f
            radius = 12f
            useCompatPadding = true
        }
        val inner = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16.dp(), 16.dp(), 16.dp(), 16.dp())
        }
        val tv = TextView(context).apply {
            text = title
            textSize = 16f
            setTextColor(0xFF0d1a3a.toInt())
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 8.dp())
        }
        inner.addView(tv)
        card.addView(inner)
        container.addView(card)
        currentCard = card
        currentInner = inner
        return this
    }

    fun edit(id: String, label: String, value: String, hint: String = "", inputType: Int = InputType.TYPE_CLASS_TEXT): TextInputEditText {
        val layout = TextInputLayout(context).apply {
            this.hint = label
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp() }
        }
        val edit = TextInputEditText(context).apply {
            this.hint = hint
            setText(value)
            this.inputType = inputType
            tag = id
        }
        layout.addView(edit)
        currentInner?.addView(layout)
        return edit
    }

    fun number(id: String, label: String, value: Int): TextInputEditText {
        return edit(id, label, value.toString(), "", InputType.TYPE_CLASS_NUMBER)
    }

    fun number(id: String, label: String, value: Double): TextInputEditText {
        return edit(id, label, if (value == 0.0) "" else value.toString(), "", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED)
    }

    fun check(id: String, label: String, checked: Boolean): CheckBox {
        val cb = CheckBox(context).apply {
            text = label
            isChecked = checked
            tag = id
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        currentInner?.addView(cb)
        return cb
    }

    fun spinner(id: String, label: String, options: List<String>, value: String): Spinner {
        val ll = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp() }
        }
        val tv = TextView(context).apply {
            text = label
            setTextColor(0xFF333333.toInt())
            layoutParams = LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
            )
        }
        val spinner = Spinner(context).apply {
            tag = id
            layoutParams = LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.5f
            )
        }
        spinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, options)
        spinner.setSelection(options.indexOf(value).coerceAtLeast(0))
        ll.addView(tv)
        ll.addView(spinner)
        currentInner?.addView(ll)
        return spinner
    }

    fun radioGroup(id: String, label: String, options: List<String>, value: String): RadioGroup {
        val tv = TextView(context).apply {
            text = label
            setTextColor(0xFF333333.toInt())
            setPadding(0, 4.dp(), 0, 4.dp())
        }
        currentInner?.addView(tv)
        val rg = RadioGroup(context).apply {
            orientation = RadioGroup.HORIZONTAL
            tag = id
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp() }
        }
        options.forEachIndexed { i, opt ->
            val rb = RadioButton(context).apply {
                text = opt
                this.id = i
                isChecked = opt == value
            }
            rg.addView(rb)
        }
        currentInner?.addView(rg)
        return rg
    }

    fun space(dp: Int) {
        val v = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp.dp()
            )
        }
        currentInner?.addView(v)
    }

    fun addButton(id: String, text: String, onClick: (View) -> Unit): com.google.android.material.button.MaterialButton {
        val btn = com.google.android.material.button.MaterialButton(context).apply {
            this.text = text
            tag = id
            cornerRadius = 8.dp()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp() }
        }
        btn.setOnClickListener(onClick)
        currentInner?.addView(btn)
        return btn
    }

    fun addView(view: View) {
        currentInner?.addView(view)
    }

    fun addTextView(text: String, color: Int = 0xFF666666.toInt(), size: Float = 13f): TextView {
        val tv = TextView(context).apply {
            this.text = text
            this.textSize = size
            setTextColor(color)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 4.dp() }
        }
        currentInner?.addView(tv)
        return tv
    }

    private fun Int.dp(): Int {
        return (this * context.resources.displayMetrics.density).toInt()
    }
}
