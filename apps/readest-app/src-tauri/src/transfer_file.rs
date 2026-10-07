// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Upload files from disk to a remote server over HTTP.
//!
//! Download files from a remote HTTP server to disk.

use crate::filesystem_scope::{is_path_allowed, resolved_path};
use futures_util::TryStreamExt;
use serde::{ser::Serializer, Serialize};
use tauri::{command, ipc::Channel, AppHandle};
use tokio::{
    fs::File,
    io::{AsyncWriteExt, BufWriter},
};
use tokio_util::codec::{BytesCodec, FramedRead};

use read_progress_stream::ReadProgressStream;

use std::time::Instant;
use std::{collections::HashMap, sync::Arc};

type Result<T> = std::result::Result<T, Error>;

// The TransferStats struct tracks both transfer speed and cumulative transfer progress.
pub struct TransferStats {
    accumulated_chunk_len: usize, // Total length of chunks transferred in the current period
    accumulated_time: u128,       // Total time taken for the transfers in the current period
    pub transfer_speed: u64,      // Calculated transfer speed in bytes per second
    pub total_transferred: u64,   // Cumulative total of all transferred data
    start_time: Instant,          // Time when the current period started
    granularity: u32, // Time period (in milliseconds) over which the transfer speed is calculated
}

impl TransferStats {
    // Initializes a new TransferStats instance with the specified granularity.
    pub fn start(granularity: u32) -> Self {
        Self {
            accumulated_chunk_len: 0,
            accumulated_time: 0,
            transfer_speed: 0,
            total_transferred: 0,
            start_time: Instant::now(),
            granularity,
        }
    }
    // Records the transfer of a data chunk and updates both transfer speed and total progress.
    pub fn record_chunk_transfer(&mut self, chunk_len: usize) {
        let now = Instant::now();
        let it_took = now.duration_since(self.start_time).as_millis();
        self.accumulated_chunk_len += chunk_len;
        self.total_transferred += chunk_len as u64;
        self.accumulated_time += it_took;

        // Calculate transfer speed if accumulated time exceeds granularity.
        if self.accumulated_time >= self.granularity as u128 {
            self.transfer_speed =
                (self.accumulated_chunk_len as u128 / self.accumulated_time * 1024) as u64;
            self.accumulated_chunk_len = 0;
            self.accumulated_time = 0;
        }

        // Reset the start time for the next period.
        self.start_time = now;
    }
}

// Provides a default implementation for TransferStats with a granularity of 500 milliseconds.
impl Default for TransferStats {
    fn default() -> Self {
        Self::start(500) // Default granularity is 500 ms
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Request(#[from] reqwest::Error),
    #[error("{0}")]
    ContentLength(String),
    #[error("request failed with status code {0}: {1}")]
    HttpErrorCode(u16, String),
    #[error("permission denied: path not in filesystem scope: {0}")]
    Forbidden(String),
}

fn ensure_path_allowed(app: &AppHandle, file_path: &str) -> Result<()> {
    if is_path_allowed(app, std::path::Path::new(file_path)) {
        Ok(())
    } else {
        Err(Error::Forbidden(file_path.to_string()))
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    progress: u64,
    total: u64,
    transfer_speed: u64,
}

#[command]
#[allow(clippy::too_many_arguments)] // Tauri command surface mirrors the JS caller's options.
pub async fn download_file(
    app: AppHandle,
    url: &str,
    file_path: &str,
    headers: HashMap<String, String>,
    body: Option<String>,
    single_threaded: Option<bool>,
    skip_ssl_verification: Option<bool>,
    on_progress: Channel<ProgressPayload>,
) -> Result<HashMap<String, String>> {
    ensure_path_allowed(&app, file_path)?;
    let target = resolved_path(std::path::Path::new(file_path))?;
    let name = target
        .file_name()
        .ok_or_else(|| Error::Forbidden(file_path.into()))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| Error::ContentLength(e.to_string()))?
        .as_nanos();
    let temporary = target.with_file_name(format!(".{}.{nonce}.part", name.to_string_lossy()));
    // Reserve a fresh sibling. Never truncate an existing file before validation completes.
    let reserved = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .await?;
    drop(reserved);
    let result = download_to_file(
        url,
        &temporary,
        headers,
        body,
        single_threaded,
        skip_ssl_verification,
        on_progress,
    )
    .await;
    match result {
        Ok(headers) => {
            if let Err(error) = tokio::fs::rename(&temporary, &target).await {
                let _ = tokio::fs::remove_file(&temporary).await;
                return Err(error.into());
            }
            Ok(headers)
        }
        Err(error) => {
            let _ = tokio::fs::remove_file(&temporary).await;
            Err(error)
        }
    }
}

async fn download_to_file(
    url: &str,
    file_path: &std::path::Path,
    headers: HashMap<String, String>,
    body: Option<String>,
    single_threaded: Option<bool>,
    skip_ssl_verification: Option<bool>,
    on_progress: Channel<ProgressPayload>,
) -> Result<HashMap<String, String>> {
    use futures::stream::{self, StreamExt};
    use std::cmp::min;
    use tokio::io::AsyncSeekExt;

    const PART_SIZE: u64 = 1024 * 1024;

    let client = reqwest::ClientBuilder::new()
        .danger_accept_invalid_certs(skip_ssl_verification.unwrap_or(false))
        .danger_accept_invalid_hostnames(skip_ssl_verification.unwrap_or(false))
        .build()?;
    let force_single = single_threaded.unwrap_or(false) || body.is_some();

    async fn single_threaded_download(
        client: &reqwest::Client,
        url: &str,
        file_path: &std::path::Path,
        headers: &HashMap<String, String>,
        body: &Option<String>,
        on_progress: Channel<ProgressPayload>,
    ) -> Result<HashMap<String, String>> {
        let mut request = if let Some(body) = body {
            client.post(url).body(body.clone())
        } else {
            client.get(url)
        };

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(Error::HttpErrorCode(
                response.status().as_u16(),
                response.text().await.unwrap_or_default(),
            ));
        }

        let mut resp_headers = HashMap::new();
        for (key, value) in response.headers().iter() {
            if let Ok(val_str) = value.to_str() {
                resp_headers.insert(key.to_string(), val_str.to_string());
            }
        }

        let total = response.content_length().unwrap_or(0);
        let mut file = BufWriter::new(File::create(file_path).await?);
        let mut stream = response.bytes_stream();

        let mut stats = TransferStats::default();
        while let Some(chunk) = stream.try_next().await? {
            file.write_all(&chunk).await?;
            stats.record_chunk_transfer(chunk.len());
            let _ = on_progress.send(ProgressPayload {
                progress: stats.total_transferred,
                total,
                transfer_speed: stats.transfer_speed,
            });
        }
        file.flush().await?;

        Ok(resp_headers)
    }

    if force_single {
        return single_threaded_download(&client, url, file_path, &headers, &body, on_progress)
            .await;
    }

    // Check if server supports range requests
    let mut range_req = client.get(url).header("Range", "bytes=0-0");
    for (key, value) in headers.iter() {
        range_req = range_req.header(key, value);
    }
    let range_resp = range_req.send().await?;
    let accept_ranges = range_resp
        .headers()
        .get("accept-ranges")
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("")
        .eq_ignore_ascii_case("bytes");
    let total = range_resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split('/').nth(1))
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let mut resp_headers = HashMap::new();
    for (key, value) in range_resp.headers().iter() {
        if let Ok(val_str) = value.to_str() {
            resp_headers.insert(key.to_string(), val_str.to_string());
        }
    }

    if range_resp.status() != reqwest::StatusCode::PARTIAL_CONTENT
        || !accept_ranges
        || total == 0
        || range_resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            != Some(format!("bytes 0-0/{total}").as_str())
    {
        return single_threaded_download(&client, url, file_path, &headers, &body, on_progress)
            .await;
    }

    // Multi-part download with range access
    let part_count = total.div_ceil(PART_SIZE);
    let file = File::create(file_path).await?;
    file.set_len(total).await?;

    let file = Arc::new(tokio::sync::Mutex::new(file));
    let progress = Arc::new(tokio::sync::Mutex::new(TransferStats::default()));

    stream::iter(0..part_count)
        .map(|i| {
            let client = client.clone();
            let file = Arc::clone(&file);
            let progress = Arc::clone(&progress);
            let headers = headers.clone();
            let on_progress = on_progress.clone();
            async move {
                let start = i * PART_SIZE;
                let end = min(start + PART_SIZE - 1, total - 1);
                let mut req = client.get(url);
                for (key, value) in headers {
                    req = req.header(key, value);
                }
                let resp = req
                    .header("Range", format!("bytes={start}-{end}"))
                    .send()
                    .await?;
                if resp.status() != reqwest::StatusCode::PARTIAL_CONTENT {
                    return Err(Error::HttpErrorCode(
                        resp.status().as_u16(),
                        "expected a partial response".into(),
                    ));
                }
                let expected_range = format!("bytes {start}-{end}/{total}");
                if resp
                    .headers()
                    .get("content-range")
                    .and_then(|v| v.to_str().ok())
                    != Some(expected_range.as_str())
                {
                    return Err(Error::ContentLength("invalid Content-Range".into()));
                }
                let expected_length = (end - start + 1) as usize;
                let mut bytes = Vec::with_capacity(expected_length);
                let mut chunks = resp.bytes_stream();
                while let Some(chunk) = chunks.try_next().await? {
                    if chunk.len() > expected_length - bytes.len() {
                        return Err(Error::ContentLength("range response is too long".into()));
                    }
                    bytes.extend_from_slice(&chunk);
                }
                if bytes.len() != expected_length {
                    return Err(Error::ContentLength("incomplete range response".into()));
                }
                {
                    let mut f = file.lock().await;
                    f.seek(std::io::SeekFrom::Start(start)).await?;
                    f.write_all(&bytes).await?;
                }
                let mut stat = progress.lock().await;
                stat.record_chunk_transfer(bytes.len());
                let _ = on_progress.send(ProgressPayload {
                    progress: stat.total_transferred,
                    total,
                    transfer_speed: stat.transfer_speed,
                });
                Ok::<(), Error>(())
            }
        })
        .buffer_unordered(8)
        .try_collect::<Vec<_>>()
        .await?;
    file.lock().await.sync_all().await?;

    Ok(resp_headers)
}

#[command]
pub async fn upload_file(
    app: AppHandle,
    url: &str,
    file_path: &str,
    method: &str,
    headers: HashMap<String, String>,
    on_progress: Channel<ProgressPayload>,
) -> Result<String> {
    ensure_path_allowed(&app, file_path)?;

    let file = File::open(file_path).await?;
    let file_len = file.metadata().await?.len();

    let client = reqwest::Client::new();
    let mut request = match method.to_uppercase().as_str() {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        _ => return Err(Error::ContentLength("Invalid HTTP method".into())),
    };

    request = request
        .header(reqwest::header::CONTENT_LENGTH, file_len)
        .body(file_to_body(on_progress.clone(), file, file_len));

    for (key, value) in headers {
        request = request.header(&key, value);
    }

    let response = request.send().await?;
    if response.status().is_success() {
        response.text().await.map_err(Into::into)
    } else {
        Err(Error::HttpErrorCode(
            response.status().as_u16(),
            response.text().await.unwrap_or_default(),
        ))
    }
}

fn file_to_body(channel: Channel<ProgressPayload>, file: File, file_len: u64) -> reqwest::Body {
    let stream = FramedRead::new(file, BytesCodec::new()).map_ok(|r| r.freeze());

    let mut stats = TransferStats::default();
    reqwest::Body::wrap_stream(ReadProgressStream::new(
        stream,
        Box::new(move |progress_chunk, _progress_total| {
            stats.record_chunk_transfer(progress_chunk as usize);
            let _ = channel.send(ProgressPayload {
                progress: stats.total_transferred,
                total: file_len,
                transfer_speed: stats.transfer_speed,
            });
        }),
    ))
}
