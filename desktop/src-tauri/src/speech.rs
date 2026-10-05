//! Native macOS voice: listening (speech-to-text) and speaking (text-to-speech). The app's
//! WKWebView has no `SpeechRecognition`, so the host does it (from feat/bridge-parity).
//!
//! Listening spawns `native/stt_helper.swift` (built by `build.rs`) and streams its stdout as
//! `stt://partial` / `stt://final` / `stt://error` events with `{text}`. Speaking shells out to
//! macOS's own `say` and emits `tts://start` / `tts://end`; it can be stopped mid-utterance.
//!
//! The state holds only process ids: each child is owned (and reaped) by its reader or waiter
//! thread, which clears the state only if it still names its own process, so a quick
//! stop-then-start or a new reply replacing the old one never loses the new process.

use serde::Serialize;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct SpeechState {
    stt: Mutex<Option<u32>>,
    tts: Mutex<Option<u32>>,
}

#[derive(Serialize, Clone)]
struct SttEvent<'a> {
    text: &'a str,
}

fn terminate(pid: u32) {
    // SAFETY: signalling a child process we spawned.
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
}

fn clear_if(slot: &Mutex<Option<u32>>, pid: u32) {
    if let Ok(mut guard) = slot.lock() {
        if *guard == Some(pid) {
            *guard = None;
        }
    }
}

/// Starts listening; a no-op if already listening. When the helper wasn't built (not macOS),
/// says so with `stt://error` instead of pretending to listen.
#[tauri::command]
pub fn stt_start(app: AppHandle, state: tauri::State<SpeechState>) -> Result<(), String> {
    let mut guard = state.stt.lock().map_err(|_| "speech state poisoned")?;
    if guard.is_some() {
        return Ok(());
    }
    let Some(helper) = option_env!("STT_HELPER_PATH").filter(|p| !p.is_empty()) else {
        let _ = app.emit("stt://error", SttEvent { text: "Listening isn't available in this build." });
        return Ok(());
    };
    let mut child = Command::new(helper)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn stt helper: {e}"))?;
    let stdout = child.stdout.take().ok_or("stt helper stdout unavailable")?;
    let pid = child.id();
    crate::note(&format!("stt: helper {pid} started"));
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                crate::note(&format!("stt: helper {pid} says {line}"));
            }
        });
    }
    *guard = Some(pid);
    drop(guard);

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut ended = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            let text = value["text"].as_str().unwrap_or("");
            let event = match value["type"].as_str() {
                Some("partial") => "stt://partial",
                Some("final") => "stt://final",
                Some("error") => "stt://error",
                _ => continue,
            };
            ended |= event != "stt://partial";
            // What came back, never the words themselves: how many, so a silent recognizer shows.
            let words = text.split_whitespace().count();
            crate::note(&format!("stt: helper {pid} {event} ({words} words){}", if event == "stt://error" { format!(": {text}") } else { String::new() }));
            let _ = app.emit(event, SttEvent { text });
        }
        let status = child.wait();
        crate::note(&format!("stt: helper {pid} ended {status:?}"));
        // The helper died without a word (macOS kills it when the app asking has no usage
        // description, e.g. a dev build started from a terminal): say so, or the page waits forever.
        if !ended {
            let _ = app.emit("stt://error", SttEvent { text: "Listening stopped: macOS didn't let Zazoo listen. Open Alpha as an app and allow the microphone and speech recognition." });
        }
        if let Some(state) = app.try_state::<SpeechState>() {
            clear_if(&state.stt, pid);
        }
    });
    Ok(())
}

/// Stops listening. `SIGTERM` lets the helper end the audio cleanly, so a trailing `stt://final`
/// (or `stt://error`) still arrives before it exits.
#[tauri::command]
pub fn stt_stop(state: tauri::State<SpeechState>) -> Result<(), String> {
    if let Some(pid) = state.stt.lock().map_err(|_| "speech state poisoned")?.take() {
        terminate(pid);
    }
    Ok(())
}

/// Speaks `text`, replacing anything already speaking. Emits `tts://start` now and `tts://end`
/// when it finishes or is stopped; a replaced utterance emits no end of its own.
#[tauri::command]
pub fn tts_speak(app: AppHandle, state: tauri::State<SpeechState>, text: String) -> Result<(), String> {
    let mut guard = state.tts.lock().map_err(|_| "speech state poisoned")?;
    if let Some(pid) = guard.take() {
        terminate(pid);
    }
    if text.trim().is_empty() {
        return Ok(());
    }
    let mut child = Command::new("/usr/bin/say")
        .arg(&text)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn say: {e}"))?;
    let pid = child.id();
    *guard = Some(pid);
    drop(guard);
    let _ = app.emit("tts://start", ());
    std::thread::spawn(move || {
        let _ = child.wait();
        let Some(state) = app.try_state::<SpeechState>() else { return };
        let Ok(mut guard) = state.tts.lock() else { return };
        if *guard == Some(pid) {
            *guard = None;
            let _ = app.emit("tts://end", ());
        }
    });
    Ok(())
}

/// Stops speaking now (barge-in). The waiter thread from `tts_speak` still emits `tts://end`.
#[tauri::command]
pub fn tts_stop(state: tauri::State<SpeechState>) -> Result<(), String> {
    if let Some(pid) = *state.tts.lock().map_err(|_| "speech state poisoned")? {
        terminate(pid);
    }
    Ok(())
}
