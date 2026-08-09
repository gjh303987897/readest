use serde::{Deserialize, Serialize};
use std::{
    env,
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};

const MODEL_DIRECTORY: &str = "Readest/TTS/MeloTTS";
const SUPPORTED_LANGUAGES: [&str; 6] = ["EN", "ES", "FR", "ZH", "JP", "KR"];

#[derive(Debug, Deserialize)]
struct RuntimeResponse {
    ok: bool,
    audio_base64: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
struct RuntimeRequest<'a> {
    language_code: &'a str,
    text: &'a str,
    model_dir: &'a Path,
}

struct MeloProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    log_path: PathBuf,
}

#[derive(Clone, Default)]
pub struct MeloTtsState {
    process: Arc<Mutex<Option<MeloProcess>>>,
}

fn parse_runtime_response(line: &str) -> Result<String, String> {
    let response: RuntimeResponse =
        serde_json::from_str(line).map_err(|error| format!("Invalid MeloTTS response: {error}"))?;
    if response.ok {
        return response
            .audio_base64
            .filter(|audio| !audio.is_empty())
            .ok_or_else(|| "MeloTTS returned an empty audio response".to_string());
    }
    Err(response
        .error
        .filter(|error| !error.is_empty())
        .unwrap_or_else(|| "MeloTTS synthesis failed".to_string()))
}

fn runtime_script_path(app: &AppHandle) -> Result<PathBuf, String> {
    let development_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("melotts_server.py");
    if development_path.is_file() {
        return Ok(development_path);
    }

    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Cannot resolve the application resource directory: {error}"))?
        .join("melotts")
        .join("melotts_server.py");
    if resource_path.is_file() {
        Ok(resource_path)
    } else {
        Err("MeloTTS runtime script is missing from this build".to_string())
    }
}

fn runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join(MODEL_DIRECTORY).join("runtime"))
        .map_err(|error| format!("Cannot resolve the application cache directory: {error}"))
}

fn python_command(runtime_dir: &Path) -> PathBuf {
    if let Some(path) = env::var_os("READEST_MELOTTS_PYTHON") {
        return PathBuf::from(path);
    }

    let candidates = if cfg!(windows) {
        vec![
            runtime_dir.join(".venv").join("Scripts").join("python.exe"),
            runtime_dir.join("python").join("python.exe"),
        ]
    } else {
        vec![
            runtime_dir.join(".venv").join("bin").join("python3"),
            runtime_dir.join("python").join("bin").join("python3"),
        ]
    };
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(if cfg!(windows) { "python" } else { "python3" }))
}

fn log_tail(path: &Path) -> String {
    let Ok(mut file) = fs::File::open(path) else {
        return String::new();
    };
    let Ok(length) = file.metadata().map(|metadata| metadata.len()) else {
        return String::new();
    };
    let start = length.saturating_sub(4_096);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut tail = String::new();
    if file.read_to_string(&mut tail).is_err() {
        return String::new();
    }
    tail.trim().to_string()
}

impl MeloProcess {
    fn start(app: &AppHandle) -> Result<Self, String> {
        let runtime_dir = runtime_root(app)?;
        fs::create_dir_all(&runtime_dir)
            .map_err(|error| format!("Cannot create the MeloTTS runtime directory: {error}"))?;
        let script_path = runtime_script_path(app)?;
        let log_path = runtime_dir.join("runtime.log");
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|error| format!("Cannot open the MeloTTS runtime log: {error}"))?;

        let mut command = Command::new(python_command(&runtime_dir));
        command
            .arg("-u")
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log_file))
            .env("HF_HOME", runtime_dir.join("huggingface"))
            .env("HF_HUB_OFFLINE", "1")
            .env("NLTK_DATA", runtime_dir.join("nltk_data"))
            .env("TOKENIZERS_PARALLELISM", "false")
            .env("TRANSFORMERS_OFFLINE", "1")
            .env("PYTHONUTF8", "1")
            .env("PYTHONUNBUFFERED", "1");

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let mut child = command.spawn().map_err(|error| {
            format!(
                "Cannot start the MeloTTS Python runtime. Install Python 3.9+ and melotts 0.1.2, or set READEST_MELOTTS_PYTHON: {error}"
            )
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Cannot open the MeloTTS runtime input".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Cannot open the MeloTTS runtime output".to_string())?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            log_path,
        })
    }

    fn synthesize(&mut self, request: &RuntimeRequest<'_>) -> Result<String, String> {
        let line = serde_json::to_string(request)
            .map_err(|error| format!("Cannot encode the MeloTTS request: {error}"))?;
        self.stdin
            .write_all(line.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("Cannot send text to the MeloTTS runtime: {error}"))?;

        let mut response = String::new();
        let bytes_read = self
            .stdout
            .read_line(&mut response)
            .map_err(|error| format!("Cannot read the MeloTTS response: {error}"))?;
        if bytes_read == 0 {
            let details = log_tail(&self.log_path);
            return Err(if details.is_empty() {
                "MeloTTS runtime exited before producing audio".to_string()
            } else {
                format!("MeloTTS runtime exited before producing audio: {details}")
            });
        }
        parse_runtime_response(response.trim())
    }

    fn exited(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(Some(_)))
    }
}

impl Drop for MeloProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl MeloTtsState {
    fn synthesize(
        &self,
        app: &AppHandle,
        language_code: &str,
        text: &str,
    ) -> Result<String, String> {
        if !cfg!(desktop) {
            return Err(
                "MeloTTS local inference is currently available on desktop only".to_string(),
            );
        }
        if !SUPPORTED_LANGUAGES.contains(&language_code) {
            return Err(format!("Unsupported MeloTTS model: {language_code}"));
        }
        let text = text.trim();
        if text.is_empty() {
            return Err("MeloTTS cannot synthesize empty text".to_string());
        }
        if text.chars().count() > 2_000 {
            return Err("MeloTTS text segment is too long".to_string());
        }

        let model_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Cannot resolve the application cache directory: {error}"))?
            .join(MODEL_DIRECTORY)
            .join(language_code);
        for file_name in ["config.json", "checkpoint.pth"] {
            let path = model_dir.join(file_name);
            if !path
                .metadata()
                .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
            {
                return Err(format!(
                    "MeloTTS model {language_code} is not downloaded completely"
                ));
            }
        }

        let request = RuntimeRequest {
            language_code,
            text,
            model_dir: &model_dir,
        };
        let mut process = self
            .process
            .lock()
            .map_err(|_| "MeloTTS runtime state is unavailable".to_string())?;
        if process.is_none() {
            *process = Some(MeloProcess::start(app)?);
        }
        let result = process
            .as_mut()
            .ok_or_else(|| "MeloTTS runtime failed to start".to_string())?
            .synthesize(&request);
        if result.is_err() && process.as_mut().is_some_and(MeloProcess::exited) {
            process.take();
        }
        result
    }
}

#[tauri::command]
pub async fn melotts_synthesize(
    app: AppHandle,
    state: State<'_, MeloTtsState>,
    language_code: String,
    text: String,
) -> Result<String, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.synthesize(&app, &language_code, &text))
        .await
        .map_err(|error| format!("MeloTTS worker failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::parse_runtime_response;

    #[test]
    fn parses_successful_audio_response() {
        let audio = parse_runtime_response(r#"{"ok":true,"audio_base64":"UklGRg=="}"#)
            .expect("response should contain audio");
        assert_eq!(audio, "UklGRg==");
    }

    #[test]
    fn surfaces_runtime_errors() {
        let error = parse_runtime_response(r#"{"ok":false,"error":"MeloTTS package missing"}"#)
            .expect_err("runtime error should be returned");
        assert_eq!(error, "MeloTTS package missing");
    }
}
