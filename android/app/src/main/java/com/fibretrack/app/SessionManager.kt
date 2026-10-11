package com.fibretrack.app

import android.content.Context
import android.content.SharedPreferences

object SessionManager {
    private const val PREFS = "chaptech_session"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_USER_NAME = "user_name"
    private const val KEY_IS_ADMIN = "is_admin"
    private const val KEY_CODE = "user_code"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveUser(ctx: Context, userId: String, userName: String, isAdmin: Boolean, code: String) {
        prefs(ctx).edit()
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USER_NAME, userName)
            .putBoolean(KEY_IS_ADMIN, isAdmin)
            .putString(KEY_CODE, code)
            .apply()
    }

    fun getUserId(ctx: Context) = prefs(ctx).getString(KEY_USER_ID, "") ?: ""
    fun getUserName(ctx: Context) = prefs(ctx).getString(KEY_USER_NAME, "") ?: ""
    fun isAdmin(ctx: Context) = prefs(ctx).getBoolean(KEY_IS_ADMIN, false)
    fun getCode(ctx: Context) = prefs(ctx).getString(KEY_CODE, "") ?: ""

    fun isLoggedIn(ctx: Context) = prefs(ctx).getString(KEY_USER_ID, "")?.isNotEmpty() == true

    fun logout(ctx: Context) {
        prefs(ctx).edit().clear().apply()
    }
}
