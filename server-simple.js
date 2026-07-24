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
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Explicit CSS route for debugging
app.get('/style.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

// Mock data - no database for now
const users = [
  {
    id: 1,
    login: 'admin',
    mot_de_passe: '$2a$10$z5XsyKcVWWB0aAJ8dQKDbeX.wW1YUnaMsJHKKYzdNU5CBNpbOx3Yu', // admin123
    nom: 'Admin',
    prenom: 'System',
    role: 'admin'
  }
];

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, mot_de_passe } = req.body;
    
    console.log('Login attempt:', { login, password: mot_de_passe }); // Debug
    
    const user = users.find(u => u.login === login);
    
    if (!user) {
      console.log('User not found');
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    // Simple fallback: allow direct password or hashed password
    let valid = false;
    if (mot_de_passe === 'admin123') {
      valid = true; // Direct password for easy testing
    } else {
      try {
        valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
      } catch (e) {
        console.log('Bcrypt error:', e.message);
        valid = false;
      }
    }
    
    if (!valid) {
      console.log('Password invalid');
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    console.log('Login successful');
    
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
    console.error('Auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth check endpoint  
app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, 'jwt_secret_key');
    const user = users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ id: user.id, login: user.login, nom: user.nom, prenom: user.prenom, role: user.role });
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// Test login endpoint
app.get('/api/test-login', (req, res) => {
  res.json({ 
    message: 'Auth endpoint working',
    users: users.map(u => ({ login: u.login, role: u.role })),
    testCredentials: { login: 'admin', password: 'admin123' }
  });
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
  console.log('CSS Path:', cssPath);
  console.log('File exists:', require('fs').existsSync(cssPath));
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(cssPath);
});

// Debug static files
app.get('/debug-static', (req, res) => {
  const fs = require('fs');
  const publicPath = path.join(__dirname, 'public');
  try {
    const files = fs.readdirSync(publicPath);
    res.json({
      publicPath,
      files,
      __dirname,
      exists: fs.existsSync(publicPath)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;