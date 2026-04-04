from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import pymysql
import pymysql.cursors
import os

app = Flask(__name__)
CORS(app)

# ── MySQL Config (FIXED for Aiven) ────────────────────────────
DB_CONFIG = {
    'host':        os.environ.get('DB_HOST'),
    'port':        int(os.environ.get('DB_PORT', 3306)),
    'user':        os.environ.get('DB_USER'),
    'password':    os.environ.get('DB_PASSWORD'),
    'database':    os.environ.get('DB_NAME'),
    'charset':     'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
}

def get_db():
    try:
        conn = pymysql.connect(connect_timeout=10, **DB_CONFIG)
        return conn
    except Exception as e:
        print("❌ DB Connection Error:", e)
        raise


# ── AUTO-CREATE TABLES ────────────────────────────────────────
def init_db():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS repair_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                receipt VARCHAR(20),
                date DATE,
                machine_type VARCHAR(100),
                machine_code VARCHAR(50),
                requester VARCHAR(100),
                phone VARCHAR(30),
                location VARCHAR(200),
                description TEXT,
                req_date DATE,
                note VARCHAR(500),
                status VARCHAR(20) DEFAULT 'pending',
                start_date DATE,
                done_date DATE,
                report TEXT,
                parts_total DECIMAL(12,2) DEFAULT 0,
                labor_total DECIMAL(12,2) DEFAULT 0,
                grand_total DECIMAL(12,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        conn.commit()
        print("✅ Database ready")
    except Exception as e:
        print("⚠️ init_db error:", e)
    finally:
        conn.close()


# ── BASIC ROUTES ──────────────────────────────────────────────
@app.route('/')
def index():
    return jsonify({'status': 'API running ✅'})

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


# ✅ TEST DB (VERY IMPORTANT)
@app.route('/test-db')
def test_db():
    try:
        conn = get_db()
        conn.close()
        return "✅ DB Connected!"
    except Exception as e:
        return f"❌ DB Failed: {e}"


# ── GET ALL ───────────────────────────────────────────────────
@app.route('/api/requests', methods=['GET'])
def get_requests():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM repair_requests ORDER BY id DESC")
            rows = cur.fetchall()
    finally:
        conn.close()
    return jsonify(rows)


# ── CREATE ────────────────────────────────────────────────────
@app.route('/api/requests', methods=['POST'])
def create_request():
    d = request.get_json()
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('''
                INSERT INTO repair_requests
                (receipt, machine_type, requester, status)
                VALUES (%s,%s,%s,%s)
            ''', (
                d.get('receipt'),
                d.get('machine_type'),
                d.get('requester'),
                d.get('status', 'pending')
            ))
            rid = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    return jsonify({'id': rid})


# ── DELETE ────────────────────────────────────────────────────
@app.route('/api/requests/<int:rid>', methods=['DELETE'])
def delete_request(rid):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM repair_requests WHERE id=%s", (rid,))
        conn.commit()
    finally:
        conn.close()

    return jsonify({'ok': True})


# ── INIT DB ON START ──────────────────────────────────────────
with app.app_context():
    try:
        init_db()
    except Exception as e:
        print("⚠️ init skipped:", e)


# ── RUN ───────────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Server running on port {port}")
    app.run(host='0.0.0.0', port=port)