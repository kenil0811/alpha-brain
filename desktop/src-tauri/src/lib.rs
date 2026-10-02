//! Alpha's native host.
//!
//! It owns the windows (the workspace and the always-on companion), the tray, and the core: it
//! launches `alpha serve` with a fixed environment and a random token, waits for the core's
//! ready line, hands the window the address and token through one typed command, keeps the core
//! running when the window closes, and stops it on quit. Because the core is a child of the app,
//! macOS asks for calendar (and later other) access in Alpha's name.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, RunEvent, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const READY_PREFIX: &str = "ALPHA_CORE_READY ";
const READY_TIMEOUT: Duration = Duration::from_secs(60);
const SESSION_WAIT: Duration = Duration::from_secs(120);
const QUIT_GRACE: Duration = Duration::from_secs(5);

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
const AVATAR_BUBBLE: (f64, f64) = (320.0, 230.0);
const AVATAR_OPEN: (f64, f64) = (380.0, 560.0);
const AVATAR_MARGIN: f64 = 20.0;
const AVATAR_HIDDEN_MARKER: &str = "avatar-hidden";
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

fn build_avatar(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, AVATAR_LABEL, WebviewUrl::App("index.html".into()))
        .title("Alpha companion")
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
    place_bottom_right(&window, AVATAR_IDLE)?;
    let hidden = avatar_marker().map(|m| m.exists()).unwrap_or(false);
    if !hidden {
        window.show()?;
    }
    Ok(())
}

/// Resize the companion to `mode` ("idle", "bubble" or "open"), keeping its bottom-right
/// corner in place.
#[tauri::command]
fn avatar_layout(app: AppHandle, mode: String) -> Result<(), String> {
    let window = app.get_webview_window(AVATAR_LABEL).ok_or("no companion window")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let right = position.x + size.width as i32;
    let bottom = position.y + size.height as i32;
    let expanded = mode == "open";
    let (width, height) = match mode.as_str() {
        "open" => AVATAR_OPEN,
        "bubble" => AVATAR_BUBBLE,
        _ => AVATAR_IDLE,
    };
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

/// Reveal a file Alpha keeps (an export, a fetched attachment) in Finder.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let dir = DATA_DIR.get().ok_or("Alpha's data folder isn't set yet")?;
    let target = std::path::PathBuf::from(&path);
    if !target.starts_with(dir) {
        return Err("Alpha only reveals files in its own folder".into());
    }
    Command::new("/usr/bin/open").arg("-R").arg(&target).status().map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a file Alpha keeps with the Mac's default app for it.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let dir = DATA_DIR.get().ok_or("Alpha's data folder isn't set yet")?;
    let target = std::path::PathBuf::from(&path);
    if !target.starts_with(dir) {
        return Err("Alpha only opens files in its own folder".into());
    }
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

/// The core's Python: the repository's uv environment in development; `ALPHA_PYTHON` overrides.
fn core_python() -> PathBuf {
    if let Ok(path) = std::env::var("ALPHA_PYTHON") {
        return PathBuf::from(path);
    }
    repo_root().join(".venv/bin/python")
}

fn launch_core(app: &AppHandle) -> Result<CoreProcess, String> {
    let python = core_python();
    if !python.is_file() {
        return Err(format!(
            "Alpha's core isn't installed ({}). Run `just setup` in the repository.",
            python.display()
        ));
    }
    let mut data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    if cfg!(debug_assertions) {
        if let Ok(dir) = std::env::var("ALPHA_HOME") {
            if !dir.is_empty() {
                data_dir = PathBuf::from(dir);
            }
        }
    }
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
    let _ = DATA_DIR.set(data_dir.clone());
    let log_dir = data_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| format!("create log dir: {e}"))?;
    let _ = HOST_LOG.set(log_dir.join("host.log"));
    let token = random_token()?;
    let core_log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("core.log"))
        .map_err(|e| format!("open core log: {e}"))?;
    let home = std::env::var("HOME").unwrap_or_default();
    let user = std::env::var("USER").unwrap_or_else(|_| {
        PathBuf::from(&home)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    });
    // The model runs through the Claude Code CLI on the person's own login: their HOME and
    // USER, the default config home, and a PATH that finds `claude` and Node 24.
    let path = format!(
        "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:{home}/.local/bin:/usr/local/bin:/usr/bin:/bin"
    );
    note(&format!(
        "launching core: python={} data={}",
        python.display(),
        data_dir.display()
    ));
    let mut command = Command::new(&python);
    command
        .args(["-m", "alpha.cli", "serve", "--port", "0"])
        .env_clear()
        .env("HOME", &home)
        .env("USER", &user)
        .env("PATH", path)
        .env("ALPHA_HOME", &data_dir)
        .env("ALPHA_TOKEN", &token)
        .env("ALPHA_CONNECTORS", repo_root().join("connectors"))
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("LANG", "en_GB.UTF-8")
        .current_dir(&data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(core_log));
    if let Ok(model) = std::env::var("ALPHA_MODEL") {
        command.env("ALPHA_MODEL", model);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("spawn core ({}): {e}", python.display()))?;
    let stdout = child.stdout.take().ok_or("core stdout unavailable")?;
    let mut reader = BufReader::new(stdout);
    let started = Instant::now();
    let ready_line = loop {
        if started.elapsed() > READY_TIMEOUT {
            let _ = child.kill();
            return Err(format!("the core didn't start within {}s", READY_TIMEOUT.as_secs()));
        }
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .map_err(|e| format!("read core stdout: {e}"))?;
        if n == 0 {
            let status = child.wait().map(|s| s.to_string()).unwrap_or_default();
            return Err(format!(
                "the core stopped before it was ready ({status}); see {}",
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
        serde_json::from_str(&ready_line).map_err(|e| format!("bad ready line: {e}"))?;
    let port = ready["port"].as_u64().ok_or("ready line missing port")? as u16;
    Ok(CoreProcess { child, port, token })
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
            return Err("Alpha's core is still starting.".to_string());
        }
        let guard = launch.core.lock().map_err(|_| "host state poisoned")?;
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
                .unwrap_or_else(|| "the core isn't running".into())),
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
                    let outcome = launch_core(&handle);
                    match &outcome {
                        Ok(core) => note(&format!("core ready on port {}", core.port)),
                        Err(error) => note(&format!("core launch failed: {error}")),
                    }
                    launch.settle(outcome);
                })
                .expect("core launch thread");

            if let Err(error) = build_avatar(app.handle()) {
                note(&format!("companion window not created: {error}"));
            }
            watch_companion_clicks(app.handle().clone());

            let open = MenuItem::with_id(app, "open", "Open Alpha", true, None::<&str>)?;
            let avatar_item =
                MenuItem::with_id(app, "avatar", "Show or hide the companion", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Alpha", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &avatar_item, &quit_item])?;
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
