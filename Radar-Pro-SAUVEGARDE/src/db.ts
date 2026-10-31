
import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

let database: Database | null = null;

export type CompanyProfile = {
  id?: number;
  company_name: string;
  siret: string;
  legal_form: string;
  vat_number: string;
  manager_name: string;
  phone: string;
  contact_email: string;
  website: string;
  address: string;
  postal_code: string;
  city: string;
  activity: string;
  secondary_activities: string;
  keywords: string;
  cpv_codes: string;
  intervention_area: string;
  intervention_radius_km: string;
  departments: string;
  communes: string;
  certifications: string;
  qualifications: string;
  habilitations: string;
  rc_insurer: string;
  rc_policy_number: string;
  rc_expiry: string;
  decennial_insurer: string;
  decennial_policy_number: string;
  decennial_expiry: string;
  workforce_total: string;
  workforce_supervisors: string;
  workforce_technicians: string;
  workforce_workers: string;
  vehicles: string;
  equipment: string;
  references: string;
  annual_revenue: string;
  financial_capacity: string;
  additional_info: string;
};

export type SavedDocument = {
  id?: number;
  name: string;
  category: string;
  storedName: string;
  created_at?: string;
};

export type Tender = {
  id?: number;
  source: string;
  external_id: string;
  title: string;
  description: string;
  buyer: string;
  buyer_identifier: string;
  location: string;
  department: string;
  cpv_codes: string;
  procedure: string;
  contract_type: string;
  published_at: string;
  deadline: string;
  estimated_value: string;
  source_url: string;
  dce_url: string;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type ResponseDossier = {
  id?: number;
  tender_id: number | null;
  tender_title: string;
  buyer: string;
  deadline: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export const profileFields = [
  'company_name',
  'siret',
  'legal_form',
  'vat_number',
  'manager_name',
  'phone',
  'contact_email',
  'website',
  'address',
  'postal_code',
  'city',
  'activity',
  'secondary_activities',
  'keywords',
  'cpv_codes',
  'intervention_area',
  'intervention_radius_km',
  'departments',
  'communes',
  'certifications',
  'qualifications',
  'habilitations',
  'rc_insurer',
  'rc_policy_number',
  'rc_expiry',
  'decennial_insurer',
  'decennial_policy_number',
  'decennial_expiry',
  'workforce_total',
  'workforce_supervisors',
  'workforce_technicians',
  'workforce_workers',
  'vehicles',
  'equipment',
  'references',
  'annual_revenue',
  'financial_capacity',
  'additional_info'
] as const;

export function createEmptyProfile(): CompanyProfile {
  return Object.fromEntries(
    profileFields.map((field) => [field, ''])
  ) as unknown as CompanyProfile;
}

export async function getDatabase() {
  if (!database) {
    database = await Database.load('sqlite:radarpro.db');

    await database.execute(`
      CREATE TABLE IF NOT EXISTS company_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        company_name TEXT NOT NULL DEFAULT '',
        siret TEXT NOT NULL DEFAULT '',
        activity TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        intervention_area TEXT NOT NULL DEFAULT '',
        contact_email TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration progressive : ajout des nouveaux champs
    // sans supprimer les anciennes données.
    for (const field of profileFields) {
      if (
        field === 'company_name' ||
        field === 'siret' ||
        field === 'activity' ||
        field === 'address' ||
        field === 'intervention_area' ||
        field === 'contact_email'
      ) {
        continue;
      }

      try {
        await database.execute(
          `ALTER TABLE company_profile ADD COLUMN "${field}" TEXT NOT NULL DEFAULT ''`
        );
      } catch (error) {
        const message = String(error).toLowerCase();

        if (!message.includes('duplicate column name')) {
          throw error;
        }
      }
    }

    await database.execute(`
      INSERT OR IGNORE INTO company_profile (id) VALUES (1);
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS saved_tenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        title TEXT NOT NULL,
        buyer TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        deadline TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
    `);
    await database.execute(`
      CREATE TABLE IF NOT EXISTS saved_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await database.execute(`
      CREATE TABLE IF NOT EXISTS response_dossiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER,
        tender_title TEXT NOT NULL DEFAULT '',
        buyer TEXT NOT NULL DEFAULT '',
        deadline TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'À préparer',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id)
      );
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS tenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        buyer TEXT NOT NULL DEFAULT '',
        buyer_identifier TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        procedure TEXT NOT NULL DEFAULT '',
        contract_type TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        deadline TEXT NOT NULL DEFAULT '',
        estimated_value TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        dce_url TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, external_id)
      );
    `);
    // Migration : ajout des informations géographiques et CPV.
      for (const column of ['department', 'cpv_codes']) {
        try {
          await database.execute(
            `ALTER TABLE tenders ADD COLUMN "${column}" TEXT NOT NULL DEFAULT ''`
          );
        } catch (error) {
          const message = String(error).toLowerCase();

          if (!message.includes('duplicate column name')) {
            throw error;
          }
        }
      }
  }

  return database;
}

export async function loadCompany(): Promise<CompanyProfile> {
  const db = await getDatabase();

  const rows = await db.select<CompanyProfile[]>(
    'SELECT * FROM company_profile WHERE id = 1'
  );

  return rows[0] ?? createEmptyProfile();
}

export async function saveCompany(profile: CompanyProfile) {
  const db = await getDatabase();

  const assignments = profileFields
    .map((field) => `"${field}" = ?`)
    .join(', ');

  const values = profileFields.map(
    (field) => profile[field] ?? ''
  );

  await db.execute(
    `UPDATE company_profile
     SET ${assignments},
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    values
  );
}

// Supprime toutes les informations du profil entreprise.
// Les autres données de l'application sont conservées.
export async function deleteCompany() {
  const db = await getDatabase();

  const assignments = profileFields
    .map((field) => `"${field}" = ''`)
    .join(', ');

  await db.execute(
    `UPDATE company_profile
     SET ${assignments},
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  );
}



export async function saveDocument(document: SavedDocument): Promise<string[]> {
  const db = await getDatabase();

  // Récupérer les anciens fichiers de cette catégorie.
  const previousDocuments = await db.select<{ storedName: string }[]>(
    `SELECT stored_name AS storedName
     FROM saved_documents
     WHERE category = ?`,
    [document.category]
  );

  // Enregistrer le nouveau document.
  await db.execute(
    `INSERT INTO saved_documents (name, category, stored_name)
     VALUES (?, ?, ?)`,
    [
      document.name,
      document.category,
      document.storedName,
    ]
  );

  // Supprimer les anciennes entrées de cette catégorie.
  await db.execute(
    `DELETE FROM saved_documents
     WHERE category = ?
     AND stored_name != ?`,
    [document.category, document.storedName]
  );

  // Renvoyer les anciens noms pour supprimer leurs fichiers physiques.
  return previousDocuments.map(item => item.storedName);
}



export async function loadDocuments(): Promise<SavedDocument[]> {
  const db = await getDatabase();

  return await db.select<SavedDocument[]>(
    `SELECT
       id,
       name,
       category,
       stored_name AS storedName,
       created_at
     FROM saved_documents
     ORDER BY id DESC`
  );
}

export async function deleteDocument(id: number) {
  const db = await getDatabase();

  await db.execute(
    'DELETE FROM saved_documents WHERE id = ?',
    [id]
  );
}

export async function upsertTender(tender: Tender) {
  const db = await getDatabase();

  await db.execute(
    `INSERT INTO tenders (
      source,
      external_id,
      title,
      description,
      buyer,
      buyer_identifier,
      location,
      department,
      cpv_codes,
      procedure,
      contract_type,
      published_at,
      deadline,
      estimated_value,
      source_url,
      dce_url,
      last_seen_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(source, external_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      buyer = excluded.buyer,
      buyer_identifier = excluded.buyer_identifier,
      location = excluded.location,
      department = excluded.department,
      cpv_codes = excluded.cpv_codes,
      procedure = excluded.procedure,
      contract_type = excluded.contract_type,
      published_at = excluded.published_at,
      deadline = excluded.deadline,
      estimated_value = excluded.estimated_value,
      source_url = excluded.source_url,
      dce_url = excluded.dce_url,
      last_seen_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP`,
    [
      tender.source,
      tender.external_id,
      tender.title,
      tender.description ?? '',
      tender.buyer ?? '',
      tender.buyer_identifier ?? '',
      tender.location ?? '',
      tender.department ?? '',
      tender.cpv_codes ?? '',
      tender.procedure ?? '',
      tender.contract_type ?? '',
      tender.published_at ?? '',
      tender.deadline ?? '',
      tender.estimated_value ?? '',
      tender.source_url ?? '',
      tender.dce_url ?? '',
    ]
  );
}

export async function deleteExpiredTenders() {
  const db = await getDatabase();

  await db.execute(
    `DELETE FROM tenders
     WHERE deadline IS NOT NULL
       AND TRIM(deadline) != ''
       AND date(substr(deadline, 1, 10)) < date('now', 'localtime')`
  );
}

export async function loadTenders(): Promise<Tender[]> {
  const db = await getDatabase();

  return await db.select<Tender[]>(
    `SELECT *
     FROM tenders
     ORDER BY published_at DESC, id DESC`
  );
}

export async function loadResponseDossiers(): Promise<ResponseDossier[]> {
  const db = await getDatabase();

  return await db.select<ResponseDossier[]>(
    `SELECT
       id,
       tender_id,
       tender_title,
       buyer,
       deadline,
       status,
       created_at,
       updated_at
     FROM response_dossiers
     ORDER BY updated_at DESC, id DESC`
  );
}

export async function createResponseDossier(
  tender: Tender
): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `INSERT INTO response_dossiers (
       tender_id,
       tender_title,
       buyer,
       deadline,
       status
     ) VALUES (?, ?, ?, ?, ?)`,
    [
      tender.id ?? null,
      tender.title,
      tender.buyer,
      tender.deadline,
      'À préparer',
    ]
  );
}

export async function updateResponseDossierStatus(
  id: number,
  status: string
): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `UPDATE response_dossiers
     SET status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, id]
  );
}

export async function deleteResponseDossier(
  id: number
): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    'DELETE FROM response_dossiers WHERE id = ?',
    [id]
  );
}

type BoampNotice = {
  idweb?: string;
  objet?: string;
  nomacheteur?: string;
  code_departement?: string[];
  code_departement_prestation?: string | null;
  descripteur_code?: string[];
  dateparution?: string;
  datelimitereponse?: string;
  donnees?: string;
  procedure_libelle?: string;
  type_marche_facette?: string[];
  url_avis?: string;
};

type BoampResponse = {
  results?: BoampNotice[];
};

export async function syncBoampTenders(): Promise<number> {
  const now = new Date();

  const today =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const response = await invoke<BoampResponse>('fetch_boamp_notices', {
    today,
  });
  const notices = response.results ?? [];

  

  let imported = 0;

  for (const notice of notices) {
    const deadline = notice.datelimitereponse?.slice(0, 10) ?? '';

    if (!notice.idweb || !notice.objet || !deadline || deadline < today) {
      continue;
    }

    let details: any = {};

    try {
      details = notice.donnees ? JSON.parse(notice.donnees) : {};
    } catch {
      details = {};
    }

    const department =
      notice.code_departement_prestation ||
      notice.code_departement?.join(', ') ||
      '';

    const cpvCodes = new Set<string>();

    const cpv = details?.OBJET?.CPV;

    if (Array.isArray(cpv)) {
      for (const item of cpv) {
        if (item?.PRINCIPAL) cpvCodes.add(item.PRINCIPAL);
      }
    } else if (cpv?.PRINCIPAL) {
      cpvCodes.add(cpv.PRINCIPAL);
    }

    await upsertTender({
      source: 'BOAMP',
      external_id: notice.idweb,
      title: notice.objet,
      description: details?.OBJET?.OBJET_COMPLET ?? notice.objet,
      buyer: notice.nomacheteur ?? '',
      buyer_identifier: '',
      location: details?.OBJET?.LIEU_EXEC_LIVR?.ADRESSE ?? '',
      department,
      cpv_codes: Array.from(cpvCodes).join(', '),
      procedure: notice.procedure_libelle ?? '',
      contract_type: notice.type_marche_facette?.join(', ') ?? '',
      published_at: notice.dateparution ?? '',
      deadline,
      estimated_value: '',
      source_url: notice.url_avis ?? '',
      dce_url: '',
    });

    imported++;
  }

  await deleteExpiredTenders();

  return imported;
}