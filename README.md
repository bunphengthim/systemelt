# 🔧 Elythong Repair System

ប្រព័ន្ធគ្រប់គ្រងការជួសជុល - Repair Management System

## 📁 Project Structure

```
elythong_repair/
├── backend/              ← Flask API (Python)
│   ├── app.py            ← Main API server
│   ├── connect_db.py     ← DB connection test
│   ├── create_db_mysql.py← DB setup script
│   └── requirements.txt  ← Python packages
├── frontend/             ← Static HTML/CSS/JS
│   └── index.html        ← Main UI
├── render.yaml           ← Render deployment config
└── README.md
```

---

## 🚀 Deploy to Render

### ជំហានទី 1 — Push to GitHub
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/elythong_repair.git
git push -u origin main
```

### ជំហានទី 2 — Deploy Backend on Render
1. ចូល [render.com](https://render.com) → **New** → **Web Service**
2. ភ្ជាប់ GitHub repo
3. ជ្រើស **Root Directory** = `backend`
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`
6. បន្ថែម **Environment Variables**:
   - `DB_HOST` = your MySQL host
   - `DB_USER` = your MySQL username
   - `DB_PASSWORD` = your MySQL password
   - `DB_NAME` = `elythong_repair`

### ជំហានទី 3 — Deploy Frontend on Render
1. **New** → **Static Site**
2. ភ្ជាប់ GitHub repo
3. **Root Directory** = `frontend`
4. **Publish Directory** = `.`
5. Deploy!

### ជំហានទី 4 — ភ្ជាប់ Frontend ទៅ Backend
នៅក្នុង `frontend/index.html` ស្វែងរក API URL ហើយប្តូរទៅ Backend URL របស់ Render:
```
const API_URL = 'https://elythong-repair-api.onrender.com';
```

---

## 🗄️ Database (MySQL)

ប្រើ **PlanetScale**, **Railway**, ឬ **Aiven** សម្រាប់ MySQL free hosting។

Run setup script:
```bash
python backend/create_db_mysql.py
```

---

## 💻 Run Locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
source .venv/bin/activate # Mac/Linux
pip install -r requirements.txt
python app.py
```

បន្ទាប់មក open `frontend/index.html` ក្នុង browser។
