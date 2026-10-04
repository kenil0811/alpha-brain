package com.zazoo.recorder

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.core.content.FileProvider
import java.io.File

/**
 * One screen: a Record/Stop button, then the recordings. Tap one to send it to the Mac
 * (Quick Share, Drive, Gmail, LocalSend...), hold one to delete it. "Send all" sends every one.
 */
class MainActivity : Activity() {

    private val tick = Handler(Looper.getMainLooper())
    private lateinit var button: Button
    private lateinit var status: TextView
    private lateinit var list: ListView
    private var files: List<File> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()

        button = Button(this).apply { textSize = 28f; setOnClickListener { toggle() } }
        status = TextView(this).apply { gravity = Gravity.CENTER; setPadding(0, pad, 0, pad) }
        val sendAll = Button(this).apply {
            text = "Send all to Zazoo"
            setOnClickListener { if (files.isNotEmpty()) share(files) }
        }
        list = ListView(this).apply {
            setOnItemClickListener { _, _, i, _ -> share(listOf(files[i])) }
            setOnItemLongClickListener { _, _, i, _ -> confirmDelete(files[i]); true }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(button, LinearLayout.LayoutParams(-1, pad * 8))
            addView(status)
            addView(sendAll)
            addView(list, LinearLayout.LayoutParams(-1, 0, 1f))
        })

        val needed = listOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS)
            .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isNotEmpty()) requestPermissions(needed.toTypedArray(), 0)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onPause() {
        super.onPause()
        tick.removeCallbacksAndMessages(null)
    }

    private fun toggle() {
        val service = Intent(this, RecorderService::class.java)
        if (RecorderService.startedAt != null) {
            stopService(service)
        } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 0)
            return
        } else {
            startForegroundService(service)
        }
        tick.postDelayed({ refresh() }, 300) // the service sets startedAt a moment later
    }

    private fun refresh() {
        tick.removeCallbacksAndMessages(null)
        val started = RecorderService.startedAt
        if (started != null) {
            button.text = "■ Stop"
            status.text = "Recording  " + clock((System.currentTimeMillis() - started) / 1000)
            tick.postDelayed({ refresh() }, 1000)
        } else {
            button.text = "● Record"
            status.text = "Tap a recording to send it, hold to delete"
        }
        files = RecorderService.dir(this).listFiles().orEmpty().sortedByDescending { it.name }
        list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1,
            files.map { "${it.nameWithoutExtension}   ${it.length() / 1_000_000} MB" })
    }

    private fun share(chosen: List<File>) {
        val uris = ArrayList<Uri>(chosen.map {
            FileProvider.getUriForFile(this, "com.zazoo.recorder.files", it)
        })
        val send = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "audio/aac"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, "Send to your Mac"))
    }

    private fun confirmDelete(file: File) {
        if (RecorderService.startedAt != null && file == files.firstOrNull()) return // still recording
        AlertDialog.Builder(this)
            .setMessage("Delete ${file.nameWithoutExtension}? Only do this once it is on your Mac.")
            .setPositiveButton("Delete") { _, _ -> file.delete(); refresh() }
            .setNegativeButton("Keep", null)
            .show()
    }

    private fun clock(s: Long) = "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60)
}
