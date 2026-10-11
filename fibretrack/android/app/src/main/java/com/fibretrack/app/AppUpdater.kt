package com.fibretrack.app

import android.app.ProgressDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

object AppUpdater {
    private const val VERSION_URL = "https://fibretrack.mantota.com/api/index.php?action=app_version"

    private data class RemoteVersion(
        val versionCode: Int = 0,
        val versionName: String = "",
        val notes: String = "",
        val apkUrl: String = ""
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .build()

    @Volatile private var checked = false

    fun checkForUpdate(activity: AppCompatActivity) {
        if (checked) return
        checked = true
        activity.lifecycleScope.launch {
            val remote = try {
                withContext(Dispatchers.IO) { fetchRemote() }
            } catch (_: Exception) {
                null
            } ?: return@launch
            val current = currentVersionCode(activity)
            if (remote.versionCode <= current || remote.apkUrl.isEmpty()) return@launch
            if (activity.isFinishing || activity.isDestroyed) return@launch
            AlertDialog.Builder(activity)
                .setTitle("Mise à jour disponible")
                .setMessage("Version ${remote.versionName}" + if (remote.notes.isNotBlank()) "\n\n${remote.notes}" else "")
                .setCancelable(false)
                .setPositiveButton("Mettre à jour") { _, _ -> downloadAndInstall(activity, remote) }
                .setNegativeButton("Plus tard", null)
                .show()
        }
    }

    private fun fetchRemote(): RemoteVersion? {
        val req = Request.Builder().url(VERSION_URL).build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return null
            return Gson().fromJson(res.body?.string() ?: return null, RemoteVersion::class.java)
        }
    }

    @Suppress("DEPRECATION")
    private fun currentVersionCode(context: Context): Int {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode.toInt() else info.versionCode
    }

    @Suppress("DEPRECATION")
    private fun downloadAndInstall(activity: AppCompatActivity, remote: RemoteVersion) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(activity)
                .setTitle("Autorisation requise")
                .setMessage("Autorisez CHAPTECH à installer des applications, puis revenez et relancez la mise à jour.")
                .setPositiveButton("Ouvrir les réglages") { _, _ ->
                    checked = false
                    activity.startActivity(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                    )
                }
                .show()
            return
        }
        val progress = ProgressDialog(activity).apply {
            setTitle("Téléchargement de la mise à jour")
            setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
            setCancelable(false)
            max = 100
            show()
        }
        activity.lifecycleScope.launch {
            try {
                val file = withContext(Dispatchers.IO) {
                    val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
                    val out = File(dir, "fibretrack-${remote.versionCode}.apk")
                    client.newCall(Request.Builder().url(remote.apkUrl).build()).execute().use { res ->
                        if (!res.isSuccessful) throw Exception("Erreur ${res.code}")
                        val body = res.body ?: throw Exception("Réponse vide")
                        val total = body.contentLength()
                        var done = 0L
                        body.byteStream().use { input ->
                            out.outputStream().use { output ->
                                val buf = ByteArray(64 * 1024)
                                while (true) {
                                    val n = input.read(buf)
                                    if (n < 0) break
                                    output.write(buf, 0, n)
                                    done += n
                                    if (total > 0) {
                                        val pct = (done * 100 / total).toInt()
                                        activity.runOnUiThread { progress.progress = pct }
                                    }
                                }
                            }
                        }
                    }
                    out
                }
                progress.dismiss()
                if (activity.isFinishing || activity.isDestroyed) return@launch
                if (!signaturesMatch(activity, file)) {
                    manualReinstall(activity, file)
                    return@launch
                }
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                progress.dismiss()
                checked = false
                android.widget.Toast.makeText(activity, "Échec de la mise à jour : ${e.message}", android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun firstSignature(info: PackageInfo?): ByteArray? {
        info ?: return null
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
        } else {
            @Suppress("DEPRECATION")
            info.signatures?.firstOrNull()?.toByteArray()
        }
    }

    // Compare la signature de l'APK téléchargee avec celle de l'app installee.
    // Android refuse toute mise a jour signee avec une cle differente ; il faut
    // alors desinstaller puis reinstaller. En cas de doute, on laisse Android decider.
    private fun signaturesMatch(context: Context, apk: File): Boolean {
        return try {
            val pm = context.packageManager
            val flagsInstalled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
            val installed = pm.getPackageInfo(context.packageName, flagsInstalled)
            val flagsArchive = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                PackageManager.GET_SIGNING_CERTIFICATES or PackageManager.GET_META_DATA
            else PackageManager.GET_SIGNATURES
            val archive = pm.getPackageArchiveInfo(apk.absolutePath, flagsArchive)
            val a = firstSignature(installed)
            val b = firstSignature(archive)
            if (a == null || b == null) true else a.contentEquals(b)
        } catch (_: Exception) {
            true
        }
    }

    private fun copyToDownloads(context: Context, src: File): String? {
        val name = "CHAPTECH_${src.name}"
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = android.content.ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive")
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
                context.contentResolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } }
                    ?: return null
                "Téléchargements/$name"
            } else {
                val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return null
                val dst = File(dir, name)
                src.inputStream().use { input -> dst.outputStream().use { input.copyTo(it) } }
                dst.absolutePath
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun manualReinstall(activity: AppCompatActivity, apk: File) {
        val dest = copyToDownloads(activity, apk)
        val where = dest
            ?: "Vous pouvez aussi télécharger la nouvelle version sur : https://fibretrack.mantota.com/api/app/fibretrack.apk"
        AlertDialog.Builder(activity)
            .setTitle("Réinstallation nécessaire")
            .setMessage(
                "Cette version a été installée avec une signature différente, Android ne peut pas la mettre à jour automatiquement.\n\n" +
                    "1. Appuyez sur « Désinstaller » puis confirmez.\n" +
                    "2. Ouvrez le fichier APK copié ici : $where\n\n" +
                    "Vous devrez ressaisir votre code à 4 chiffres."
            )
            .setCancelable(false)
            .setPositiveButton("Désinstaller") { _, _ ->
                checked = false
                try {
                    activity.startActivity(
                        Intent(Intent.ACTION_DELETE, Uri.parse("package:${activity.packageName}"))
                    )
                } catch (_: Exception) {
                    android.widget.Toast.makeText(
                        activity,
                        "Désinstallez l'application depuis les paramètres Android, puis installez le fichier APK.",
                        android.widget.Toast.LENGTH_LONG
                    ).show()
                }
            }
            .setNegativeButton("Plus tard", null)
            .show()
    }
}
