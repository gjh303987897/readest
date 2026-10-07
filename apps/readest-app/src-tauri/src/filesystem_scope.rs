use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

// Resolve the parent of a new file too, so symlinks cannot disguise its destination.
pub(crate) fn resolved_path(path: &Path) -> std::io::Result<PathBuf> {
    if !path.is_absolute()
        || path.components().any(|c| c == Component::ParentDir)
        || path
            .to_string_lossy()
            .split(['/', '\\'])
            .any(|part| part == "..")
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "absolute, traversal-free path required",
        ));
    }
    if path.exists() {
        path.canonicalize()
    } else {
        let parent = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
        let name = path.file_name().ok_or(std::io::ErrorKind::InvalidInput)?;
        Ok(parent.canonicalize()?.join(name))
    }
}

pub fn is_path_allowed(app: &AppHandle, path: &Path) -> bool {
    let Ok(path) = resolved_path(path) else {
        return false;
    };
    let scope = app.fs_scope();
    if scope.is_forbidden(&path) {
        return false;
    }
    if scope.is_allowed(&path) {
        return true;
    }
    [
        app.path().app_data_dir(),
        app.path().app_local_data_dir(),
        app.path().app_cache_dir(),
    ]
    .into_iter()
    .filter_map(Result::ok)
    .filter_map(|root| root.canonicalize().ok())
    .any(|root| path.starts_with(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_new_files_and_rejects_traversal() {
        let root = std::env::temp_dir().canonicalize().unwrap();
        assert_eq!(
            resolved_path(&root.join("readest-scope-test.epub")).unwrap(),
            root.join("readest-scope-test.epub")
        );
        let traversal = format!("{}/ReadestProbe/../private", root.display());
        assert!(resolved_path(Path::new(&traversal)).is_err());
        assert!(resolved_path(Path::new("relative/Readest/book.epub")).is_err());
        assert!(!root
            .join("ReadestProbe/file.epub")
            .starts_with(root.join("Readest")));
    }
}
