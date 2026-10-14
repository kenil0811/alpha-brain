//! Alpha's native host.
//!
//! It owns the windows (the workspace and the always-on companion), the tray, and the core: it
//! launches `alpha serve` with a fixed environment and a random token, waits for the core's
//! ready line, hands the window the address and token through one typed command, keeps the core
//! running when the window closes, and stops it on quit. Because the core is a child of the app,
//! macOS asks for calendar (and later other) access in Alpha's name.
//!
//! The host also watches the core: a core that dies is started again on the same port with the
//! same token (so the windows' sessions stay good), after a pause that grows while it keeps
//! failing, and the windows are told (`core-restarted`) so they look again. Found at the 3 Oct
//! checkpoint: a crash left the window on a dead port saying "Alpha is running".

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, RunEvent, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const READY_PREFIX: &str = "ALPHA_CORE_READY ";
const READY_TIMEOUT: Duration = Duration::from_secs(60);
const SESSION_WAIT: Duration = Duration::from_secs(120);
const QUIT_GRACE: Duration = Duration::from_secs(5);
/// How often the host looks whether the core is still there.
const WATCH_EVERY: Duration = Duration::from_millis(500);
/// The pause before starting a dead core again: doubles while it keeps dying, up to a minute.
const RESTART_PAUSE_FIRST: Duration = Duration::from_secs(1);
const RESTART_PAUSE_MOST: Duration = Duration::from_secs(60);
/// A core that stayed up this long had a fresh failure, not the same one: the pause starts over.
const STEADY_AFTER: Duration = Duration::from_secs(120);

/// Set when the person quits: a core that ends then is not started again.
static QUITTING: AtomicBool = AtomicBool::new(false);

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static HOST_LOG: OnceLock<PathBuf> = OnceLock::new();

fn note(message: &str) {
    eprintln!("[host] {message}");
    if let Some(path) = HOST_LOG.get() {
        use std::io::Write;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{stamp} {message}");
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreSession {
    base_url: String,
    token: String,
}

struct CoreProcess {
    child: Child,
    port: u16,
    token: String,
    started: Instant,
}

#[derive(Default)]
struct Launch {
    core: Mutex<Option<CoreProcess>>,
    launch_error: Mutex<Option<String>>,
    settled: (Mutex<bool>, Condvar),
}

impl Launch {
    fn settle(&self, outcome: Result<CoreProcess, String>) {
        match outcome {
            Ok(core) => *self.core.lock().unwrap() = Some(core),
            Err(error) => *self.launch_error.lock().unwrap() = Some(error),
        }
        let (done, ready) = &self.settled;
        *done.lock().unwrap() = true;
        ready.notify_all();
    }

    fn wait(&self, timeout: Duration) -> bool {
        let (done, ready) = &self.settled;
        let guard = done.lock().unwrap();
        let (guard, _) = ready
            .wait_timeout_while(guard, timeout, |settled| !*settled)
            .unwrap();
        *guard
    }
}

#[derive(Default)]
struct HostState {
    launch: Arc<Launch>,
}

// ---------- the companion ----------

const AVATAR_LABEL: &str = "avatar";
/// The companion's window only covers what it shows: the character, the character with a
/// bubble, or the open panel. (Even a transparent window catches clicks.)
const AVATAR_IDLE: (f64, f64) = (112.0, 124.0);
const AVATAR_MARGIN: f64 = 20.0;
const AVATAR_HIDDEN_MARKER: &str = "avatar-hidden";
/// Where the person last put the companion: its bottom-right corner (the corner it grows and
/// shrinks around) and the display it was on, so it opens there next time (slice 2 E1).
const AVATAR_PLACE: &str = "avatar-place.json";
/// Even sized to what it shows, the companion's window is a rectangle around a round character
/// and a bubble. The page reports where it is drawn; everywhere else the window lets clicks
/// through to what is behind it, so it never blocks the workspace or other apps.
static AVATAR_HOT: Mutex<Vec<[f64; 4]>> = Mutex::new(Vec::new());
const HOT_SLACK: f64 = 4.0;
const HOT_EVERY: Duration = Duration::from_millis(40);

fn avatar_marker() -> Option<PathBuf> {
    DATA_DIR.get().map(|d| d.join(AVATAR_HIDDEN_MARKER))
}

fn place_bottom_right(window: &WebviewWindow, size: (f64, f64)) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(m) => Some(m),
        None => window.primary_monitor()?,
    };
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let x = area.position.x as f64 + area.size.width as f64 - (size.0 + AVATAR_MARGIN) * scale;
        let y = area.position.y as f64 + area.size.height as f64 - (size.1 + AVATAR_MARGIN) * scale;
        window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
    }
    Ok(())
}

/// A display's work area, in physical pixels: left, top, right, bottom.
type Area = (i32, i32, i32, i32);

/// The saved corner, if the display it was on is connected (by name) and the corner is still on
/// it; otherwise none, and the companion goes to the main display's bottom-right.
fn saved_corner(saved: &serde_json::Value, displays: &[(Option<String>, Area)]) -> Option<(i32, i32)> {
    let name = saved["display"].as_str();
    let right = i32::try_from(saved["right"].as_i64()?).ok()?;
    let bottom = i32::try_from(saved["bottom"].as_i64()?).ok()?;
    displays.iter().find_map(|(display, (left, top, area_right, area_bottom))| {
        let same = display.as_deref() == name;
        let on = right > *left && right <= *area_right && bottom > *top && bottom <= *area_bottom;
        (same && on).then_some((right, bottom))
    })
}

fn place_file() -> Option<PathBuf> {
    DATA_DIR.get().map(|d| d.join(AVATAR_PLACE))
}

/// Keep where the companion is now (after a drag, or as it grows around its corner).
fn remember_place(window: &tauri::Window) {
    let (Ok(at), Ok(size), Some(file)) = (window.outer_position(), window.outer_size(), place_file())
    else {
        return;
    };
    let display = window.current_monitor().ok().flatten().and_then(|m| m.name().cloned());
    let saved = serde_json::json!({
        "display": display,
        "right": at.x + size.width as i32,
        "bottom": at.y + size.height as i32,
    });
    let _ = std::fs::write(file, saved.to_string());
}

/// Put the companion where it was left, when that place is still on a display.
fn place_where_left(window: &WebviewWindow, size: (f64, f64)) -> tauri::Result<bool> {
    let Some(saved) = place_file()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    else {
        return Ok(false);
    };
    let monitors = window.available_monitors()?;
    let displays: Vec<(Option<String>, Area)> = monitors
        .iter()
        .map(|m| {
            let a = m.work_area();
            let (x, y) = (a.position.x, a.position.y);
            (m.name().cloned(), (x, y, x + a.size.width as i32, y + a.size.height as i32))
        })
        .collect();
    let Some((right, bottom)) = saved_corner(&saved, &displays) else {
        return Ok(false);
    };
    let scale = monitors
        .iter()
        .find(|m| m.name().map(String::as_str) == saved["display"].as_str())
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    let (w, h) = ((size.0 * scale).round() as i32, (size.1 * scale).round() as i32);
    window.set_position(PhysicalPosition::new(right - w, bottom - h))?;
    Ok(true)
}

/// The tray's "Put the companion back in the corner": the bottom-right of its display, and the
/// remembered place forgotten.
fn avatar_to_corner(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(AVATAR_LABEL).ok_or("no companion window")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    if let Some(file) = place_file() {
        let _ = std::fs::remove_file(file);
    }
    place_bottom_right(&window, (size.width as f64 / scale, size.height as f64 / scale))
        .map_err(|e| e.to_string())
}

fn build_avatar(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, AVATAR_LABEL, WebviewUrl::App("index.html".into()))
        .title("Alpha")
        .inner_size(AVATAR_IDLE.0, AVATAR_IDLE.1)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    if !place_where_left(&window, AVATAR_IDLE)? {
        place_bottom_right(&window, AVATAR_IDLE)?;
    }
    let hidden = avatar_marker().map(|m| m.exists()).unwrap_or(false);
    if !hidden {
        window.show()?;
    }
    Ok(())
}

/// Resize the companion to what it shows now (`mode` is "idle", "bubble" or "open"; the page
/// says the width and height it needs, which follow the character's size), keeping its
/// bottom-right corner in place.
#[tauri::command]
fn avatar_layout(app: AppHandle, mode: String, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window(AVATAR_LABEL).ok_or("no companion window")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let right = position.x + size.width as i32;
    let bottom = position.y + size.height as i32;
    let expanded = mode == "open";
    let width = width.clamp(60.0, 800.0);
    let height = height.clamp(60.0, 900.0);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    let physical_w = (width * scale).round() as i32;
    let physical_h = (height * scale).round() as i32;
    window
        .set_position(PhysicalPosition::new(right - physical_w, bottom - physical_h))
        .map_err(|e| e.to_string())?;
    if expanded {
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn avatar_hot_areas(areas: Vec<[f64; 4]>) {
    *AVATAR_HOT.lock().unwrap() = areas;
}

fn over_hot_area(x: f64, y: f64) -> bool {
    AVATAR_HOT.lock().unwrap().iter().any(|[left, top, width, height]| {
        x >= left - HOT_SLACK
            && x <= left + width + HOT_SLACK
            && y >= top - HOT_SLACK
            && y <= top + height + HOT_SLACK
    })
}

/// Follow the pointer and let clicks through wherever the companion draws nothing.
fn watch_companion_clicks(app: AppHandle) {
    std::thread::Builder::new()
        .name("companion-clicks".into())
        .spawn(move || {
            let mut passing: Option<bool> = None;
            loop {
                std::thread::sleep(HOT_EVERY);
                let Some(window) = app.get_webview_window(AVATAR_LABEL) else {
                    continue;
                };
                if !window.is_visible().unwrap_or(false) {
                    continue;
                }
                let (Ok(cursor), Ok(origin), Ok(scale)) =
                    (app.cursor_position(), window.outer_position(), window.scale_factor())
                else {
                    continue;
                };
                let x = (cursor.x - origin.x as f64) / scale;
                let y = (cursor.y - origin.y as f64) / scale;
                let pass = !over_hot_area(x, y);
                if passing != Some(pass) && window.set_ignore_cursor_events(pass).is_ok() {
                    passing = Some(pass);
                }
            }
        })
        .expect("companion clicks thread");
}

#[tauri::command]
fn avatar_visible(app: AppHandle, visible: bool) -> Result<bool, String> {
    let window = app.get_webview_window(AVATAR_LABEL).ok_or("no companion window")?;
    if visible {
        window.show().map_err(|e| e.to_string())?;
        if let Some(marker) = avatar_marker() {
            let _ = std::fs::remove_file(marker);
        }
    } else {
        window.hide().map_err(|e| e.to_string())?;
        if let Some(marker) = avatar_marker() {
            let _ = std::fs::write(marker, b"");
        }
    }
    Ok(visible)
}

#[tauri::command]
fn avatar_is_visible(app: AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window(AVATAR_LABEL).ok_or("no companion window")?;
    window.is_visible().map_err(|e| e.to_string())
}

/// Open the folder that holds the person's world in Finder.
#[tauri::command]
fn reveal_data() -> Result<(), String> {
    let dir = DATA_DIR.get().ok_or("Alpha's data folder isn't set yet")?;
    Command::new("/usr/bin/open")
        .arg(dir)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// A path inside Alpha's own folder, both resolved first (symlinks and `..` followed), so the
/// check is on where the file really is, not on how the path was spelled.
fn own_file(path: &str, verb: &str) -> Result<PathBuf, String> {
    let dir = DATA_DIR.get().ok_or("Alpha's data folder isn't set yet")?;
    let dir = std::fs::canonicalize(dir).map_err(|e| format!("Alpha's data folder: {e}"))?;
    let target = std::fs::canonicalize(path)
        .map_err(|_| "That file isn't there any more".to_string())?;
    if !target.starts_with(&dir) {
        return Err(format!("Alpha only {verb} files in its own folder"));
    }
    Ok(target)
}

/// Reveal a file Alpha keeps (an export, a fetched attachment) in Finder.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let target = own_file(&path, "reveals")?;
    Command::new("/usr/bin/open").arg("-R").arg(&target).status().map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a file Alpha keeps with the Mac's default app for it.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = own_file(&path, "opens")?;
    Command::new("/usr/bin/open").arg(&target).status().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn show_main(app: AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

// ---------- the core ----------

fn random_token() -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open("/dev/urandom").map_err(|e| format!("urandom: {e}"))?;
    let mut buf = [0u8; 32];
    file.read_exact(&mut buf).map_err(|e| format!("urandom: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// The repository root in development (`desktop/src-tauri/../..`); `ALPHA_REPO` overrides it.
fn repo_root() -> PathBuf {
    if let Ok(dir) = std::env::var("ALPHA_REPO") {
        return PathBuf::from(dir);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// The runtime a shipped Alpha carries inside its bundle (`just ship`, 9 Oct 2026): Python with
/// the core and its packages, Node for the browser driver, and the connectors. Absent in
/// development, where the repository's uv environment and connectors are used instead.
fn bundled_runtime(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?.join("runtime");
    dir.join("python/bin/python3.13").is_file().then_some(dir)
}

/// A copy of Alpha that arrived by download or AirDrop carries macOS's quarantine mark on
/// every file inside it. The person's right-click › Open answers for the app, not for the
/// Python and Node inside it, which macOS would then refuse to run. Once the host runs, it
/// clears the mark from its own runtime: its own files, no password, once.
fn release_quarantine(dir: &PathBuf) {
    let marked = Command::new("/usr/bin/xattr")
        .args(["-p", "com.apple.quarantine"])
        .arg(dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !marked {
        return;
    }
    let cleared = Command::new("/usr/bin/xattr")
        .args(["-dr", "com.apple.quarantine"])
        .arg(dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    note(&format!(
        "{} the quarantine mark on {}",
        if cleared { "cleared" } else { "couldn't clear" },
        dir.display()
    ));
}

/// The core's Python: the bundled runtime's when shipped, the repository's uv environment in
/// development; `ALPHA_PYTHON` overrides both.
fn core_python(bundled: Option<&PathBuf>) -> PathBuf {
    if let Ok(path) = std::env::var("ALPHA_PYTHON") {
        return PathBuf::from(path);
    }
    match bundled {
        Some(dir) => dir.join("python/bin/python3.13"),
        None => repo_root().join(".venv/bin/python"),
    }
}

/// Alpha's data folder (the app's own, or `ALPHA_HOME` in development), made if missing and
/// kept for the rest of the run. Worked out before the companion is made, which keeps its own
/// small files there (whether it is hidden, where it was put), and again by the core's launch.
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = DATA_DIR.get() {
        return Ok(dir.clone());
    }
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Alpha's data folder couldn't be found: {e}"))?;
    if cfg!(debug_assertions) {
        if let Ok(home) = std::env::var("ALPHA_HOME") {
            if !home.is_empty() {
                dir = PathBuf::from(home);
            }
        }
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("Alpha's data folder couldn't be made: {e}"))?;
    let _ = DATA_DIR.set(dir.clone());
    Ok(dir)
}

/// Start the core. `keep`: the port and token of the core this one replaces, so the windows'
/// sessions stay good; none on the first start (port 0 picks a free one, the token is new).
fn launch_core(app: &AppHandle, keep: Option<(u16, String)>) -> Result<CoreProcess, String> {
    let bundled = bundled_runtime(app);
    let python = core_python(bundled.as_ref());
    if !python.is_file() {
        return Err(format!(
            "It isn't installed ({}). Run `just setup` in the repository.",
            python.display()
        ));
    }
    let data_dir = data_dir(app)?;
    let log_dir = data_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| format!("It couldn't make its log folder: {e}"))?;
    let _ = HOST_LOG.set(log_dir.join("host.log"));
    if let Some(dir) = &bundled {
        release_quarantine(dir);
    }
    let (port_arg, token) = match keep {
        Some((port, token)) => (port.to_string(), token),
        None => ("0".to_string(), random_token()?),
    };
    let core_log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("core.log"))
        .map_err(|e| format!("It couldn't open its log: {e}"))?;
    let home = std::env::var("HOME").unwrap_or_default();
    let user = std::env::var("USER").unwrap_or_else(|_| {
        PathBuf::from(&home)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    });
    // The model runs through the Claude Code CLI on the person's own login: their HOME and
    // USER, the default config home, and a PATH that finds `claude` and Node (the bundled one
    // first when shipped).
    let node_bin = bundled
        .as_ref()
        .map(|dir| format!("{}:", dir.join("node/bin").display()))
        .unwrap_or_default();
    let path = format!(
        "{node_bin}/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:{home}/.local/bin:/usr/local/bin:/usr/bin:/bin"
    );
    let connectors = match &bundled {
        Some(dir) => dir.join("connectors"),
        None => repo_root().join("connectors"),
    };
    note(&format!(
        "launching core: python={} data={} runtime={}",
        python.display(),
        data_dir.display(),
        bundled
            .as_ref()
            .map(|d| d.display().to_string())
            .unwrap_or_else(|| "the repository".to_string())
    ));
    let mut command = Command::new(&python);
    command
        .args(["-m", "alpha.cli", "serve", "--port", &port_arg])
        .env_clear()
        .env("HOME", &home)
        .env("USER", &user)
        .env("PATH", path)
        .env("ALPHA_HOME", &data_dir)
        .env("ALPHA_TOKEN", &token)
        .env("ALPHA_CONNECTORS", &connectors)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("LANG", "en_GB.UTF-8")
        .current_dir(&data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(core_log));
    if let Some(dir) = &bundled {
        command
            .env("PYTHONPATH", dir.join("site-packages"))
            .env("PYTHONNOUSERSITE", "1")
            .env("ALPHA_NODE", dir.join("node/bin/node"));
    }
    if let Ok(model) = std::env::var("ALPHA_MODEL") {
        command.env("ALPHA_MODEL", model);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("It couldn't start ({}): {e}", python.display()))?;
    let stdout = child.stdout.take().ok_or("It couldn't be heard while starting.")?;
    let mut reader = BufReader::new(stdout);
    let started = Instant::now();
    let ready_line = loop {
        if started.elapsed() > READY_TIMEOUT {
            let _ = child.kill();
            return Err(format!("It didn't start within {} seconds.", READY_TIMEOUT.as_secs()));
        }
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .map_err(|e| format!("It couldn't be heard while starting: {e}"))?;
        if n == 0 {
            let status = child.wait().map(|s| s.to_string()).unwrap_or_default();
            return Err(format!(
                "It stopped before it was ready ({status}); its log is {}.",
                log_dir.join("core.log").display()
            ));
        }
        if let Some(rest) = line.strip_prefix(READY_PREFIX) {
            break rest.trim().to_string();
        }
    };
    std::thread::spawn(move || {
        for line in reader.lines().map_while(Result::ok) {
            eprintln!("[core] {line}");
        }
    });
    let ready: serde_json::Value =
        serde_json::from_str(&ready_line).map_err(|e| format!("It started but didn't say where to reach it: {e}"))?;
    let port = ready["port"].as_u64().ok_or("ready line missing port")? as u16;
    Ok(CoreProcess { child, port, token, started: Instant::now() })
}

/// Keep the core alive: when it ends on its own, start it again on the same port with the same
/// token, pausing longer each time it dies quickly, and tell the windows. Nothing is started
/// again once the person quits.
fn watch_core(app: AppHandle, launch: Arc<Launch>) {
    std::thread::Builder::new()
        .name("core-watch".into())
        .spawn(move || {
            let mut pause = RESTART_PAUSE_FIRST;
            let mut keep: Option<(u16, String)> = None;
            loop {
                std::thread::sleep(WATCH_EVERY);
                if QUITTING.load(Ordering::SeqCst) {
                    return;
                }
                if keep.is_none() {
                    // The core is meant to be running: is it?
                    let ended = {
                        let Ok(mut guard) = launch.core.lock() else { return };
                        let Some(core) = guard.as_mut() else { continue };
                        match core.child.try_wait() {
                            Ok(Some(status)) => {
                                let lived = core.started.elapsed();
                                let same = (core.port, core.token.clone());
                                *guard = None;
                                Some((status.to_string(), lived, same))
                            }
                            Ok(None) => None,
                            Err(error) => {
                                note(&format!("core watch: {error}"));
                                None
                            }
                        }
                    };
                    let Some((status, lived, same)) = ended else { continue };
                    if lived > STEADY_AFTER {
                        pause = RESTART_PAUSE_FIRST;
                    }
                    note(&format!(
                        "core ended on its own ({status}) after {}s; starting it again in {}s",
                        lived.as_secs(),
                        pause.as_secs()
                    ));
                    let _ = app.emit("core-down", format!("the core stopped ({status})"));
                    keep = Some(same);
                }
                // The core is down: start it again after the pause, on the same port and token.
                std::thread::sleep(pause);
                if QUITTING.load(Ordering::SeqCst) {
                    return;
                }
                match launch_core(&app, keep.clone()) {
                    Ok(core) => {
                        note(&format!("core started again on port {}", core.port));
                        if let Ok(mut guard) = launch.core.lock() {
                            *guard = Some(core);
                        }
                        keep = None;
                        pause = (pause * 2).min(RESTART_PAUSE_MOST);
                        let _ = app.emit("core-restarted", ());
                    }
                    Err(error) => {
                        note(&format!("core did not start again: {error}; next try in {}s", pause.as_secs()));
                        pause = (pause * 2).min(RESTART_PAUSE_MOST);
                        let _ = app.emit("core-down", error);
                    }
                }
            }
        })
        .expect("core watch thread");
}

fn stop_core(process: &mut CoreProcess) {
    let pid = process.child.id() as i32;
    // SAFETY: signalling a child process we spawned.
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
    let deadline = Instant::now() + QUIT_GRACE;
    loop {
        match process.child.try_wait() {
            Ok(Some(status)) => {
                note(&format!("core exited: {status}"));
                return;
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => break,
        }
    }
    note("core did not stop in time; killing it");
    let _ = process.child.kill();
    let _ = process.child.wait();
}

#[tauri::command]
async fn core_session(state: State<'_, HostState>) -> Result<CoreSession, String> {
    let launch = state.launch.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !launch.wait(SESSION_WAIT) {
            return Err("It's still starting.".to_string());
        }
        let guard = launch.core.lock().map_err(|_| "Alpha's Mac app hit a problem; quit Alpha and open it again.")?;
        match guard.as_ref() {
            Some(core) => Ok(CoreSession {
                base_url: format!("http://127.0.0.1:{}", core.port),
                token: core.token.clone(),
            }),
            None => Err(launch
                .launch_error
                .lock()
                .ok()
                .and_then(|e| e.clone())
                .unwrap_or_else(|| "It isn't running.".into())),
        }
    })
    .await
    .map_err(|e| format!("host task failed: {e}"))?
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn stop_all(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    if let Some(state) = app.try_state::<HostState>() {
        if let Ok(mut guard) = state.launch.core.lock() {
            if let Some(mut core) = guard.take() {
                stop_core(&mut core);
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(HostState::default())
        .invoke_handler(tauri::generate_handler![
            core_session,
            avatar_layout,
            avatar_hot_areas,
            avatar_visible,
            avatar_is_visible,
            show_main,
            reveal_data,
            reveal_path,
            open_path
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let launch = app.state::<HostState>().launch.clone();
            std::thread::Builder::new()
                .name("core-launch".into())
                .spawn(move || {
                    let outcome = launch_core(&handle, None);
                    match &outcome {
                        Ok(core) => note(&format!("core ready on port {}", core.port)),
                        Err(error) => note(&format!("core launch failed: {error}")),
                    }
                    let started = outcome.is_ok();
                    launch.settle(outcome);
                    if started {
                        watch_core(handle, launch);
                    }
                })
                .expect("core launch thread");

            if let Err(error) = data_dir(app.handle()) {
                note(&format!("data folder not ready: {error}"));
            }
            if let Err(error) = build_avatar(app.handle()) {
                note(&format!("companion window not created: {error}"));
            }
            watch_companion_clicks(app.handle().clone());

            let open = MenuItem::with_id(app, "open", "Open Alpha", true, None::<&str>)?;
            let avatar_item =
                MenuItem::with_id(app, "avatar", "Show or hide the companion", true, None::<&str>)?;
            let corner_item = MenuItem::with_id(
                app,
                "corner",
                "Put the companion back in the corner",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Alpha", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &avatar_item, &corner_item, &quit_item])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("window icon"))
                .icon_as_template(true)
                .tooltip("Alpha")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "avatar" => {
                        let shown = avatar_is_visible(app.clone()).unwrap_or(false);
                        let _ = avatar_visible(app.clone(), !shown);
                    }
                    "corner" => {
                        if let Err(error) = avatar_to_corner(app) {
                            note(&format!("companion not put back: {error}"));
                        }
                    }
                    "quit" => {
                        stop_all(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Wherever the companion goes, it opens there next time (slice 2 E1).
            if let WindowEvent::Moved(_) = event {
                if window.label() == AVATAR_LABEL {
                    remember_place(window);
                }
            }
            // Closing the workspace keeps Alpha running (the companion and the core stay).
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Alpha")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main_window(app),
            RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            RunEvent::Exit => stop_all(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::saved_corner;

    #[test]
    fn the_companion_opens_where_it_was_left_while_that_display_is_there() {
        let main = (Some("Built-in".to_string()), (0, 25, 3024, 1964));
        let side = (Some("LG".to_string()), (3024, 0, 6864, 2160));
        let saved = serde_json::json!({"display": "LG", "right": 5000, "bottom": 1200});
        assert_eq!(saved_corner(&saved, &[main.clone(), side.clone()]), Some((5000, 1200)));
        // the display is gone: none, so it goes to the corner
        assert_eq!(saved_corner(&saved, &[main.clone()]), None);
        // the display is there but smaller now: the spot is off it
        let smaller = (Some("LG".to_string()), (3024, 0, 4944, 1080));
        assert_eq!(saved_corner(&saved, &[main, smaller]), None);
        // nothing sensible saved
        assert_eq!(saved_corner(&serde_json::json!({"right": "x"}), &[side]), None);
    }
}
