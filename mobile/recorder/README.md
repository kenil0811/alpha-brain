# Zazoo Recorder (Android)

One screen: Record/Stop, then the recordings. Recording runs as a foreground service, so it keeps
going with the screen off; files are ADTS AAC (`yyyy-MM-dd_HHmm.aac`, ~29 MB an hour), which stay
playable even if the phone dies mid-recording. Tap a recording to send it to the Mac (Quick Share,
Drive, Gmail, LocalSend…), hold it to delete, or "Send all to Zazoo". On the Mac, drop the files on
Zazoo's composer or a project page; they go through `/api/files`.

Build: open this folder in Android Studio (or `gradle :app:assembleDebug` with the Android SDK),
minimum Android 10 (API 29).
