package com.fibretrack.app

import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

fun applyBottomSystemBarInset(root: View) {
    val initialPadding = intArrayOf(root.paddingLeft, root.paddingTop, root.paddingRight, root.paddingBottom)
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
        val bottomInset = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
        view.setPadding(
            initialPadding[0],
            initialPadding[1],
            initialPadding[2],
            initialPadding[3] + bottomInset
        )
        insets
    }
    ViewCompat.requestApplyInsets(root)
}
