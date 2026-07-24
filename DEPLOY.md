# Déploiement Transit Pro

## Option A — Render.com (recommandé, sans CLI)

### 1. Créer un compte GitHub et pusher le code
```bash
git remote add origin https://github.com/TON_USERNAME/transit-pro.git
git push -u origin master
```

### 2. Déployer sur Render
1. Va sur https://render.com → "New" → "Web Service"
2. Connecte ton repo GitHub `transit-pro`
3. Paramètres :
   - **Name** : `transit-pro`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
4. Section **Advanced** → **Add Disk** :
   - Name : `data`
   - Mount Path : `/data`
   - Size : 1 GB
5. Clique **Create Web Service**
6. Render te donne une URL type `https://transit-pro.onrender.com`

### Identifiants
- admin / admin123
- agent1 / agent123

---

## Option B — Railway.com (via CLI)

```bash
npm install -g @railway/cli
railway login
railway init      # Crée un projet "transit-pro"
railway up        # Déploie le code
railway volume add --mount /data --size 1  # Ajoute le disque persistant
railway domain    # Génère l'URL publique
```

---

## Option C — Fly.io (gratuit, robuste)

```bash
npm install -g flyctl
flyctl auth login
flyctl launch --name transit-pro --no-deploy
flyctl volumes create data --size 1 --region cdg
flyctl deploy
flyctl open
```
