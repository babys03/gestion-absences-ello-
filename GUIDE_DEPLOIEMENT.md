# 🏫 Application de Gestion des Absences Scolaires

Application mobile et web pour gérer les absences dans une école.

## ✨ Fonctionnalités

- ✅ **Faire l'appel** - Marquer les absences par demi-journée (Matin/Après-midi)
- ✅ **Gestion des classes** - Créer, modifier, supprimer des classes
- ✅ **Gestion des élèves** - Ajouter des élèves avec contacts parents
- ✅ **Statistiques** - Graphiques et rapports détaillés
- ✅ **Notifications** - Alertes automatiques pour les parents
- ✅ **Export PDF/Excel** - Feuilles d'appel et récapitulatifs imprimables

---

## 🚀 Déploiement Gratuit

### Étape 1 : Base de données MongoDB Atlas (Gratuit)

1. Créez un compte sur [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Créez un cluster **FREE** (M0 Sandbox)
3. Créez un utilisateur de base de données
4. Autorisez toutes les IPs : `0.0.0.0/0`
5. Copiez l'URL de connexion :
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/absences?retryWrites=true&w=majority
   ```

### Étape 2 : Backend sur Render (Gratuit)

1. Créez un compte sur [render.com](https://render.com)
2. Connectez votre GitHub
3. Créez un **New Web Service**
4. Configurez :
   - **Root Directory** : `backend`
   - **Runtime** : Python 3
   - **Build Command** : `pip install -r requirements.txt`
   - **Start Command** : `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Ajoutez les **Variables d'environnement** :
   ```
   MONGO_URL = votre_url_mongodb_atlas
   DB_NAME = absences
   ```
6. Déployez ! Notez l'URL (ex: `https://votre-app.onrender.com`)

### Étape 3 : Frontend Mobile (APK Android)

1. Installez les outils :
   ```bash
   npm install -g eas-cli
   cd frontend
   npm install
   ```

2. Modifiez le fichier `frontend/.env` :
   ```
   EXPO_PUBLIC_BACKEND_URL=https://votre-app.onrender.com
   ```

3. Connectez-vous à Expo :
   ```bash
   eas login
   ```

4. Générez l'APK :
   ```bash
   eas build --platform android --profile preview
   ```

5. Téléchargez l'APK et installez-le sur votre téléphone !

---

## 📁 Structure du Projet

```
├── backend/
│   ├── server.py          # API FastAPI
│   ├── requirements.txt   # Dépendances Python
│   └── .env              # Variables d'environnement
│
├── frontend/
│   ├── app/              # Écrans de l'application
│   │   ├── index.tsx     # Accueil
│   │   ├── appel.tsx     # Faire l'appel
│   │   ├── classes.tsx   # Gestion classes
│   │   ├── students.tsx  # Gestion élèves
│   │   ├── absences.tsx  # Historique
│   │   ├── statistics.tsx # Statistiques
│   │   └── exports.tsx   # Exports PDF/Excel
│   ├── app.json          # Configuration Expo
│   └── package.json      # Dépendances JS
```

---

## 🔧 Variables d'Environnement

### Backend (`backend/.env`)
```env
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/absences
DB_NAME=absences
```

### Frontend (`frontend/.env`)
```env
EXPO_PUBLIC_BACKEND_URL=https://votre-backend-url.com
```

---

## 📱 Utilisation

1. **Accueil** - Vue d'ensemble avec statistiques
2. **Appel** - Sélectionnez la date, la classe, et cochez les absents
3. **Classes** - Gérez vos classes (6ème A, 5ème B, etc.)
4. **Élèves** - Ajoutez les élèves avec email/téléphone des parents
5. **Historique** - Consultez et modifiez les absences passées
6. **Exports** - Téléchargez les feuilles en PDF ou Excel

---

## 💰 Coûts (Tout Gratuit !)

| Service | Limite Gratuite |
|---------|-----------------|
| MongoDB Atlas | 512 MB de données |
| Render | 750h/mois (suffisant) |
| EAS Build | 30 builds/mois |

---

## 🆘 Support

En cas de problème :
- MongoDB Atlas : [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- Render : [render.com/docs](https://render.com/docs)
- Expo : [docs.expo.dev](https://docs.expo.dev)

---

Créé avec ❤️ pour la gestion scolaire
