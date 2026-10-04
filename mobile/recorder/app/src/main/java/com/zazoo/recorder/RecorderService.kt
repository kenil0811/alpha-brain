package com.zazoo.recorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.IBinder
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Records the mic to recordings/<date>.aac while the screen is off or the app is closed. */
class RecorderService : Service() {

    companion object {
        /** When the current recording started, or null when idle. Read by the screen's timer. */
        @Volatile var startedAt: Long? = null

        fun dir(context: Context) = File(context.filesDir, "recordings").apply { mkdirs() }
    }

    private var recorder: MediaRecorder? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (recorder != null) return START_NOT_STICKY
        startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)

        val name = SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.US).format(Date())
        // ADTS AAC, not .m4a: an .m4a is unplayable if the phone dies before stop() writes its
        // index, while ADTS keeps every second already written. Hours of meeting are not lost.
        recorder = MediaRecorder(this).apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioChannels(1)
            setAudioSamplingRate(44_100)
            setAudioEncodingBitRate(64_000) // ~29 MB an hour, plenty for speech
            setOutputFile(File(dir(this@RecorderService), "$name.aac").path)
            prepare()
            start()
        }
        startedAt = System.currentTimeMillis()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        recorder?.runCatching { stop() } // throws if stopped within a second of starting
        recorder?.release()
        recorder = null
        startedAt = null
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel("rec", "Recording", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, "rec")
            .setContentTitle("Zazoo is recording")
            .setContentText("Open to stop")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }
}
