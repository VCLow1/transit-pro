const http = require('http');
const { initDb } = require('../db/database');
const seed = require('./seed');
const handler = require('../server');

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('🧪 Starting Automated Workflow Verification Tests...\n');

  // Supprimer l'ancienne base pour avoir un schéma propre sans ancienne contrainte CHECK
  const dbFile = path.join(__dirname, '../db/transit.db');
  if (fs.existsSync(dbFile)) {
    try { fs.unlinkSync(dbFile); } catch(ex) {}
  }

  // 1. Initialize DB & Seed
  await initDb();
  await seed();
  console.log('✅ 1. Database & Seed initialized successfully.');

  // Start temporary server for HTTP tests
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(3099, resolve));
  const BASE_URL = 'http://localhost:3099/api';

  async function post(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE_URL + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  async function patch(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE_URL + path, { method: 'PATCH', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  async function get(path, token) {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE_URL + path, { headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    // 2. Logins
    const adminLogin = await post('/auth/login', { login: 'admin', mot_de_passe: 'admin123' });
    const agentLogin = await post('/auth/login', { login: 'agent1', mot_de_passe: 'agent123' });
    const clientLogin = await post('/auth/login', { login: 'client1', mot_de_passe: 'client123' });

    if (!adminLogin.data.token || !agentLogin.data.token || !clientLogin.data.token) {
      console.error('Admin Login Result:', adminLogin);
      console.error('Agent Login Result:', agentLogin);
      console.error('Client Login Result:', clientLogin);
      throw new Error('Login failed for one or more test accounts');
    }
    const adminToken = adminLogin.data.token;
    const agentToken = agentLogin.data.token;
    const clientToken = clientLogin.data.token;

    console.log('✅ 2. Logins successful (Admin, Agent1, Client1).');

    // Get a dossier ID owned by Client1 (STEG)
    const dossiers = await get('/dossiers', adminToken);
    const stegDossier = dossiers.data.data.find(d => d.client_id === clientLogin.data.user.client_id);
    if (!stegDossier) throw new Error('No dossier found for Client1 (STEG)');
    const dossierId = stegDossier.id;

    // 3. Agent declares a new step
    const stepDecl = await post('/etapes', {
      dossier_id: dossierId,
      titre_etape: '3. Déclaration en douane',
      description: 'Test declaration - TradeNet Ref 8849'
    }, agentToken);

    if (stepDecl.status !== 201 || !stepDecl.data.id) {
      throw new Error('Agent step declaration failed: ' + JSON.stringify(stepDecl.data));
    }
    const stepId = stepDecl.data.id;
    console.log(`✅ 3. Agent1 declared step #${stepId} ("3. Déclaration en douane") -> Status: en_attente.`);

    // 4. Verify Client1 CANNOT see the pending step
    const clientEtapesInitial = await get(`/etapes/dossier/${dossierId}`, clientToken);
    const hasPendingStep = clientEtapesInitial.data.some(e => e.id === stepId);
    if (hasPendingStep) {
      throw new Error('CRITICAL PERMISSION FAIL: Client can see pending step before supervisor validation!');
    }
    console.log('✅ 4. Non-negotiable principle verified: Client CANNOT see pending step.');

    // 5. Supervisor fetches pending queue & validates step
    const pendingQueue = await get('/etapes/pending', adminToken);
    const targetStep = pendingQueue.data.find(e => e.id === stepId);
    if (!targetStep) throw new Error('Pending step not found in supervisor queue');

    const validationRes = await patch(`/etapes/${stepId}/validate`, {}, adminToken);
    if (validationRes.status !== 200) throw new Error('Step validation failed');
    console.log(`✅ 5. Supervisor validated step #${stepId}.`);

    // 6. Verify Client1 CAN NOW see the validated step
    const clientEtapesAfter = await get(`/etapes/dossier/${dossierId}`, clientToken);
    const validatedStep = clientEtapesAfter.data.find(e => e.id === stepId);
    if (!validatedStep || validatedStep.statut !== 'validee') {
      throw new Error('Validated step is missing from client view!');
    }
    console.log('✅ 6. Client CAN NOW see the validated step on their timeline.');

    // 7. Test Rejection Workflow & Rejection Motif Requirement
    const step2Decl = await post('/etapes', {
      dossier_id: dossierId,
      titre_etape: '4. Contrôle / inspection douanière',
      description: 'Demande de visite physique douane'
    }, agentToken);
    const step2Id = step2Decl.data.id;

    // Reject without motif -> MUST fail (400)
    const rejectNoMotif = await patch(`/etapes/${step2Id}/reject`, {}, adminToken);
    if (rejectNoMotif.status !== 400) {
      throw new Error('Rejection without motif should have failed with status 400!');
    }

    // Reject with motif -> MUST succeed
    const rejectWithMotif = await patch(`/etapes/${step2Id}/reject`, {
      motif_rejet: 'Documents complémentaires requis par l\'inspecteur douanier'
    }, adminToken);
    if (rejectWithMotif.status !== 200) {
      throw new Error('Rejection with valid motif failed!');
    }
    console.log(`✅ 7. Rejection requirement verified (rejected without motif failed with 400, succeeded with motif).`);

    // 8. Verify Agent received notifications
    const agentNotifs = await get('/notifications', agentToken);
    if (!agentNotifs.data.notifications || agentNotifs.data.notifications.length === 0) {
      throw new Error('Agent received no notifications!');
    }
    console.log(`✅ 8. Notifications verified (Agent received ${agentNotifs.data.notifications.length} notifications).`);

    console.log('\n🎉 ALL WORKFLOW TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
