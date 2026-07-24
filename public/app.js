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

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  // Update user info
  const n = (currentUser.prenom || '') + ' ' + currentUser.nom;
  document.getElementById('userName').textContent = n.trim() || currentUser.login;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('userAvatar').textContent = (currentUser.nom || currentUser.login)[0].toUpperCase();
  navigate('dashboard');
}

// ── Navigation ───────────────────────────────────────────────────
const pageTitles = {
  dashboard:'Tableau de bord', clients:'Clients', dossiers:'Dossiers',
  devis:'Devis', factures:'Factures', debours:'Débours', preavis:'Préavis d\'arrivée'
};

function navigate(page, params = {}) {
  currentPage = page;
  // Active nav
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  // Top actions
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
  if (newBtns[page]) {
    const b = document.createElement('button');
    b.className = 'btn btn-primary';
    b.textContent = newBtns[page].label;
    b.onclick = newBtns[page].fn;
    ta.appendChild(b);
  }
  const renders = {
    dashboard, clients, dossiers, devis, factures, debours, preavis
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
    </form>`);
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

    document.getElementById('modalTitle').textContent = `Dossier ${d.reference}`;
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-header" style="margin-bottom:16px">
        <div><div class="detail-title">${esc(d.reference)}</div><div class="detail-subtitle">${esc(d.raison_sociale)}</div></div>
        <div class="detail-actions">
          ${statusBadge(d.statut,'dossier')}
          <select class="filter-select" id="statutSel" style="padding:5px 10px;font-size:12px" onchange="changerStatutDossier(${id},this.value)">${statOpts}</select>
          <button class="btn btn-secondary btn-sm" onclick="closeModal();openDossierForm(${id})">Modifier</button>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${esc(d.type_libelle)}</div></div>
        <div class="detail-item"><div class="detail-label">Marchandise</div><div class="detail-value">${esc(d.marchandise||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Pays origine</div><div class="detail-value">${esc(d.pays_origine||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Incoterm</div><div class="detail-value">${esc(d.incoterm||'—')}</div></div>
        <div class="detail-item"><div class="detail-label">Créé le</div><div class="detail-value">${fmtDate(d.created_at)}</div></div>
        <div class="detail-item"><div class="detail-label">Par</div><div class="detail-value">${esc(d.cree_par||'—')}</div></div>
      </div>
      <div class="tabs" id="dossTabs">
        <div class="tab active" onclick="switchTab('dossTabs','dossTab',0)">Factures</div>
        <div class="tab" onclick="switchTab('dossTabs','dossTab',1)">Débours</div>
        <div class="tab" onclick="switchTab('dossTabs','dossTab',2)">Préavis</div>
        <div class="tab" onclick="switchTab('dossTabs','dossTab',3)">Notes</div>
      </div>
      <div class="tab-panel active dossTab"><div class="table-wrap"><table><thead><tr><th>N°</th><th>Date</th><th>Statut</th><th>Montant</th></tr></thead><tbody>${facRows}</tbody></table></div></div>
      <div class="tab-panel dossTab"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Bénéficiaire</th><th>Montant</th></tr></thead><tbody>${debRows}</tbody></table></div></div>
      <div class="tab-panel dossTab"><div class="table-wrap"><table><thead><tr><th>Réf.</th><th>Transporteur</th><th>Arrivée</th><th>Statut</th></tr></thead><tbody>${preRows}</tbody></table></div></div>
      <div class="tab-panel dossTab">
        ${noteItems}
        <form style="margin-top:12px" onsubmit="addNote(event,${id})">
          <div class="field-group"><label>Ajouter une note</label><textarea name="contenu" rows="2" placeholder="Saisir une note…" required></textarea></div>
          <div style="margin-top:8px"><button type="submit" class="btn btn-primary btn-sm">Ajouter</button></div>
        </form>
      </div>`;
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
    </form>`);
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
    </form>`);
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
      token = null;
      localStorage.removeItem('transit_token');
    }
  }
});
