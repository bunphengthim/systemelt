from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import pymysql
import pymysql.cursors
import os

app = Flask(__name__)
CORS(app)

# ── MySQL Config ──────────────────────────────────────────────
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
                id            INT AUTO_INCREMENT PRIMARY KEY,
                receipt       VARCHAR(20),
                date          DATE,
                machine_type  VARCHAR(100),
                machine_code  VARCHAR(50),
                requester     VARCHAR(100),
                phone         VARCHAR(30),
                location      VARCHAR(200),
                description   TEXT,
                req_date      DATE,
                note          VARCHAR(500),
                status        VARCHAR(20)  DEFAULT 'pending',
                start_date    DATE,
                done_date     DATE,
                report        TEXT,
                parts_total   DECIMAL(12,2) DEFAULT 0,
                labor_total   DECIMAL(12,2) DEFAULT 0,
                grand_total   DECIMAL(12,2) DEFAULT 0,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

            cur.execute('''CREATE TABLE IF NOT EXISTS work_parts (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                request_id   INT NOT NULL,
                sort_order   INT DEFAULT 0,
                part_name    VARCHAR(200),
                quantity     DECIMAL(10,2) DEFAULT 0,
                unit_price   DECIMAL(12,2) DEFAULT 0,
                sub_total    DECIMAL(12,2) DEFAULT 0,
                FOREIGN KEY (request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

            cur.execute('''CREATE TABLE IF NOT EXISTS work_labor (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                request_id   INT NOT NULL,
                sort_order   INT DEFAULT 0,
                worker_name  VARCHAR(200),
                hours        DECIMAL(10,2) DEFAULT 0,
                hourly_rate  DECIMAL(12,2) DEFAULT 0,
                sub_total    DECIMAL(12,2) DEFAULT 0,
                FOREIGN KEY (request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

            cur.execute('''CREATE TABLE IF NOT EXISTS request_signatures (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                request_id   INT NOT NULL,
                sig_type     VARCHAR(20),
                agent_req    VARCHAR(100), agent_appr  VARCHAR(100),
                agent_legal  VARCHAR(100), agent_conf  VARCHAR(100),
                base_req     VARCHAR(100), base_appr   VARCHAR(100),
                base_legal   VARCHAR(100), base_conf   VARCHAR(100),
                sign_req     VARCHAR(100), sign_appr   VARCHAR(100),
                sign_legal   VARCHAR(100), sign_conf   VARCHAR(100),
                date_req     DATE,         date_appr   DATE,
                date_legal   DATE,         date_conf   DATE,
                FOREIGN KEY (request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

        conn.commit()
        print('✅ Database tables ready.')
    except Exception as e:
        print(f'⚠️ DB init warning: {e}')
    finally:
        conn.close()


# ── HELPERS ───────────────────────────────────────────────────
def safe_date(v):
    return v if v else None

def _save_sigs(cur, rid, sig_type, s):
    cur.execute('DELETE FROM request_signatures WHERE request_id=%s AND sig_type=%s', (rid, sig_type))
    cur.execute('''INSERT INTO request_signatures
        (request_id,sig_type,agent_req,agent_appr,agent_legal,agent_conf,
         base_req,base_appr,base_legal,base_conf,sign_req,sign_appr,sign_legal,sign_conf,
         date_req,date_appr,date_legal,date_conf)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        (rid, sig_type,
         s.get('agent_req',''), s.get('agent_appr',''),
         s.get('agent_legal',''), s.get('agent_conf',''),
         s.get('base_req',''), s.get('base_appr',''),
         s.get('base_legal',''), s.get('base_conf',''),
         s.get('sign_req',''), s.get('sign_appr',''),
         s.get('sign_legal',''), s.get('sign_conf',''),
         safe_date(s.get('date_req')), safe_date(s.get('date_appr')),
         safe_date(s.get('date_legal')), safe_date(s.get('date_conf'))))

def _recalc_totals(cur, rid):
    cur.execute('SELECT COALESCE(SUM(sub_total),0) AS t FROM work_parts WHERE request_id=%s', (rid,))
    parts_total = float(cur.fetchone()['t'])
    cur.execute('SELECT COALESCE(SUM(sub_total),0) AS t FROM work_labor WHERE request_id=%s', (rid,))
    labor_total = float(cur.fetchone()['t'])
    grand_total = parts_total + labor_total
    cur.execute('UPDATE repair_requests SET parts_total=%s, labor_total=%s, grand_total=%s WHERE id=%s',
                (parts_total, labor_total, grand_total, rid))
    return parts_total, labor_total, grand_total

def _serialize(row):
    import decimal, datetime
    if not row:
        return row
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            out[k] = v.isoformat()
        elif isinstance(v, decimal.Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


# ── ROUTES ────────────────────────────────────────────────────
@app.route('/')
def index():
    return jsonify({'status': 'ELYTHONG Repair API running ✅'})

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/test-db')
def test_db():
    try:
        conn = get_db()
        conn.close()
        return "✅ DB Connected!"
    except Exception as e:
        return f"❌ DB Failed: {e}"


@app.route('/api/requests', methods=['GET'])
def get_requests():
    status = request.args.get('status')
    search = request.args.get('q', '')
    month  = request.args.get('month', '')
    conn = get_db()
    try:
        with conn.cursor() as cur:
            sql = 'SELECT * FROM repair_requests WHERE 1=1'
            params = []
            if status:
                sql += ' AND status=%s'
                params.append(status)
            if search:
                sql += (' AND (receipt LIKE %s OR machine_type LIKE %s'
                        ' OR machine_code LIKE %s OR requester LIKE %s OR location LIKE %s)')
                params += [f'%{search}%'] * 5
            if month:
                sql += ' AND done_date LIKE %s'
                params.append(f'{month}%')
            sql += ' ORDER BY id DESC'
            cur.execute(sql, params)
            rows = [_serialize(r) for r in cur.fetchall()]
    finally:
        conn.close()
    return jsonify(rows)


@app.route('/api/requests/<int:rid>', methods=['GET'])
def get_request(rid):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM repair_requests WHERE id=%s', (rid,))
            r = cur.fetchone()
            if not r:
                return jsonify({'error': 'Not found'}), 404
            r = _serialize(r)
            cur.execute('SELECT * FROM work_parts WHERE request_id=%s ORDER BY sort_order', (rid,))
            r['work_parts'] = [_serialize(p) for p in cur.fetchall()]
            cur.execute('SELECT * FROM work_labor WHERE request_id=%s ORDER BY sort_order', (rid,))
            r['work_labor'] = [_serialize(l) for l in cur.fetchall()]
            r['sigs'] = {}
            r['work_sigs'] = {}
            cur.execute('SELECT * FROM request_signatures WHERE request_id=%s', (rid,))
            for s in cur.fetchall():
                s = _serialize(s)
                if s['sig_type'] == 'request':
                    r['sigs'] = s
                elif s['sig_type'] == 'completion':
                    r['work_sigs'] = s
    finally:
        conn.close()
    return jsonify(r)


@app.route('/api/requests', methods=['POST'])
def create_request():
    d = request.get_json()
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('''INSERT INTO repair_requests
                (receipt,date,machine_type,machine_code,requester,phone,location,
                 description,req_date,note,status,start_date,done_date,report)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (d.get('receipt'), safe_date(d.get('date')),
                 d.get('type'), d.get('code'),
                 d.get('requester'), d.get('phone'), d.get('location'),
                 d.get('desc'), safe_date(d.get('req_date')),
                 d.get('note'), d.get('status', 'pending'),
                 safe_date(d.get('start_date')),
                 safe_date(d.get('done_date')),
                 d.get('report', '')))
            rid = cur.lastrowid
            if d.get('sigs'):
                _save_sigs(cur, rid, 'request', d['sigs'])
        conn.commit()
    finally:
        conn.close()
    return jsonify({'id': rid}), 201


@app.route('/api/requests/<int:rid>', methods=['PUT'])
def update_request(rid):
    d = request.get_json()
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('''UPDATE repair_requests SET
                date=%s, machine_type=%s, machine_code=%s, requester=%s, phone=%s,
                location=%s, description=%s, req_date=%s, note=%s, status=%s,
                start_date=%s, done_date=%s, report=%s WHERE id=%s''',
                (safe_date(d.get('date')),
                 d.get('type'), d.get('code'),
                 d.get('requester'), d.get('phone'), d.get('location'),
                 d.get('desc'), safe_date(d.get('req_date')),
                 d.get('note'), d.get('status', 'pending'),
                 safe_date(d.get('start_date')),
                 safe_date(d.get('done_date')),
                 d.get('report', ''), rid))

            if 'sigs' in d:
                _save_sigs(cur, rid, 'request', d['sigs'])
            if 'work_sigs' in d:
                _save_sigs(cur, rid, 'completion', d['work_sigs'])

            if 'work_parts' in d:
                cur.execute('DELETE FROM work_parts WHERE request_id=%s', (rid,))
                for i, p in enumerate(d['work_parts']):
                    qty   = float(p.get('qty') or p.get('quantity') or 0)
                    price = float(p.get('price') or p.get('unit_price') or 0)
                    sub   = round(qty * price, 2)
                    cur.execute('''INSERT INTO work_parts
                        (request_id, sort_order, part_name, quantity, unit_price, sub_total)
                        VALUES (%s,%s,%s,%s,%s,%s)''',
                        (rid, i + 1, p.get('name') or p.get('part_name', ''), qty, price, sub))

            if 'work_labor' in d:
                cur.execute('DELETE FROM work_labor WHERE request_id=%s', (rid,))
                for i, l in enumerate(d['work_labor']):
                    hours = float(l.get('hours') or 0)
                    rate  = float(l.get('rate') or l.get('hourly_rate') or 0)
                    sub   = round(hours * rate, 2)
                    cur.execute('''INSERT INTO work_labor
                        (request_id, sort_order, worker_name, hours, hourly_rate, sub_total)
                        VALUES (%s,%s,%s,%s,%s,%s)''',
                        (rid, i + 1, l.get('name') or l.get('worker_name', ''), hours, rate, sub))

            _recalc_totals(cur, rid)
        conn.commit()
    finally:
        conn.close()
    return jsonify({'ok': True})


@app.route('/api/requests/<int:rid>', methods=['DELETE'])
def delete_request(rid):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM repair_requests WHERE id=%s', (rid,))
        conn.commit()
    finally:
        conn.close()
    return jsonify({'ok': True})


@app.route('/api/next-receipt', methods=['GET'])
def next_receipt():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT MAX(CAST(receipt AS UNSIGNED)) AS mx FROM repair_requests')
            row = cur.fetchone()
    finally:
        conn.close()
    return jsonify({'receipt': str((row['mx'] or 0) + 1).zfill(6)})


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