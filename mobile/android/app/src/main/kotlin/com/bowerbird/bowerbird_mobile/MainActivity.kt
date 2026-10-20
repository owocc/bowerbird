package com.bowerbird.bowerbird_mobile

import android.app.Activity
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.bowerbird.mobile/native_bridge"
    private val PICK_FILES_REQUEST_CODE = 2001
    private var pendingPickResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "pickMediaFiles" -> {
                    if (pendingPickResult != null) {
                        result.error("BUSY", "A file picker request is already in progress", null)
                        return@setMethodCallHandler
                    }
                    pendingPickResult = result
                    try {
                        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "*/*"
                            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                        startActivityForResult(intent, PICK_FILES_REQUEST_CODE)
                    } catch (e: Exception) {
                        pendingPickResult = null
                        result.error("PICK_FAILED", e.message, null)
                    }
                }
                "copyFileToClipboard" -> {
                    val path = call.argument<String>("path")
                    val mimeType = call.argument<String>("mimeType") ?: "application/octet-stream"
                    val displayName = call.argument<String>("displayName")
                    if (path.isNullOrEmpty()) {
                        result.error("INVALID_ARGS", "Missing path for clipboard copy", null)
                        return@setMethodCallHandler
                    }
                    try {
                        copyFileToClipboard(File(path), mimeType, displayName)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("COPY_FAILED", e.message, null)
                    }
                }
                "saveMediaToGallery" -> {
                    val bytes = call.argument<ByteArray>("bytes")
                    val filename = call.argument<String>("filename") ?: "bowerbird_${System.currentTimeMillis()}.png"
                    val mimeType = call.argument<String>("mimeType") ?: "image/png"
                    if (bytes == null) {
                        result.error("INVALID_ARGS", "Missing bytes for media save", null)
                        return@setMethodCallHandler
                    }
                    try {
                        val uriStr = saveToMediaStore(bytes, filename, mimeType)
                        result.success(uriStr)
                    } catch (e: Exception) {
                        result.error("SAVE_FAILED", e.message, null)
                    }
                }
                else -> {
                    result.notImplemented()
                }
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PICK_FILES_REQUEST_CODE) {
            val result = pendingPickResult ?: return
            pendingPickResult = null

            if (resultCode == Activity.RESULT_OK && data != null) {
                val filePaths = mutableListOf<String>()
                val clipData = data.clipData
                if (clipData != null) {
                    for (i in 0 until clipData.itemCount) {
                        val uri = clipData.getItemAt(i).uri
                        copyUriToCache(uri)?.let { filePaths.add(it) }
                    }
                } else {
                    data.data?.let { uri ->
                        copyUriToCache(uri)?.let { filePaths.add(it) }
                    }
                }
                result.success(filePaths)
            } else {
                result.success(emptyList<String>())
            }
        }
    }

    private fun copyUriToCache(uri: Uri): String? {
        return try {
            val resolver = applicationContext.contentResolver
            val cursor = resolver.query(uri, null, null, null, null)
            val nameIndex = cursor?.let {
                it.moveToFirst()
                it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            } ?: -1
            val displayName = if (cursor != null && nameIndex >= 0) {
                cursor.getString(nameIndex)
            } else {
                "upload_${System.currentTimeMillis()}"
            }
            cursor?.close()

            val tempFile = File(cacheDir, displayName)
            resolver.openInputStream(uri)?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            tempFile.absolutePath
        } catch (e: Exception) {
            null
        }
    }

    private fun copyFileToClipboard(file: File, mimeType: String, displayName: String?) {
        val clipboardDir = File(cacheDir, "clipboard").canonicalFile
        val canonical = file.canonicalFile
        if (!canonical.path.startsWith(clipboardDir.path + File.separator)) {
            throw IllegalArgumentException("File is outside the clipboard cache directory")
        }
        if (!canonical.exists()) {
            throw IllegalArgumentException("File not found: ${canonical.name}")
        }

        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", canonical)
        val label = displayName?.takeIf { it.isNotBlank() } ?: canonical.name
        val clip = ClipData(ClipDescription(label, arrayOf(mimeType)), ClipData.Item(uri))
        val manager = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        manager.setPrimaryClip(clip)

        // Best-effort: drop stale clipboard payloads so the cache does not grow.
        val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        clipboardDir.listFiles()?.forEach { candidate ->
            if (candidate != canonical && candidate.isFile && candidate.lastModified() < cutoff) {
                candidate.delete()
            }
        }
    }

    private fun saveToMediaStore(bytes: ByteArray, filename: String, mimeType: String): String {
        val resolver = applicationContext.contentResolver
        val isVideo = mimeType.startsWith("video/")
        val collection = if (isVideo) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }
        }

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val relDir = if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$relDir/Bowerbird")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val uri = resolver.insert(collection, values) ?: throw Exception("Failed to insert MediaStore record")
        resolver.openOutputStream(uri)?.use { out ->
            out.write(bytes)
            out.flush()
        } ?: throw Exception("Failed to write to MediaStore stream")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        }

        return uri.toString()
    }
}
