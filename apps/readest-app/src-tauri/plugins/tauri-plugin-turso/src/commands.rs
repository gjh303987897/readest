use indexmap::IndexMap;
use serde_json::Value as JsonValue;
use tauri::{command, AppHandle, Manager, Runtime, State};

use crate::models::{LoadOptions, PingRequest, PingResponse, QueryResult};
use crate::wrapper::DbInstances;
use crate::Error;

#[cfg(desktop)]
use crate::desktop::Turso;
#[cfg(mobile)]
use crate::mobile::Turso;

/// Load a database connection
#[command]
pub(crate) async fn load<R: Runtime>(
    app: AppHandle<R>,
    db_instances: State<'_, DbInstances>,
    options: LoadOptions,
) -> Result<String, Error> {
    let path = options.path.clone();

    let turso = app.state::<Turso>().inner();
    let base_path = turso.base_path();

    // Use provided encryption, or fall back to plugin default
    let encryption = options.encryption.or_else(|| turso.encryption().cloned());

    // Idempotent: if a connection for this path is already open, return it as-is
    if db_instances.0.lock().await.contains_key(&path) {
        return Ok(path);
    }

    let initializer = {
        let mut pending = db_instances.1.lock().await;
        pending.entry(path.clone()).or_default().clone()
    };
    let connected = initializer
        .get_or_try_init(|| async {
            crate::wrapper::DbConnection::connect(
                &path,
                encryption,
                base_path,
                &options.experimental,
            )
            .await
            .map(std::sync::Arc::new)
        })
        .await;
    let conn = match connected {
        Ok(conn) => conn.clone(),
        Err(error) => {
            let mut pending = db_instances.1.lock().await;
            if std::sync::Arc::strong_count(&initializer) == 2
                && pending
                    .get(&path)
                    .is_some_and(|current| std::sync::Arc::ptr_eq(current, &initializer))
            {
                pending.remove(&path);
            }
            return Err(error);
        }
    };
    // Only initialization of this path is shared; queries never wait for unrelated opens.
    db_instances
        .0
        .lock()
        .await
        .entry(path.clone())
        .or_insert(conn);

    Ok(path)
}

/// Execute a query that doesn't return rows
#[command]
pub(crate) async fn execute(
    db_instances: State<'_, DbInstances>,
    db: String,
    query: String,
    values: Vec<JsonValue>,
) -> Result<QueryResult, Error> {
    let conn = {
        let instances = db_instances.0.lock().await;
        instances
            .get(&db)
            .ok_or_else(|| Error::DatabaseNotLoaded(db.clone()))?
            .clone()
    };
    conn.execute(&query, values).await
}

/// Execute a query that returns rows
#[command]
pub(crate) async fn select(
    db_instances: State<'_, DbInstances>,
    db: String,
    query: String,
    values: Vec<JsonValue>,
) -> Result<Vec<IndexMap<String, JsonValue>>, Error> {
    let conn = {
        let instances = db_instances.0.lock().await;
        instances
            .get(&db)
            .ok_or_else(|| Error::DatabaseNotLoaded(db.clone()))?
            .clone()
    };
    conn.select(&query, values).await
}

/// Execute multiple SQL statements atomically inside a single transaction.
#[command]
pub(crate) async fn batch(
    db_instances: State<'_, DbInstances>,
    db: String,
    queries: Vec<String>,
) -> Result<(), Error> {
    let conn = {
        let instances = db_instances.0.lock().await;
        instances
            .get(&db)
            .ok_or_else(|| Error::DatabaseNotLoaded(db.clone()))?
            .clone()
    };
    conn.batch(queries).await
}

/// Close a database connection
#[command]
pub(crate) async fn close(
    db_instances: State<'_, DbInstances>,
    db: Option<String>,
) -> Result<bool, Error> {
    {
        let mut initializers = db_instances.1.lock().await;
        if let Some(db) = &db {
            initializers.remove(db);
        } else {
            initializers.clear();
        }
    }
    let connections: Vec<_> = {
        let mut instances = db_instances.0.lock().await;
        if let Some(db) = db {
            instances.remove(&db).into_iter().collect()
        } else {
            instances.drain().map(|(_, conn)| conn).collect()
        }
    };
    for conn in connections {
        conn.close().await;
    }

    Ok(true)
}

/// Ping command (for backwards compatibility)
#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse, Error> {
    let turso = app.state::<Turso>().inner();
    turso.ping(payload)
}

/// Get plugin config info
#[command]
pub(crate) async fn get_config<R: Runtime>(app: AppHandle<R>) -> Result<ConfigInfo, Error> {
    let turso = app.state::<Turso>().inner();
    Ok(ConfigInfo {
        encrypted: turso.encryption().is_some(),
    })
}

/// Config info returned to frontend
#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct ConfigInfo {
    pub encrypted: bool,
}
