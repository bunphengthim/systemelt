"""
create_db_mysql.py
==================
១. បង្កើត MySQL database  'elythong_repair'
២. បង្កើត tables ទាំងអស់
៣. Migrate ទិន្នន័យចាស់ពី SQLite → MySQL (ដោយស្វ័យប្រវត្តិ)

រត់ម្តងគ្រាន់ដើម្បីដំឡើង:
    python create_db_mysql.py
"""

import pymysql
import sqlite3
import os

# ── Config ──────────────────────────────────────
DB_NAME   = 'elythong_repair'
SQLITE_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'elythong_repair.db')

# ── Connect & create DB ──────────────────────────
conn = pymysql.connect(
    host="mysql-25ee43b3-system.a.aivencloud.com",
    port=25581,
    user="avnadmin",
    password='',
    charset='utf8mb4',
    connect_timeout=5   # 🔥 important
)
cur  = conn.cursor()

cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
cur.execute(f"USE `{DB_NAME}`")
print(f"✅ Database '{DB_NAME}' ready")

# ── Create Tables ────────────────────────────────
cur.execute('''CREATE TABLE IF NOT EXISTS repair_requests (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    receipt      VARCHAR(20) NOT NULL UNIQUE,
    date         VARCHAR(20),
    machine_type VARCHAR(100),
    machine_code VARCHAR(50),
    requester    VARCHAR(100),
    phone        VARCHAR(30),
    location     VARCHAR(200),
    description  TEXT,
    req_date     VARCHAR(20),
    note         TEXT,
    status       ENUM('pending','progress','done') DEFAULT 'pending',
    start_date   VARCHAR(20),
    done_date    VARCHAR(20),
    report       TEXT,
    parts_total  DOUBLE DEFAULT 0,
    labor_total  DOUBLE DEFAULT 0,
    grand_total  DOUBLE DEFAULT 0,
    created_at   VARCHAR(30),
    updated_at   VARCHAR(30)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

cur.execute('''CREATE TABLE IF NOT EXISTS request_signatures (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    request_id  INT NOT NULL,
    sig_type    ENUM('request','completion') NOT NULL,
    agent_req   VARCHAR(100), agent_appr  VARCHAR(100),
    agent_legal VARCHAR(100), agent_conf  VARCHAR(100),
    base_req    VARCHAR(100), base_appr   VARCHAR(100),
    base_legal  VARCHAR(100), base_conf   VARCHAR(100),
    sign_req    VARCHAR(200), sign_appr   VARCHAR(200),
    sign_legal  VARCHAR(200), sign_conf   VARCHAR(200),
    date_req    VARCHAR(20),  date_appr   VARCHAR(20),
    date_legal  VARCHAR(20),  date_conf   VARCHAR(20),
    FOREIGN KEY (request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

cur.execute('''CREATE TABLE IF NOT EXISTS work_parts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    request_id  INT NOT NULL,
    sort_order  INT DEFAULT 0,
    part_name   VARCHAR(200) NOT NULL,
    quantity    DOUBLE DEFAULT 0,
    unit_price  DOUBLE DEFAULT 0,
    sub_total   DOUBLE DEFAULT 0,
    FOREIGN KEY (request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

cur.execute('''CREATE TABLE IF NOT EXISTS work_labor (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    request_id  INT NOT NULL,
    sort_order  INT DEFAULT 0,
    worker_name VARCHAR(200) NOT NULL,
    hours       DOUBLE DEFAULT 0,
    hourly_rate DOUBLE DEFAULT 0,
    sub_total   DOUBLE DEFAULT 0,
    FOREIGN KEY (request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

print("✅ Tables created")

# ── Migrate from SQLite ──────────────────────────
if os.path.exists(SQLITE_DB):
    print(f"\n📦 Migrating data from SQLite: {SQLITE_DB}")
    sl = sqlite3.connect(SQLITE_DB)
    sl.row_factory = sqlite3.Row

    # repair_requests
    rows = sl.execute('SELECT * FROM repair_requests ORDER BY id').fetchall()
    migrated = 0
    for r in rows:
        r = dict(r)
        try:
            cur.execute('''INSERT IGNORE INTO repair_requests
                (id,receipt,date,machine_type,machine_code,requester,phone,location,
                 description,req_date,note,status,start_date,done_date,report,
                 parts_total,labor_total,grand_total,created_at,updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (r.get('id'),r.get('receipt'),r.get('date'),r.get('machine_type'),
                 r.get('machine_code'),r.get('requester'),r.get('phone'),r.get('location'),
                 r.get('description'),r.get('req_date'),r.get('note'),r.get('status','pending'),
                 r.get('start_date',''),r.get('done_date',''),r.get('report',''),
                 r.get('parts_total',0),r.get('labor_total',0),r.get('grand_total',0),
                 r.get('created_at',''),r.get('updated_at','')))
            migrated += 1
        except Exception as e:
            print(f"  ⚠️  Skip receipt {r.get('receipt')}: {e}")
    print(f"  ✅ repair_requests: {migrated}/{len(rows)} rows")

    # request_signatures
    rows = sl.execute('SELECT * FROM request_signatures ORDER BY id').fetchall()
    migrated = 0
    for r in rows:
        r = dict(r)
        try:
            cur.execute('''INSERT IGNORE INTO request_signatures
                (id,request_id,sig_type,agent_req,agent_appr,agent_legal,agent_conf,
                 base_req,base_appr,base_legal,base_conf,
                 sign_req,sign_appr,sign_legal,sign_conf,
                 date_req,date_appr,date_legal,date_conf)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (r.get('id'),r.get('request_id'),r.get('sig_type'),
                 r.get('agent_req',''),r.get('agent_appr',''),r.get('agent_legal',''),r.get('agent_conf',''),
                 r.get('base_req',''),r.get('base_appr',''),r.get('base_legal',''),r.get('base_conf',''),
                 r.get('sign_req',''),r.get('sign_appr',''),r.get('sign_legal',''),r.get('sign_conf',''),
                 r.get('date_req',''),r.get('date_appr',''),r.get('date_legal',''),r.get('date_conf','')))
            migrated += 1
        except Exception as e:
            print(f"  ⚠️  Skip sig id {r.get('id')}: {e}")
    print(f"  ✅ request_signatures: {migrated}/{len(rows)} rows")

    # work_parts
    rows = sl.execute('SELECT * FROM work_parts ORDER BY id').fetchall()
    migrated = 0
    for r in rows:
        r = dict(r)
        try:
            cur.execute('''INSERT IGNORE INTO work_parts
                (id,request_id,sort_order,part_name,quantity,unit_price,sub_total)
                VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (r.get('id'),r.get('request_id'),r.get('sort_order',0),
                 r.get('part_name',''),r.get('quantity',0),r.get('unit_price',0),r.get('sub_total',0)))
            migrated += 1
        except Exception as e:
            print(f"  ⚠️  Skip part id {r.get('id')}: {e}")
    print(f"  ✅ work_parts: {migrated}/{len(rows)} rows")

    # work_labor
    rows = sl.execute('SELECT * FROM work_labor ORDER BY id').fetchall()
    migrated = 0
    for r in rows:
        r = dict(r)
        try:
            cur.execute('''INSERT IGNORE INTO work_labor
                (id,request_id,sort_order,worker_name,hours,hourly_rate,sub_total)
                VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (r.get('id'),r.get('request_id'),r.get('sort_order',0),
                 r.get('worker_name',''),r.get('hours',0),r.get('hourly_rate',0),r.get('sub_total',0)))
            migrated += 1
        except Exception as e:
            print(f"  ⚠️  Skip labor id {r.get('id')}: {e}")
    print(f"  ✅ work_labor: {migrated}/{len(rows)} rows")

    sl.close()
    print("\n🎉 Migration complete!")
else:
    print(f"\n⚠️  SQLite file not found at: {SQLITE_DB}")
    print("   (skip migration, starting fresh)")

conn.commit()
conn.close()
print("\n✅ Done! You can now run: python run.py")