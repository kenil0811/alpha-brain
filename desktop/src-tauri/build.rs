fn main() {
    tauri_build::build();
    #[cfg(target_os = "macos")]
    build_stt_helper();
}

/// Compiles `native/stt_helper.swift` (native macOS speech-to-text; see that file for why it's
/// Swift rather than a new Rust dependency tree) into a standalone binary next to the build
/// output, so `speech.rs` can spawn it by a path baked in at compile time (`STT_HELPER_PATH`).
#[cfg(target_os = "macos")]
fn build_stt_helper() {
    use std::path::PathBuf;
    use std::process::Command;
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let source = manifest_dir.join("native/stt_helper.swift");
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed={}", manifest_dir.join("Info.plist").display());
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let binary = out_dir.join("stt_helper");
    let status = Command::new("swiftc")
        // The helper carries the app's Info.plist, so macOS finds the microphone and speech
        // usage descriptions when the helper is the one asking.
        .args(["-O", source.to_str().expect("utf8 path"), "-o", binary.to_str().expect("utf8 path"),
               "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist",
               "-Xlinker", manifest_dir.join("Info.plist").to_str().expect("utf8 path")])
        .status()
        .expect("run swiftc (Xcode command line tools required)");
    if !status.success() {
        panic!("swiftc failed to build native/stt_helper.swift");
    }
    println!("cargo:rustc-env=STT_HELPER_PATH={}", binary.display());
}
