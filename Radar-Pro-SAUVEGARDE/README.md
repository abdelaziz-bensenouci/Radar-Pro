# RADAR PRO Desktop

Prototype de logiciel Windows avec Tauri 2, React, TypeScript et SQLite local.

## Installation

Prérequis : Node.js LTS, Rust, Microsoft C++ Build Tools et WebView2 Runtime.

```powershell
npm install
npm run tauri dev
```

Pour générer un installateur Windows :

```powershell
npm run tauri build
```

Les données du profil entreprise sont enregistrées dans `sqlite:radarpro.db` via le plugin SQL de Tauri.
La collecte des appels d'offres et la synchronisation centrale ne sont pas encore implémentées.
Consulter `LISEZ-MOI.txt` pour les détails.
