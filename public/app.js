// ═══════════════════════════════════════════════════════════════
//  Transit Pro — Application SPA
// ═══════════════════════════════════════════════════════════════

const API = '/api';
let token = localStorage.getItem('transit_token');
let currentUser = null;
let currentPage = 'dashboard';

// ── HTTP helper ──────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

// ── Formatters ───────────────────────────────────────────────────
function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s); if (isNaN(d)) return s;
  return d.toLocaleDateString('fr-FR');
}
function fmtDateInput(s) {
  if (!s) return '';
  return s.slice(0, 10);
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(statut, type) {
  const maps = {
    dossier:  { ouvert:'info', en_cours:'warning', cloture:'neutral' },
    facture:  { brouillon:'neutral', emise:'info', payee:'success', partielle:'warning', annulee:'danger' },
    devis:    { brouillon:'neutral', envoye:'info', accepte:'success', refuse:'danger', expire:'neutral', facture:'purple' },
    preavis:  { en_attente:'warning', arrive:'info', traite:'success' },
  };
  const labels = {
    ouvert:'Ouvert', en_cours:'En cours', cloture:'Clôturé',
    brouillon:'Brouillon', emise:'Émise', payee:'Payée', partielle:'Partielle', annulee:'Annulée',
    envoye:'Envoyé', accepte:'Accepté', refuse:'Refusé', expire:'Expiré', facture:'Facturé',
    en_attente:'En attente', arrive:'Arrivé', traite:'Traité',
  };
  const cls = (maps[type] || {})[statut] || 'neutral';
  const lbl = labels[statut] || statut;
  return `<span class="badge badge-${cls}">${lbl}</span>`;
}

function typeTransportIcon(m) {
  return { maritime:'🚢', aerien:'✈️', routier:'🚛', ferroviaire:'🚂' }[m] || '📦';
}

// ── Toast ────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal ────────────────────────────────────────────────────────
function openModal(title, bodyHtml, size = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const m = document.getElementById('modal');
  m.className = 'modal ' + size;
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('modalOverlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalOverlay').style.display = 'none';
}

// ── Auth ─────────────────────────────────────────────────────────
async function login(loginVal, pass) {
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.querySelector('span').textContent = 'Connexion…';
  try {
    const data = await api('POST', '/auth/login', { login: loginVal, mot_de_passe: pass });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('transit_token', token);
    showApp();
  } catch (e) {
    document.getElementById('loginError').textContent = e.message;
    document.getElementById('loginError').classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.querySelector('span').textContent = 'Se connecter';
  }
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('transit_token');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

const CYCLE_ETAPES = [
  '1. Ouverture du dossier',
  '2. Réception des documents / marchandises',
  '3. Déclaration en douane',
  '4. Contrôle / inspection douanière',
  '5. Paiement des débours',
  '6. Dédouanement obtenu',
  '7. Transport vers destination',
  '8. Livraison au client',
  '9. Facturation finale',
  '10. Clôture du dossier'
];

let notifPollInterval = null;

function renderNavigation() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || !currentUser) return;
  const role = currentUser.role;

  let links = [];
  if (role === 'client') {
    links = [
      { page: 'dossiers', icon: '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>', label: 'Mes Dossiers' },
      { page: 'devis', icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 14H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>', label: 'Mes Devis' },
      { page: 'factures', icon: '<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>', label: 'Mes Factures' },
      { page: 'preavis', icon: '<svg viewBox="0 0 24 24"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/></svg>', label: 'Préavis' }
    ];
  } else if (role === 'agent') {
    links = [
      { page: 'dossiers', icon: '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>', label: 'Dossiers assignés' },
      { page: 'declarer_etape', icon: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>', label: 'Déclarer étape' },
      { page: 'my_declarations', icon: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>', label: 'Mes déclarations' },
      { page: 'preavis', icon: '<svg viewBox="0 0 24 24"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/></svg>', label: 'Préavis' }
    ];
  } else {
    links = [
      { page: 'dashboard', icon: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>', label: 'Tableau de bord' },
      { page: 'validation', icon: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>', label: 'Validation étapes', badgeId: 'pendingQueueBadge' },
      { page: 'clients', icon: '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>', label: 'Clients' },
      { page: 'dossiers', icon: '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>', label: 'Dossiers' },
      { page: 'devis', icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 14H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>', label: 'Devis' },
      { page: 'factures', icon: '<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>', label: 'Factures' },
      { page: 'debours', icon: '<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>', label: 'Débours' },
      { page: 'preavis', icon: '<svg viewBox="0 0 24 24"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/></svg>', label: 'Préavis' },
      { page: 'parametres', icon: '<svg viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>', label: 'Paramètres' }
    ];
  }

  nav.innerHTML = links.map(l => `
    <a class="nav-link" data-page="${l.page}" onclick="navigate('${l.page}')">
      ${l.icon}
      <span>${l.label}</span>
      ${l.badgeId ? `<span class="badge badge-warning hidden" id="${l.badgeId}" style="margin-left:auto">0</span>` : ''}
    </a>
  `).join('');
}

function setupNotifications() {
  const btn = document.getElementById('notifBtn');
  const dropdown = document.getElementById('notifDropdown');
  const markBtn = document.getElementById('markAllReadBtn');

  if (btn && dropdown) {
    btn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
      if (!dropdown.classList.contains('hidden')) {
        loadNotifications();
      }
    };
    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target) && e.target !== btn) {
        dropdown.classList.add('hidden');
      }
    });
  }

  if (markBtn) {
    markBtn.onclick = async () => {
      try {
        await api('PATCH', '/notifications/read-all');
        loadNotifications();
      } catch {}
    };
  }

  loadNotifications();
  if (notifPollInterval) clearInterval(notifPollInterval);
  notifPollInterval = setInterval(loadNotifications, 12000);
}

async function loadNotifications() {
  if (!token || !currentUser) return;
  try {
    const res = await api('GET', '/notifications');
    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (res.unread > 0) {
        badge.textContent = res.unread > 99 ? '99+' : res.unread;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    const list = document.getElementById('notifList');
    if (list) {
      if (!res.notifications || res.notifications.length === 0) {
        list.innerHTML = `<div class="empty-state-sm">Aucune notification</div>`;
      } else {
        list.innerHTML = res.notifications.map(n => `
          <div class="notif-item ${n.lu ? '' : 'unread'}" onclick="handleNotifClick(${n.id}, ${n.dossier_id || 'null'})">
            <div>${esc(n.message)}</div>
            <span class="notif-time">${fmtDate(n.date_creation)}</span>
          </div>
        `).join('');
      }
    }

    if (['superviseur', 'admin'].includes(currentUser.role)) {
      try {
        const pending = await api('GET', '/etapes/pending');
        const qBadge = document.getElementById('pendingQueueBadge');
        if (qBadge) {
          if (pending && pending.length > 0) {
            qBadge.textContent = pending.length;
            qBadge.classList.remove('hidden');
          } else {
            qBadge.classList.add('hidden');
          }
        }
      } catch {}
    }
  } catch {}
}

async function handleNotifClick(id, dossierId) {
  try {
    await api('PATCH', `/notifications/${id}/read`);
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.classList.add('hidden');
    loadNotifications();
    if (dossierId) {
      dossierDetail(dossierId);
    }
  } catch {}
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  const n = (currentUser.prenom || '') + ' ' + currentUser.nom;
  document.getElementById('userName').textContent = n.trim() || currentUser.login;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('userAvatar').textContent = (currentUser.nom || currentUser.login)[0].toUpperCase();
  
  renderNavigation();
  setupNotifications();

  // Page de redirection selon rôle
  if (currentUser.role === 'client') {
    navigate('dossiers');
  } else if (currentUser.role === 'agent') {
    navigate('dossiers');
  } else {
    navigate('dashboard');
  }
}

// ── Navigation ───────────────────────────────────────────────────
const pageTitles = {
  dashboard: 'Tableau de bord',
  validation: 'Validation des étapes',
  declarer_etape: 'Déclarer une étape',
  my_declarations: 'Mes déclarations',
  clients: 'Clients',
  dossiers: 'Dossiers',
  devis: 'Devis',
  factures: 'Factures',
  debours: 'Débours',
  preavis: 'Préavis d\'arrivée',
  parametres: 'Gestion & Paramètres'
};

function navigate(page, params = {}) {
  // Contrôle de sécurité navigation
  if (currentUser.role === 'client' && !['dossiers', 'devis', 'factures', 'preavis'].includes(page)) {
    page = 'dossiers';
  } else if (currentUser.role === 'agent' && !['dossiers', 'declarer_etape', 'my_declarations', 'preavis'].includes(page)) {
    page = 'dossiers';
  }

  currentPage = page;
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  
  const ta = document.getElementById('topbarActions');
  ta.innerHTML = '';
  const newBtns = {
    clients:  { label:'+ Nouveau client',   fn: () => openClientForm() },
    dossiers: { label:'+ Nouveau dossier',  fn: () => openDossierForm() },
    devis:    { label:'+ Nouveau devis',    fn: () => openDevisForm() },
    factures: { label:'+ Nouvelle facture', fn: () => openFactureForm() },
    debours:  { label:'+ Débours',          fn: () => openDebourForm() },
    preavis:  { label:'+ Nouveau préavis',  fn: () => openPreavisForm() },
  };

  // Masquer boutons de création pour le rôle client
  if (currentUser.role !== 'client' && newBtns[page]) {
    const b = document.createElement('button');
    b.className = 'btn btn-primary';
    b.textContent = newBtns[page].label;
    b.onclick = newBtns[page].fn;
    ta.appendChild(b);
  }

  const renders = {
    dashboard, validation, declarer_etape, my_declarations, clients, dossiers, devis, factures, debours, preavis, parametres
  };
  const fn = renders[page];
  if (fn) fn(params);
}

function setContent(html) {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="page-enter">' + html + '</div>';
}

// ── Select helpers ───────────────────────────────────────────────
async function loadOpts(sel, url, vf, lf, placeholder = '— Choisir —') {
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  try {
    const data = await api('GET', url);
    const rows = data.data || data;
    rows.forEach(r => {
      const o = document.createElement('option');
      o.value = r[vf]; o.textContent = r[lf];
      sel.appendChild(o);
    });
  } catch {}
}

// ════════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════════
async function dashboard() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const d = await api('GET', '/dashboard');
    const s = d.stats;

    const monthName = (ym) => {
      if (!ym) return '';
      const [y, m] = ym.split('-');
      return new Date(y, m - 1).toLocaleDateString('fr-FR', { month:'short' });
    };

    // Bar chart
    const evol = d.evolution_mensuelle || [];
    const maxN = Math.max(...evol.map(e => e.n), 1);
    const barChart = evol.map(e => `
      <div class="chart-bar-col">
        <div class="chart-bar" style="height:${Math.round((e.n/maxN)*64)+4}px"
             title="${e.n} dossier(s)"></div>
        <span class="chart-label">${monthName(e.mois)}</span>
      </div>`).join('');

    // Répartition
    const rep = d.repartition_type || [];
    const repTotal = rep.reduce((a, r) => a + r.n, 0) || 1;
    const repColors = { I:'#6c47ff', E:'#f59e0b', T:'#10b981' };
    const repPills = rep.map(r => `
      <div class="rep-pill">
        <span class="rep-dot" style="background:${repColors[r.code]||'#6b6880'}"></span>
        <span>${r.libelle}</span>
        <strong>${r.n}</strong>
        <span class="text-muted text-sm">${Math.round(r.n/repTotal*100)}%</span>
      </div>`).join('');

    // Dernières factures
    const lastFac = (d.dernieres_factures || []).map(f => `
      <tr onclick="navigate('factures')">
        <td class="td-mono">${esc(f.numero)}</td>
        <td>${esc(f.raison_sociale)}</td>
        <td>${fmtDate(f.date_facture)}</td>
        <td>${statusBadge(f.statut,'facture')}</td>
        <td class="fw-600">${fmtMoney(f.montant_ttc)}</td>
      </tr>`).join('') || `<tr><td colspan="5"><div class="empty" style="padding:20px">Aucune facture</div></td></tr>`;

    // Prochains préavis
    const nextPre = (d.prochains_arrivees || []).map(p => `
      <tr onclick="navigate('preavis')">
        <td>${typeTransportIcon(p.moyen_transport)} ${esc(p.transporteur||'—')}</td>
        <td>${esc(p.raison_sociale)}</td>
        <td>${fmtDate(p.date_arrivee_prevue)}</td>
        <td>${esc(p.ref_dossier)}</td>
      </tr>`).join('') || `<tr><td colspan="4"><div class="empty" style="padding:20px">Aucun préavis</div></td></tr>`;

    setContent(`
      <div class="stats-grid">
        <div class="stat-card c-accent" onclick="navigate('clients')" style="cursor:pointer">
          <div class="stat-value">${s.clients}</div>
          <div class="stat-label">Clients actifs</div>
        </div>
        <div class="stat-card c-warning" onclick="navigate('dossiers')" style="cursor:pointer">
          <div class="stat-value">${s.dossiers_en_cours}</div>
          <div class="stat-label">Dossiers en cours</div>
          <div class="stat-sub">${s.dossiers} au total</div>
        </div>
        <div class="stat-card c-danger" onclick="navigate('factures')" style="cursor:pointer">
          <div class="stat-value">${s.factures_impayees}</div>
          <div class="stat-label">Factures impayées</div>
        </div>
        <div class="stat-card c-success">
          <div class="stat-value" style="font-size:18px">${fmtMoney(s.ca_mois)}</div>
          <div class="stat-label">CA ce mois</div>
          <div class="stat-sub">Total: ${fmtMoney(s.ca_total)}</div>
        </div>
        <div class="stat-card c-amber">
          <div class="stat-value" style="font-size:18px">${fmtMoney(s.debours_mois)}</div>
          <div class="stat-label">Débours ce mois</div>
        </div>
        <div class="stat-card c-info" onclick="navigate('preavis')" style="cursor:pointer">
          <div class="stat-value">${(d.prochains_arrivees||[]).length}</div>
          <div class="stat-label">Préavis à venir</div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:20px">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Évolution des dossiers (6 mois)</span>
          </div>
          <div class="chart-bar-wrap">${barChart || '<span class="text-muted text-sm">Pas de données</span>'}</div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Répartition Import / Export</span></div>
          <div class="repartition-pills" style="margin-top:8px">${repPills || '<span class="text-muted text-sm">Pas de données</span>'}</div>
          <div style="margin-top:16px;font-size:28px;font-weight:700;color:var(--accent)">${s.dossiers_mois}</div>
          <div class="stat-label">dossiers créés ce mois</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Dernières factures</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Statut</th><th>Montant</th></tr></thead>
              <tbody>${lastFac}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Prochains préavis</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Transporteur</th><th>Client</th><th>Arrivée</th><th>Dossier</th></tr></thead>
              <tbody>${nextPre}</tbody>
            </table>
          </div>
        </div>
      </div>`);
  } catch (e) {
    setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

// ════════════════════════════════════════════════════════════════
//  CLIENTS
// ════════════════════════════════════════════════════════════════
let clientSearch = '';
async function clients() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const d = await api('GET', `/clients?q=${encodeURIComponent(clientSearch)}&limit=100`);
    const rows = d.data.map(c => `
      <tr onclick="clientDetail(${c.id})">
        <td class="td-mono fw-600">${esc(c.code)}</td>
        <td>${esc(c.raison_sociale)}</td>
        <td>${esc(c.ville||'—')}</td>
        <td>${esc(c.secteur_lib||'—')}</td>
        <td>${esc(c.telephone||'—')}</td>
        <td><span class="badge badge-info">${c.nb_dossiers}</span></td>
        <td onclick="event.stopPropagation()">
          <div class="flex gap-2">
            <button class="btn btn-icon btn-ghost" title="Modifier" onclick="openClientForm(${c.id})">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('') || `<tr><td colspan="7"><div class="empty"><div class="empty-icon">👥</div><p>Aucun client trouvé</p></div></td></tr>`;
    setContent(`
      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" id="clientSearchInput" placeholder="Rechercher un client…" value="${esc(clientSearch)}"/>
          </div>
          <span class="text-muted text-sm">${d.total} client(s)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Raison sociale</th><th>Ville</th><th>Secteur</th><th>Téléphone</th><th>Dossiers</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
    document.getElementById('clientSearchInput').addEventListener('input', e => {
      clientSearch = e.target.value; clearTimeout(window._cst);
      window._cst = setTimeout(() => clients(), 400);
    });
  } catch(e) { setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`); }
}

async function clientDetail(id) {
  openModal('Détail client', `<div class="loading-state"><div class="spinner"></div></div>`, 'modal-lg');
  try {
    const c = await api('GET', `/clients/${id}`);
    const s = c.stats_dossiers || {};
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-grid" style="margin-bottom:20px">
        <div class="detail-item"><div class="detail-label">Code</div><div class="detail-value td-mono">${esc(c.code)}</div></div>
        <div class="detail-item"><div class="detail-label">Raison sociale</div><div class="detail-value fw-600">${esc(c.raison_sociale)}</div></div>
        <div class="detail-item"><div class="detail-label">Secteur</div><div class="detail-value">${esc(c.secteur_lib||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Ville</div><div class="detail-value">${esc(c.ville||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Téléphone</div><div class="detail-value">${esc(c.telephone||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${esc(c.email||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Contact</div><div class="detail-value">${esc(c.contact||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">NIF</div><div class="detail-value td-mono">${esc(c.nif||'—')}</div></div>
      </div>
      <div class="flex gap-2" style="margin-bottom:16px;flex-wrap:wrap">
        <div class="stat-card c-accent" style="flex:1;min-width:120px;padding:12px 16px">
          <div class="stat-value" style="font-size:22px">${s.total||0}</div><div class="stat-label">Total dossiers</div>
        </div>
        <div class="stat-card c-warning" style="flex:1;min-width:120px;padding:12px 16px">
          <div class="stat-value" style="font-size:22px">${s.en_cours||0}</div><div class="stat-label">En cours</div>
        </div>
        <div class="stat-card c-success" style="flex:1;min-width:120px;padding:12px 16px">
          <div class="stat-value" style="font-size:22px">${s.clotures||0}</div><div class="stat-label">Clôturés</div>
        </div>
      </div>
      ${c.notes ? `<div class="detail-item"><div class="detail-label">Notes</div><div class="detail-value">${esc(c.notes)}</div></div>` : ''}
      <div class="modal-footer" style="padding:0;border:none;margin-top:16px">
        <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
        <button class="btn btn-primary" onclick="closeModal();openClientForm(${id})">Modifier</button>
        <button class="btn btn-secondary" onclick="closeModal();clientSearch='';dossiers();setTimeout(()=>{navigate('dossiers')},100)">Voir les dossiers</button>
      </div>`;
  } catch(e) { document.getElementById('modalBody').innerHTML = `<p class="text-muted">${e.message}</p>`; }
}

async function openClientForm(id = null) {
  const secteurs = await api('GET', '/parametres/secteurs');
  let c = {};
  if (id) { try { c = await api('GET', `/clients/${id}`); } catch {} }
  const sOpts = secteurs.map(s => `<option value="${s.id}" ${c.secteur_id==s.id?'selected':''}>${esc(s.libelle)}</option>`).join('');
  openModal(id ? 'Modifier le client' : 'Nouveau client', `
    ${!id ? pdfUploadWidget('client', 'pdfClientWidget') : ''}
    <form id="clientForm" class="form-grid" onsubmit="saveClient(event,${id||'null'})">
      <div class="field-group"><label>Code *</label><input name="code" value="${esc(c.code||'')}" required/></div>
      <div class="field-group"><label>Raison sociale *</label><input name="raison_sociale" value="${esc(c.raison_sociale||'')}" required/></div>
      <div class="field-group"><label>Secteur</label><select name="secteur_id"><option value="">— Choisir —</option>${sOpts}</select></div>
      <div class="field-group"><label>Ville</label><input name="ville" value="${esc(c.ville||'')}"/></div>
      <div class="field-group"><label>Téléphone</label><input name="telephone" value="${esc(c.telephone||'')}"/></div>
      <div class="field-group"><label>Email</label><input type="email" name="email" value="${esc(c.email||'')}"/></div>
      <div class="field-group"><label>Contact</label><input name="contact" value="${esc(c.contact||'')}"/></div>
      <div class="field-group"><label>NIF</label><input name="nif" value="${esc(c.nif||'')}"/></div>
      <div class="field-group full"><label>Notes</label><textarea name="notes">${esc(c.notes||'')}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`, 'modal-lg');
}

async function saveClient(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  try {
    if (id) { await api('PUT', `/clients/${id}`, body); toast('Client mis à jour'); }
    else    { await api('POST', '/clients', body); toast('Client créé'); }
    closeModal(); clients();
  } catch(err) { toast(err.message, 'error'); }
}

// ════════════════════════════════════════════════════════════════
//  DOSSIERS
// ════════════════════════════════════════════════════════════════
let dossierFilters = { q:'', statut:'', type:'' };
async function dossiers() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const { q, statut, type } = dossierFilters;
    const d = await api('GET', `/dossiers?q=${encodeURIComponent(q)}&statut=${statut}&type=${type}&limit=200`);
    const rows = d.data.map(r => `
      <tr onclick="dossierDetail(${r.id})">
        <td class="td-mono fw-600">${esc(r.reference)}</td>
        <td>${esc(r.raison_sociale)}</td>
        <td><span class="badge badge-${r.type_code==='I'?'info':r.type_code==='E'?'warning':'neutral'}">${r.type_libelle}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.marchandise||'—')}</td>
        <td>${statusBadge(r.statut,'dossier')}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-icon btn-ghost" onclick="openDossierForm(${r.id})">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
        </td>
      </tr>`).join('') || `<tr><td colspan="7"><div class="empty"><div class="empty-icon">📁</div><p>Aucun dossier</p></div></td></tr>`;
    setContent(`
      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" id="dosQ" placeholder="Référence, client, marchandise…" value="${esc(q)}"/>
          </div>
          <select class="filter-select" id="dosStatut">
            <option value="">Tous statuts</option>
            <option value="ouvert" ${statut==='ouvert'?'selected':''}>Ouvert</option>
            <option value="en_cours" ${statut==='en_cours'?'selected':''}>En cours</option>
            <option value="cloture" ${statut==='cloture'?'selected':''}>Clôturé</option>
          </select>
          <select class="filter-select" id="dosType">
            <option value="">Tous types</option>
            <option value="I" ${type==='I'?'selected':''}>Import</option>
            <option value="E" ${type==='E'?'selected':''}>Export</option>
            <option value="T" ${type==='T'?'selected':''}>Transit</option>
          </select>
          <span class="text-muted text-sm">${d.total} dossier(s)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Référence</th><th>Client</th><th>Type</th><th>Marchandise</th><th>Statut</th><th>Date</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
    document.getElementById('dosQ').addEventListener('input', e => { dossierFilters.q = e.target.value; clearTimeout(window._dst); window._dst = setTimeout(dossiers,400); });
    document.getElementById('dosStatut').addEventListener('change', e => { dossierFilters.statut = e.target.value; dossiers(); });
    document.getElementById('dosType').addEventListener('change', e => { dossierFilters.type = e.target.value; dossiers(); });
  } catch(e) { setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`); }
}

async function dossierDetail(id) {
  openModal('Dossier', `<div class="loading-state"><div class="spinner"></div></div>`, 'modal-xl');
  try {
    const d = await api('GET', `/dossiers/${id}`);
    const statuts = ['ouvert','en_cours','cloture'];
    const statOpts = statuts.map(s => `<option value="${s}" ${d.statut===s?'selected':''}>${{ouvert:'Ouvert',en_cours:'En cours',cloture:'Clôturé'}[s]}</option>`).join('');
    const facRows = (d.factures||[]).map(f => `<tr><td class="td-mono">${esc(f.numero)}</td><td>${fmtDate(f.date_facture)}</td><td>${statusBadge(f.statut,'facture')}</td><td class="fw-600">${fmtMoney(f.montant_ttc)}</td></tr>`).join('') || `<tr><td colspan="4" class="text-muted">Aucune facture</td></tr>`;
    const debRows = (d.debours||[]).map(b => `<tr><td>${fmtDate(b.date_debours)}</td><td>${esc(b.libelle)}</td><td>${esc(b.beneficiaire||'—')}</td><td class="fw-600">${fmtMoney(b.montant)}</td></tr>`).join('') || `<tr><td colspan="4" class="text-muted">Aucun débours</td></tr>`;
    const preRows = (d.preavis||[]).map(p => `<tr><td class="td-mono">${esc(p.reference)}</td><td>${typeTransportIcon(p.moyen_transport)} ${esc(p.transporteur||'—')}</td><td>${fmtDate(p.date_arrivee_prevue)}</td><td>${statusBadge(p.statut,'preavis')}</td></tr>`).join('') || `<tr><td colspan="4" class="text-muted">Aucun préavis</td></tr>`;
    const noteItems = (d.notes||[]).map(n => `<div class="note-item"><p>${esc(n.contenu)}</p><div class="note-meta">${esc(n.auteur||'—')} — ${fmtDate(n.created_at)}</div></div>`).join('') || `<p class="text-muted">Aucune note</p>`;

    const transitLineHtml = renderTransitLine(d.etapes || [], 'full');
    const timelineHtml = renderTimeline(d.etapes || [], currentUser.role);

    document.getElementById('modalTitle').textContent = `Dossier ${d.reference}`;
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-header" style="margin-bottom:16px">
        <div><div class="detail-title">${esc(d.reference)}</div><div class="detail-subtitle">${esc(d.raison_sociale)}</div></div>
        <div class="detail-actions">
          ${statusBadge(d.statut,'dossier')}
          ${currentUser.role !== 'client' ? `<select class="filter-select" id="statutSel" style="padding:5px 10px;font-size:12px" onchange="changerStatutDossier(${id},this.value)">${statOpts}</select>` : ''}
          ${currentUser.role !== 'client' ? `<button class="btn btn-secondary btn-sm" onclick="closeModal();openDossierForm(${id})">Modifier</button>` : ''}
        </div>
      </div>
      ${transitLineHtml}
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${esc(d.type_libelle)}</div></div>
        <div class="detail-item"><div class="detail-label">Marchandise</div><div class="detail-value">${esc(d.marchandise||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Agent assigné</div><div class="detail-value fw-600">${esc(d.agent_nom||'Non attribué')}</div></div>
        <div class="detail-item"><div class="detail-label">Pays origine</div><div class="detail-value">${esc(d.pays_origine||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Incoterm</div><div class="detail-value">${esc(d.incoterm||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Créé le</div><div class="detail-value">${fmtDate(d.created_at)}</div></div>
      </div>
      <div class="tabs" id="dossTabs">
        <div class="tab active" onclick="switchTab('dossTabs','dossTab',0)">Étapes du transit</div>
        <div class="tab" onclick="switchTab('dossTabs','dossTab',1)">Factures</div>
        <div class="tab" onclick="switchTab('dossTabs','dossTab',2)">Débours</div>
        <div class="tab" onclick="switchTab('dossTabs','dossTab',3)">Préavis</div>
        ${currentUser.role !== 'client' ? `<div class="tab" onclick="switchTab('dossTabs','dossTab',4)">Notes</div>` : ''}
      </div>
      <div class="tab-panel active dossTab">
        ${currentUser.role === 'agent' ? `<div style="margin-bottom:12px;text-align:right"><button class="btn btn-primary btn-sm" onclick="closeModal();navigate('declarer_etape')">+ Déclarer une étape</button></div>` : ''}
        ${timelineHtml}
      </div>
      <div class="tab-panel dossTab"><div class="table-wrap"><table><thead><tr><th>N°</th><th>Date</th><th>Statut</th><th>Montant</th></tr></thead><tbody>${facRows}</tbody></table></div></div>
      <div class="tab-panel dossTab"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Bénéficiaire</th><th>Montant</th></tr></thead><tbody>${debRows}</tbody></table></div></div>
      <div class="tab-panel dossTab"><div class="table-wrap"><table><thead><tr><th>Réf.</th><th>Transporteur</th><th>Arrivée</th><th>Statut</th></tr></thead><tbody>${preRows}</tbody></table></div></div>
      ${currentUser.role !== 'client' ? `
      <div class="tab-panel dossTab">
        ${noteItems}
        <form style="margin-top:12px" onsubmit="addNote(event,${id})">
          <div class="field-group"><label>Ajouter une note</label><textarea name="contenu" rows="2" placeholder="Saisir une note…" required></textarea></div>
          <div style="margin-top:8px"><button type="submit" class="btn btn-primary btn-sm">Ajouter</button></div>
        </form>
      </div>` : ''}`;
  } catch(e) { document.getElementById('modalBody').innerHTML = `<p class="text-muted">${e.message}</p>`; }
}

function switchTab(tabGroupId, panelClass, idx) {
  const group = document.getElementById(tabGroupId);
  group.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  document.querySelectorAll('.'+panelClass).forEach((p,i) => p.classList.toggle('active', i===idx));
}

async function changerStatutDossier(id, statut) {
  try { await api('PATCH', `/dossiers/${id}/statut`, { statut }); toast('Statut mis à jour'); dossiers(); }
  catch(e) { toast(e.message,'error'); }
}

async function addNote(e, id) {
  e.preventDefault();
  const contenu = e.target.elements.contenu.value;
  try { await api('POST', `/dossiers/${id}/notes`, { contenu }); toast('Note ajoutée'); dossierDetail(id); }
  catch(err) { toast(err.message,'error'); }
}

async function openDossierForm(id = null) {
  const [cliData, typesData] = await Promise.all([api('GET','/clients?limit=200'), api('GET','/parametres/types-declaration')]);
  let d = {};
  if (id) { try { d = await api('GET', `/dossiers/${id}`); } catch {} }
  const cOpts = cliData.data.map(c => `<option value="${c.id}" ${d.client_id==c.id?'selected':''}>${esc(c.raison_sociale)}</option>`).join('');
  const tOpts = typesData.map(t => `<option value="${t.id}" ${d.type_decl_id==t.id?'selected':''}>${esc(t.libelle)}</option>`).join('');
  openModal(id ? 'Modifier le dossier' : 'Nouveau dossier', `
    ${!id ? pdfUploadWidget('dossier', 'pdfDossierWidget') : ''}
    <form id="dossierForm" class="form-grid" onsubmit="saveDossier(event,${id||'null'})">
      <div class="field-group"><label>Client *</label><select name="client_id" required><option value="">— Choisir —</option>${cOpts}</select></div>
      <div class="field-group"><label>Type *</label><select name="type_decl_id" required><option value="">— Choisir —</option>${tOpts}</select></div>
      <div class="field-group full"><label>Marchandise</label><input name="marchandise" value="${esc(d.marchandise||'')}"/></div>
      <div class="field-group"><label>Pays origine</label><input name="pays_origine" value="${esc(d.pays_origine||'')}"/></div>
      <div class="field-group"><label>Incoterm</label><input name="incoterm" value="${esc(d.incoterm||'')}"/></div>
      <div class="field-group"><label>Valeur douane (TND)</label><input type="number" name="valeur_douane" step="0.001" value="${d.valeur_douane||0}"/></div>
      <div class="field-group"><label>Statut</label><select name="statut"><option value="ouvert" ${d.statut==='ouvert'?'selected':''}>Ouvert</option><option value="en_cours" ${d.statut==='en_cours'?'selected':''}>En cours</option><option value="cloture" ${d.statut==='cloture'?'selected':''}>Clôturé</option></select></div>
      <div class="field-group full"><label>Description</label><textarea name="description">${esc(d.description||'')}</textarea></div>
      <div class="field-group full"><label>Observations</label><textarea name="observations">${esc(d.observations||'')}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`, 'modal-lg');
}

async function saveDossier(e, id) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    if (id) { await api('PUT', `/dossiers/${id}`, body); toast('Dossier mis à jour'); }
    else    { const r = await api('POST', '/dossiers', body); toast(`Dossier ${r.reference} créé`); }
    closeModal(); dossiers();
  } catch(err) { toast(err.message,'error'); }
}

// ════════════════════════════════════════════════════════════════
//  LINES TABLE COMPONENT
// ════════════════════════════════════════════════════════════════
let _rubriques = []; let _tvaList = [];

async function loadLinesData() {
  if (!_rubriques.length) try { _rubriques = await api('GET','/parametres/rubriques'); } catch(ex){}
  if (!_tvaList.length)   try { _tvaList   = await api('GET','/parametres/tva');        } catch(ex){}
}

function buildLinesTable(initLines) {
  const rO = _rubriques.map(r =>
    `<option value="${r.id}" data-prix="${r.prix_defaut||0}" data-tva="${r.tva_id||''}">${r.libelle}</option>`
  ).join('');
  const tO = _tvaList.map(t =>
    `<option value="${t.id}" data-taux="${t.taux}">${t.libelle}</option>`
  ).join('');
  const rows = (initLines && initLines.length ? initLines : [{designation:'',quantite:1,prix_unitaire:0}])
    .map(l => buildLineRow(l, rO, tO)).join('');
  return `<table class="lines-table" id="linesTable">
    <thead><tr>
      <th style="min-width:160px">Prestation</th>
      <th style="min-width:180px">Désignation</th>
      <th class="td-num">Qté</th>
      <th class="td-num">P.U. (TND)</th>
      <th class="td-tva">TVA</th>
      <th class="td-amt">HT</th>
      <th class="td-amt">TVA mnt</th>
      <th style="width:36px"></th>
    </tr></thead>
    <tbody id="linesBody">${rows}</tbody>
  </table>
  <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="addLine()">+ Ajouter une ligne</button>
  <div class="totals-box" id="totalsBox"></div>`;
}

function buildLineRow(l, rO, tO) {
  const rid = String(l.rubrique_id || '');
  const tid = String(l.tva_id || '');
  const selR = rO.replace(`value="${rid}"`, `value="${rid}" selected`);
  const selT = tO.replace(`value="${tid}"`, `value="${tid}" selected`);
  const qty  = l.quantite     || 1;
  const pu   = l.prix_unitaire || 0;
  const des  = (l.designation  || '').replace(/"/g, '&quot;');
  return `<tr>
    <td><select class="line-rub" onchange="onRubChange(this)"><option value="">—</option>${selR}</select></td>
    <td><input type="text" class="line-des" value="${des}" required/></td>
    <td class="td-num"><input type="number" class="line-qty" value="${qty}" min="0.001" step="any" oninput="recalcLines()" style="width:70px"/></td>
    <td class="td-num"><input type="number" class="line-pu" value="${pu}" min="0" step="any" oninput="recalcLines()" style="width:90px"/></td>
    <td class="td-tva"><select class="line-tva" onchange="recalcLines()"><option value="" data-taux="0">0%</option>${selT}</select></td>
    <td class="td-amt"><span class="line-ht">0,000</span></td>
    <td class="td-amt"><span class="line-tva-amt">0,000</span></td>
    <td><button type="button" class="btn btn-icon btn-ghost" onclick="this.closest('tr').remove();recalcLines()">✕</button></td>
  </tr>`;
}

function addLine() {
  const tb = document.getElementById('linesBody'); if (!tb) return;
  const rO = _rubriques.map(r => `<option value="${r.id}" data-prix="${r.prix_defaut||0}" data-tva="${r.tva_id||''}">${r.libelle}</option>`).join('');
  const tO = _tvaList.map(t => `<option value="${t.id}" data-taux="${t.taux}">${t.libelle}</option>`).join('');
  const tmp = document.createElement('tbody');
  tmp.innerHTML = buildLineRow({}, rO, tO);
  tb.appendChild(tmp.firstChild);
  recalcLines();
}

function onRubChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const row = sel.closest('tr'); if (!row) return;
  row.querySelector('.line-pu').value = parseFloat(opt.dataset.prix || 0);
  const tvaSel = row.querySelector('.line-tva');
  for (const o of tvaSel.options) { if (o.value === (opt.dataset.tva || '')) { o.selected = true; break; } }
  const des = row.querySelector('.line-des');
  if (!des.value) des.value = opt.textContent.trim();
  recalcLines();
}

function recalcLines() {
  let ht = 0, tva = 0;
  document.querySelectorAll('#linesBody tr').forEach(row => {
    const qty  = parseFloat(row.querySelector('.line-qty')?.value  || 0);
    const pu   = parseFloat(row.querySelector('.line-pu')?.value   || 0);
    const tSel = row.querySelector('.line-tva');
    const taux = parseFloat(tSel?.options[tSel.selectedIndex]?.dataset?.taux || 0);
    const lHt  = qty * pu;
    const lTva = lHt * taux / 100;
    ht += lHt; tva += lTva;
    const hEl = row.querySelector('.line-ht');   if (hEl)  hEl.textContent  = lHt.toLocaleString('fr-TN',{minimumFractionDigits:3});
    const tEl = row.querySelector('.line-tva-amt'); if (tEl) tEl.textContent = lTva.toLocaleString('fr-TN',{minimumFractionDigits:3});
  });
  const ttc = ht + tva;
  const tb = document.getElementById('totalsBox');
  if (tb) tb.innerHTML = `
    <div class="total-row"><span>Total HT</span><span>${ht.toLocaleString('fr-TN',{minimumFractionDigits:3})} TND</span></div>
    <div class="total-row"><span>Total TVA</span><span>${tva.toLocaleString('fr-TN',{minimumFractionDigits:3})} TND</span></div>
    <div class="total-row final"><span>Total TTC</span><span>${ttc.toLocaleString('fr-TN',{minimumFractionDigits:3})} TND</span></div>`;
}

function getLinesData() {
  return Array.from(document.querySelectorAll('#linesBody tr')).map(row => ({
    rubrique_id:   row.querySelector('.line-rub')?.value || null,
    designation:   row.querySelector('.line-des')?.value || '',
    quantite:      parseFloat(row.querySelector('.line-qty')?.value || 1),
    prix_unitaire: parseFloat(row.querySelector('.line-pu')?.value  || 0),
    tva_id:        row.querySelector('.line-tva')?.value || null,
  })).filter(l => l.designation.trim());
}


// ════════════════════════════════════════════════════════════════
//  DEVIS
// ════════════════════════════════════════════════════════════════
async function devis() {
  setContent('<div class="loading-state"><div class="spinner"></div></div>');
  try {
    const d = await api('GET', '/devis?limit=100');
    const rows = d.data.map(r => `
      <tr>
        <td class="td-mono fw-600">${esc(r.numero)}</td>
        <td>${esc(r.raison_sociale)}</td>
        <td>${esc(r.ref_dossier||'—')}</td>
        <td>${fmtDate(r.date_devis)}</td>
        <td>${fmtDate(r.date_validite)}</td>
        <td>${statusBadge(r.statut,'devis')}</td>
        <td class="fw-600">${fmtMoney(r.total_ttc)}</td>
        <td onclick="event.stopPropagation()">
          <div class="flex gap-2">
            <button class="btn btn-sm btn-secondary" onclick="devisDetail(${r.id})">Voir</button>
            ${r.statut!=='facture'?'<button class="btn btn-sm btn-primary" onclick="convertirDevis('+r.id+')">→ Facture</button>':''}
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="8"><div class="empty"><div class="empty-icon">📋</div><p>Aucun devis</p></div></td></tr>';
    setContent(`
      <div class="card">
        <div class="toolbar"><span class="text-muted text-sm">${d.total} devis</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>Client</th><th>Dossier</th><th>Date</th><th>Validité</th><th>Statut</th><th>Total TTC</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
  } catch(e) { setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`); }
}

async function devisDetail(id) {
  openModal('Devis', '<div class="loading-state"><div class="spinner"></div></div>', 'modal-lg');
  try {
    const d = await api('GET', `/devis/${id}`);
    const lignes = (d.lignes||[]).map(l => `<tr>
      <td>${esc(l.designation)}</td>
      <td class="td-num">${l.quantite}</td>
      <td class="td-num">${fmtMoney(l.prix_unitaire)}</td>
      <td>${esc(l.tva_libelle||'0%')}</td>
      <td class="fw-600">${fmtMoney((l.quantite||0)*(l.prix_unitaire||0))}</td>
    </tr>`).join('');
    document.getElementById('modalTitle').textContent = 'Devis ' + d.numero;
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-header">
        <div><div class="detail-title">${esc(d.numero)}</div><div class="detail-subtitle">${esc(d.raison_sociale)}</div></div>
        <div>${statusBadge(d.statut,'devis')}</div>
      </div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Date</div><div class="detail-value">${fmtDate(d.date_devis)}</div></div>
        <div class="detail-item"><div class="detail-label">Validité</div><div class="detail-value">${fmtDate(d.date_validite)}</div></div>
        <div class="detail-item"><div class="detail-label">Dossier</div><div class="detail-value">${esc(d.ref_dossier||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Objet</div><div class="detail-value">${esc(d.objet||'—')}</div></div>
      </div>
      <div class="table-wrap" style="margin-bottom:12px">
        <table><thead><tr><th>Désignation</th><th>Qté</th><th>P.U.</th><th>TVA</th><th>HT</th></tr></thead>
        <tbody>${lignes}</tbody></table>
      </div>
      <div class="totals-box">
        <div class="total-row"><span>Total HT</span><span>${fmtMoney(d.total_ht)}</span></div>
        <div class="total-row"><span>Total TVA</span><span>${fmtMoney(d.total_tva)}</span></div>
        <div class="total-row final"><span>Total TTC</span><span>${fmtMoney(d.total_ttc)}</span></div>
      </div>
      <div class="modal-footer" style="padding:0;border:none;margin-top:16px">
        <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
        <button class="btn btn-primary" onclick="closeModal();openDevisForm(${id})">Modifier</button>
        ${d.statut!=='facture'?'<button class="btn btn-success" onclick="closeModal();convertirDevis('+id+')">→ Convertir en facture</button>':''}
      </div>`;
  } catch(e) { document.getElementById('modalBody').innerHTML = '<p class="text-muted">'+e.message+'</p>'; }
}

async function openDevisForm(id = null) {
  await loadLinesData();
  const [cliData, dosData] = await Promise.all([api('GET','/clients?limit=200'), api('GET','/dossiers?limit=200')]);
  let d = { lignes: [] };
  if (id) { try { d = await api('GET', `/devis/${id}`); } catch {} }
  const cOpts = cliData.data.map(c => `<option value="${c.id}" ${d.client_id==c.id?'selected':''}>${esc(c.raison_sociale)}</option>`).join('');
  const dosOpts = dosData.data.map(x => `<option value="${x.id}" ${d.dossier_id==x.id?'selected':''}>${esc(x.reference)} — ${esc(x.raison_sociale)}</option>`).join('');
  openModal(id?'Modifier devis':'Nouveau devis', `
    <form id="devisForm" onsubmit="saveDevis(event,${id||'null'})">
      <div class="form-grid" style="margin-bottom:16px">
        <div class="field-group"><label>Client *</label><select name="client_id" required><option value="">— Choisir —</option>${cOpts}</select></div>
        <div class="field-group"><label>Dossier</label><select name="dossier_id"><option value="">— Aucun —</option>${dosOpts}</select></div>
        <div class="field-group"><label>Date</label><input type="date" name="date_devis" value="${fmtDateInput(d.date_devis||new Date().toISOString())}" required/></div>
        <div class="field-group"><label>Date validité</label><input type="date" name="date_validite" value="${fmtDateInput(d.date_validite)}"/></div>
        <div class="field-group full"><label>Objet</label><input name="objet" value="${esc(d.objet||'')}"/></div>
      </div>
      ${buildLinesTable(d.lignes)}
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id?'Enregistrer':'Créer le devis'}</button>
      </div>
    </form>`, 'modal-xl');
  recalcLines();
}

async function saveDevis(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const lignes = getLinesData();
  if (!lignes.length) { toast('Ajoutez au moins une ligne','warning'); return; }
  const body = { ...Object.fromEntries(fd), lignes };
  try {
    if (id) { await api('PUT', `/devis/${id}`, body); toast('Devis mis à jour'); }
    else    { const r = await api('POST', '/devis', body); toast('Devis ' + r.numero + ' créé'); }
    closeModal(); devis();
  } catch(err) { toast(err.message,'error'); }
}

async function convertirDevis(id) {
  if (!confirm('Convertir ce devis en facture ?')) return;
  try {
    const r = await api('POST', `/devis/${id}/convertir`);
    toast('Facture ' + r.numero + ' créée');
    navigate('factures');
  } catch(e) { toast(e.message,'error'); }
}


// ════════════════════════════════════════════════════════════════
//  FACTURES
// ════════════════════════════════════════════════════════════════
let factureFilters = { q:'', statut:'' };

async function factures() {
  setContent('<div class="loading-state"><div class="spinner"></div></div>');
  try {
    const { q, statut } = factureFilters;
    const d = await api('GET', `/factures?q=${encodeURIComponent(q)}&statut=${statut}&limit=100`);
    const rows = d.data.map(f => {
      const pct = f.net_a_payer > 0 ? Math.min(100, Math.round((f.total_paye / f.net_a_payer) * 100)) : 0;
      const barColor = pct >= 100 ? 'green' : pct > 0 ? 'orange' : 'red';
      return `<tr onclick="factureDetail(${f.id})">
        <td class="td-mono fw-600">${esc(f.numero)}</td>
        <td>${esc(f.raison_sociale)}</td>
        <td>${esc(f.ref_dossier||'—')}</td>
        <td>${fmtDate(f.date_facture)}</td>
        <td>${fmtDate(f.date_echeance)}</td>
        <td>${statusBadge(f.statut,'facture')}</td>
        <td class="fw-600">${fmtMoney(f.net_a_payer)}</td>
        <td>
          <div style="min-width:80px">
            <div style="font-size:11px;color:var(--text2)">${fmtMoney(f.total_paye)}</div>
            <div class="progress-wrap"><div class="progress-bar ${barColor}" style="width:${pct}%"></div></div>
          </div>
        </td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-secondary" onclick="factureDetail(${f.id})">Voir</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="9"><div class="empty"><div class="empty-icon">🧾</div><p>Aucune facture</p></div></td></tr>';

    setContent(`
      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" id="facQ" placeholder="N° facture, client…" value="${esc(q)}"/>
          </div>
          <select class="filter-select" id="facStatut">
            <option value="">Tous statuts</option>
            <option value="emise" ${statut==='emise'?'selected':''}>Émise</option>
            <option value="partielle" ${statut==='partielle'?'selected':''}>Partielle</option>
            <option value="payee" ${statut==='payee'?'selected':''}>Payée</option>
            <option value="annulee" ${statut==='annulee'?'selected':''}>Annulée</option>
          </select>
          <span class="text-muted text-sm">${d.total} facture(s)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>Client</th><th>Dossier</th><th>Date</th><th>Échéance</th><th>Statut</th><th>Net à payer</th><th>Paiement</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
    document.getElementById('facQ').addEventListener('input', e => { factureFilters.q = e.target.value; clearTimeout(window._fst); window._fst = setTimeout(factures, 400); });
    document.getElementById('facStatut').addEventListener('change', e => { factureFilters.statut = e.target.value; factures(); });
  } catch(e) { setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`); }
}

async function factureDetail(id) {
  openModal('Facture', '<div class="loading-state"><div class="spinner"></div></div>', 'modal-xl');
  try {
    const f = await api('GET', `/factures/${id}`);
    const lignes = (f.lignes||[]).map(l => `<tr>
      <td>${esc(l.designation)}</td>
      <td class="td-num">${l.quantite}</td>
      <td class="td-num">${fmtMoney(l.prix_unitaire)}</td>
      <td>${esc(l.tva_libelle||'0%')}</td>
      <td class="fw-600">${fmtMoney((l.quantite||0)*(l.prix_unitaire||0))}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-muted">Aucune ligne</td></tr>';

    const paiements = (f.paiements||[]).map(p => `<tr>
      <td>${fmtDate(p.date_paiement)}</td>
      <td class="fw-600">${fmtMoney(p.montant)}</td>
      <td>${esc(p.mode)}</td>
      <td>${esc(p.reference||'—')}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-icon btn-ghost btn-sm" onclick="supprimerPaiement(${id},${p.id})" title="Supprimer">✕</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-muted">Aucun paiement</td></tr>';

    const pct = f.net_a_payer > 0 ? Math.min(100, Math.round((f.total_paye / f.net_a_payer) * 100)) : 0;
    const barColor = pct >= 100 ? 'green' : pct > 0 ? 'orange' : 'red';

    document.getElementById('modalTitle').textContent = 'Facture ' + f.numero;
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-header">
        <div>
          <div class="detail-title">${esc(f.numero)}</div>
          <div class="detail-subtitle">${esc(f.raison_sociale)}</div>
        </div>
        <div class="detail-actions">
          ${statusBadge(f.statut,'facture')}
          <button class="btn btn-secondary btn-sm" onclick="closeModal();openFactureForm(${id})">Modifier</button>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Date facture</div><div class="detail-value">${fmtDate(f.date_facture)}</div></div>
        <div class="detail-item"><div class="detail-label">Échéance</div><div class="detail-value">${fmtDate(f.date_echeance)}</div></div>
        <div class="detail-item"><div class="detail-label">Dossier</div><div class="detail-value">${esc(f.ref_dossier||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Devis source</div><div class="detail-value">${esc(f.ref_devis||'—')}</div></div>
      </div>

      <div class="table-wrap" style="margin-bottom:16px">
        <table><thead><tr><th>Désignation</th><th>Qté</th><th>P.U.</th><th>TVA</th><th>HT</th></tr></thead>
        <tbody>${lignes}</tbody></table>
      </div>

      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:20px">
        <div class="totals-box" style="flex:1;min-width:200px">
          <div class="total-row"><span>Total HT</span><span>${fmtMoney(f.total_ht)}</span></div>
          <div class="total-row"><span>Total TVA</span><span>${fmtMoney(f.total_tva)}</span></div>
          <div class="total-row"><span>Remise</span><span>-${fmtMoney(f.remise_globale)}</span></div>
          <div class="total-row final"><span>Net à payer</span><span>${fmtMoney(f.net_a_payer)}</span></div>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:13px;color:var(--text2);margin-bottom:6px">Avancement du paiement</div>
          <div style="font-size:20px;font-weight:700;color:var(--${pct>=100?'success':'text'})">${pct}%</div>
          <div class="progress-wrap" style="margin-bottom:8px"><div class="progress-bar ${barColor}" style="width:${pct}%"></div></div>
          <div style="font-size:12px;color:var(--text2)">Payé : ${fmtMoney(f.total_paye)} / Reste : ${fmtMoney(f.reste_a_payer)}</div>
        </div>
      </div>

      <div class="tabs" id="facTabs">
        <div class="tab active" onclick="switchTab('facTabs','facTab',0)">Paiements (${(f.paiements||[]).length})</div>
        <div class="tab" onclick="switchTab('facTabs','facTab',1)">Ajouter un paiement</div>
        <div class="tab" onclick="switchTab('facTabs','facTab',2)">Décharges (${(f.decharges||[]).length})</div>
      </div>

      <div class="tab-panel active facTab">
        <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Montant</th><th>Mode</th><th>Référence</th><th></th></tr></thead>
          <tbody>${paiements}</tbody></table>
        </div>
      </div>

      <div class="tab-panel facTab">
        <form class="form-grid" style="margin-top:8px" onsubmit="ajouterPaiement(event,${id})">
          <div class="field-group"><label>Date *</label><input type="date" name="date_paiement" value="${new Date().toISOString().slice(0,10)}" required/></div>
          <div class="field-group"><label>Montant (TND) *</label><input type="number" name="montant" step="0.001" min="0.001" placeholder="0,000" required/></div>
          <div class="field-group"><label>Mode</label>
            <select name="mode">
              <option value="virement">Virement</option>
              <option value="cheque">Chèque</option>
              <option value="especes">Espèces</option>
              <option value="traite">Traite</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div class="field-group"><label>Référence</label><input name="reference" placeholder="N° chèque, virement…"/></div>
          <div class="form-actions full">
            <button type="submit" class="btn btn-success">Enregistrer le paiement</button>
          </div>
        </form>
      </div>

      <div class="tab-panel facTab">
        ${(f.decharges||[]).length ? f.decharges.map(dc => `
          <div class="note-item">
            <div class="fw-600">${fmtDate(dc.date_decharge)}</div>
            <div>${esc(dc.signataire||'—')}</div>
            ${dc.observations ? '<div class="text-muted text-sm">'+esc(dc.observations)+'</div>' : ''}
          </div>`).join('') : '<p class="text-muted">Aucune décharge</p>'}
        <form class="form-grid" style="margin-top:12px" onsubmit="ajouterDecharge(event,${id})">
          <div class="field-group"><label>Date</label><input type="date" name="date_decharge" value="${new Date().toISOString().slice(0,10)}"/></div>
          <div class="field-group"><label>Signataire</label><input name="signataire"/></div>
          <div class="field-group full"><label>Observations</label><textarea name="observations" rows="2"></textarea></div>
          <div class="form-actions full">
            <button type="submit" class="btn btn-primary btn-sm">Enregistrer la décharge</button>
          </div>
        </form>
      </div>`;
  } catch(e) { document.getElementById('modalBody').innerHTML = '<p class="text-muted">'+e.message+'</p>'; }
}

async function ajouterPaiement(e, factureId) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('POST', `/factures/${factureId}/paiements`, body);
    toast('Paiement enregistré');
    factureDetail(factureId);
    factures();
  } catch(err) { toast(err.message,'error'); }
}

async function supprimerPaiement(factureId, paiementId) {
  if (!confirm('Supprimer ce paiement ?')) return;
  try {
    await api('DELETE', `/factures/${factureId}/paiements/${paiementId}`);
    toast('Paiement supprimé');
    factureDetail(factureId);
    factures();
  } catch(e) { toast(e.message,'error'); }
}

async function ajouterDecharge(e, factureId) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('POST', `/factures/${factureId}/decharges`, body);
    toast('Décharge enregistrée');
    factureDetail(factureId);
  } catch(err) { toast(err.message,'error'); }
}

async function openFactureForm(id = null) {
  await loadLinesData();
  const [cliData, dosData] = await Promise.all([api('GET','/clients?limit=200'), api('GET','/dossiers?limit=200')]);
  let f = { lignes: [] };
  if (id) { try { f = await api('GET', `/factures/${id}`); } catch {} }
  const cOpts = cliData.data.map(c => `<option value="${c.id}" ${f.client_id==c.id?'selected':''}>${esc(c.raison_sociale)}</option>`).join('');
  const dosOpts = dosData.data.map(x => `<option value="${x.id}" ${f.dossier_id==x.id?'selected':''}>${esc(x.reference)} — ${esc(x.raison_sociale)}</option>`).join('');
  openModal(id?'Modifier la facture':'Nouvelle facture', `
    <form id="factureForm" onsubmit="saveFacture(event,${id||'null'})">
      <div class="form-grid" style="margin-bottom:16px">
        <div class="field-group"><label>Client *</label><select name="client_id" required><option value="">— Choisir —</option>${cOpts}</select></div>
        <div class="field-group"><label>Dossier</label><select name="dossier_id"><option value="">— Aucun —</option>${dosOpts}</select></div>
        <div class="field-group"><label>Date facture</label><input type="date" name="date_facture" value="${fmtDateInput(f.date_facture||new Date().toISOString())}" required/></div>
        <div class="field-group"><label>Date échéance</label><input type="date" name="date_echeance" value="${fmtDateInput(f.date_echeance)}"/></div>
        <div class="field-group full"><label>Objet</label><input name="objet" value="${esc(f.objet||'')}"/></div>
      </div>
      ${buildLinesTable(f.lignes)}
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id?'Enregistrer':'Créer la facture'}</button>
      </div>
    </form>`, 'modal-xl');
  recalcLines();
}

async function saveFacture(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const lignes = getLinesData();
  if (!lignes.length) { toast('Ajoutez au moins une ligne','warning'); return; }
  const body = { ...Object.fromEntries(fd), lignes };
  try {
    if (id) { await api('PUT', `/factures/${id}`, body); toast('Facture mise à jour'); }
    else    { const r = await api('POST', '/factures', body); toast('Facture ' + r.numero + ' créée'); }
    closeModal(); factures();
  } catch(err) { toast(err.message,'error'); }
}


// ════════════════════════════════════════════════════════════════
//  DÉBOURS
// ════════════════════════════════════════════════════════════════
async function debours() {
  setContent('<div class="loading-state"><div class="spinner"></div></div>');
  try {
    const d = await api('GET', '/debours?limit=200');
    const rows = d.data.map(b => `
      <tr>
        <td>${fmtDate(b.date_debours)}</td>
        <td class="td-mono">${esc(b.ref_dossier)}</td>
        <td>${esc(b.raison_sociale)}</td>
        <td>${esc(b.libelle)}</td>
        <td>${esc(b.beneficiaire||'—')}</td>
        <td class="fw-600">${fmtMoney(b.montant)}</td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-icon btn-ghost" onclick="supprimerDebours(${b.id})" title="Supprimer">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </td>
      </tr>`).join('') || '<tr><td colspan="7"><div class="empty"><div class="empty-icon">💸</div><p>Aucun débours</p></div></td></tr>';

    setContent(`
      <div class="card">
        <div class="toolbar">
          <span class="text-muted text-sm">${d.total} débours — Total : ${fmtMoney(d.somme_totale)}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Dossier</th><th>Client</th><th>Libellé</th><th>Bénéficiaire</th><th>Montant</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
  } catch(e) { setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`); }
}

async function openDebourForm() {
  const dosData = await api('GET', '/dossiers?limit=200');
  const dosOpts = dosData.data.map(x => `<option value="${x.id}">${esc(x.reference)} — ${esc(x.raison_sociale)}</option>`).join('');
  const libelles = ['Droits et taxes douane','Transport routier','Magasinage','Pesage','Frais escorte','Assurance','Timbrage','Frais de port','Frais divers'];
  const libOpts = libelles.map(l => `<option value="${l}">${l}</option>`).join('');
  openModal('Nouveau débours', `
    ${pdfUploadWidget('debours', 'pdfDebourWidget')}
    <form class="form-grid" onsubmit="saveDebours(event)">
      <div class="field-group"><label>Dossier *</label><select name="dossier_id" required><option value="">— Choisir —</option>${dosOpts}</select></div>
      <div class="field-group"><label>Date *</label><input type="date" name="date_debours" value="${new Date().toISOString().slice(0,10)}" required/></div>
      <div class="field-group full"><label>Libellé *</label>
        <input name="libelle" list="libList" placeholder="Sélectionner ou saisir…" required/>
        <datalist id="libList">${libOpts}</datalist>
      </div>
      <div class="field-group"><label>Bénéficiaire</label><input name="beneficiaire" placeholder="ADII, transporteur…"/></div>
      <div class="field-group"><label>Montant (TND) *</label><input type="number" name="montant" step="0.001" min="0" placeholder="0,000" required/></div>
      <div class="field-group full"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`, 'modal-lg');
}

async function saveDebours(e) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('POST', '/debours', body);
    toast('Débours enregistré');
    closeModal(); debours();
  } catch(err) { toast(err.message,'error'); }
}

async function supprimerDebours(id) {
  if (!confirm('Supprimer ce débours ?')) return;
  try {
    await api('DELETE', `/debours/${id}`);
    toast('Débours supprimé');
    debours();
  } catch(e) { toast(e.message,'error'); }
}


// ════════════════════════════════════════════════════════════════
//  PRÉAVIS D'ARRIVÉE
// ════════════════════════════════════════════════════════════════
async function preavis() {
  setContent('<div class="loading-state"><div class="spinner"></div></div>');
  try {
    const d = await api('GET', '/preavis?limit=100');
    const rows = d.data.map(p => `
      <tr onclick="preavisDetail(${p.id})">
        <td class="td-mono fw-600">${esc(p.reference)}</td>
        <td>${esc(p.raison_sociale)}</td>
        <td class="td-mono">${esc(p.ref_dossier)}</td>
        <td>${typeTransportIcon(p.moyen_transport)} ${esc(p.transporteur||'—')}</td>
        <td>${esc(p.ref_transport||'—')}</td>
        <td>${fmtDate(p.date_arrivee_prevue)}</td>
        <td>${statusBadge(p.statut,'preavis')}</td>
        <td onclick="event.stopPropagation()">
          <div class="flex gap-2">
            <button class="btn btn-sm btn-secondary" onclick="preavisDetail(${p.id})">Voir</button>
            ${p.statut==='en_attente' && p.client_email ? `<button class="btn btn-sm btn-primary" onclick="notifierClient(${p.id})">📧 Notifier</button>` : ''}
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="8"><div class="empty"><div class="empty-icon">🚢</div><p>Aucun préavis</p></div></td></tr>';

    setContent(`
      <div class="card">
        <div class="toolbar"><span class="text-muted text-sm">${d.total} préavis</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Référence</th><th>Client</th><th>Dossier</th><th>Transporteur</th><th>Réf. transport</th><th>Arrivée prévue</th><th>Statut</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
  } catch(e) { setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`); }
}

async function preavisDetail(id) {
  openModal("Préavis d'arrivée", '<div class="loading-state"><div class="spinner"></div></div>', 'modal-lg');
  try {
    const p = await api('GET', `/preavis/${id}`);
    const statuts = [
      {v:'en_attente', l:'En attente'},
      {v:'arrive',     l:'Arrivé'},
      {v:'traite',     l:'Traité'},
    ];
    const stOpts = statuts.map(s => `<option value="${s.v}" ${p.statut===s.v?'selected':''}>${s.l}</option>`).join('');
    document.getElementById('modalTitle').textContent = 'Préavis ' + p.reference;
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-header">
        <div>
          <div class="detail-title">${typeTransportIcon(p.moyen_transport)} ${esc(p.reference)}</div>
          <div class="detail-subtitle">${esc(p.raison_sociale)} — ${esc(p.ref_dossier)}</div>
        </div>
        <div class="detail-actions">
          ${statusBadge(p.statut,'preavis')}
          <select class="filter-select" style="padding:5px 10px;font-size:12px" onchange="changerStatutPreavis(${id},this.value)">${stOpts}</select>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Transporteur</div><div class="detail-value">${esc(p.transporteur||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Moyen</div><div class="detail-value">${typeTransportIcon(p.moyen_transport)} ${esc(p.moyen_transport||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Réf. transport</div><div class="detail-value td-mono">${esc(p.ref_transport||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Arrivée prévue</div><div class="detail-value fw-600">${fmtDate(p.date_arrivee_prevue)}</div></div>
        <div class="detail-item"><div class="detail-label">Port embarquement</div><div class="detail-value">${esc(p.port_embarquement||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Port déchargement</div><div class="detail-value">${esc(p.port_dechargement||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Marchandise</div><div class="detail-value">${esc(p.designation_march||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Colis / Poids / Volume</div><div class="detail-value">${p.nb_colis||'—'} colis · ${p.poids_brut||'—'} kg · ${p.volume||'—'} m³</div></div>
        <div class="detail-item"><div class="detail-label">Email client</div><div class="detail-value">${esc(p.client_email||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Notification</div><div class="detail-value">${p.email_notif_envoye ? '✅ Envoyée' : '⏳ Non envoyée'}</div></div>
      </div>
      ${p.notes ? `<div class="detail-item" style="margin-top:8px"><div class="detail-label">Notes</div><div class="detail-value">${esc(p.notes)}</div></div>` : ''}
      <div class="modal-footer" style="padding:0;border:none;margin-top:16px">
        <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
        <button class="btn btn-primary" onclick="closeModal();openPreavisForm(${id})">Modifier</button>
        ${p.client_email && p.statut==='en_attente' ? `<button class="btn btn-success" onclick="notifierClient(${id})">📧 Notifier le client</button>` : ''}
      </div>`;
  } catch(e) { document.getElementById('modalBody').innerHTML = '<p class="text-muted">'+e.message+'</p>'; }
}

async function changerStatutPreavis(id, statut) {
  try { await api('PUT', `/preavis/${id}`, { statut }); toast('Statut mis à jour'); preavis(); }
  catch(e) { toast(e.message,'error'); }
}

async function notifierClient(id) {
  try {
    const r = await api('POST', `/preavis/${id}/notifier`);
    toast(r.message || 'Notification envoyée');
    preavis();
  } catch(e) { toast(e.message,'error'); }
}

async function openPreavisForm(id = null) {
  const dosData = await api('GET', '/dossiers?limit=200&statut=en_cours');
  let p = {};
  if (id) { try { p = await api('GET', `/preavis/${id}`); } catch {} }
  const dosOpts = dosData.data.map(x => `<option value="${x.id}" ${p.dossier_id==x.id?'selected':''}>${esc(x.reference)} — ${esc(x.raison_sociale)}</option>`).join('');
  openModal(id ? "Modifier le préavis" : "Nouveau préavis d'arrivée", `
    <form class="form-grid" onsubmit="savePreavis(event,${id||'null'})">
      <div class="field-group"><label>Dossier *</label><select name="dossier_id" required onchange="onDossierChangePreavis(this)"><option value="">— Choisir —</option>${dosOpts}</select></div>
      <div class="field-group"><label>Date d&apos;arrivée prévue</label><input type="date" name="date_arrivee_prevue" value="${fmtDateInput(p.date_arrivee_prevue)}"/></div>
      <div class="field-group"><label>Transporteur</label><input name="transporteur" value="${esc(p.transporteur||'')}"/></div>
      <div class="field-group"><label>Moyen de transport</label>
        <select name="moyen_transport">
          <option value="">— Choisir —</option>
          <option value="maritime" ${p.moyen_transport==='maritime'?'selected':''}>🚢 Maritime</option>
          <option value="aerien" ${p.moyen_transport==='aerien'?'selected':''}>✈️ Aérien</option>
          <option value="routier" ${p.moyen_transport==='routier'?'selected':''}>🚛 Routier</option>
          <option value="ferroviaire" ${p.moyen_transport==='ferroviaire'?'selected':''}>🚂 Ferroviaire</option>
        </select>
      </div>
      <div class="field-group"><label>Réf. transport (BL/LTA/CMR)</label><input name="ref_transport" value="${esc(p.ref_transport||'')}"/></div>
      <div class="field-group"><label>Port embarquement</label><input name="port_embarquement" value="${esc(p.port_embarquement||'')}"/></div>
      <div class="field-group"><label>Port déchargement</label><input name="port_dechargement" value="${esc(p.port_dechargement||'')}"/></div>
      <div class="field-group full"><label>Désignation marchandise</label><input name="designation_march" value="${esc(p.designation_march||'')}"/></div>
      <div class="field-group"><label>Nombre de colis</label><input type="number" name="nb_colis" min="0" value="${p.nb_colis||''}"/></div>
      <div class="field-group"><label>Poids brut (kg)</label><input type="number" name="poids_brut" step="0.001" min="0" value="${p.poids_brut||''}"/></div>
      <div class="field-group"><label>Volume (m³)</label><input type="number" name="volume" step="0.001" min="0" value="${p.volume||''}"/></div>
      <div class="field-group full"><label>Notes</label><textarea name="notes" rows="2">${esc(p.notes||'')}</textarea></div>
      <input type="hidden" name="client_id" id="preavisClientId" value="${p.client_id||''}"/>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id?'Enregistrer':'Créer le préavis'}</button>
      </div>
    </form>`);
}

async function onDossierChangePreavis(sel) {
  const dosId = sel.value;
  if (!dosId) return;
  try {
    const d = await api('GET', `/dossiers/${dosId}`);
    const inp = document.getElementById('preavisClientId');
    if (inp) inp.value = d.client_id || '';
  } catch(ex) {}
}

async function savePreavis(e, id) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  if (!body.client_id) {
    // try to get client from dossier
    if (body.dossier_id) {
      try { const d = await api('GET', `/dossiers/${body.dossier_id}`); body.client_id = d.client_id; } catch(ex){}
    }
  }
  if (!body.client_id) { toast('Client non trouvé pour ce dossier','error'); return; }
  try {
    if (id) { await api('PUT', `/preavis/${id}`, body); toast('Préavis mis à jour'); }
    else    { const r = await api('POST', '/preavis', body); toast('Préavis ' + r.reference + ' créé'); }
    closeModal(); preavis();
  } catch(err) { toast(err.message,'error'); }
}


// ════════════════════════════════════════════════════════════════
//  ÉTAPES, TIMELINE & WORKFLOW SIGNATURE (LA LIGNE DE TRANSIT)
// ════════════════════════════════════════════════════════════════

function renderTransitLine(etapes, mode = 'full') {
  const validatedTitles = (etapes || [])
    .filter(e => e.statut === 'validee')
    .map(e => e.titre_etape);

  let maxValidatedIdx = -1;
  CYCLE_ETAPES.forEach((title, idx) => {
    if (validatedTitles.includes(title)) {
      maxValidatedIdx = idx;
    }
  });

  const totalSteps = CYCLE_ETAPES.length; // 10
  const countValidated = maxValidatedIdx + 1;
  const percentage = Math.round((countValidated / totalSteps) * 100);

  if (mode === 'mini') {
    return `
      <div class="transit-mini-line" title="Progression : ${countValidated}/${totalSteps} étapes validées">
        ${CYCLE_ETAPES.map((_, i) => {
          const isVal = i <= maxValidatedIdx;
          const isCurr = i === maxValidatedIdx + 1;
          return `<div class="transit-mini-segment ${isVal ? 'validee' : isCurr ? 'current' : ''}"></div>`;
        }).join('')}
      </div>
    `;
  }

  if (mode === 'compact') {
    return `
      <div class="transit-line-compact">
        <div class="flex items-center justify-between">
          <span class="fw-600 text-sm">📍 Cycle de transit du dossier</span>
          <span class="badge badge-success">${countValidated}/${totalSteps} étapes validées (${percentage}%)</span>
        </div>
        <div class="transit-compact-track">
          ${CYCLE_ETAPES.map((title, i) => {
            const isVal = i <= maxValidatedIdx;
            const isCurr = i === maxValidatedIdx + 1;
            return `<div class="transit-compact-segment ${isVal ? 'validee' : isCurr ? 'current' : ''}" title="${esc(title)}"></div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  // mode === 'full' (Espace Client & Fiche Détail Dossier)
  const progressPercent = maxValidatedIdx < 0 ? 0 : Math.min(100, Math.round(((maxValidatedIdx + 0.5) / (totalSteps - 1)) * 100));

  const stepsHtml = CYCLE_ETAPES.map((title, i) => {
    const isVal = i <= maxValidatedIdx;
    const isCurr = i === maxValidatedIdx + 1;
    const stepNum = i + 1;
    const cleanTitle = title.replace(/^\d+\.\s*/, '');
    
    const icon = isVal ? '✓' : isCurr ? '🚚' : stepNum;
    const cls = isVal ? 'validee' : isCurr ? 'current' : '';

    return `
      <div class="transit-step ${cls}">
        <div class="transit-dot">${icon}</div>
        <div class="transit-step-label">${cleanTitle}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="transit-line-container">
      <div class="transit-line-header">
        <div class="transit-line-title">
          <span style="font-size:20px">🚢</span>
          <span>Suivi de l'Acheminement & Transit</span>
        </div>
        <div class="transit-line-percentage">
          ${percentage}% complété (${countValidated}/${totalSteps} étapes)
        </div>
      </div>
      <div class="transit-track-wrapper">
        <div class="transit-track">
          <div class="transit-progress-bar" style="width: ${progressPercent}%;"></div>
          ${stepsHtml}
        </div>
      </div>
    </div>
  `;
}

function renderTimeline(etapes, role) {
  if (!etapes || etapes.length === 0) {
    return `<div class="empty" style="padding:24px"><div class="empty-icon">📍</div><p>${role === 'client' ? 'Aucune étape validée pour le moment' : 'Aucune étape enregistrée pour ce dossier'}</p></div>`;
  }
  return `
    <div class="timeline">
      ${etapes.map(e => {
        const statusCls = e.statut;
        const icon = statusCls === 'validee' ? '✓' : statusCls === 'rejetee' ? '✕' : '⏳';
        const filesHtml = (e.pieces_jointes || []).map(f => `
          <a href="${esc(f.path)}" target="_blank" class="file-chip">
            📎 ${esc(f.filename)}
          </a>
        `).join('');

        return `
          <div class="timeline-item">
            <div class="timeline-node ${statusCls}">${icon}</div>
            <div class="timeline-content">
              <div class="timeline-header">
                <h4 class="timeline-title">${esc(e.titre_etape)}</h4>
                ${statusBadge(e.statut, 'preavis')}
              </div>
              ${e.description ? `<div class="timeline-desc">${esc(e.description)}</div>` : ''}
              ${e.statut === 'rejetee' && e.motif_rejet ? `
                <div class="badge badge-danger" style="display:block;margin-bottom:8px;padding:8px">
                  <strong>Motif du rejet :</strong> ${esc(e.motif_rejet)}
                </div>
              ` : ''}
              ${filesHtml ? `<div class="file-attachments">${filesHtml}</div>` : ''}
              <div class="timeline-meta">
                <span>Déclaré le ${fmtDate(e.date_declaration)} par ${esc(e.agent_nom || 'Agent')}</span>
                ${e.date_validation ? `<span>${e.statut === 'validee' ? 'Validé' : 'Décidé'} le ${fmtDate(e.date_validation)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Superviseur : File de validation ─────────────────────────────────────────
async function validation() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const etapes = await api('GET', '/etapes/pending');
    if (!etapes || etapes.length === 0) {
      setContent(`
        <div class="empty" style="padding:40px">
          <div class="empty-icon">✅</div>
          <h3>Aucune étape en attente de validation</h3>
          <p>Toutes les étapes soumises par les agents ont été traitées.</p>
        </div>
      `);
      return;
    }

    const cardsHtml = await Promise.all(etapes.map(async e => {
      const filesHtml = (e.pieces_jointes || []).map(f => `
        <a href="${esc(f.path)}" target="_blank" class="file-chip">📎 ${esc(f.filename)}</a>
      `).join('');

      let miniTrackHtml = '';
      try {
        const d = await api('GET', `/dossiers/${e.dossier_id}`);
        miniTrackHtml = renderTransitLine(d.etapes || [], 'mini');
      } catch(ex) {}

      return `
        <div class="validation-card">
          <div class="validation-header">
            <div>
              <div class="validation-title">${esc(e.titre_etape)}</div>
              <div class="validation-sub">Dossier : <strong class="td-mono">${esc(e.dossier_ref)}</strong> (${esc(e.client_nom)})</div>
              ${miniTrackHtml}
            </div>
            <span class="badge badge-warning badge-pulse">En attente</span>
          </div>
          ${e.description ? `<div class="timeline-desc">${esc(e.description)}</div>` : ''}
          ${filesHtml ? `<div class="file-attachments" style="margin-bottom:12px">${filesHtml}</div>` : ''}
          <div class="timeline-meta">
            <span>Agent terrain : <strong>${esc(e.agent_nom)}</strong></span>
            <span>Déclaré le : ${fmtDate(e.date_declaration)}</span>
          </div>
          <div class="validation-actions">
            <button class="btn btn-secondary btn-sm" onclick="openRejectModal(${e.id})">❌ Rejeter</button>
            <button class="btn btn-primary btn-sm" onclick="validerEtape(${e.id})">✅ Valider</button>
          </div>
        </div>
      `;
    }));

    setContent(`
      <div class="card">
        <div class="card-header">
          <h2>File d'attente de validation (${etapes.length})</h2>
          <button class="btn btn-secondary btn-sm" onclick="validation()">🔄 Rafraîchir</button>
        </div>
        <div class="validation-queue">
          ${cardsHtml.join('')}
        </div>
      </div>
    `);
  } catch (e) {
    setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

async function validerEtape(id) {
  try {
    await api('PATCH', `/etapes/${id}/validate`);
    toast('Étape validée avec succès !');
    validation();
    loadNotifications();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function openRejectModal(id) {
  openModal('Rejeter l\'étape', `
    <form onsubmit="submitReject(event, ${id})">
      <div class="field-group">
        <label>Motif de rejet (obligatoire) *</label>
        <textarea name="motif_rejet" rows="4" placeholder="Précisez la raison du rejet..." required></textarea>
      </div>
      <div class="form-actions" style="margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-danger">Confirmer le rejet</button>
      </div>
    </form>
  `);
}

async function submitReject(e, id) {
  e.preventDefault();
  const motif = e.target.elements.motif_rejet.value;
  try {
    await api('PATCH', `/etapes/${id}/reject`, { motif_rejet: motif });
    toast('Étape rejetée');
    closeModal();
    validation();
    loadNotifications();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Agent : Formulaire de déclaration d'étape ────────────────────────────────
async function declarer_etape() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const dossiersRes = await api('GET', '/dossiers?limit=100');
    const dossiersList = dossiersRes.data || [];

    const dosOpts = dossiersList.map(d => `
      <option value="${d.id}">${esc(d.reference)} — ${esc(d.raison_sociale)} (${esc(d.marchandise || 'Sans désignation')})</option>
    `).join('');

    const cycleOpts = CYCLE_ETAPES.map(s => `
      <option value="${s}">${s}</option>
    `).join('');

    setContent(`
      <div class="card" style="max-width:720px; margin: 0 auto;">
        <div class="card-header">
          <h2>Déclarer une étape de transit</h2>
        </div>
        <div id="agentCompactLineContainer"></div>
        <form id="etapeForm" onsubmit="submitEtapeForm(event)" class="form-grid">
          <div class="field-group full">
            <label>Dossier assigné *</label>
            <select name="dossier_id" id="agentDossierSelect" required onchange="updateAgentCompactLine(this.value)">
              <option value="">— Sélectionner un dossier —</option>
              ${dosOpts}
            </select>
          </div>
          <div class="field-group full">
            <label>Étape du cycle de vie *</label>
            <select name="titre_etape" required>
              <option value="">— Choisir l'étape —</option>
              ${cycleOpts}
            </select>
          </div>
          <div class="field-group full">
            <label>Description / Remarques du terrain</label>
            <textarea name="description" rows="3" placeholder="Informations complémentaires, remarques, numéro de conteneur..."></textarea>
          </div>
          <div class="field-group full">
            <label>Pièces jointes (Photos / Documents / Justificatifs)</label>
            <input type="file" name="pieces_jointes" multiple accept="image/*,.pdf,.doc,.docx" />
            <span class="text-muted text-sm" style="margin-top:4px">Formats autorisés : PDF, Images, Word (Max 15MB)</span>
          </div>
          <div class="form-actions full">
            <button type="submit" class="btn btn-primary btn-full btn-agent-submit" id="submitEtapeBtn">
              <span>Transmettre pour validation</span>
            </button>
          </div>
        </form>
      </div>
    `);
  } catch (e) {
    setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

async function updateAgentCompactLine(dossierId) {
  const container = document.getElementById('agentCompactLineContainer');
  if (!container || !dossierId) {
    if (container) container.innerHTML = '';
    return;
  }
  try {
    const d = await api('GET', `/dossiers/${dossierId}`);
    container.innerHTML = renderTransitLine(d.etapes || [], 'compact');
  } catch(ex) {}
}

async function submitEtapeForm(e) {
  e.preventDefault();
  const btn = document.getElementById('submitEtapeBtn');
  btn.disabled = true;
  btn.classList.add('success-anim');
  btn.querySelector('span').textContent = '✓ Étape soumise ! Transmission...';

  const formData = new FormData(e.target);
  try {
    const res = await fetch('/api/etapes', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la déclaration');

    toast('Étape déclarée avec succès ! Transmise au superviseur.');
    setTimeout(() => {
      navigate('my_declarations');
    }, 400);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.classList.remove('success-anim');
    btn.querySelector('span').textContent = 'Transmettre pour validation';
  }
}

// ── Agent : Mes déclarations ──────────────────────────────────────────────────
async function my_declarations() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const etapes = await api('GET', '/etapes/my-declarations');
    if (!etapes || etapes.length === 0) {
      setContent(`
        <div class="empty" style="padding:40px">
          <div class="empty-icon">📝</div>
          <h3>Aucune déclaration enregistrée</h3>
          <p>Vous n'avez pas encore soumis d'étape pour vos dossiers.</p>
          <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('declarer_etape')">+ Déclarer une étape</button>
        </div>
      `);
      return;
    }

    const rows = etapes.map(e => `
      <tr>
        <td class="td-mono">${esc(e.dossier_ref)}</td>
        <td>${esc(e.client_nom)}</td>
        <td class="fw-600">${esc(e.titre_etape)}</td>
        <td>${statusBadge(e.statut, 'preavis')}</td>
        <td>${fmtDate(e.date_declaration)}</td>
        <td>
          ${e.statut === 'rejetee' && e.motif_rejet ? `
            <span class="text-danger" title="${esc(e.motif_rejet)}">⚠️ ${esc(e.motif_rejet)}</span>
          ` : e.statut === 'validee' ? `
            <span class="text-success">Validée par ${esc(e.validateur_nom || 'Superviseur')}</span>
          ` : `<span class="text-muted">En attente de revue</span>`}
        </td>
      </tr>
    `).join('');

    setContent(`
      <div class="card">
        <div class="card-header">
          <h2>Mes déclarations d'étape (${etapes.length})</h2>
          <button class="btn btn-primary btn-sm" onclick="navigate('declarer_etape')">+ Nouvelle déclaration</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Réf. Dossier</th>
                <th>Client</th>
                <th>Étape</th>
                <th>Statut</th>
                <th>Date Déclaration</th>
                <th>Remarques / Motif</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) {
    setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

// ── Superviseur : Gestion des Paramètres et des Utilisateurs ───────────────────
async function parametres() {
  setContent(`<div class="loading-state"><div class="spinner"></div></div>`);
  try {
    const users = await api('GET', '/parametres/utilisateurs');
    const rows = users.map(u => `
      <tr>
        <td class="fw-600">${esc(u.nom)} ${esc(u.prenom || '')}</td>
        <td class="td-mono">${esc(u.login)}</td>
        <td>${esc(u.email || '—')}</td>
        <td><span class="badge ${u.role === 'superviseur' || u.role === 'admin' ? 'badge-purple' : u.role === 'client' ? 'badge-info' : 'badge-warning'}">${u.role}</span></td>
        <td>${esc(u.client_nom || '—')}</td>
        <td><span class="badge ${u.actif ? 'badge-success' : 'badge-danger'}">${u.actif ? 'Actif' : 'Inactif'}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="openUserForm(${u.id})">Modifier</button>
        </td>
      </tr>
    `).join('');

    setContent(`
      <div class="card">
        <div class="card-header">
          <h2>Gestion des utilisateurs</h2>
          <button class="btn btn-primary btn-sm" onclick="openUserForm()">+ Nouvel utilisateur</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom & Prénom</th>
                <th>Login</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Client Associé</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) {
    setContent(`<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

async function openUserForm(id = null) {
  const [users, clientsRes] = await Promise.all([
    api('GET', '/parametres/utilisateurs'),
    api('GET', '/clients?limit=200')
  ]);
  const u = id ? users.find(x => x.id === id) || {} : {};
  const clientsList = clientsRes.data || [];

  const cOpts = clientsList.map(c => `
    <option value="${c.id}" ${u.client_id == c.id ? 'selected' : ''}>${esc(c.raison_sociale)} (${esc(c.code)})</option>
  `).join('');

  openModal(id ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur', `
    <form onsubmit="saveUser(event, ${id || 'null'})" class="form-grid">
      <div class="field-group"><label>Nom *</label><input name="nom" value="${esc(u.nom || '')}" required /></div>
      <div class="field-group"><label>Prénom</label><input name="prenom" value="${esc(u.prenom || '')}" /></div>
      <div class="field-group"><label>Login *</label><input name="login" value="${esc(u.login || '')}" ${id ? 'readonly' : 'required'} /></div>
      <div class="field-group"><label>Mot de passe ${id ? '(laisser vide pour ne pas changer)' : '*'}</label><input type="password" name="mot_de_passe" ${id ? '' : 'required'} /></div>
      <div class="field-group"><label>Email</label><input type="email" name="email" value="${esc(u.email || '')}" /></div>
      <div class="field-group"><label>Rôle *</label>
        <select name="role" required onchange="toggleClientSelect(this.value)">
          <option value="agent" ${u.role === 'agent' ? 'selected' : ''}>Agent (Terrain)</option>
          <option value="superviseur" ${u.role === 'superviseur' || u.role === 'admin' ? 'selected' : ''}>Superviseur (Admin)</option>
          <option value="client" ${u.role === 'client' ? 'selected' : ''}>Client (Espace restreint)</option>
        </select>
      </div>
      <div class="field-group full" id="clientSelectGroup" style="${u.role === 'client' ? '' : 'display:none'}">
        <label>Société Client associée *</label>
        <select name="client_id">
          <option value="">— Choisir la société client —</option>
          ${cOpts}
        </select>
      </div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>
  `);
}

function toggleClientSelect(role) {
  const grp = document.getElementById('clientSelectGroup');
  if (grp) {
    grp.style.display = role === 'client' ? 'block' : 'none';
  }
}

async function saveUser(e, id) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    if (id) {
      await api('PUT', `/parametres/utilisateurs/${id}`, body);
      toast('Utilisateur mis à jour');
    } else {
      await api('POST', '/parametres/utilisateurs', body);
      toast('Utilisateur créé avec succès');
    }
    closeModal();
    parametres();
  } catch (err) {
    toast(err.message, 'error');
  }
}


// ════════════════════════════════════════════════════════════════
//  PDF AI EXTRACTION — Widget et logique de remplissage auto
// ════════════════════════════════════════════════════════════════

/**
 * Génère le HTML du widget d'upload PDF.
 * @param {string} type   - 'client' | 'dossier' | 'debours'
 * @param {string} widgetId - ID du conteneur pour les callbacks
 */
function pdfUploadWidget(type, widgetId) {
  const labels = { client: 'client / contrat', dossier: 'BL / connaissement / facture commerciale', debours: 'facture / reçu / bon de caisse' };
  return `
  <div id="${widgetId}" style="
    border:2px dashed var(--accent);border-radius:10px;padding:14px 16px;
    margin-bottom:18px;background:var(--accent-light);
  ">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:20px">🤖</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--accent)">Extraction automatique par IA</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">
          Importez un PDF (${labels[type]}) — les champs seront remplis automatiquement
        </div>
      </div>
      <label style="cursor:pointer">
        <input type="file" accept=".pdf" style="display:none"
          onchange="handlePdfUpload(event,'${type}','${widgetId}')"/>
        <span class="btn btn-primary btn-sm">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
          Importer PDF
        </span>
      </label>
    </div>
    <div id="${widgetId}_status" style="margin-top:8px;display:none"></div>
  </div>`;
}

/**
 * Gère l'upload du PDF, appelle l'API d'extraction, remplit le formulaire.
 */
async function handlePdfUpload(event, type, widgetId) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById(widgetId + '_status');
  statusEl.style.display = 'block';
  statusEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--accent)">
      <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
      <span>Analyse du PDF en cours…</span>
    </div>`;

  try {
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('type', type);

    const res = await fetch('/api/ai/extract-pdf', {
      method: 'POST',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
      body: formData
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      throw new Error(result.error || 'Erreur serveur');
    }

    const data = result.data;
    const fieldsCount = Object.keys(data).length;

    // Remplir les champs du formulaire
    fillFormFromPdf(type, data);

    const methodLabel = result.method === 'ai'
      ? '✅ IA (GPT-4o)'
      : '⚠️ Extraction basique (sans clé OpenAI)';

    statusEl.innerHTML = `
      <div style="background:#d1fae5;border-radius:6px;padding:8px 12px;font-size:12px;color:#065f46">
        ${methodLabel} — <strong>${fieldsCount} champ(s) rempli(s)</strong> depuis <em>${file.name}</em>
        <span style="float:right;cursor:pointer;color:#065f46" onclick="this.parentElement.parentElement.style.display='none'">✕</span>
      </div>`;

    toast(`${fieldsCount} champs extraits du PDF`, 'success');

  } catch (err) {
    statusEl.innerHTML = `
      <div style="background:#fee2e2;border-radius:6px;padding:8px 12px;font-size:12px;color:#991b1b">
        ❌ ${err.message}
        <span style="float:right;cursor:pointer" onclick="this.parentElement.parentElement.style.display='none'">✕</span>
      </div>`;
    toast(err.message, 'error');
  }

  // Reset file input
  event.target.value = '';
}

/**
 * Remplit les champs du formulaire modal selon le type et les données extraites.
 */
function fillFormFromPdf(type, data) {
  const modal = document.getElementById('modalBody');
  if (!modal) return;

  function setField(name, value) {
    if (!value) return;
    const el = modal.querySelector(`[name="${name}"]`);
    if (!el) return;
    el.value = value;
    // Animation visuelle pour signaler le champ rempli
    el.style.transition = 'background .3s';
    el.style.background = 'rgba(108,71,255,0.08)';
    setTimeout(() => { el.style.background = ''; }, 2000);
  }

  function matchSelect(name, value) {
    if (!value) return;
    const el = modal.querySelector(`select[name="${name}"]`);
    if (!el) return;
    const val = value.toString().toLowerCase();
    // Cherche une option qui contient le texte
    for (const opt of el.options) {
      if (opt.text.toLowerCase().includes(val) || opt.value.toLowerCase().includes(val)) {
        el.value = opt.value;
        el.style.background = 'rgba(108,71,255,0.08)';
        setTimeout(() => { el.style.background = ''; }, 2000);
        break;
      }
    }
  }

  if (type === 'client') {
    setField('code', data.code);
    setField('raison_sociale', data.raison_sociale);
    setField('adresse', data.adresse);
    setField('ville', data.ville);
    setField('code_postal', data.code_postal);
    setField('telephone', data.telephone);
    setField('email', data.email);
    setField('contact', data.contact);
    setField('nif', data.nif || data.matricule_fiscal);
    setField('notes', data.notes);
    if (data.secteur_lib) matchSelect('secteur_id', data.secteur_lib);
  }

  if (type === 'dossier') {
    setField('marchandise', data.marchandise);
    setField('pays_origine', data.pays_origine);
    setField('pays_destination', data.pays_destination);
    setField('incoterm', data.incoterm);
    setField('description', data.description || data.observations);
    setField('observations', data.observations);
    if (data.valeur_marchandise) {
      setField('valeur_douane', parseFloat(data.valeur_marchandise.toString().replace(/[^0-9.]/g,'')) || 0);
    }
    // Sélectionner le type de déclaration
    if (data.type_declaration) matchSelect('type_decl_id', data.type_declaration);
    // Chercher le client par nom
    if (data.client_nom) {
      const selClient = modal.querySelector('select[name="client_id"]');
      if (selClient) {
        const nom = data.client_nom.toLowerCase();
        for (const opt of selClient.options) {
          if (opt.text.toLowerCase().includes(nom.slice(0,8))) {
            selClient.value = opt.value;
            selClient.style.background = 'rgba(108,71,255,0.08)';
            setTimeout(() => { selClient.style.background = ''; }, 2000);
            break;
          }
        }
      }
    }
  }

  if (type === 'debours') {
    setField('libelle', data.libelle);
    setField('beneficiaire', data.beneficiaire);
    setField('montant', data.montant);
    setField('date_debours', data.date_debours);
    setField('notes', data.observations);
    // Chercher le dossier par référence
    if (data.ref_dossier) {
      const selDos = modal.querySelector('select[name="dossier_id"]');
      if (selDos) {
        const ref = data.ref_dossier.toLowerCase();
        for (const opt of selDos.options) {
          if (opt.text.toLowerCase().includes(ref)) {
            selDos.value = opt.value;
            break;
          }
        }
      }
    }
  }
}

//  ── FIN PDF AI ────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════
//  BOOTSTRAP — DOMContentLoaded
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  // ── Theme ──────────────────────────────────────────────────
  const savedTheme = localStorage.getItem('transit_theme') || 'light';
  document.documentElement.dataset.theme = savedTheme;
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('transit_theme', next);
  });

  // ── Modal close ────────────────────────────────────────────
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Sidebar toggle (mobile) ────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
  // Close sidebar when nav item clicked on mobile
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768) sidebar.classList.remove('open');
    });
  });

  // ── Nav links ──────────────────────────────────────────────
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.addEventListener('click', () => navigate(link.dataset.page));
  });

  // ── Logout ────────────────────────────────────────────────
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // ── Login form ────────────────────────────────────────────
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    document.getElementById('loginError').classList.add('hidden');
    const loginVal = document.getElementById('loginInput').value.trim();
    const passVal  = document.getElementById('passwordInput').value;
    await login(loginVal, passVal);
  });

  // ── Check auth ────────────────────────────────────────────
  if (token) {
    try {
      currentUser = await api('GET', '/auth/me');
      showApp();
    } catch {
      // Token invalide ou expiré → nettoyer et afficher le login
      token = null;
      currentUser = null;
      localStorage.removeItem('transit_token');
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('appShell').classList.add('hidden');
    }
  }
});
