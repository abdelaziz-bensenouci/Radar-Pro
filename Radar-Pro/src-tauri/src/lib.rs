
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::thread;
use tauri::Manager;
use tauri::webview::{DownloadEvent, WebviewWindowBuilder};
use tauri::WebviewUrl;

const MAX_UPLOAD_SIZE: usize = 100 * 1024 * 1024;
const MAX_EXTRACTED_SIZE: u64 = 200 * 1024 * 1024;
const MAX_ZIP_FILES: usize = 100;
const MAX_TEXT_CHARS: usize = 1_000_000;

fn read_gemini_api_key() -> Result<String, String> {
    let home = std::env::var("USERPROFILE")
        .map_err(|_| "Dossier utilisateur Windows introuvable.".to_string())?;

    let env_path = Path::new(&home).join(".radar-pro.env");
    let content = fs::read_to_string(env_path)
        .map_err(|_| "Fichier de configuration Gemini introuvable.".to_string())?;

    for line in content.lines() {
        if let Some(value) = line.strip_prefix("GEMINI_API_KEY=") {
            let key = value.trim().trim_matches('"').trim_matches('\'');

            if !key.is_empty() && key != "TA_CLE_API_ICI" {
                return Ok(key.to_string());
            }
        }
    }

    Err("Clé API Gemini absente du fichier de configuration.".to_string())
}

fn documents_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("documents");

    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory)
}

fn safe_dossier_id(value: &str) -> Result<String, String> {
    if value.is_empty()
        || value.len() > 80
        || !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Identifiant de dossier invalide.".to_string());
    }

    Ok(value.to_string())
}

fn safe_file_name(value: &str) -> Result<String, String> {
    let name = Path::new(value)
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or("Nom de fichier invalide.")?;

    if name != value || name.is_empty() {
        return Err("Nom de fichier non autorisé.".to_string());
    }

    let cleaned = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();

    if cleaned.starts_with('.') {
        return Err("Nom de fichier non autorisé.".to_string());
    }

    Ok(cleaned)
}

fn extract_docx_text(bytes: &[u8]) -> Result<String, String> {
    let archive_cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(archive_cursor)
        .map_err(|_| "Fichier DOCX invalide.".to_string())?;

    let mut xml = String::new();

    {
        let mut document = archive
            .by_name("word/document.xml")
            .map_err(|_| "Contenu DOCX introuvable.".to_string())?;

        document
            .read_to_string(&mut xml)
            .map_err(|_| "Impossible de lire le contenu DOCX.".to_string())?;
    }

    let mut reader = quick_xml::Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut output = String::new();

    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Text(event)) => {
                let text = event
                    .decode()
                    .map_err(|_| "Texte DOCX illisible.".to_string())?;

                output.push_str(&text);
                output.push(' ');
            }
            Ok(quick_xml::events::Event::End(event)) => {
                if event.name().as_ref() == b"w:p" {
                    output.push('\n');
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => return Err("Erreur de lecture du texte DOCX.".to_string()),
            _ => {}
        }

        if output.len() > MAX_TEXT_CHARS {
            return Err("Le document contient trop de texte.".to_string());
        }
    }

    Ok(output)
}

fn extract_file_text(extension: &str, bytes: &[u8]) -> Result<String, String> {
    match extension {
        "pdf" => {
            pdf_extract::extract_text_from_mem(bytes)
                .map_err(|_| "Impossible d'extraire le texte du PDF. S'il s'agit d'un scan, un OCR sera nécessaire.".to_string())
        }
        "docx" => extract_docx_text(bytes),
        _ => Err("Format non pris en charge pour l'extraction.".to_string()),
    }
}

#[tauri::command]
async fn fetch_boamp_notices(today: String) -> Result<serde_json::Value, String> {
    const LIMIT: usize = 100;

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

    let where_clause = format!("datelimitereponse >= date'{}'", today);

    let mut all_results = Vec::new();
    let mut total_count = 0_u64;
    let mut offset = 0_usize;

    loop {
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
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|e| format!("Erreur de connexion au BOAMP : {}", e))?;

        let status = response.status();

        if !status.is_success() {
            return Err(format!("Le BOAMP a répondu avec le statut HTTP {}", status));
        }

        let page = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Impossible de lire les annonces BOAMP : {}", e))?;

        total_count = page["total_count"].as_u64().unwrap_or(total_count);

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
    if content.len() > MAX_UPLOAD_SIZE {
        return Err("Fichier trop volumineux (maximum 100 Mo).".to_string());
    }

    let extension = file_name.rsplit('.').next().unwrap_or("").to_lowercase();
    let allowed = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];

    if !allowed.contains(&extension.as_str()) {
        return Err("Format de fichier non autorisé.".to_string());
    }

    let directory = documents_directory(&app)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();

    let stored_name = format!("document_{}.{}", timestamp, extension);
    fs::write(directory.join(&stored_name), content).map_err(|e| e.to_string())?;

    Ok(stored_name)
}

#[tauri::command]
fn delete_document(
    app: tauri::AppHandle,
    stored_name: String,
) -> Result<(), String> {
    let file_name = safe_file_name(&stored_name)?;

    if !file_name.starts_with("document_") {
        return Err("Nom de fichier non autorisé.".to_string());
    }

    let directory = documents_directory(&app)?;
    fs::remove_file(directory.join(file_name)).map_err(|e| e.to_string())?;

    Ok(())
}
#[tauri::command]
fn delete_dce_document(
    app: tauri::AppHandle,
    dossier_id: String,
    stored_name: String,
) -> Result<(), String> {
    let dossier_id = safe_dossier_id(&dossier_id)?;
    let file_name = safe_file_name(&stored_name)?;

    let directory = documents_directory(&app)?
        .join("dce")
        .join(dossier_id);

    let path = directory.join(file_name);

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_document_path(
    app: tauri::AppHandle,
    stored_name: String,
) -> Result<String, String> {
    let file_name = safe_file_name(&stored_name)?;

    if !file_name.starts_with("document_") {
        return Err("Nom de fichier non autorisé.".to_string());
    }

    let extension = Path::new(&file_name)
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase();

    let allowed = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];

    if !allowed.contains(&extension.as_str()) {
        return Err("Format de fichier non autorisé.".to_string());
    }

    let path = documents_directory(&app)?.join(file_name);

    if !path.is_file() {
        return Err("Le document est introuvable.".to_string());
    }

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn download_dce(url: String) -> Result<serde_json::Value, String> {
    use scraper::{Html, Selector};
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    if !url.starts_with("https://") {
        return Err("Seules les adresses HTTPS sont acceptées.".to_string());
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .header("Accept", "application/pdf, application/zip, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/html")
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {}", e))?;

    if !response.status().is_success() {
        return Ok(serde_json::json!({
            "status": "manual",
            "message": "La plateforme nécessite une connexion ou une action manuelle."
        }));
    }

    let base_url = response.url().clone();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let content = response.bytes().await.map_err(|e| e.to_string())?;

    if content.is_empty() || content.len() > MAX_UPLOAD_SIZE {
        return Err("Fichier vide ou supérieur à 100 Mo.".to_string());
    }

    // Cas 1 : le lien mène directement à un PDF ou à une archive ZIP.
    if content.starts_with(b"%PDF-") || content.starts_with(b"PK") {
        let format = if content.starts_with(b"%PDF-") {
            "pdf"
        } else {
            "zip"
        };

        return Ok(serde_json::json!({
            "status": "downloaded",
            "file_name": format!("dce_telecharge.{}", format),
            "content": content.to_vec()
        }));
    }

    // Cas 2 : la page est HTML, on recherche les liens vers les documents.
    if !content_type.contains("text/html") {
        return Ok(serde_json::json!({
            "status": "manual",
            "message": "Le lien ne renvoie pas un document exploitable."
        }));
    }

    let links: Vec<String> = {
    let html = String::from_utf8_lossy(&content);
    let document = Html::parse_document(&html);

    let selector = Selector::parse("a[href]")
        .map_err(|e| format!("Erreur de lecture HTML : {:?}", e))?;

    document
        .select(&selector)
        .take(100)
        .filter_map(|element| {
            element.value().attr("href").map(str::to_string)
        })
        .collect()
    };

    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default();

    let mut count = 0usize;
    let mut total_size = 0usize;
    let mut zip_candidate: Option<Vec<u8>> = None;

    for href in links {

        let Ok(file_url) = base_url.join(&href) else {
            continue;
        };

        // On accepte uniquement HTTPS et le même domaine.
        if file_url.scheme() != "https"
            || file_url.host_str() != base_url.host_str()
        {
            continue;
        }

        let path = file_url.path().to_lowercase();

        let format = if path.ends_with(".pdf") {
            "pdf"
        } else if path.ends_with(".docx") {
            "docx"
        } else if path.ends_with(".zip") {
            "zip"
        } else {
            continue;
        };

        let file_response = match client.get(file_url.clone()).send().await {
            Ok(response) if response.status().is_success() => response,
            _ => continue,
        };

        let file_content = match file_response.bytes().await {
            Ok(bytes) if !bytes.is_empty() => bytes,
            _ => continue,
        };

        if file_content.len() > MAX_UPLOAD_SIZE
            || total_size + file_content.len() > MAX_UPLOAD_SIZE
        {
            continue;
        }

        // On vérifie le contenu réel du fichier.
        let valid = match format {
            "pdf" => file_content.starts_with(b"%PDF-"),
            "docx" | "zip" => file_content.starts_with(b"PK"),
            _ => false,
        };

        if !valid {
            continue;
        }

        if format == "zip" {
            if zip_candidate.is_none() {
                zip_candidate = Some(file_content.to_vec());
            }
            continue;
        }

        let name = file_url
            .path_segments()
            .and_then(|segments| segments.last())
            .filter(|name| !name.is_empty())
            .unwrap_or("document");

        let safe_name = sanitize_filename::sanitize(name);

        archive
            .start_file(safe_name, options)
            .map_err(|e| e.to_string())?;

        archive
            .write_all(&file_content)
            .map_err(|e| e.to_string())?;

        total_size += file_content.len();
        count += 1;

        if count >= 30 {
            break;
        }
    }

    // Si aucun PDF/DOCX n'a été trouvé, on utilise une archive ZIP trouvée.
    if count == 0 {
        if let Some(zip_content) = zip_candidate {
            return Ok(serde_json::json!({
                "status": "downloaded",
                "file_name": "dce_telecharge.zip",
                "content": zip_content
            }));
        }

        return Ok(serde_json::json!({
            "status": "manual",
            "message": "Aucun document public téléchargeable n'a été trouvé. Une connexion ou une action manuelle peut être nécessaire."
        }));
    }

    let finished = archive.finish().map_err(|e| e.to_string())?;
    let archive_content = finished.into_inner();

    Ok(serde_json::json!({
        "status": "downloaded",
        "file_name": "dce_documents.zip",
        "content": archive_content
    }))
}

#[tauri::command]
fn import_dce(
    app: tauri::AppHandle,
    dossier_id: String,
    file_name: String,
    content: Vec<u8>,
) -> Result<serde_json::Value, String> {
    let dossier_id = safe_dossier_id(&dossier_id)?;
    let original_name = safe_file_name(&file_name)?;

    if content.is_empty() || content.len() > MAX_UPLOAD_SIZE {
        return Err("Fichier vide ou supérieur à 100 Mo.".to_string());
    }

    let extension = Path::new(&original_name)
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !["pdf", "docx", "zip"].contains(&extension.as_str()) {
        return Err("Seuls les PDF, DOCX et ZIP sont acceptés.".to_string());
    }

    let base = documents_directory(&app)?
        .join("dce")
        .join(&dossier_id);

    fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();

    let mut files = Vec::new();
    let mut total_extracted = 0_u64;

    if extension == "zip" {
        let cursor = Cursor::new(content);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|_| "Archive ZIP invalide.".to_string())?;

        if archive.len() > MAX_ZIP_FILES {
            return Err("L'archive contient trop de fichiers (maximum 100).".to_string());
        }

        for index in 0..archive.len() {
            let mut entry = archive.by_index(index)
                .map_err(|_| "Impossible de lire une entrée ZIP.".to_string())?;

            if entry.is_dir() {
                continue;
            }

            let entry_name = entry.name().to_string();

            if entry_name.contains("..") || entry_name.starts_with('/') || entry_name.contains('\\') {
                continue;
            }

            let entry_extension = Path::new(&entry_name)
                .extension()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_lowercase();

            if !["pdf", "docx"].contains(&entry_extension.as_str()) {
                continue;
            }

            total_extracted = total_extracted.saturating_add(entry.size());

            if total_extracted > MAX_EXTRACTED_SIZE {
                return Err("Archive décompressée trop volumineuse.".to_string());
            }

            let mut bytes = Vec::new();
            entry.take(MAX_EXTRACTED_SIZE)
                .read_to_end(&mut bytes)
                .map_err(|_| "Erreur pendant la décompression.".to_string())?;

            let text = extract_file_text(&entry_extension, &bytes)?;
            let stored_name = format!("dce_{}_{}.{}", timestamp, index, entry_extension);
            fs::write(base.join(&stored_name), &bytes).map_err(|e| e.to_string())?;

            files.push(serde_json::json!({
                "name": entry_name,
                "stored_name": stored_name,
                "format": entry_extension,
                "text": text.chars().take(MAX_TEXT_CHARS).collect::<String>()
            }));
        }
    } else {
        let text = extract_file_text(&extension, &content)?;
        let stored_name = format!("dce_{}.{}", timestamp, extension);
        fs::write(base.join(&stored_name), &content).map_err(|e| e.to_string())?;

        files.push(serde_json::json!({
            "name": original_name,
            "stored_name": stored_name,
            "format": extension,
            "text": text.chars().take(MAX_TEXT_CHARS).collect::<String>()
        }));
    }

    if files.is_empty() {
        return Err("Aucun PDF ou DOCX exploitable trouvé dans le fichier.".to_string());
    }

    Ok(serde_json::json!({
        "dossier_id": dossier_id,
        "files": files,
        "count": files.len()
    }))
}

#[tauri::command]
async fn test_gemini() -> Result<String, String> {
    let api_key = read_gemini_api_key()?;
    let client = reqwest::Client::new();

    let response = client
        .post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"
        )
        .header("x-goog-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "contents": [{
                "parts": [{
                    "text": "Réponds simplement : RADAR PRO est connecté à Gemini."
                }]
            }]
        }))
        .send()
        .await
        .map_err(|_| "Impossible de contacter Gemini. Vérifie ta connexion Internet.".to_string())?;

    let status = response.status();

    if !status.is_success() {
        return Err(format!(
            "Gemini a refusé la requête (HTTP {}). Vérifie la clé et les quotas.",
            status
        ));
    }

    let data = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "Réponse Gemini illisible.".to_string())?;

    let answer = data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Gemini n'a pas renvoyé de texte exploitable.")?;

    Ok(answer.to_string())
}


#[tauri::command]
async fn analyze_dce(
    text: String,
    company_profile: serde_json::Value,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Aucun texte à analyser.".to_string());
    }


    let company_profile_json = serde_json::to_string_pretty(&company_profile)
        .map_err(|_| "Impossible de lire la fiche entreprise.".to_string())?;

    let api_key = read_gemini_api_key()?;
    let client = reqwest::Client::new();

    let prompt = format!(
        r#"Tu es un spécialiste des marchés publics français.
Analyse le DCE pour aider une entreprise à préparer sa réponse.

RÈGLES :
- Le DCE est la source des exigences du marché.
- La fiche entreprise est la source des informations concernant l'entreprise.
- N'invente aucune information.
- Si une information manque, indique « À compléter ».
- Distingue les obligations des simples recommandations.
- Signale les contradictions et les points à vérifier.
- Ne prétends jamais que l'entreprise est éligible sans preuves suffisantes.
- Cite le nom du document source lorsque possible.
- N'utilise pas les informations de l'entreprise pour modifier les exigences du DCE.

FICHE ENTREPRISE :
{company_profile_json}

CONTENU DU DCE :
{text}

Présente ton analyse avec ces rubriques :

1. IDENTIFICATION DU MARCHÉ
Acheteur, objet, lieu, procédure, lots et durée.

2. DATES IMPORTANTES
Date limite de réponse, visites, questions et autres échéances.

3. CONDITIONS DE PARTICIPATION
Compare les exigences du marché avec les informations disponibles sur l'entreprise.
Identifie les conditions remplies, non vérifiées ou manquantes.

4. DOCUMENTS À FOURNIR
Liste les pièces administratives et justificatifs obligatoires.
Précise lesquels devront être vérifiés dans la bibliothèque documentaire de l'entreprise.

5. EXIGENCES TECHNIQUES
Prestations demandées, contraintes et normes.

6. CRITÈRES DE NOTATION
Critères, sous-critères et pondérations exactes si disponibles.

7. ADÉQUATION DE L'ENTREPRISE
Présente les points correspondant aux capacités déclarées de l'entreprise.
Signale les informations manquantes et les éventuelles difficultés.
Ne présente jamais une simple déclaration comme une preuve documentaire.

8. POINTS DE VIGILANCE
Risques, incohérences, clauses importantes et éléments à clarifier.

9. CHECK-LIST DE RÉPONSE
Liste concrète des actions à réaliser avant le dépôt.
"#
    );

    
    let request_body = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    });

    let mut response = None;
    let delays = [0, 2, 4, 8];

    for (attempt, delay) in delays.iter().enumerate() {
        if *delay > 0 {
            std::thread::sleep(
                std::time::Duration::from_secs(*delay)
            );
            }

        let result = client
            .post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"
            )
            .header("x-goog-api-key", &api_key)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await;

        match result {
            Ok(res) if res.status().as_u16() == 503 && attempt < 3 => {
                continue;
            }
            Ok(res) => {
                response = Some(res);
                break;
            }
            Err(_) if attempt < 3 => {
                continue;
            }
            Err(_) => {
                return Err(
                    "Impossible de contacter Gemini après 4 tentatives.".to_string()
                );
            }
        }
    }

    let response = response.ok_or_else(|| {
        "Gemini reste temporairement indisponible après 4 tentatives.".to_string()
    })?;

    let status = response.status();

    if !status.is_success() {
        return Err(format!(
            "Erreur Gemini (HTTP {}). Vérifie la clé, les quotas ou la disponibilité du service.",
            status
        ));
    }

    let data = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "Réponse Gemini illisible.".to_string())?;

    data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|answer| answer.to_string())
        .ok_or_else(|| "Gemini n'a pas renvoyé d'analyse exploitable.".to_string())

}



#[tauri::command]
async fn open_dce_browser(
    app: tauri::AppHandle,
    url: String,
    dossier_id: String,
) -> Result<(), String> {
    let dossier_id = safe_dossier_id(&dossier_id)?;

    let parsed_url = reqwest::Url::parse(&url)
        .map_err(|_| "Adresse du marché invalide.".to_string())?;

    if parsed_url.scheme() != "https" {
        return Err("Seules les adresses HTTPS sont acceptées.".to_string());
    }

    // Réutilise la fenêtre si elle est déjà ouverte.
    if let Some(window) = app.get_webview_window("dce-browser") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let download_dir = documents_directory(&app)?
        .join("dce")
        .join(&dossier_id)
        .join("navigateur");

    fs::create_dir_all(&download_dir)
        .map_err(|e| e.to_string())?;

    let window = WebviewWindowBuilder::new(
        &app,
        "dce-browser",
        WebviewUrl::External(parsed_url),
    )
    .title("RADAR PRO - Consultation du marché")
    .inner_size(1200.0, 850.0)
    .on_download(move |_webview, event| {
        match event {
            DownloadEvent::Requested { url, destination } => {
                let filename = url
                    .path_segments()
                    .and_then(|segments| segments.last())
                    .unwrap_or("document");

                let filename = sanitize_filename::sanitize(filename);

                let extension = Path::new(&filename)
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();

                if !["pdf", "docx", "zip"].contains(&extension.as_str()) {
                    return false;
                }

                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let filename = format!("{}_{}", timestamp, filename);
                *destination = download_dir.join(filename);
            }
            DownloadEvent::Finished { url, path, success } => {
                eprintln!(
                    "Téléchargement : {} | {:?} | succès : {}",
                    url, path, success
                );
            }
            _ => {}
        }

        true
    })
    .build()
    .map_err(|e| format!("Impossible d'ouvrir le navigateur : {}", e))?;

    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_document,
            delete_document,
            delete_dce_document,
            get_document_path,
            fetch_boamp_notices,
            test_gemini,
            import_dce,
            download_dce,
            open_dce_browser,
            analyze_dce
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de RADAR PRO");
}
