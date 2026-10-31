import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import {
  Activity,
  Building2,
  BriefcaseBusiness,
  ClipboardList,
  Settings,
  LayoutDashboard,
  Save,
  ShieldCheck,
  FileText,
  FolderOpen,
  Search,
  ChevronUp,
  ChevronDown,
  Bell,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import {
  CompanyProfile,
  SavedDocument,
  Tender,
  createEmptyProfile,
  loadCompany,
  saveCompany,
  deleteCompany,
  saveDocument,
  loadDocuments,
  deleteDocument,
  loadTenders,
  syncBoampTenders,
  ResponseDossier,
  loadResponseDossiers,
  createResponseDossier,
  updateResponseDossierStatus,
  deleteResponseDossier,
  saveDceDocument,
  loadDceDocuments,
  saveDceAnalysis,
  loadDceAnalyses,
  deleteDceDocument,
} from './db';

type Section = 'dashboard' | 'company' | 'documents' | 'markets' | 'responses' | 'settings';

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
};

function Field({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
}: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder = '',
}: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [section, setSection] = useState<Section>('dashboard');
  const [profile, setProfile] = useState<CompanyProfile>(createEmptyProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadCompany()
      .then((data) => setProfile(data))
      .catch((error) => {
        console.error('Erreur de chargement du profil :', error);
        setMessage('Impossible de charger les données de l’entreprise.');
      })
      .finally(() => setLoading(false));
  }, []);

  function updateField(field: keyof CompanyProfile, value: string) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave() {
    setMessage('');

    // Vérification du SIRET
    const siret = profile.siret.replace(/\s/g, '');

    if (siret !== '' && !/^\d{14}$/.test(siret)) {
      setMessage('Le SIRET doit contenir exactement 14 chiffres.');
      return;
    }

    // Vérification de l'adresse e-mail
    if (
      profile.contact_email.trim() !== '' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contact_email.trim())
    ) {
      setMessage("L'adresse e-mail semble incorrecte.");
      return;
    }

    // Vérification du téléphone
    if (profile.phone.trim() !== '') {
      const phone = profile.phone.replace(/[\s.()/-]/g, '');

      if (!/^(?:\+33|0033|0)\d{9}$/.test(phone)) {
        setMessage('Le numéro de téléphone semble incorrect.');
        return;
      }
    }

    // Vérification du rayon d'intervention
    const radius = profile.intervention_radius_km.trim();

    if (
      radius !== '' &&
      (!/^\d+(?:[.,]\d+)?$/.test(radius) ||
        !Number.isFinite(Number(radius.replace(',', '.'))))
    ) {
      setMessage('Le rayon d’intervention doit être un nombre valide.');
      return;
    }

    if (radius !== '' && Number(radius.replace(',', '.')) < 0) {
      setMessage('Le rayon d’intervention ne peut pas être négatif.');
      return;
    }

    // Vérification des effectifs
    const workforceFields = [
      profile.workforce_total,
      profile.workforce_supervisors,
      profile.workforce_technicians,
      profile.workforce_workers,
    ];

    for (const value of workforceFields) {
      const trimmedValue = value.trim();

      if (trimmedValue !== '' && !/^\d+$/.test(trimmedValue)) {
        setMessage('Les effectifs doivent être des nombres entiers positifs ou nuls.');
        return;
      }
    }

    setSaving(true);

    try {
      await saveCompany(profile);
      setMessage('Profil entreprise enregistré avec succès.');
    } catch (error) {
      console.error(error);
      setMessage('Erreur lors de l’enregistrement du profil.');
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    const confirmed = window.confirm(
      'Attention : toutes les informations du profil de cette entreprise seront définitivement supprimées. Les marchés enregistrés ne seront pas supprimés.\n\nVoulez-vous vraiment continuer ?'
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage('');

    try {
      await deleteCompany();
      setProfile(createEmptyProfile());
      setMessage('Les informations de l’entreprise ont été supprimées.');
    } catch (error) {
      console.error(error);
      setMessage('Erreur lors de la suppression de l’entreprise.');
    } finally {
      setSaving(false);
    }
  }

  const navigation = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'company', label: 'Mon entreprise', icon: Building2 },
    { id: 'documents', label: 'Mes documents', icon: FolderOpen },
    { id: 'markets', label: 'Marchés publics', icon: BriefcaseBusiness },
    { id: 'responses', label: 'Mes réponses', icon: ClipboardList },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ] as const;

  if (loading) {
    return <div className="app-loading">Chargement de RADAR PRO...</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={23} />
          </div>
          <div>
            <strong>RADAR PRO</strong>
            <span>VEILLE MARCHÉS PUBLICS</span>
          </div>
        </div>

        <div className="sidebar-label">MENU PRINCIPAL</div>

        <nav>
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                className={`nav-item ${section === item.id ? 'active' : ''}`}
                onClick={() => {
                  setSection(item.id);
                  setMessage('');
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-status">
            <span className="status-dot" />
            Stockage local actif
          </div>
          <span className="version">RADAR PRO v0.1.0</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">RADAR PRO / </span>
            <strong>{navigation.find((item) => item.id === section)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <ShieldCheck size={15} /> Données privées
            </span>
            <Bell size={19} />
          </div>
        </header>

        {message && (
          <div className="app-message">
            {message.includes('succès') ? (
              <CheckCircle2 size={17} />
            ) : (
              <AlertCircle size={17} />
            )}
            {message}
          </div>
        )}

        {section === 'dashboard' && (
          <Dashboard
            profile={profile}
            onNavigate={setSection}
          />
        )}

        {section === 'company' && (
          <CompanyPage
            profile={profile}
            updateField={updateField}
            onSave={handleSave}
            onDelete={handleDelete}
            saving={saving}
          />
        )}

        {section === 'documents' && <DocumentsPage />}

        {section === 'markets' && <MarketsPage profile={profile} />}

        {section === 'responses' && <ResponsesPage />}

        {section === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

const departmentAliases: Record<string, string> = {
  'AIN': '01',
  'AISNE': '02',
  'ALLIER': '03',
  'ALPES-DE-HAUTE-PROVENCE': '04',
  'HAUTES-ALPES': '05',
  'ALPES-MARITIMES': '06',
  'ARDECHE': '07',
  'ARDENNES': '08',
  'ARIEGE': '09',
  'AUBE': '10',
  'AUDE': '11',
  'AVEYRON': '12',
  'BOUCHES-DU-RHONE': '13',
  'CALVADOS': '14',
  'CANTAL': '15',
  'CHARENTE': '16',
  'CHARENTE-MARITIME': '17',
  'CHER': '18',
  'CORREZE': '19',
  'CORSE-DU-SUD': '2A',
  'HAUTE-CORSE': '2B',
  'COTE-DOR': '21',
  'COTES-DARMOR': '22',
  'CREUSE': '23',
  'DORDOGNE': '24',
  'DOUBS': '25',
  'DROME': '26',
  'EURE': '27',
  'EURE-ET-LOIR': '28',
  'FINISTERE': '29',
  'GARD': '30',
  'HAUTE-GARONNE': '31',
  'GERS': '32',
  'GIRONDE': '33',
  'HERAULT': '34',
  'ILLE-ET-VILAINE': '35',
  'INDRE': '36',
  'INDRE-ET-LOIRE': '37',
  'ISERE': '38',
  'JURA': '39',
  'LANDES': '40',
  'LOIR-ET-CHER': '41',
  'LOIRE': '42',
  'HAUTE-LOIRE': '43',
  'LOIRE-ATLANTIQUE': '44',
  'LOIRET': '45',
  'LOT': '46',
  'LOT-ET-GARONNE': '47',
  'LOZERE': '48',
  'MAINE-ET-LOIRE': '49',
  'MANCHE': '50',
  'MARNE': '51',
  'HAUTE-MARNE': '52',
  'MAYENNE': '53',
  'MEURTHE-ET-MOSELLE': '54',
  'MEUSE': '55',
  'MORBIHAN': '56',
  'MOSELLE': '57',
  'NIEVRE': '58',
  'NORD': '59',
  'OISE': '60',
  'ORNE': '61',
  'PAS-DE-CALAIS': '62',
  'PUY-DE-DOME': '63',
  'PYRENEES-ATLANTIQUES': '64',
  'HAUTES-PYRENEES': '65',
  'PYRENEES-ORIENTALES': '66',
  'BAS-RHIN': '67',
  'HAUT-RHIN': '68',
  'RHONE': '69',
  'HAUTE-SAONE': '70',
  'SAONE-ET-LOIRE': '71',
  'SARTHE': '72',
  'SAVOIE': '73',
  'HAUTE-SAVOIE': '74',
  'PARIS': '75',
  'SEINE-MARITIME': '76',
  'SEINE-ET-MARNE': '77',
  'YVELINES': '78',
  'DEUX-SEVRES': '79',
  'SOMME': '80',
  'TARN': '81',
  'TARN-ET-GARONNE': '82',
  'VAR': '83',
  'VAUCLUSE': '84',
  'VENDEE': '85',
  'VIENNE': '86',
  'HAUTE-VIENNE': '87',
  'VOSGES': '88',
  'YONNE': '89',
  'TERRITOIRE-DE-BELFORT': '90',
  'ESSONNE': '91',
  'HAUTS-DE-SEINE': '92',
  'SEINE-SAINT-DENIS': '93',
  'VAL-DE-MARNE': '94',
  'VAL-D-OISE': '95',
};

function normalizeDepartment(value: string) {
  const normalized = value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '-')
    .replace(/\s+/g, '-');

  return departmentAliases[normalized] ?? normalized;
}

function Dashboard({
  profile,
  onNavigate,
}: {
  profile: CompanyProfile;
  onNavigate: (section: Section) => void;
}) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDashboardTenders() {
      try {
        const data = await loadTenders();

        if (active) {
          setTenders(data);
        }
      } catch (error) {
        console.error('Erreur de chargement du tableau de bord :', error);
      } finally {
        if (active) {
          setLoadingTenders(false);
        }
      }
    }

    void loadDashboardTenders();

    return () => {
      active = false;
    };
  }, []);

  
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function splitValues(value: string) {
  return value
    .split(/[,;\n\r]+/)
    .map(item => normalize(item))
    .filter(item => item.length > 1);
}

const companyTerms = [
  ...splitValues(profile.activity),
  ...splitValues(profile.secondary_activities),
  ...splitValues(profile.keywords),
  ...splitValues(profile.certifications),
  ...splitValues(profile.qualifications),
  ...splitValues(profile.habilitations),
];

const companyCpv = profile.cpv_codes.match(/\d{8}/g) ?? [];

const relevantTenders = tenders.filter(tender => {
  const title = normalize(tender.title);
  const description = normalize(tender.description);
  const tenderCpv = tender.cpv_codes.match(/\d{8}/g) ?? [];

  const activityMatch = companyTerms.some(term =>
    title.includes(term) || description.includes(term)
  );

  const cpvMatch = companyCpv.some(companyCode =>
    tenderCpv.some(tenderCode =>
      tenderCode === companyCode ||
      tenderCode.slice(0, 5) === companyCode.slice(0, 5)
    )
  );

  const companyDepartments = splitValues(profile.departments)
  .map(normalizeDepartment)
  .filter(value => /^(?:\d{2,3}|2A|2B)$/.test(value));

  const tenderDepartments = tender.department
    .split(/[,;\s]+/)
    .map(value => value.trim().toUpperCase());

  const departmentMatch =
    companyDepartments.length === 0 ||
    companyDepartments.some(dep => tenderDepartments.includes(dep));

  return (activityMatch || cpvMatch) && departmentMatch;
  });

const latestTenders = [...relevantTenders]
  .sort((a, b) =>
    b.published_at.localeCompare(a.published_at)
  )
  .slice(0, 5);


  return (
    <div className="page-content">
      <div className="welcome-card">
        <div>
          <span className="eyebrow">VOTRE ESPACE PROFESSIONNEL</span>
          <h1>
            Bonjour{profile.company_name ? `, ${profile.company_name}` : ''} !
          </h1>
          <p>
            Retrouvez ici votre veille des marchés publics et vos dossiers de réponse.
          </p>
          <button
            className="primary-button"
            onClick={() => onNavigate('markets')}
          >
            <Search size={17} /> Explorer les marchés
          </button>
        </div>
        <div className="welcome-graphic">
          <Activity size={100} />
        </div>
      </div>

      <div className="stats-grid">
        <Stat
          icon={<Search />}
          label="Marchés détectés"
          value={loadingTenders ? '...' : String(relevantTenders.length)}
        />
        <Stat
          icon={<ClipboardList />}
          label="Dossiers en cours"
          value="À venir"
        />
        <Stat
          icon={<CheckCircle2 />}
          label="Réponses préparées"
          value="À venir"
        />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h3>Dernières opportunités</h3>

          {loadingTenders ? (
            <div className="empty-state">
              <p>Chargement des marchés...</p>
            </div>
          ) : latestTenders.length === 0 ? (
            <div className="empty-state">
              <Search size={30} />
              <p>Aucun marché disponible pour le moment.</p>
              <span>Lancez une synchronisation BOAMP pour importer des opportunités.</span>
            </div>
          ) : (
            <div className="step-list">
              {latestTenders.map(tender => (
                <div key={`${tender.source}-${tender.external_id}`}>
                  <span>
                    <BriefcaseBusiness size={17} />
                  </span>
                  <p>
                    <strong>{tender.title}</strong>
                    <br />
                    {tender.buyer || 'Acheteur non renseigné'}
                    <br />
                    <small>
                      {tender.department || 'Département non renseigné'}
                    </small>
                  </p>
                </div>
              ))}
              <button
                className="secondary-button"
                onClick={() => onNavigate('markets')}
              >
                Voir tous les marchés
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>Préparer votre entreprise</h3>
          <div className="step-list">
            <div>
              <span>01</span>
              <p>Compléter le profil entreprise</p>
            </div>
            <div>
              <span>02</span>
              <p>Configurer votre zone d'intervention</p>
            </div>
            <div>
              <span>03</span>
              <p>Ajouter vos références et certifications</p>
            </div>
            <div>
              <span>04</span>
              <p>Rechercher des marchés pertinents</p>
            </div>
          </div>
          <button
            className="secondary-button"
            onClick={() => onNavigate('company')}
          >
            <Building2 size={16} /> Compléter mon entreprise
          </button>
        </div>
      </div>
    </div>
  );
}


function CompanyPage({
  profile,
  updateField,
  onSave,
  onDelete,
  saving,
}: {
  profile: CompanyProfile;
  updateField: (field: keyof CompanyProfile, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const field = (name: keyof CompanyProfile, label: string, placeholder = '') => (
    <Field
      label={label}
      value={String(profile[name] ?? '')}
      placeholder={placeholder}
      onChange={(value) => updateField(name, value)}
    />
  );

  const area = (name: keyof CompanyProfile, label: string, placeholder = '') => (
    <TextAreaField
      label={label}
      value={String(profile[name] ?? '')}
      placeholder={placeholder}
      onChange={(value) => updateField(name, value)}
    />
  );

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONFIGURATION</span>
          <h1>Mon entreprise</h1>
          <p>
            Ces informations permettront à RADAR PRO d'évaluer la pertinence
            des marchés publics pour votre entreprise.
          </p>
        </div>

        <div className="company-actions">
          <button
            className="danger-button"
            onClick={onDelete}
            disabled={saving}
          >
            Supprimer cette entreprise
          </button>

          <button
            className="primary-button"
            onClick={onSave}
            disabled={saving}
          >
            <Save size={17} />
            {saving ? 'Enregistrement...' : 'Enregistrer le profil'}
          </button>
        </div>
      </div>

      <div className="company-sections">

        <section className="form-section">
          <SectionTitle
            title="1. Identité juridique"
            description="Informations administratives et coordonnées de votre entreprise."
          />
          <div className="documents-form-grid">
            {field('company_name', 'Nom de l’entreprise')}
            {field('legal_form', 'Forme juridique', 'SARL, SAS, EI...')}
            {field('siret', 'Numéro SIRET', '14 chiffres')}
            {field('vat_number', 'Numéro de TVA intracommunautaire')}
            {field('manager_name', 'Dirigeant / Responsable')}
            {field('phone', 'Téléphone', '06...')}
            {field('contact_email', 'Adresse e-mail')}
            {field('website', 'Site internet', 'https://')}
            {field('address', 'Adresse')}
            {field('postal_code', 'Code postal')}
            {field('city', 'Ville')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="2. Activités et savoir-faire"
            description="Décrivez précisément les prestations proposées."
          />
          <div className="form-grid">
            {area('activity', 'Activité principale')}
            {area('secondary_activities', 'Activités secondaires')}
            {area('keywords', 'Mots-clés de recherche', 'Ex : plomberie, rénovation, entretien...')}
            {area('cpv_codes', 'Codes CPV connus', 'Ex : 45210000')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="3. Zone d’intervention"
            description="Définissez votre secteur géographique de travail."
          />
          <div className="form-grid">
            {field('intervention_area', 'Zone d’intervention')}
            {field('intervention_radius_km', 'Rayon d’intervention en kilomètres')}
            {area('departments', 'Départements couverts')}
            {area('communes', 'Communes couvertes')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="4. Certifications et qualifications"
            description="Références professionnelles et habilitations de votre entreprise."
          />
          <div className="form-grid">
            {area('certifications', 'Certifications')}
            {area('qualifications', 'Qualifications professionnelles')}
            {area('habilitations', 'Habilitations')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="5. Assurances professionnelles"
            description="Informations relatives aux assurances obligatoires ou utiles."
          />
          <h3>Responsabilité civile professionnelle</h3>
          <div className="form-grid">
            {field('rc_insurer', 'Assureur RC professionnelle')}
            {field('rc_policy_number', 'Numéro de contrat RC')}
            {field('rc_expiry', 'Date d’expiration RC')}
          </div>

          <h3>Garantie décennale</h3>
          <div className="form-grid">
            {field('decennial_insurer', 'Assureur décennale')}
            {field('decennial_policy_number', 'Numéro de contrat décennale')}
            {field('decennial_expiry', 'Date d’expiration décennale')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="6. Moyens humains"
            description="Effectifs et organisation de votre entreprise."
          />
          <div className="form-grid">
            {field('workforce_total', 'Effectif total')}
            {field('workforce_supervisors', 'Encadrement')}
            {field('workforce_technicians', 'Techniciens')}
            {field('workforce_workers', 'Ouvriers')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="7. Moyens matériels"
            description="Véhicules, équipements et matériels disponibles."
          />
          <div className="form-grid">
            {area('vehicles', 'Véhicules')}
            {area('equipment', 'Matériel et équipements')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="8. Références et capacités financières"
            description="Expériences et informations financières de l’entreprise."
          />
          <div className="form-grid">
            {area('references', 'Références de chantiers et clients')}
            {field('annual_revenue', 'Chiffre d’affaires annuel')}
            {area('financial_capacity', 'Capacités financières')}
          </div>
        </section>

        <section className="form-section">
          <SectionTitle
            title="9. Informations complémentaires"
            description="Tout élément utile pour mieux présenter votre entreprise."
          />
          <div className="form-grid">
            {area('additional_info', 'Informations complémentaires')}
          </div>
        </section>

      </div>

      <div className="form-footer">
        <button className="primary-button" onClick={onSave} disabled={saving}>
          <Save size={17} />
          {saving ? 'Enregistrement...' : 'Enregistrer toutes les informations'}
        </button>
      </div>
    </div>
  );
}



function MarketsPage({ profile }: { profile: CompanyProfile }) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState('');

  const [search, setSearch] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [sortBy, setSortBy] = useState('relevance');
  const [activeTender, setActiveTender] = useState<Tender | null>(null);

  async function refreshTenders() {
    try {
      const data = await loadTenders();
      setTenders(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshTenders();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError('');

    try {
      const imported = await syncBoampTenders();
      await refreshTenders();
      setLastSync(new Date().toLocaleString('fr-FR'));
      alert(`${imported} annonce(s) BOAMP importée(s) ou actualisée(s).`);
    } catch (err) {
      setError(`Erreur de synchronisation : ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  function normalize(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function splitValues(value: string) {
    return value
      .split(/[,;\n\r]+/)
      .map(item => normalize(item))
      .filter(item => item.length > 1);
  }

  const companyTerms = [
    ...splitValues(profile.activity),
    ...splitValues(profile.secondary_activities),
    ...splitValues(profile.keywords),
    ...splitValues(profile.certifications),
    ...splitValues(profile.qualifications),
    ...splitValues(profile.habilitations),
  ];

  const companyCpv: string[] = profile.cpv_codes.match(/\d{8}/g) ?? [];

  
  function getRelevance(tender: Tender) {
    let score = 0;
    const reasons: string[] = [];

    const title = normalize(tender.title);
    const description = normalize(tender.description);
    const text = `${title} ${description}`;
    const tenderCpv: string[] = tender.cpv_codes.match(/\d{8}/g) ?? [];

    const titleMatch = companyTerms.some(term => title.includes(term));
    const descriptionMatch = companyTerms.some(term => text.includes(term));

    if (titleMatch) {
      score += 30;
      reasons.push('Activité reconnue dans le titre');
    } else if (descriptionMatch) {
      score += 15;
      reasons.push('Activité reconnue dans la description');
    }

    const exactCpvMatch = companyCpv.some(cpv =>
      tenderCpv.includes(cpv)
    );

    const familyCpvMatch = companyCpv.some(cpv =>
      tenderCpv.some(code => code.slice(0, 5) === cpv.slice(0, 5))
    );

    if (exactCpvMatch) {
      score += 30;
      reasons.push('Code CPV exact');
    } else if (familyCpvMatch) {
      score += 15;
      reasons.push('Famille CPV correspondante');
    }


    const companyDepartments = splitValues(profile.departments)
      .map(normalizeDepartment)
      .filter(value => /^(?:\d{2,3}|2A|2B)$/.test(value));

    const tenderDepartments = tender.department
      .split(/[,;\s]+/)
      .map(value => value.trim().toUpperCase());

    if (companyDepartments.some(dep => tenderDepartments.includes(dep))) {
      score += 15;
      reasons.push('Département couvert par votre entreprise');
    }

    return {
      score: Math.min(score, 100),
      reasons: [...new Set(reasons)],
    };
  }

  const departments = Array.from(
    new Set([
      ...tenders.flatMap(tender =>
        tender.department
          .split(/[,;\s]+/)
          .map(value => value.trim().toUpperCase())
          .filter(value => /^(?:\d{2,3}|2A|2B)$/.test(value))
      ),
      ...splitValues(profile.departments)
        .map(normalizeDepartment)
        .filter(value => /^(?:\d{2,3}|2A|2B)$/.test(value)),
    ])
  ).sort((a, b) => a.localeCompare(b, 'fr'));
  useEffect(() => {
    const companyDepartments = splitValues(profile.departments)
      .map(normalizeDepartment)
      .filter(value => /^(?:\d{2,3}|2A|2B)$/.test(value));

    setSelectedDepartments(companyDepartments);
  }, [profile.departments]);

  const contractTypes = Array.from(
    new Set(
      tenders
        .map(tender => tender.contract_type.trim())
        .filter(Boolean)
    )
  ).sort();

  const filteredTenders = tenders
  .map(tender => {
    const match = getRelevance(tender);

    return {
      tender,
      relevance: match.score,
      reasons: match.reasons,
    };
  })
    .filter(({ tender, reasons }) => {
      const searchText = normalize(search);
      const fullText = normalize(
        `${tender.title} ${tender.description} ${tender.buyer} ${tender.cpv_codes} ${tender.department}`
      );

      if (searchText && !fullText.includes(searchText)) {
        return false;
      }

      if (selectedType && tender.contract_type !== selectedType) {
        return false;
      }

      if (selectedDepartments.length > 0) {
        const tenderDepartments = tender.department
          .split(/[,;\s]+/)
          .map(value => value.trim().toUpperCase());

        if (!selectedDepartments.some(dep => tenderDepartments.includes(dep))) {
          return false;
        }
      }

      const hasActivityMatch = reasons.some(reason =>
        reason.includes('Activité reconnue')
      );

      const hasCpvMatch = reasons.some(reason =>
        reason.includes('CPV')
      );

      if (relevantOnly && !hasActivityMatch && !hasCpvMatch) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'relevance') {
        return b.relevance - a.relevance;
      }

      if (sortBy === 'deadline') {
        return a.tender.deadline.localeCompare(b.tender.deadline);
      }

      return b.tender.published_at.localeCompare(a.tender.published_at);
    });
  
  
async function handleRespondToTender(tender: Tender) {
  if (!tender.id) {
    setError("Impossible d'identifier ce marché.");
    return;
  }

  try {
    setError('');

    const dossiers = await loadResponseDossiers();

    const existingDossier = dossiers.find(
      dossier => dossier.tender_id === tender.id
    );

    let dossierId: number;

    if (existingDossier) {
      dossierId = existingDossier.id!;
    } else {
      dossierId = await createResponseDossier(tender);
    }

    setActiveTender({
      ...tender,
      responseDossierId: dossierId,
    } as Tender);

  } catch (err) {
    console.error(err);
    setError("Impossible d'ouvrir le dossier de réponse.");
  }
}

  function formatDate(value: string) {
    if (!value) return 'Non renseignée';

    const date = new Date(`${value.slice(0, 10)}T12:00:00`);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('fr-FR');
  }

  function toggleDepartment(department: string) {
    setSelectedDepartments(current =>
      current.includes(department)
        ? current.filter(item => item !== department)
        : [...current, department]
    );
  }
  if (activeTender) {
  return (
    <TenderResponseWorkspace
      tender={activeTender}
      profile={profile}
      onBack={() => setActiveTender(null)}
    />
  );
}



function TenderResponseWorkspace({
  tender,
  profile,
  onBack,
}: {
  tender: Tender & { responseDossierId?: number };
  profile: CompanyProfile;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState('');
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState('');

  const dossierId = tender.responseDossierId ?? 0;

  useEffect(() => {
    if (dossierId === 0) return;

    async function loadSavedData() {
      try {
        const documents = await loadDceDocuments(dossierId);
        const analyses = await loadDceAnalyses(dossierId);

        setFiles(documents as any[]);

        if (analyses.length > 0) {
          setAnalysis((analyses[0] as any).analysis);
        }
      } catch (err) {
        console.error(err);
        setError("Impossible de charger les données du dossier.");
      }
    }

    loadSavedData();
  }, [dossierId]);
  
async function handleOpenDceBrowser() {
  if (!tender.dce_url || !dossierId) return;

  setError('');
  setLoadingDownload(true);

  try {
    await invoke('open_dce_browser', {
      url: tender.dce_url,
      dossierId: String(dossierId),
    });
  } catch (err) {
    console.error(err);
    setError(String(err));
  } finally {
    setLoadingDownload(false);
  }
}

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length || !dossierId) return;

    setError('');
    setLoadingImport(true);

    try {
      for (const file of selectedFiles) {
        const content = Array.from(
          new Uint8Array(await file.arrayBuffer())
        );

        const result = await invoke<any>('import_dce', {
          dossierId: String(dossierId),
          fileName: file.name,
          content,
        });

        for (const importedFile of result.files) {
          await saveDceDocument(
            dossierId,
            importedFile.name,
            importedFile.stored_name,
            importedFile.format,
            importedFile.text || ''
          );

          setFiles(previous => [
            ...previous,
            {
              ...importedFile,
              extracted_text: importedFile.text || '',
            },
          ]);
        }
      }
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoadingImport(false);
      event.target.value = '';
    }
  }
  async function handleDeleteDocument(file: any) {
    if (!dossierId || !file.stored_name) return;

    const confirmed = window.confirm(
      `Veux-tu vraiment supprimer le document "${file.name}" ?`
    );

    if (!confirmed) return;

    try {
      setError('');

      await invoke('delete_dce_document', {
        dossierId: String(dossierId),
        storedName: file.stored_name,
      });

      await deleteDceDocument(dossierId, file.stored_name);

      setFiles(previous =>
        previous.filter(item => item.stored_name !== file.stored_name)
      );
    } catch (err) {
      console.error(err);
      setError(`Impossible de supprimer le document : ${String(err)}`);
    }
  }
  
async function handleAnalysis() {
  if (!files.length || !dossierId) return;

  if (!window.confirm(
    "Les textes des documents du DCE ainsi que les informations de la fiche entreprise seront envoyés à Google Gemini pour analyse. Les documents de la bibliothèque (Kbis, assurances, RIB, logo, etc.) ne sont pas transmis. Continuer ?"
  )) return;

  setError('');
  setLoadingAnalysis(true);

  try {
    const text = files
      .map(file =>
        `DOCUMENT : ${file.name}\n\n${file.text || file.extracted_text || ''}`
      )
      .join('\n\n--------------------\n\n');

    const result = await invoke<string>('analyze_dce', {
      text,
      companyProfile: profile,
    });

    await saveDceAnalysis(dossierId, result);
    setAnalysis(result);
  } catch (err) {
    console.error(err);
    setError(String(err));
  } finally {
    setLoadingAnalysis(false);
  }
}


  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ASSISTANT DE RÉPONSE</span>
          <h1>Répondre à cet appel d'offres</h1>
          <p>{tender.title}</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          Retour aux marchés
        </button>
      </div>

      <div className="panel">
        <h2>Informations du marché</h2>
        <p><strong>Acheteur :</strong> {tender.buyer || 'Non renseigné'}</p>
        <p><strong>Échéance :</strong> {tender.deadline || 'Non renseignée'}</p>
        <p><strong>Département :</strong> {tender.department || 'Non renseigné'}</p>
        <p><strong>Source :</strong> {tender.source}</p>
      </div>

      <div className="panel">
        <h2>1. Documents du DCE</h2>
        <p>Importe les documents transmis par l'acheteur public.</p>

        
        {tender.dce_url && (
          <button
            type="button"
            className="primary-button"
            onClick={handleOpenDceBrowser}
            disabled={loadingDownload || loadingImport}
          >
            {loadingDownload
              ? 'Ouverture en cours...'
              : 'Ouvrir la consultation et récupérer le DCE'}
          </button>
        )}


        <input
          type="file"
          accept=".pdf,.docx,.zip"
          multiple
          onChange={handleImport}
          disabled={loadingImport || !dossierId}
        />

        {loadingImport && <p>Import et sauvegarde en cours...</p>}

        {files.map((file, index) => (
          <div
            className="response-card"
            key={`${file.stored_name}-${index}`}
          >
            <div>
              <h3>{file.name}</h3>
              <p>{file.format.toUpperCase()}</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleDeleteDocument(file)}
            >
              🗑️ Supprimer
            </button>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>2. Analyse des exigences par IA</h2>
        <p>
          Gemini examine les documents pour identifier les obligations,
          les critères de notation, les échéances et les points de vigilance.
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={handleAnalysis}
          disabled={!files.length || loadingAnalysis || loadingImport}
        >
          {loadingAnalysis ? 'Analyse en cours...' : 'Analyser le DCE avec l’IA'}
        </button>

        {error && (
          <p role="alert" style={{ color: '#dc2626' }}>{error}</p>
        )}

        {analysis && (
          <div className="panel" style={{ marginTop: 20 }}>
            <h3>Dernière analyse enregistrée</h3>
            <pre style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontFamily: 'inherit',
            }}>
              {analysis}
            </pre>
            <p>
              Vérifie toujours les informations dans les documents originaux.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}




  
return (
  <div className="page-content">
    <div className="page-heading">
      <div>
        <span className="eyebrow">VEILLE TERRITORIALE</span>
        <h1>Marchés publics</h1>
        <p>
          Les opportunités nationales classées selon le profil de votre entreprise.
        </p>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="primary-button"
      >
        {syncing ? 'Synchronisation...' : 'Synchroniser le BOAMP'}
      </button>
    </div>

    {error && (
      <div className="panel" style={{ color: '#dc2626', marginBottom: 16 }}>
        {error}
      </div>
    )}

    <div className="panel" style={{ marginBottom: 20 }}>
      <h2>Veille BOAMP</h2>
      <p>
        <strong>{tenders.length}</strong> consultation(s) enregistrée(s).
      </p>
      <p>
        <strong>{filteredTenders.length}</strong> résultat(s) après filtrage.
      </p>
      {lastSync && <p>Dernière synchronisation : {lastSync}</p>}
    </div>

    <div className="panel" style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setFiltersOpen(!filtersOpen)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 18,
          fontWeight: 600,
          color: 'inherit',
        }}
      >
        Filtres de recherche
        {filtersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {filtersOpen && (
        <div>
          <div className="form-grid">
            <div className="form-field">
              <label>Recherche par mot-clé</label>
              <input
                type="text"
                placeholder="Ex : rénovation, plomberie..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Type de marché</label>
              <select
                value={selectedType}
                onChange={event => setSelectedType(event.target.value)}
              >
                <option value="">Tous les types</option>
                {contractTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Classer les résultats</label>
              <select
                value={sortBy}
                onChange={event => setSortBy(event.target.value)}
              >
                <option value="relevance">Pertinence entreprise</option>
                <option value="publication">Date de publication</option>
                <option value="deadline">Date limite de réponse</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={relevantOnly}
                onChange={event => setRelevantOnly(event.target.checked)}
              />
              Afficher uniquement les marchés correspondant à mon activité
            </label>
          </div>

          <div style={{ marginTop: 20 }}>
            <strong>Départements</strong>

            <p style={{ color: '#64748b', fontSize: 13 }}>
              Aucun département sélectionné : tous les départements sont affichés.
            </p>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 12,
            }}>
              {departments.map(department => (
                <label
                  key={department}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDepartments.includes(department)}
                    onChange={() => toggleDepartment(department)}
                  />
                  {department}
                </label>
              ))}
            </div>

            {selectedDepartments.length > 0 && (
              <button
                className="secondary-button"
                style={{ marginTop: 12 }}
                onClick={() => setSelectedDepartments([])}
              >
                Effacer les départements sélectionnés
              </button>
            )}
          </div>
        </div>
      )}
    </div>

    {loading ? (
      <div className="panel">Chargement des consultations...</div>
    ) : filteredTenders.length === 0 ? (
      <div className="panel empty-large">
        <Search size={42} />
        <h2>Aucun résultat</h2>
        <p>
          Modifiez vos filtres ou lancez une synchronisation BOAMP.
        </p>
      </div>
    ) : (
      <div style={{ display: 'grid', gap: 16 }}>
        {filteredTenders.map(({ tender, relevance, reasons }) => (
          <div
            className="panel"
            key={`${tender.source}-${tender.external_id}`}
          >
            <div>
              <span className="eyebrow">
                {tender.source} · {tender.contract_type || 'Marché public'}
              </span>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                <h2 style={{ marginTop: 8 }}>{tender.title}</h2>

                <span style={{
                  background: relevance > 0 ? '#dcfce7' : '#f1f5f9',
                  color: relevance > 0 ? '#166534' : '#475569',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  Score de correspondance : {relevance}/100
                </span>

                {reasons.length > 0 && (
                  <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
                    Correspondances : {reasons.join(' · ')}
                  </p>
                )}
              </div>

              <p>{tender.buyer || 'Acheteur non renseigné'}</p>
              <p>Département : {tender.department || 'Non renseigné'}</p>
              <p>Localisation : {tender.location || 'Non renseignée'}</p>
              <p>Date de publication : {formatDate(tender.published_at)}</p>

              <p>
                Date limite de réponse :{' '}
                <strong>{formatDate(tender.deadline)}</strong>
              </p>

              {tender.cpv_codes && (
                <p>Codes CPV : {tender.cpv_codes}</p>
              )}

              {tender.source_url && (
                <a
                  href={tender.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Consulter l'avis BOAMP
                </a>
              )}

              {tender.dce_url && (
                <a
                  className="dce-link"
                  href={tender.dce_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Accéder au DCE
                </a>
              )}
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleRespondToTender(tender)}
                >
                  <FileText size={17} style={{ marginRight: 8 }} />
                  Répondre à cet appel d'offres
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

}





function ResponsesPage() {
  const [dossiers, setDossiers] = useState<ResponseDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refreshData() {
    try {
      const loadedDossiers = await loadResponseDossiers();
      setDossiers(loadedDossiers);
    } catch (err) {
      console.error(err);
      setError('Impossible de charger les dossiers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  async function handleStatusChange(id: number, status: string) {
    try {
      await updateResponseDossierStatus(id, status);
      await refreshData();
    } catch (err) {
      console.error(err);
      setError('Impossible de modifier le statut.');
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Supprimer définitivement ce dossier ?')) return;

    try {
      await deleteResponseDossier(id);
      await refreshData();
    } catch (err) {
      console.error(err);
      setError('Impossible de supprimer le dossier.');
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTION DES CANDIDATURES</span>
          <h1>Mes réponses</h1>
          <p>Retrouvez et suivez vos dossiers de réponse aux marchés publics.</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="panel">
        <div className="section-heading">
          <h2>Mes dossiers de candidature</h2>
          <span>{dossiers.length} dossier(s)</span>
        </div>

        {loading ? (
          <p>Chargement des dossiers...</p>
        ) : dossiers.length === 0 ? (
          <div className="empty-large">
            <FileText size={38} />
            <h2>Aucun dossier pour le moment</h2>
            <p>
              Pour commencer, choisissez un marché public dans l'onglet
              Marchés publics et cliquez sur « Préparer une réponse ».
            </p>
          </div>
        ) : (
          <div className="response-list">
            {dossiers.map(dossier => (
              <div className="response-card" key={dossier.id}>
                <div>
                  <h3>{dossier.tender_title}</h3>
                  <p>{dossier.buyer || 'Acheteur non renseigné'}</p>
                  <p>
                    Échéance : {dossier.deadline || 'Non renseignée'}
                  </p>
                </div>

                <div className="response-actions">
                  <select
                    value={dossier.status}
                    onChange={event =>
                      handleStatusChange(dossier.id!, event.target.value)
                    }
                    aria-label={`Statut de ${dossier.tender_title}`}
                  >
                    <option>À préparer</option>
                    <option>En préparation</option>
                    <option>À vérifier</option>
                    <option>Validé</option>
                    <option>Envoyé</option>
                  </select>

                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDelete(dossier.id!)}
                  >
                    <Trash2 size={16} />
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}




function SettingsPage() {
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiMessage, setGeminiMessage] = useState('');

  async function handleTestGemini() {
    setTestingGemini(true);
    setGeminiMessage('');

    try {
      const answer = await invoke<string>('test_gemini');
      setGeminiMessage(answer);
    } catch (error) {
      console.error('Erreur Gemini :', error);
      setGeminiMessage(`Échec du test : ${String(error)}`);
    } finally {
      setTestingGemini(false);
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">APPLICATION</span>
          <h1>Paramètres</h1>
          <p>Configuration générale de RADAR PRO.</p>
        </div>
      </div>

      <div className="panel settings-panel">
        <div>
          <ShieldCheck size={22} />
          <div>
            <strong>Stockage local</strong>
            <p>Les données de votre entreprise sont conservées dans la base locale SQLite.</p>
          </div>
        </div>

        <div>
          <Activity size={22} />
          <div>
            <strong>Synchronisation</strong>
            <p>La synchronisation des marchés n'est pas encore configurée.</p>
          </div>
        </div>

        <div>
          <Settings size={22} />
          <div>
            <strong>Version de l'application</strong>
            <p>RADAR PRO 0.1.0</p>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>Intelligence artificielle</h2>
        <p>Connexion à Google Gemini pour l'analyse et la préparation des dossiers de réponse.</p>

        <button
          type="button"
          className="primary-button"
          onClick={handleTestGemini}
          disabled={testingGemini}
        >
          {testingGemini ? 'Test en cours...' : 'Tester la connexion Gemini'}
        </button>

        {geminiMessage && (
          <p style={{ marginTop: 15 }}>
            {geminiMessage}
          </p>
        )}
      </div>
    </div>
  );
}



function DocumentsPage() {
  const categories = [
    'Documents administratifs',
    'Assurances',
    'Certifications et qualifications',
    'Références professionnelles',
    'Logo de l’entreprise (facultatif)',
    'Coordonnées bancaires (RIB)',
  ];

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState(categories[0]);
  const [uploadedDocuments, setUploadedDocuments] = useState<SavedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  // Charger les documents enregistrés au démarrage.
  useEffect(() => {
    let active = true;

    async function loadSavedDocuments() {
      try {
        const documents = await loadDocuments();

        if (active) {
          setUploadedDocuments(documents);
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setMessage(`Erreur de chargement des documents : ${String(error)}`);
        }
      }
    }

    loadSavedDocuments();

    return () => {
      active = false;
    };
  }, []);

  async function handleUpload() {
    if (!selectedFile) {
      setMessage('Veuillez sélectionner un fichier.');
      return;
    }

    const isLogo = category === "Logo de l’entreprise (facultatif)";
    const isRib = category === "Coordonnées bancaires (RIB)";

    if (
      isRib &&
      !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)
    ) {
      setMessage('Le RIB doit être au format PDF, JPG, PNG ou WebP.');
      return;
    }

    if (
      isLogo &&
      !['image/png', 'image/jpeg', 'image/webp'].includes(selectedFile.type)
    ) {
      setMessage('Le logo doit être au format PNG, JPG ou WebP.');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      const content = Array.from(
        new Uint8Array(await selectedFile.arrayBuffer())
      );

      const storedName = await invoke<string>('save_document', {
        fileName: selectedFile.name,
        content,
      });

      const previousDocuments = await saveDocument({
        name: selectedFile.name,
        category,
        storedName,
      });

      // Supprimer physiquement les anciens fichiers.
      for (const previousStoredName of previousDocuments) {
        try {
          await invoke('delete_document', {
            storedName: previousStoredName,
          });
        } catch (error) {
          console.error(
            'Impossible de supprimer un ancien fichier :',
            error
          );
        }
      }

      const documents = await loadDocuments();
      setUploadedDocuments(documents);

      setSelectedFile(null);
      setMessage(
        isLogo
          ? 'Logo importé avec succès.'
          : isRib
            ? 'RIB importé avec succès.'
            : 'Document importé avec succès.'
      );
    } catch (error) {
      console.error(error);
      setMessage(`Erreur lors de l'importation : ${String(error)}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(document: SavedDocument) {
    if (!window.confirm(`Voulez-vous vraiment supprimer "${document.name}" ?`)) {
      return;
    }

    if (document.id === undefined) {
      setMessage('Impossible d’identifier ce document.');
      return;
    }

    try {
      await invoke('delete_document', {
        storedName: document.storedName,
      });

      await deleteDocument(document.id);

      const documents = await loadDocuments();
      setUploadedDocuments(documents);

      setMessage('Document supprimé avec succès.');
    } catch (error) {
      console.error(error);
      setMessage(`Erreur lors de la suppression : ${String(error)}`);
    }
  }

  async function handleOpenDocument(document: SavedDocument) {
  try {
    const path = await invoke<string>('get_document_path', {
      storedName: document.storedName,
    });

    await openPath(path);
  } catch (error) {
    console.error(error);
    setMessage(`Impossible d'ouvrir le document : ${String(error)}`);
  }
}

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTION DOCUMENTAIRE</span>
          <h1>Mes documents</h1>
          <p>
            Centralisez les documents administratifs et professionnels
            de votre entreprise.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>Importer un document</h2>
        <p>
          Sélectionnez un fichier et choisissez sa catégorie.
        </p>

        <div className="form-grid">
          <div className="form-field">
            <label>Catégorie du document</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Fichier à importer</label>

            <input
              type="file"
              accept={
                category === "Logo de l’entreprise (facultatif)"
                  ? ".png,.jpg,.jpeg,.webp"
                  : category === "Coordonnées bancaires (RIB)"
                    ? ".pdf,.jpg,.jpeg,.png,.webp"
                    : ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              }
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
          </div>
        </div>

        {selectedFile && (
          <p>
            Fichier sélectionné : <strong>{selectedFile.name}</strong>
          </p>
        )}

        <button
          className="primary-button documents-upload-button"
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
        >
          <FolderOpen size={17} />
          {uploading ? 'Importation...' : 'Importer le document'}
        </button>

        {message && <p>{message}</p>}
      </div>

      <div className="panel">
        <h2>Mes fichiers importés</h2>

        {uploadedDocuments.length === 0 ? (
          <div className="empty-large">
            <FileText size={38} />
            <p>Aucun document importé pour le moment.</p>
          </div>
        ) : (
          <div className="document-list">
            {uploadedDocuments.map((document) => (
              <div className="document-item" key={document.id}>
                <FileText size={22} />
                <div className="document-info">
                  <div className="document-title-row">
                    <button
                        type="button"
                        className="document-open-button"
                        onClick={() => handleOpenDocument(document)}
                        title="Ouvrir ce document"
                      >
                        {document.name}
                      </button>

                    <button
                      type="button"
                      className="document-delete-button"
                      title="Supprimer ce document"
                      aria-label={`Supprimer ${document.name}`}
                      onClick={() => handleDelete(document)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <p>{document.category}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


