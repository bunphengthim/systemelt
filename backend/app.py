from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import pymysql
import pymysql.cursors
import os

app = Flask(__name__)
CORS(app)

# ── MySQL Config ──────────────────────────────────────────────
# SSL=True required for Aiven MySQL (cloud hosting)

DB_CONFIG = {
    'host':        os.environ.get('DB_HOST', 'localhost'),
    'port':        int(os.environ.get('DB_PORT', 3306)),
    'user':        os.environ.get('DB_USER', 'root'),
    'password':    os.environ.get('DB_PASSWORD', ''),
    'database':    os.environ.get('DB_NAME', 'elythong_repair'),
    'charset':     'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'ssl_disabled': True,
}

def get_db():
    return pymysql.connect(**DB_CONFIG)


# ── AUTO-CREATE TABLES (run once on startup) ──────────────────
def init_db():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS repair_requests (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                receipt       VARCHAR(20)   NOT NULL,
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
        print(f'⚠️  DB init warning: {e}')
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
    """Recalculate and update parts_total, labor_total, grand_total."""
    cur.execute('SELECT COALESCE(SUM(sub_total),0) AS t FROM work_parts WHERE request_id=%s', (rid,))
    parts_total = float(cur.fetchone()['t'])
    cur.execute('SELECT COALESCE(SUM(sub_total),0) AS t FROM work_labor WHERE request_id=%s', (rid,))
    labor_total = float(cur.fetchone()['t'])
    grand_total = parts_total + labor_total
    cur.execute('UPDATE repair_requests SET parts_total=%s, labor_total=%s, grand_total=%s WHERE id=%s',
                (parts_total, labor_total, grand_total, rid))
    return parts_total, labor_total, grand_total

def _serialize(row):
    """Convert date/Decimal fields for JSON."""
    import decimal
    import datetime
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
                (d.get('receipt'),
                 safe_date(d.get('date')),
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

            # ── Save work_parts with sub_total ──────────────
            if 'work_parts' in d:
                cur.execute('DELETE FROM work_parts WHERE request_id=%s', (rid,))
                for i, p in enumerate(d['work_parts']):
                    qty   = float(p.get('qty') or p.get('quantity') or 0)
                    price = float(p.get('price') or p.get('unit_price') or 0)
                    sub   = round(qty * price, 2)
                    cur.execute('''INSERT INTO work_parts
                        (request_id, sort_order, part_name, quantity, unit_price, sub_total)
                        VALUES (%s,%s,%s,%s,%s,%s)''',
                        (rid, i + 1,
                         p.get('name') or p.get('part_name', ''),
                         qty, price, sub))

            # ── Save work_labor with sub_total ───────────────
            if 'work_labor' in d:
                cur.execute('DELETE FROM work_labor WHERE request_id=%s', (rid,))
                for i, l in enumerate(d['work_labor']):
                    hours = float(l.get('hours') or 0)
                    rate  = float(l.get('rate') or l.get('hourly_rate') or 0)
                    sub   = round(hours * rate, 2)
                    cur.execute('''INSERT INTO work_labor
                        (request_id, sort_order, worker_name, hours, hourly_rate, sub_total)
                        VALUES (%s,%s,%s,%s,%s,%s)''',
                        (rid, i + 1,
                         l.get('name') or l.get('worker_name', ''),
                         hours, rate, sub))

            # ── Recalculate totals ───────────────────────────
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


@app.route('/api/monthly-report', methods=['GET'])
def monthly_report():
    """Return a printable HTML monthly report."""
    year  = request.args.get('year', '')
    month = request.args.get('month', '')
    conn = get_db()
    try:
        with conn.cursor() as cur:
            sql = "SELECT * FROM repair_requests WHERE status='done'"
            params = []
            if year and month:
                sql += ' AND done_date LIKE %s'
                params.append(f'{year}-{month}%')
            elif year:
                sql += ' AND done_date LIKE %s'
                params.append(f'{year}%')
            sql += ' ORDER BY done_date ASC'
            cur.execute(sql, params)
            rows = [_serialize(r) for r in cur.fetchall()]
    finally:
        conn.close()

    MONTH_KM = ['','មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា',
                'កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ']

    def usd(v):
        return f'${float(v or 0):,.2f}'

    def fmt_d(d):
        return d.split('-')[::-1][0] + '-' + d.split('-')[1] + '-' + d.split('-')[0] if d else '—'

    total_p = sum(r.get('parts_total', 0) or 0 for r in rows)
    total_l = sum(r.get('labor_total', 0) or 0 for r in rows)
    total_g = sum(r.get('grand_total', 0) or 0 for r in rows)

    period_label = ''
    if year and month:
        period_label = f'{MONTH_KM[int(month)]} {year}'
    elif year:
        period_label = f'ឆ្នាំ {year}'

    rows_html = ''
    for i, r in enumerate(rows, 1):
        rows_html += f'''<tr>
            <td style="text-align:center">{i}</td>
            <td style="text-align:center;font-weight:700">{r.get("receipt","")}</td>
            <td>{fmt_d(r.get("done_date",""))}</td>
            <td>{r.get("machine_type","—")}</td>
            <td style="text-align:center">{r.get("machine_code","—")}</td>
            <td>{r.get("requester","—")}</td>
            <td style="text-align:right">{usd(r.get("parts_total"))}</td>
            <td style="text-align:right">{usd(r.get("labor_total"))}</td>
            <td style="text-align:right;font-weight:700">{usd(r.get("grand_total"))}</td>
        </tr>'''

    html = f'''<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8">
<title>របាយការណ៍ {period_label}</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:"Kantumruy Pro",sans-serif;font-size:15px;color:#1a2340;padding:16px;background:#fff}}
.w{{max-width:900px;margin:0 auto;border:2px solid #1a4fa0;border-radius:8px;overflow:hidden}}
.hd{{background:#1a4fa0;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}}
.hd h1{{font-size:17px;font-weight:700}}
.hd .logo{{font-size:18px;font-weight:700;letter-spacing:2px;color:#ffe082}}
.summary{{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:2px solid #1a4fa0}}
.sc{{padding:12px;text-align:center;border-right:1px solid #b8cde8}}
.sc:last-child{{border-right:none;background:#1a4fa0;color:#fff}}
.sc .lbl{{font-size:13px;font-weight:700;color:#1a4fa0;margin-bottom:3px}}
.sc:last-child .lbl{{color:rgba(255,255,255,.8)}}
.sc .val{{font-size:18px;font-weight:700;color:#e07b2a}}
.sc:last-child .val{{color:#fff}}
table{{width:100%;border-collapse:collapse;font-size:15px}}
th{{background:#dbe8f8;color:#1a4fa0;font-weight:700;padding:7px;border:1px solid #b8cde8;text-align:center}}
td{{padding:5px 7px;border:1px solid #d0dff0}}
tr:nth-child(even) td{{background:#f0f6ff}}
.ft-row td{{background:#1a4fa0!important;color:#fff!important;font-weight:700;font-size:16px}}
.ft{{text-align:center;padding:8px;font-size:13px;color:#888;border-top:1px solid #b8cde8}}
@media print{{.np{{display:none!important}}}}
</style></head><body>
<div class="w">
  <div class="hd">
    <div class="logo">ELYTHONG</div>
    <h1>របាយការណ៍ប្រចាំ{period_label}</h1>
    <span style="font-size:15px;opacity:.8">{len(rows)} ប័ណ្ណ</span>
  </div>
  <div class="summary">
    <div class="sc"><div class="lbl">ចំនួនប័ណ្ណ</div><div class="val" style="color:#1a4fa0">{len(rows)}</div></div>
    <div class="sc"><div class="lbl">តម្លៃគ្រឿង</div><div class="val">{usd(total_p)}</div></div>
    <div class="sc"><div class="lbl">តម្លៃជាង</div><div class="val">{usd(total_l)}</div></div>
    <div class="sc"><div class="lbl">សរុបរួម</div><div class="val">{usd(total_g)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:34px">លរ</th><th style="width:70px">ប័ណ្ណ</th>
      <th style="width:100px">ថ្ងៃរួច</th><th>ប្រភេទ</th>
      <th style="width:80px">លេខសម្គាល់</th><th>អ្នកស្នើ</th>
      <th style="width:90px">គ្រឿង ($)</th>
      <th style="width:80px">ជាង ($)</th>
      <th style="width:95px">សរុប ($)</th>
    </tr></thead>
    <tbody>{rows_html if rows_html else '<tr><td colspan="9" style="text-align:center;padding:20px;color:#aaa">មិនទាន់មានទិន្នន័យ</td></tr>'}</tbody>
    <tfoot><tr class="ft-row">
      <td colspan="6" style="text-align:right;padding:8px 10px">សរុបរួម</td>
      <td style="text-align:right;padding:8px">{usd(total_p)}</td>
      <td style="text-align:right;padding:8px">{usd(total_l)}</td>
      <td style="text-align:right;padding:8px">{usd(total_g)}</td>
    </tr></tfoot>
  </table>
  <div class="ft">ELYTHONG — របាយការណ៍{period_label} — បោះពុម្ព {__import__("datetime").date.today().strftime("%d-%m-%Y")}</div>
</div>
<div class="np" style="text-align:center;margin-top:14px;display:flex;gap:10px;justify-content:center">
  <button onclick="window.print()" style="font-family:'Kantumruy Pro',sans-serif;background:#1a4fa0;color:#fff;border:none;padding:9px 26px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer">🖨 បោះពុម្ព</button>
  <button onclick="window.close()" style="font-family:'Kantumruy Pro',sans-serif;background:#888;color:#fff;border:none;padding:9px 16px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer">✕ បិទ</button>
</div>
</body></html>'''
    return Response(html, mimetype='text/html')


# Run init_db when gunicorn starts too
with app.app_context():
    try:
        init_db()
    except Exception as e:
        print(f'⚠️ init_db skipped: {e}')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'Server running at http://0.0.0.0:{port}')
    app.run(debug=False, host='0.0.0.0', port=port)