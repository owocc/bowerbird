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
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.bowerbird.mobile/native_bridge"
    private val SHARE_CHANNEL = "com.bowerbird.mobile/share"
    private val PICK_FILES_REQUEST_CODE = 2001
    private var pendingPickResult: MethodChannel.Result? = null

    private var shareChannel: MethodChannel? = null
    private val shareExecutor = Executors.newSingleThreadExecutor()
    private val shareHandler = Handler(Looper.getMainLooper())
    private val shareLock = Any()
    private val sharePrefs by lazy {
        getSharedPreferences("bowerbird_share", Context.MODE_PRIVATE)
    }

    private val shareRootDir: File
        get() = File(filesDir, "share_inbox")

    private val pendingShareDir: File
        get() = File(shareRootDir, "pending")

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        handleShareIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShareIntent(intent)
    }

    // --- System share intake ------------------------------------------------

    private fun handleShareIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
        if (isDuplicateShare(intent)) return

        shareExecutor.execute {
            try {
                processShareIntent(intent, action)
            } catch (e: Exception) {
                // Nothing actionable without a payload; the share is dropped and
                // the user keeps the source content.
                e.printStackTrace()
            }
        }
    }

    private fun processShareIntent(intent: Intent, action: String) {
        val eventId = UUID.randomUUID().toString()
        val eventDir = File(shareRootDir, eventId)
        val items = JSONArray()
        val errors = JSONArray()
        val fallbackMime = intent.type ?: "*/*"

        val sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        if (!sharedText.isNullOrBlank()) {
            val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
            items.put(JSONObject().apply {
                put("kind", "text")
                put("text", sharedText)
                put("name", subject?.takeIf { it.isNotBlank() } ?: "分享文本")
            })
        }

        val uris = collectStreamUris(intent, action)
        if (uris.isNotEmpty()) {
            if (eventDir.exists() || eventDir.mkdirs()) {
                uris.forEachIndexed { index, uri ->
                    try {
                        items.put(copySharedUri(uri, eventDir, index, fallbackMime))
                    } catch (e: Exception) {
                        val name = runCatching { displayNameFor(uri) }.getOrNull()
                        errors.put(JSONObject().apply {
                            put("name", name ?: uri.toString())
                            put("reason", e.message ?: "无法读取分享的文件")
                        })
                    }
                }
            } else {
                uris.forEach { uri ->
                    val name = runCatching { displayNameFor(uri) }.getOrNull()
                    errors.put(JSONObject().apply {
                        put("name", name ?: uri.toString())
                        put("reason", "无法创建收件箱暂存目录")
                    })
                }
            }
        }

        if (items.length() == 0 && errors.length() == 0) return

        val event = JSONObject().apply {
            put("eventId", eventId)
            put("receivedAt", System.currentTimeMillis())
            put("items", items)
            put("errors", errors)
        }
        writePendingShareEvent(event)
        notifyDartOfPendingShares()
    }

    private fun collectStreamUris(intent: Intent, action: String): List<Uri> {
        val found = LinkedHashMap<String, Uri>()

        fun add(uri: Uri?) {
            if (uri == null || uri.scheme.isNullOrEmpty()) return
            found[uri.toString()] = uri
        }

        if (action == Intent.ACTION_SEND_MULTIPLE) {
            val streams = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            }
            streams?.forEach(::add)
        } else {
            val stream = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            }
            add(stream)
        }

        intent.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) {
                add(clip.getItemAt(i).uri)
            }
        }
        add(intent.data)
        return found.values.toList()
    }

    private fun copySharedUri(
        uri: Uri,
        eventDir: File,
        index: Int,
        fallbackMime: String
    ): JSONObject {
        val resolver = contentResolver
        var mimeType = resolver.getType(uri)
            ?: fallbackMime.takeIf { it != "*/*" }
            ?: "application/octet-stream"
        var displayName = displayNameFor(uri)
            ?: "shared_${System.currentTimeMillis()}_$index"
        displayName = sanitizeFileName(displayName, "shared_$index")
        if (!displayName.contains('.')) {
            extensionForMime(mimeType)?.let { displayName = "$displayName.$it" }
        }
        if (mimeType == "application/octet-stream") {
            val ext = displayName.substringAfterLast('.', "")
            if (ext.isNotEmpty()) {
                MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.lowercase())
                    ?.let { mimeType = it }
            }
        }

        val target = File(eventDir, "${index}_$displayName")
        val input = resolver.openInputStream(uri)
            ?: throw IllegalStateException("分享源未提供可读数据")
        input.use { source ->
            FileOutputStream(target).use { output ->
                source.copyTo(output, DEFAULT_BUFFER_SIZE)
            }
        }
        if (!target.exists() || target.length() == 0L) {
            target.delete()
            throw IllegalStateException("分享文件为空或读取失败")
        }

        return JSONObject().apply {
            put("kind", "file")
            put("path", target.absolutePath)
            put("name", displayName)
            put("mimeType", mimeType)
            put("size", target.length())
        }
    }

    private fun displayNameFor(uri: Uri): String? {
        return try {
            contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null
            )?.use { cursor ->
                if (!cursor.moveToFirst()) return@use null
                val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (column < 0) null else cursor.getString(column)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun sanitizeFileName(raw: String, fallback: String): String {
        var name = raw
            .replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1F]"), "_")
            .trim()
            .trim('.')
        if (name.isEmpty()) name = fallback
        if (name.length > 100) {
            val dot = name.lastIndexOf('.')
            name = if (dot > 0 && name.length - dot <= 12) {
                name.substring(0, 88) + name.substring(dot)
            } else {
                name.substring(0, 100)
            }
        }
        return name
    }

    private fun extensionForMime(mimeType: String): String? {
        return when (mimeType.lowercase()) {
            "image/jpeg" -> "jpg"
            "image/png" -> "png"
            "image/gif" -> "gif"
            "image/webp" -> "webp"
            "video/mp4" -> "mp4"
            "video/quicktime" -> "mov"
            "video/webm" -> "webm"
            "text/plain" -> "txt"
            else -> MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
        }
    }

    private fun isDuplicateShare(intent: Intent): Boolean {
        val uris = collectStreamUris(intent, intent.action ?: "")
        val fingerprint = buildString {
            append(intent.action)
            append('|')
            append(intent.type)
            append('|')
            append(uris.joinToString(",") { it.toString() })
            append('|')
            append(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
        }.hashCode().toString()

        synchronized(shareLock) {
            val now = System.currentTimeMillis()
            val last = sharePrefs.getString("last_fingerprint", null)
            val lastAt = sharePrefs.getLong("last_fingerprint_at", 0L)
            if (last == fingerprint && now - lastAt < 15_000L) return true
            sharePrefs.edit()
                .putString("last_fingerprint", fingerprint)
                .putLong("last_fingerprint_at", now)
                .apply()
            return false
        }
    }

    private fun writePendingShareEvent(event: JSONObject) {
        synchronized(shareLock) {
            if (!pendingShareDir.exists() && !pendingShareDir.mkdirs()) {
                throw IllegalStateException("Unable to create pending share directory")
            }
            val target = File(pendingShareDir, "${event.getString("eventId")}.json")
            val temp = File(pendingShareDir, "${event.getString("eventId")}.json.tmp")
            temp.writeText(event.toString())
            if (!temp.renameTo(target)) {
                target.writeText(event.toString())
                temp.delete()
            }
        }
    }

    private fun consumePendingShareEvents(): String {
        val events = JSONArray()
        synchronized(shareLock) {
            val files = pendingShareDir.listFiles { file ->
                file.isFile && file.name.endsWith(".json")
            }?.sortedBy { it.lastModified() } ?: emptyList()
            files.forEach { file ->
                try {
                    events.put(JSONObject(file.readText()))
                } catch (_: Exception) {
                    // Corrupt queue entry: drop it so it cannot block the rest.
                } finally {
                    file.delete()
                }
            }
        }
        return events.toString()
    }

    private fun notifyDartOfPendingShares() {
        val hasPending = synchronized(shareLock) {
            pendingShareDir.listFiles()?.any { it.isFile && it.name.endsWith(".json") } == true
        }
        if (!hasPending) return
        shareHandler.post {
            shareChannel?.invokeMethod("onShareAvailable", null)
        }
    }

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
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SHARE_CHANNEL).also { channel ->
            shareChannel = channel
            channel.setMethodCallHandler { call, result ->
                when (call.method) {
                    "consumePendingShares" -> result.success(consumePendingShareEvents())
                    else -> result.notImplemented()
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
