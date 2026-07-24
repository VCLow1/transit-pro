const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Mock data - no database for now
const users = [
  {
    id: 1,
    login: 'admin',
    mot_de_passe: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // admin123
    nom: 'Admin',
    prenom: 'System',
    role: 'admin'
  }
];

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, mot_de_passe } = req.body;
    const user = users.find(u => u.login === login);
    
    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    const token = jwt.sign(
      { id: user.id, login: user.login, nom: user.nom, role: user.role },
      'jwt_secret_key',
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { id: user.id, login: user.login, nom: user.nom, prenom: user.prenom, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simple dashboard data
app.get('/api/dashboard', (req, res) => {
  res.json({
    stats: {
      clients: 5,
      dossiers: 12,
      factures: 8,
      ca_total: 15000
    }
  });
});

// Test CSS endpoint
app.get('/test-css', (req, res) => {
  const cssPath = path.join(__dirname, 'public', 'style.css');
  res.sendFile(cssPath);
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;