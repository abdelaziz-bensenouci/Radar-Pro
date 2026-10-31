
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;


#[tauri::command]
async fn fetch_boamp_notices(today: String) -> Result<serde_json::Value, String> {
    const LIMIT: usize = 100;
    

    // Vérification du format de date YYYY-MM-DD.
    let valid_date = today.len() == 10
        && today.as_bytes()[4] == b'-'
        && today.as_bytes()[7] == b'-'
        && today.bytes().enumerate().all(|(i, b)| {
            matches!(i, 4 | 7) || b.is_ascii_digit()
        });

    if !valid_date {
        return Err("Format de date invalide.".to_string());
    }

    let client = reqwest::Client::new();
    let endpoint =
        "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";

    let where_clause = format!(
        "datelimitereponse >= date'{}'",
        today
    );

    let mut all_results = Vec::new();
    let mut total_count = 0_u64;
    let mut offset = 0_usize;

    loop {
        // L'API limite les résultats cumulés à moins de 10 000.
        if offset + LIMIT >= 10000 {
            break;
        }

        let params = [
            ("limit", LIMIT.to_string()),
            ("offset", offset.to_string()),
            ("order_by", "dateparution DESC".to_string()),
            ("where", where_clause.clone()),
            ("timezone", "Europe/Paris".to_string()),
        ];

        let response = client
            .get(endpoint)
            .query(&params)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Erreur de connexion au BOAMP : {}", e))?;

        let status = response.status();

        if !status.is_success() {
            return Err(format!(
                "Le BOAMP a répondu avec le statut HTTP {}",
                status
            ));
        }

        let page = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Impossible de lire les annonces BOAMP : {}", e))?;

        total_count = page["total_count"]
            .as_u64()
            .unwrap_or(total_count);

        let results = page["results"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        if results.is_empty() {
            break;
        }

        let received = results.len();
        all_results.extend(results);

        offset += received;

        if offset as u64 >= total_count || received < LIMIT {
            break;
        }
    }

    let fetched_count = all_results.len() as u64;

    Ok(serde_json::json!({
        "total_count": total_count,
        "fetched_count": fetched_count,
        "truncated": total_count > fetched_count,
        "results": all_results
    }))
}


#[tauri::command]
fn save_document(
    app: tauri::AppHandle,
    file_name: String,
    content: Vec<u8>,
) -> Result<String, String> {
    let extension = file_name.rsplit('.').next().unwrap_or("").to_lowercase();

    let allowed = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];

    if !allowed.contains(&extension.as_str()) {
        return Err("Format de fichier non autorisé.".to_string());
    }

    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("documents");

    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();

    let stored_name = format!("document_{}.{}", timestamp, extension);
    let destination = directory.join(&stored_name);

    fs::write(destination, content).map_err(|e| e.to_string())?;

    Ok(stored_name)
}

#[tauri::command]
fn delete_document(
    app: tauri::AppHandle,
    stored_name: String,
) -> Result<(), String> {
    let file_name = Path::new(&stored_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Nom de fichier invalide.")?;

    if file_name != stored_name || !file_name.starts_with("document_") {
        return Err("Nom de fichier non autorisé.".to_string());
    }

    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("documents");

    fs::remove_file(directory.join(file_name)).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_document_path(
    app: tauri::AppHandle,
    stored_name: String,
) -> Result<String, String> {
    let file_name = Path::new(&stored_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Nom de fichier invalide.")?;

    if file_name != stored_name || !file_name.starts_with("document_") {
        return Err("Nom de fichier non autorisé.".to_string());
    }

    let extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    let allowed = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];

    if !allowed.contains(&extension.as_str()) {
        return Err("Format de fichier non autorisé.".to_string());
    }

    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("documents")
        .join(file_name);

    if !path.is_file() {
        return Err("Le document est introuvable.".to_string());
    }

    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_document,
            delete_document,
            get_document_path,
            fetch_boamp_notices
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de RADAR PRO");
}
