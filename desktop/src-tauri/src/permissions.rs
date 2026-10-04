//! Settings → Permissions: what macOS has granted Alpha, a way to ask for each, and the System
//! Settings pane where it is changed. An app cannot revoke its own grants; turning one off in
//! Alpha is Alpha's own switch (desktop/src/shell/Permissions.tsx), not macOS's.
//!
//! Screen and system audio share macOS's "Screen & System Audio Recording" grant. System logs
//! need Full Disk Access, which has no API to query: Alpha tries to open the TCC database, which
//! only a process with Full Disk Access can read. Microphone and speech recognition are asked
//! through `native/stt_helper.swift`, which already links AVFoundation and Speech.

use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::string::CFString;
use std::collections::HashMap;
use std::process::Command;

// CoreGraphics is already linked by core-graphics.
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
}

const KINDS: [&str; 7] = ["screen", "system_audio", "microphone", "speech", "accessibility", "input", "logs"];

fn yes_no(granted: bool) -> String {
    // Without a preflight that tells "never asked" from "refused", a missing grant is "not_asked":
    // the UI asks first and offers System Settings after.
    (if granted { "granted" } else { "not_asked" }).to_string()
}

/// The helper's `{"microphone":..,"speech":..}`, or nothing when it is missing or fails.
fn helper(args: &[&str]) -> HashMap<String, String> {
    let Some(path) = option_env!("STT_HELPER_PATH").filter(|p| !p.is_empty()) else { return HashMap::new() };
    Command::new(path)
        .args(args)
        .output()
        .ok()
        .and_then(|out| serde_json::from_slice(&out.stdout).ok())
        .unwrap_or_default()
}

/// Every permission's state: "granted", "not_asked", "denied", or "unknown".
#[tauri::command]
pub fn permissions_status() -> HashMap<String, String> {
    let screen = yes_no(unsafe { CGPreflightScreenCaptureAccess() });
    let mut all = helper(&["--status"]);
    all.insert("system_audio".into(), screen.clone());
    all.insert("screen".into(), screen);
    all.insert("accessibility".into(), yes_no(unsafe { AXIsProcessTrusted() }));
    all.insert("input".into(), yes_no(crate::ptt::ptt_permission()));
    all.insert("logs".into(), yes_no(std::fs::File::open("/Library/Application Support/com.apple.TCC/TCC.db").is_ok()));
    for kind in KINDS {
        all.entry(kind.into()).or_insert_with(|| "unknown".into());
    }
    all
}

/// Shows macOS's own prompt where there is one (the first time only; after that macOS stays
/// quiet and the UI offers System Settings). Full Disk Access has no prompt, so it opens the pane.
#[tauri::command]
pub fn permission_request(kind: String) -> Result<(), String> {
    match kind.as_str() {
        "screen" | "system_audio" => {
            unsafe { CGRequestScreenCaptureAccess() };
        }
        "accessibility" => {
            let prompt = CFDictionary::from_CFType_pairs(&[(CFString::new("AXTrustedCheckOptionPrompt"), CFBoolean::true_value())]);
            unsafe { AXIsProcessTrustedWithOptions(prompt.as_concrete_TypeRef()) };
        }
        "input" => {
            crate::ptt::ptt_request_permission();
        }
        "microphone" | "speech" => {
            helper(&["--request", &kind]);
        }
        "logs" => return permission_settings(kind),
        _ => return Err(format!("unknown permission {kind}")),
    }
    Ok(())
}

/// Opens the Privacy & Security pane where `kind` is turned on or off.
#[tauri::command]
pub fn permission_settings(kind: String) -> Result<(), String> {
    let anchor = match kind.as_str() {
        "screen" | "system_audio" => "Privacy_ScreenCapture",
        "microphone" => "Privacy_Microphone",
        "speech" => "Privacy_SpeechRecognition",
        "accessibility" => "Privacy_Accessibility",
        "input" => "Privacy_ListenEvent",
        "logs" => "Privacy_AllFiles",
        _ => return Err(format!("unknown permission {kind}")),
    };
    Command::new("/usr/bin/open")
        .arg(format!("x-apple.systempreferences:com.apple.preference.security?{anchor}"))
        .status()
        .map_err(|e| format!("open System Settings: {e}"))?;
    Ok(())
}
