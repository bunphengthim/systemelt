# 🚀 ការ Deploy ELYTHONG Repair System នៅ Render + Aiven MySQL

## សង្ខេប Architecture
```
[User Browser]
      │
      ▼
[Render - Frontend]          (Static Site - FREE)
  elythong-repair.onrender.com
      │ API calls (fetch)
      ▼
[Render - Backend API]       (Web Service - FREE)
  elythong-repair-api.onrender.com
      │ MySQL connection (SSL)
      ▼
[Aiven - MySQL Database]     (FREE tier - 5GB)
  mysql-xxx.aivencloud.com
```

---

## ជំហានទី 1 — បង្កើត MySQL Database នៅ Aiven (FREE)

1. ចូល **https://aiven.io** → Sign up (FREE)
2. Click **"Create service"** → ជ្រើស **MySQL**
3. ជ្រើស **Free plan** → Region: **Google Cloud / Singapore**
4. Service name: `elythong-mysql` → Click **"Create free service"**
5. រង់ចាំ ~2 នាទី ដល់ status បង្ហាញ 🟢 **Running**
6. ចូលក្នុង service → Tab **"Overview"** → Copy ព័ត៌មានទាំងនេះ:

```
Host:      mysql-xxxxxxx.aivencloud.com
Port:      12345   (port ខុសគ្នា)
Database:  defaultdb
Username:  avnadmin
Password:  xxxxxxxxxxxxxxxxx
```

> ⚠️ **DB_NAME**: Aiven ប្រើ `defaultdb` — **កុំប្ដូរ** ឬ បង្កើត database ថ្មីជាមុន

### បង្កើត Database ថ្មីមួយ (optional)
- Tab **"Databases"** → Add database name: `elythong_repair` → Create
- បើធ្វើបែបនេះ → `DB_NAME=elythong_repair`
- បើមិនធ្វើ → `DB_NAME=defaultdb`

---

## ជំហានទី 2 — Upload Code ទៅ GitHub

1. ចូល **https://github.com** → New repository
2. Repository name: `elythong-repair`
3. Private ✅ → Create repository
4. Upload files ទាំងអស់ (drag & drop folder `elythong_deploy`)

**Structure ត្រូវតែបង្ហាញ:**
```
elythong-repair/
├── backend/
│   ├── app.py
│   ├── connect_db.py
│   ├── create_db_mysql.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── render.yaml
└── DEPLOY_GUIDE.md
```

---

## ជំហានទី 3 — Deploy Backend នៅ Render

1. ចូល **https://render.com** → Sign up (FREE) → Connect GitHub
2. Click **"New +"** → **Web Service**
3. Connect repository: `elythong-repair`
4. បំពេញ settings:

| Field | Value |
|-------|-------|
| Name | `elythong-repair-api` |
| Root Directory | `backend` |
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120` |
| Instance Type | **Free** |

5. Scroll ចុះ → **Environment Variables** → Add:

| Key | Value |
|-----|-------|
| `DB_HOST` | (copy ពី Aiven) |
| `DB_PORT` | (copy ពី Aiven) |
| `DB_USER` | `avnadmin` |
| `DB_PASSWORD` | (copy ពី Aiven) |
| `DB_NAME` | `elythong_repair` ឬ `defaultdb` |

6. Click **"Create Web Service"** → រង់ចាំ deploy (~3-5 នាទី)
7. Copy URL backend: `https://elythong-repair-api.onrender.com`

---

## ជំហានទី 4 — កែ Frontend ឱ្យប្រើ Backend URL

**បើក `frontend/app.js`** → line 3 → ផ្លាស់ប្ដូរ:

```javascript
// មុន:
const BACKEND_URL = 'https://elythong-repair-api.onrender.com';

// ក្រោយ (ប្ដូរ URL ទៅជា URL ពិតរបស់អ្នក):
const BACKEND_URL = 'https://elythong-repair-api.onrender.com';
```

> ✅ URL នេះ preset ហើយ — បើ URL ដូចគ្នា មិនចាំបាច់ប្ដូរ

---

## ជំហានទី 5 — Deploy Frontend នៅ Render

1. Click **"New +"** → **Static Site**
2. Connect repository: `elythong-repair`
3. បំពេញ settings:

| Field | Value |
|-------|-------|
| Name | `elythong-repair` |
| Root Directory | `frontend` |
| Build Command | *(ទទេ)* |
| Publish Directory | `.` |

4. Click **"Create Static Site"** → រង់ចាំ ~1 នាទី
5. Frontend URL: `https://elythong-repair.onrender.com` ✅

---

## ✅ ពិនិត្យ Final

- [ ] Aiven MySQL: status 🟢 Running
- [ ] Render Backend: status 🟢 Live → ចូល `/api/records` ឃើញ `[]`
- [ ] Render Frontend: status 🟢 Live → Login បាន
- [ ] ពី Frontend អាច Add/Edit/Delete data បាន

---

## ⚠️ ចំណាំសំខាន់ — Render FREE tier

> Render FREE service **sleep** ក្រោយ 15 នាទីអសកម្ម  
> Load ដំបូង (~30-50 វិ) យឺត — នេះជារឿងធម្មតា  
> **Fix**: upgrade ទៅ Starter ($7/month) ឬ ping service រៀង 10 នាទីម្ដង

### Ping Script (Keep-alive) — optional
បន្ថែម service monitor នៅ Render Dashboard → Health Check Path: `/api/records`

---

## 🆘 Troubleshoot

| បញ្ហា | ដំណោះស្រាយ |
|-------|-----------|
| Backend error "Can't connect to MySQL" | ពិនិត្យ DB_HOST, DB_PORT, DB_PASSWORD នៅ Render env vars |
| SSL error | Aiven តម្រូវ SSL — app.py រួចហើយ support |
| CORS error | app.py មាន `CORS(app)` ហើយ — ពិនិត្យ BACKEND_URL ក្នុង app.js |
| 502 Bad Gateway | Backend still starting — រង់ 1-2 នាទី |
