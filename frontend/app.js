// 🔧 សម្រាប់ Render: ប្តូរ URL នេះទៅ Backend URL របស់អ្នក
// ឧទាហរណ៍: const BACKEND_URL = 'https://elythong-repair-api.onrender.com';
const BACKEND_URL = 'https://systemelt.onrender.com';  // ទទេ = ប្រើ same server (local), ឬបំពេញ Render URL
const API = (BACKEND_URL || window.location.origin) + '/api';
let records = [];
let editingId = -1, workingId = -1;
let wParts = [], wLabor = [];

const today = () => new Date().toISOString().split('T')[0];
const usd = v => '$' + (parseFloat(v)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const fmtD = d => d ? d.split('-').reverse().join('-') : '—';
const val = id => { const e=document.getElementById(id); return e?e.value:''; };

// ── API helpers ───────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(API + path);
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(API + path, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(API + path, {method:'DELETE'});
  return r.json();
}

// ── Button Loading Helper ─────────────────────────────────────
function setLoading(btn, loading, originalHTML) {
  if (loading) {
    btn._originalHTML = btn.innerHTML;
    btn._originalDisabled = btn.disabled;
    btn.innerHTML = `<span class="btn-spinner"></span>${btn.dataset.loadingText || 'កំពុងដំណើរការ...'}`;
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.innerHTML = originalHTML !== undefined ? originalHTML : btn._originalHTML;
    btn.classList.remove('loading');
    btn.disabled = btn._originalDisabled || false;
  }
}

// ── Init ──────────────────────────────────────────────────────
window.onload = async () => {
  document.getElementById('f_date').value = today();
  document.getElementById('f_req_date').value = today();
  document.getElementById('s_date_req').value = today();
  document.getElementById('s_date_appr').value = today();
  await loadRecords();
  await genReceipt();
  // If viewer session was restored before onload, re-apply mode now that data is ready
  if (isViewer) applyViewerMode();
};

async function loadRecords() {
  try {
    records = await apiGet('/requests');
    updateCounts();
  } catch(e) {
    alert('❌ មិនអាចភ្ជាប់ Server បានទេ!\nសូម run: python app.py');
  }
}

function showTab(name) {
  ['t1','t2','t3','t4'].forEach(t => {
    const tabEl = document.getElementById('tab-'+t);
    if(tabEl) tabEl.classList.toggle('active', t===name);
    // find the matching tab button by its onclick content
    const btn = document.querySelector(`.tab-btn[onclick*="'${t}'"]`);
    if(btn) btn.classList.toggle('active', t===name);
  });
  if(name==='t2') renderT2();
  if(name==='t3') renderT3();
  if(name==='t4') { initT4Years(); renderT4(); }
}

function updateCounts() {
  document.getElementById('cnt-pending').textContent = records.filter(r=>r.status!=='done').length;
  document.getElementById('cnt-done').textContent = records.filter(r=>r.status==='done').length;
}

async function genReceipt() {
  try {
    const data = await apiGet('/next-receipt');
    document.getElementById('receiptDisplay').textContent = data.receipt;
    document.getElementById('hdrNum').textContent = 'លេខ: ' + data.receipt;
    return data.receipt;
  } catch(e) {
    const max = records.length ? Math.max(...records.map(r=>parseInt(r.receipt)||0)) : 0;
    const n = String(max+1).padStart(6,'0');
    document.getElementById('receiptDisplay').textContent = n;
    document.getElementById('hdrNum').textContent = 'លេខ: '+n;
    return n;
  }
}

// ── Save Request ──────────────────────────────────────────────
async function saveRequest(btnEl) {
  if(isViewer){ alert('⛔ អ្នកមានសិទ្ធិមើលតែ មិនអាចបញ្ចូលទិន្នន័យបានទេ!'); return; }
  const btn = btnEl || document.querySelector('.btn-success[onclick*="saveRequest"]');
  const d = {
    receipt: document.getElementById('receiptDisplay').textContent,
    date: val('f_date'), type: val('f_type'), code: val('f_code'),
    requester: val('f_requester'), phone: val('f_phone'),
    location: val('f_location'), desc: val('f_desc'),
    req_date: val('f_req_date'), note: val('f_note'),
    status: 'pending', sigs: collectSigs(),
    work_parts:[], work_labor:[]
  };
  if(!d.date||!d.type||!d.code||!d.requester){ alert('សូមបំពេញ: ថ្ងៃ, ប្រភេទ, លេខកូត, ឈ្មោះ'); return; }
  if(btn) setLoading(btn, true);
  try {
    if(editingId >= 0) {
      await apiPut('/requests/'+editingId, d);
      editingId = -1;
    } else {
      await apiPost('/requests', d);
    }
    alert('✅ បានបញ្ជូន ស្នើ #'+d.receipt);
    clearForm();
    await loadRecords();
    showTab('t2');
  } catch(e) { alert('❌ Error: ' + e.message); }
  finally { if(btn) setLoading(btn, false); }
}

function collectSigs() {
  return {
    agent_req:val('s_agent_req'), agent_appr:val('s_agent_appr'),
    agent_legal:val('s_agent_legal'), agent_conf:val('s_agent_conf'),
    base_req:val('s_base_req'), base_appr:val('s_base_appr'),
    base_legal:val('s_base_legal'), base_conf:val('s_base_conf'),
    sign_req:val('s_sign_req'), sign_appr:val('s_sign_appr'),
    sign_legal:val('s_sign_legal'), sign_conf:val('s_sign_conf'),
    date_req:val('s_date_req'), date_appr:val('s_date_appr')
  };
}

async function clearForm() {
  editingId = -1;
  ['f_type','f_code','f_requester','f_phone','f_location','f_desc','f_note'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.value='';
  });
  document.getElementById('f_date').value=today();
  document.getElementById('f_req_date').value=today();
  ['s_agent_req','s_agent_appr','s_agent_legal','s_agent_conf',
   's_base_req','s_base_appr','s_base_legal','s_base_conf',
   's_sign_req','s_sign_appr','s_sign_legal','s_sign_conf'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('s_date_req').value=today();
  document.getElementById('s_date_appr').value=today();
  await genReceipt();
}

// ── TAB 2 ────────────────────────────────────────────────────
const statusInfo = s => ({pending:['b-pending','រង់ចាំ'],progress:['b-progress','កំពុងដំណើរការ'],done:['b-done','រួចរាល់']}[s]||['','']);

function renderT2() {
  const q=(val('t2-search')||'').toLowerCase();
  const sf=val('t2-filter');
  const list=records.filter(r=>r.status!=='done'&&
    [r.receipt,r.machine_type,r.machine_code,r.requester,r.phone,r.location].join(' ').toLowerCase().includes(q)&&
    (!sf||r.status===sf));
  const tbody=document.getElementById('t2-body');
  tbody.innerHTML='';
  document.getElementById('t2-empty').style.display=list.length?'none':'block';
  list.forEach(r=>{
    const [cls,lbl]=statusInfo(r.status);
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><strong>${r.receipt}</strong></td>
      <td>${fmtD(r.req_date)}</td><td>${r.machine_type||'—'}</td><td>${r.machine_code||'—'}</td>
      <td>${r.requester||'—'}</td><td>${r.phone||'—'}</td><td>${r.location||'—'}</td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td><div style="display:flex;gap:3px;flex-wrap:wrap">
        ${isViewer ? '' : `<button class="btn btn-outline" style="padding:3px 7px;font-size:14px" onclick="editRequest(${r.id},this)">✏️ កែ</button>`}
        ${isViewer ? '' : `<button class="btn btn-primary" style="padding:3px 7px;font-size:14px;background:#1565c0" onclick="openWorkModal(${r.id},this)">🔧 ជួសជុល</button>`}
        <button class="btn btn-warning" style="padding:3px 7px;font-size:14px" onclick="printReq(${r.id},this)">🖨</button>
        ${isViewer ? '' : `<button class="btn btn-danger" style="padding:3px 7px;font-size:14px" onclick="deleteRec(${r.id},this)">🗑</button>`}
      </div></td>`;
    tbody.appendChild(tr);
  });
}

async function editRequest(id, btnEl) {
  if(isViewer){ alert('⛔ អ្នកមានសិទ្ធិមើលតែ មិនអាចកែបានទេ!'); return; }
  if(btnEl) setLoading(btnEl, true);
  try {
    const r = await apiGet('/requests/'+id);
    editingId = id;
    document.getElementById('receiptDisplay').textContent=r.receipt;
    document.getElementById('hdrNum').textContent='លេខ: '+r.receipt;
    document.getElementById('f_date').value=r.date||'';
    document.getElementById('f_type').value=r.machine_type||'';
    document.getElementById('f_code').value=r.machine_code||'';
    document.getElementById('f_requester').value=r.requester||'';
    document.getElementById('f_phone').value=r.phone||'';
    document.getElementById('f_location').value=r.location||'';
    document.getElementById('f_desc').value=r.description||'';
    document.getElementById('f_req_date').value=r.req_date||'';
    document.getElementById('f_note').value=r.note||'';
    const s=r.sigs||{};
    ['agent_req','agent_appr','agent_legal','agent_conf',
     'base_req','base_appr','base_legal','base_conf',
     'sign_req','sign_appr','sign_legal','sign_conf','date_req','date_appr'].forEach(k=>{
      const e=document.getElementById('s_'+k); if(e) e.value=s[k]||'';
    });
    showTab('t1');
  } finally {
    if(btnEl) setLoading(btnEl, false);
  }
}

async function deleteRec(id, btnEl) {
  if(isViewer){ alert('⛔ អ្នកមានសិទ្ធិមើលតែ មិនអាចលុបបានទេ!'); return; }
  const r = records.find(x=>x.id===id);
  if(confirm('លុបប័ណ្ណ #'+(r?r.receipt:id)+'?')){
    if(btnEl) setLoading(btnEl, true);
    try {
      await apiDelete('/requests/'+id);
      await loadRecords();
      renderT2(); renderT3();
    } finally {
      if(btnEl) setLoading(btnEl, false);
    }
  }
}

// ── WORK MODAL ────────────────────────────────────────────────
async function openWorkModal(id, btnEl) {
  if(btnEl) setLoading(btnEl, true);
  try {
  const r = await apiGet('/requests/'+id);
  workingId = id;
  document.getElementById('wm-receipt').textContent=r.receipt;
  document.getElementById('wm-type').textContent=r.machine_type||'—';
  document.getElementById('wm-code').textContent=r.machine_code||'—';
  document.getElementById('wm-req').textContent=r.requester||'—';
  document.getElementById('wm-loc').textContent=r.location||'—';
  document.getElementById('wm_status').value=r.status||'pending';
  document.getElementById('wm_start_date').value=r.start_date||today();
  document.getElementById('wm_done_date').value=r.done_date||'';
  document.getElementById('wm_report').value=r.report||'';
  wParts=[]; wLabor=[];
  document.getElementById('wm-parts-body').innerHTML='';
  document.getElementById('wm-labor-body').innerHTML='';
  (r.work_parts||[]).forEach(p=>{
    addWPart();
    const i=wParts.length-1; wParts[i]={name:p.part_name,qty:p.quantity,price:p.unit_price};
    const cells=document.getElementById('wp-row-'+i).querySelectorAll('input');
    cells[0].value=p.part_name||''; cells[1].value=p.quantity||''; cells[2].value=p.unit_price||'';
  });
  (r.work_labor||[]).forEach(l=>{
    addWLabor();
    const i=wLabor.length-1; wLabor[i]={name:l.worker_name,hours:l.hours,rate:l.hourly_rate};
    const cells=document.getElementById('wl-row-'+i).querySelectorAll('input');
    cells[0].value=l.worker_name||''; cells[1].value=l.hours||''; cells[2].value=l.hourly_rate||'';
  });
  if(!wParts.length) addWPart();
  if(!wLabor.length) addWLabor();
  calcWM();
  const ws=r.work_sigs||{}; const rs=r.sigs||{};
  ['agent_req','agent_appr','agent_legal','agent_conf'].forEach(k=>{
    const e=document.getElementById('w_'+k); if(e) e.value=ws[k]||rs[k]||'';
  });
  ['base_req','base_appr','base_legal','base_conf'].forEach(k=>{
    const e=document.getElementById('w_'+k); if(e) e.value=ws[k]||rs[k]||'';
  });
  ['sign_req','sign_appr','sign_legal','sign_conf'].forEach(k=>{
    const e=document.getElementById('w_'+k); if(e) e.value=ws[k]||'';
  });
  ['date_req','date_appr','date_legal','date_conf'].forEach(k=>{
    const e=document.getElementById('w_'+k); if(e) e.value=ws[k]||today();
  });
  document.getElementById('work-modal').classList.add('open');
  // Viewer: hide save button inside modal
  const modalSaveBtn = document.querySelector('#work-modal .btn-success');
  const modalAddBtns = document.querySelectorAll('#work-modal .btn-add');
  const modalDelBtns = document.querySelectorAll('#work-modal .btn-del');
  if(modalSaveBtn) modalSaveBtn.style.display = isViewer ? 'none' : '';
  modalAddBtns.forEach(b => b.style.display = isViewer ? 'none' : '');
  modalDelBtns.forEach(b => b.style.display = isViewer ? 'none' : '');
  // Viewer: disable all inputs inside modal
  document.querySelectorAll('#work-modal input, #work-modal select, #work-modal textarea').forEach(el => {
    el.disabled = isViewer;
    if(isViewer) el.style.background = '#f5f5f5';
  });
  } finally {
    if(btnEl) setLoading(btnEl, false);
  }
}

function closeWorkModal() { document.getElementById('work-modal').classList.remove('open'); workingId=-1; }

function addWPart() {
  const tbody=document.getElementById('wm-parts-body');
  const idx=wParts.length; wParts.push({name:'',qty:'',price:''});
  const tr=document.createElement('tr'); tr.id='wp-row-'+idx;
  tr.innerHTML=`
    <td style="text-align:center;color:#aaa;font-size:15px">${idx+1}</td>
    <td><input type="text" placeholder="ឈ្មោះគ្រឿង..." onchange="wParts[${idx}].name=this.value"></td>
    <td><input type="number" min="0" style="text-align:right" placeholder="0" oninput="wParts[${idx}].qty=this.value;calcWM()"></td>
    <td><input type="number" min="0" step="0.01" style="text-align:right" placeholder="0.00" oninput="wParts[${idx}].price=this.value;calcWM()"></td>
    <td id="wps-${idx}" style="text-align:right;padding:5px 8px;font-weight:600">$0.00</td>
    <td style="text-align:center"><button class="btn-del" onclick="delWP(${idx})">✕</button></td>`;
  tbody.appendChild(tr);
}
function delWP(idx){ const t=document.getElementById('wp-row-'+idx); if(t) t.remove(); wParts[idx]=null; calcWM(); }

function addWLabor() {
  const tbody=document.getElementById('wm-labor-body');
  const idx=wLabor.length; wLabor.push({name:'',hours:'',rate:''});
  const tr=document.createElement('tr'); tr.id='wl-row-'+idx;
  tr.innerHTML=`
    <td style="text-align:center;color:#aaa;font-size:15px">${idx+1}</td>
    <td><input type="text" placeholder="ឈ្មោះជាង..." onchange="wLabor[${idx}].name=this.value"></td>
    <td><input type="number" min="0" style="text-align:right" placeholder="0" oninput="wLabor[${idx}].hours=this.value;calcWM()"></td>
    <td><input type="number" min="0" step="0.01" style="text-align:right" placeholder="0.00" oninput="wLabor[${idx}].rate=this.value;calcWM()"></td>
    <td id="wls-${idx}" style="text-align:right;padding:5px 8px;font-weight:600">$0.00</td>
    <td style="text-align:center"><button class="btn-del" onclick="delWL(${idx})">✕</button></td>`;
  tbody.appendChild(tr);
}
function delWL(idx){ const t=document.getElementById('wl-row-'+idx); if(t) t.remove(); wLabor[idx]=null; calcWM(); }

function calcWM() {
  let pt=0,lt=0;
  wParts.forEach((p,i)=>{ if(!p) return; const s=(parseFloat(p.qty)||0)*(parseFloat(p.price)||0); pt+=s; const e=document.getElementById('wps-'+i); if(e) e.textContent=usd(s); });
  wLabor.forEach((l,i)=>{ if(!l) return; const s=(parseFloat(l.hours)||0)*(parseFloat(l.rate)||0); lt+=s; const e=document.getElementById('wls-'+i); if(e) e.textContent=usd(s); });
  document.getElementById('wm-parts-total').textContent=usd(pt);
  document.getElementById('wm-labor-total').textContent=usd(lt);
  document.getElementById('wm-grand-total').textContent=usd(pt+lt);
}

async function saveWork(btnEl) {
  if(isViewer){ alert('⛔ អ្នកមានសិទ្ធិមើលតែ មិនអាចកែទិន្នន័យបានទេ!'); return; }
  if(workingId<0) return;
  if(btnEl) setLoading(btnEl, true);
  const parts=wParts.filter(Boolean).map(p=>({name:p.name,qty:p.qty,price:p.price}));
  const labor=wLabor.filter(Boolean).map(l=>({name:l.name,hours:l.hours,rate:l.rate}));
  const status=document.getElementById('wm_status').value;
  const work_sigs={
    agent_req:val('w_agent_req'), agent_appr:val('w_agent_appr'),
    agent_legal:val('w_agent_legal'), agent_conf:val('w_agent_conf'),
    base_req:val('w_base_req'), base_appr:val('w_base_appr'),
    base_legal:val('w_base_legal'), base_conf:val('w_base_conf'),
    sign_req:val('w_sign_req'), sign_appr:val('w_sign_appr'),
    sign_legal:val('w_sign_legal'), sign_conf:val('w_sign_conf'),
    date_req:val('w_date_req'), date_appr:val('w_date_appr'),
    date_legal:val('w_date_legal'), date_conf:val('w_date_conf')
  };
  const r = records.find(x=>x.id===workingId)||{};
  try {
    await apiPut('/requests/'+workingId, {
      date:r.date, type:r.machine_type, code:r.machine_code,
      requester:r.requester, phone:r.phone, location:r.location,
      desc:r.description, req_date:r.req_date, note:r.note,
      status, start_date:val('wm_start_date'), done_date:val('wm_done_date'),
      report:val('wm_report'), work_parts:parts, work_labor:labor, work_sigs
    });
    await loadRecords();
    closeWorkModal();
    alert('✅ '+(status==='done'?'រួចរាល់ ✅':'បានរក្សាទុក')+' — ប័ណ្ណ #'+r.receipt);
    if(status==='done') showTab('t3'); else renderT2();
  } finally {
    if(btnEl) setLoading(btnEl, false);
  }
}

// ── TAB 3 ────────────────────────────────────────────────────
function renderT3() {
  const q=(val('t3-search')||'').toLowerCase();
  const mf=val('t3-month');
  const list=records.filter(r=>
    r.status==='done'&&
    [r.receipt,r.machine_type,r.machine_code,r.requester].join(' ').toLowerCase().includes(q)&&
    (!mf||(r.done_date||'').startsWith(mf)));
  const tbody=document.getElementById('t3-body');
  tbody.innerHTML='';
  document.getElementById('t3-empty').style.display=list.length?'none':'block';
  let sp=0,sl=0,st=0;
  list.forEach(r=>{
    sp+=r.parts_total||0; sl+=r.labor_total||0; st+=r.grand_total||0;
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="text-align:center"><input type="checkbox" class="t3-chk" value="${r.id}" onchange="updateSelCount()"></td>
      <td><strong>${r.receipt}</strong></td>
      <td>${fmtD(r.req_date)}</td><td style="color:var(--green);font-weight:600">${fmtD(r.done_date)}</td>
      <td>${r.machine_type||'—'}</td><td>${r.machine_code||'—'}</td><td>${r.requester||'—'}</td>
      <td style="text-align:right">${usd(r.parts_total)}</td>
      <td style="text-align:right">${usd(r.labor_total)}</td>
      <td style="text-align:right;font-weight:700;color:var(--blue)">${usd(r.grand_total)}</td>
      <td><div style="display:flex;gap:3px;flex-wrap:wrap">
        ${isViewer ? '' : `<button class="btn btn-primary" style="padding:3px 7px;font-size:14px" onclick="openWorkModal(${r.id},this)">🔧 កែ</button>`}
        <button class="btn btn-warning" style="padding:3px 7px;font-size:14px" onclick="printFullRecord(${r.id},this)">🖨</button>
        ${isViewer ? '' : `<button class="btn btn-danger" style="padding:3px 7px;font-size:14px" onclick="deleteRec(${r.id},this)">🗑</button>`}
      </div></td>`;
    tbody.appendChild(tr);
  });
  const sb=document.getElementById('t3-summary');
  sb.style.display=list.length?'flex':'none';
  if(list.length){
    document.getElementById('sum-count').textContent=list.length;
    document.getElementById('sum-parts').textContent=usd(sp);
    document.getElementById('sum-labor').textContent=usd(sl);
    document.getElementById('sum-total').textContent=usd(st);
  }
}

// ── PRINT ────────────────────────────────────────────────────
async function printCurrentForm(btnEl) {
  if(btnEl) setLoading(btnEl, true);
  try {
    const r={
      receipt:val('receiptDisplay')||document.getElementById('receiptDisplay').textContent,
      date:val('f_date'), machine_type:val('f_type'), machine_code:val('f_code'),
      requester:val('f_requester'), phone:val('f_phone'), location:val('f_location'),
      description:val('f_desc'), req_date:val('f_req_date'), note:val('f_note'),
      status:'pending', sigs:collectSigs(), work_parts:[], work_labor:[],
      parts_total:0, labor_total:0, grand_total:0
    };
    openPrintWin(r,'request');
  } finally {
    if(btnEl) setTimeout(()=>setLoading(btnEl, false), 500);
  }
}
async function printReq(id, btnEl){
  if(btnEl) setLoading(btnEl, true);
  try { const r=await apiGet('/requests/'+id); openPrintWin(r,'request'); }
  finally { if(btnEl) setLoading(btnEl, false); }
}
async function printFullRecord(id, btnEl){
  if(btnEl) setLoading(btnEl, true);
  try { const r=await apiGet('/requests/'+id); openPrintWin(r,'full'); }
  finally { if(btnEl) setLoading(btnEl, false); }
}
async function printWorkRecord(btnEl){
  if(workingId<0) return;
  if(btnEl) setLoading(btnEl, true);
  try {
    const r=await apiGet('/requests/'+workingId);
    const parts=wParts.filter(Boolean).map(p=>{const s=(parseFloat(p.qty)||0)*(parseFloat(p.price)||0);return{part_name:p.name,quantity:p.qty,unit_price:p.price,sub_total:s};});
    const labor=wLabor.filter(Boolean).map(l=>{const s=(parseFloat(l.hours)||0)*(parseFloat(l.rate)||0);return{worker_name:l.name,hours:l.hours,hourly_rate:l.rate,sub_total:s};});
    openPrintWin({...r,work_parts:parts,work_labor:labor},'full');
  } finally {
    if(btnEl) setLoading(btnEl, false);
  }
}

function sigTable(title, s, isRequest) {
  // ការអនុម័តស្នើរការជួសជុល — លុបចេញទាំងស្រុងពេល Print
  if (isRequest) return '';
  // ការអនុម័តជួសជុលរួចរាល់ — មាន 4 col ពេញ
  return `<div class="st" style="margin-top:8px">${title}</div>
  <table class="sg">
    <thead><tr><th style="width:68px"></th><th>ស្នើរការងារ</th><th>ឯកភាព</th><th>ពិនិត្យ និងសម្រេច</th><th>បញ្ជាក់</th></tr></thead>
    <tbody>
      <tr><td class="rl">ឈ្មោះពេញ</td><td>${s.agent_req||''}</td><td>${s.agent_appr||''}</td><td>${s.agent_legal||''}</td><td>${s.agent_conf||''}</td></tr>
      <tr><td class="rl">តួនាទី</td><td>${s.base_req||''}</td><td>${s.base_appr||''}</td><td>${s.base_legal||''}</td><td>${s.base_conf||''}</td></tr>
      <tr><td class="rl">ហត្ថលេខា</td><td style="height:44px">${s.sign_req||''}</td><td>${s.sign_appr||''}</td><td>${s.sign_legal||''}</td><td>${s.sign_conf||''}</td></tr>
      <tr><td class="rl">ថ្ងៃខែ</td><td>${fmtD(s.date_req)}</td><td>${fmtD(s.date_appr)}</td><td>${fmtD(s.date_legal)}</td><td>${fmtD(s.date_conf)}</td></tr>
    </tbody>
  </table>`;
}

function openPrintWin(r, mode) {
  const s=r.sigs||{}; const ws=r.work_sigs||{};
  const stLbl={pending:'រង់ចាំ',progress:'កំពុងដំណើរការ',done:'រួចរាល់ ✅'}[r.status]||'';
  const pRows=(r.work_parts||[]).length
    ? (r.work_parts||[]).map((p,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${p.part_name||p.name||''}</td><td style="text-align:center">${p.quantity||p.qty||''}</td><td style="text-align:right">${usd(p.unit_price||p.price)}</td><td style="text-align:right">${usd(p.sub_total||((p.quantity||p.qty||0)*(p.unit_price||p.price||0)))}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px">—</td></tr>`;
  const lRows=(r.work_labor||[]).length
    ? (r.work_labor||[]).map((l,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${l.worker_name||l.name||''}</td><td style="text-align:center">${l.hours||''}</td><td style="text-align:right">${usd(l.hourly_rate||l.rate)}</td><td style="text-align:right">${usd(l.sub_total||((l.hours||0)*(l.hourly_rate||l.rate||0)))}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px">—</td></tr>`;
  const workBlock = mode==='full' ? `
    <div class="st">គ្រឿងបម្លាស់ដែលបានផ្លាស់ប្ដូរ</div>
    <table><thead><tr><th style="width:34px">លរ</th><th style="text-align:left">ឈ្មោះគ្រឿង</th><th style="width:58px">ចំនួន</th><th style="width:90px">តម្លៃ ($)</th><th style="width:98px">សរុប ($)</th></tr></thead>
    <tbody>${pRows}</tbody>
    <tfoot><tr class="tt"><td colspan="4" style="text-align:right;padding:5px 8px;font-weight:700">សរុបតម្លៃគ្រឿង (១)</td><td style="text-align:right;padding:5px 8px">${usd(r.parts_total)}</td></tr></tfoot></table>
    <div class="st" style="margin-top:8px">ការងារដែលជាងបានធ្វើ</div>
    <table><thead><tr><th style="width:34px">លរ</th><th style="text-align:left">ឈ្មោះជាង</th><th style="width:58px">ម៉ោង</th><th style="width:90px">តម្លៃ/ម៉ោង ($)</th><th style="width:98px">សរុប ($)</th></tr></thead>
    <tbody>${lRows}</tbody>
    <tfoot>
      <tr class="tt"><td colspan="4" style="text-align:right;padding:5px 8px;font-weight:700">សរុបថ្លៃឈ្នួលជាង (២)</td><td style="text-align:right;padding:5px 8px">${usd(r.labor_total)}</td></tr>
      <tr class="gt"><td colspan="4" style="text-align:right;padding:6px 8px;font-weight:700">តម្លៃសរុបរួម = (១)+(២)</td><td style="text-align:right;padding:6px 8px">${usd(r.grand_total)}</td></tr>
    </tfoot></table>
    ${r.report?`<div style="margin:8px 0;padding:7px 10px;background:#f5f8fd;border:1px solid #b8cde8;border-radius:4px;font-size:15px"><strong>រាយការណ៍:</strong> ${r.report}</div>`:''}` : '';
  const html=`<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8">
<title>ប័ណ្ណ #${r.receipt}</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Kantumruy Pro',sans-serif;font-size:16px;color:#1a2340;background:#fff;padding:14px}.w{max-width:720px;margin:0 auto;border:2px solid #1a4fa0;border-radius:8px;overflow:hidden}.hd{display:flex;align-items:center;background:#1a4fa0;color:#fff;padding:10px 16px;gap:10px}.hd .lg{font-size:15px;font-weight:700;letter-spacing:2px;color:#ffe082}.hd h1{flex:1;font-size:16px;font-weight:700;text-align:center}.hd .rn{background:rgba(255,255,255,.15);border-radius:4px;padding:3px 10px;font-size:16px;font-weight:700}.inf{padding:9px 14px 7px;border-bottom:1.5px solid #b8cde8;background:#f5f8fd}.ig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px}.ii{font-size:15px}.ii.f{grid-column:1/-1}.ii .lb{color:#1a4fa0;font-weight:700;font-size:14px}.ii .vl{border-bottom:1px solid #b8cde8;min-height:14px;padding:1px 3px}.st{background:#1a4fa0;color:#fff;font-weight:700;font-size:15px;padding:5px 12px}table{width:100%;border-collapse:collapse;font-size:15px}th{background:#dbe8f8;color:#1a4fa0;font-weight:700;padding:5px 7px;border:1px solid #b8cde8;text-align:center}td{padding:4px 7px;border:1px solid #d0dff0}tr:nth-child(even) td{background:#f0f6ff}.tt td{background:#dbe8f8!important;font-weight:700;color:#1a4fa0}.gt td{background:#1a4fa0!important;color:#fff!important;font-weight:700;font-size:16px}.sg .rl{background:#dbe8f8;font-weight:700;color:#1a4fa0;text-align:center;font-size:14px}.sg td{height:28px;text-align:center;vertical-align:middle}.ft{padding:6px 14px;font-size:14px;color:#888;border-top:1px solid #b8cde8;text-align:center}@media print{.np{display:none!important}}
/* ── LOGIN ─────────────────────────────────────────── */
#login-screen{position:fixed;inset:0;background:linear-gradient(135deg,#1a4fa0 0%,#0d2d6b 100%);z-index:9999;display:flex;align-items:center;justify-content:center}
#login-screen.hidden{display:none}
.login-box{background:#fff;border-radius:14px;padding:40px 36px;width:340px;box-shadow:0 8px 40px rgba(0,0,0,.3);text-align:center}
.login-logo{font-size:28px;font-weight:700;letter-spacing:3px;color:#1a4fa0;margin-bottom:4px}
.login-sub{font-size:13px;color:#888;margin-bottom:28px}
.login-box .fg{text-align:left;margin-bottom:14px}
.login-box label{font-size:12px;font-weight:700;color:#1a4fa0;display:block;margin-bottom:4px}
.login-box input{width:100%;font-family:'Kantumruy Pro',sans-serif;font-size:14px;padding:10px 12px;border:1.5px solid #b8cde8;border-radius:7px;outline:none;transition:border-color .2s}
.login-box input:focus{border-color:#1a4fa0;box-shadow:0 0 0 3px rgba(26,79,160,.1)}
.login-err{color:#c0392b;font-size:12px;font-weight:600;margin-bottom:10px;min-height:18px}
.login-btn{width:100%;background:#1a4fa0;color:#fff;border:none;border-radius:7px;padding:11px;font-family:'Kantumruy Pro',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s;margin-top:4px}
.login-btn:hover{opacity:.88}
.login-btn:active{transform:scale(.98)}
</style></head><body>
<div id="login-screen">
  <div class="login-box">
    <div class="login-logo">ELYTHONG</div>
    <div class="login-sub">ប្រព័ន្ធតាមដានការជួសជុលគ្រឿងចក្រ</div>
    <div class="fg">
      <label>Username</label>
      <input type="text" id="lg-user" placeholder="Username" autocomplete="username" onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div class="fg">
      <label>Password</label>
      <input type="password" id="lg-pass" placeholder="Password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div class="login-err" id="lg-err"></div>
    <button class="login-btn" onclick="doLogin()">🔐 ចូលប្រើប្រាស់</button>
  </div>
</div>

<div class="w">
  <div class="hd"><div class="lg">ELYTHONG</div><h1>ប័ណ្ណស្នើការជួសជុលគ្រឿងចក្រ</h1><div class="rn">លេខ: ${r.receipt}</div></div>
  <div class="inf"><div class="ig">
    <div class="ii"><div class="lb">ថ្ងៃខែ</div><div class="vl">${fmtD(r.date)}</div></div>
    <div class="ii"><div class="lb">ប្រភេទ</div><div class="vl">${r.machine_type||r.type||'—'}</div></div>
    <div class="ii"><div class="lb">លេខសម្គាល់</div><div class="vl">${r.machine_code||r.code||'—'}</div></div>
    <div class="ii"><div class="lb">អ្នកស្នើ</div><div class="vl">${r.requester||'—'}</div></div>
    <div class="ii"><div class="lb">ទូរស័ព្ទ</div><div class="vl">${r.phone||'—'}</div></div>
    <div class="ii"><div class="lb">ទីតាំង</div><div class="vl">${r.location||'—'}</div></div>
    <div class="ii f"><div class="lb">ពណ៌នា</div><div class="vl">${r.description||r.desc||'—'}</div></div>
    <div class="ii"><div class="lb">ថ្ងៃស្នើ</div><div class="vl">${fmtD(r.req_date)}</div></div>
    ${mode==='full'?`<div class="ii"><div class="lb">ថ្ងៃរួច</div><div class="vl" style="color:green;font-weight:700">${fmtD(r.done_date)}</div></div>`:'<div class="ii"></div>'}
  </div></div>
  ${workBlock}
  ${sigTable('ការអនុម័ត (ស្នើរការជួសជុល)', s, true)}
  ${mode==='full' ? sigTable('ការអនុម័ត (ជួសជុលរួចរាល់)', ws, false) : ''}
  <div class="ft">ELYTHONG — ប័ណ្ណ #${r.receipt} — បោះពុម្ព ${new Date().toLocaleDateString('km-KH')}</div>
</div>
<div class="np" style="text-align:center;margin-top:14px;display:flex;gap:10px;justify-content:center">
  <button onclick="window.print()" style="font-family:'Kantumruy Pro',sans-serif;background:#1a4fa0;color:#fff;border:none;padding:9px 26px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer">🖨 បោះពុម្ព</button>
  <button onclick="window.close()" style="font-family:'Kantumruy Pro',sans-serif;background:#888;color:#fff;border:none;padding:9px 16px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer">✕ បិទ</button>
</div></body></html>`;
  const win=window.open('','_blank','width=820,height=960');
  win.document.write(html); win.document.close();
}

// ── T3 CHECKBOX & MULTI-PRINT ────────────────────────────────
function toggleAllT3(chk) {
  document.querySelectorAll('.t3-chk').forEach(c=>c.checked=chk.checked);
  updateSelCount();
}
function updateSelCount() {
  const n=document.querySelectorAll('.t3-chk:checked').length;
  document.getElementById('sel-count').textContent=n;
  document.getElementById('btn-print-selected').style.display=n>0?'':'none';
  const all=document.querySelectorAll('.t3-chk');
  const allChk=document.getElementById('t3-chk-all');
  if(allChk) allChk.checked=all.length>0&&n===all.length;
}
async function printSelectedRecords(btnEl) {
  const ids=[...document.querySelectorAll('.t3-chk:checked')].map(c=>parseInt(c.value));
  if(!ids.length) return;
  if(btnEl) setLoading(btnEl, true);
  try {
    const recs=await Promise.all(ids.map(id=>apiGet('/requests/'+id)));
    openMultiPrintWin(recs);
  } finally {
    if(btnEl) setLoading(btnEl, false);
  }
}
function openMultiPrintWin(recs) {
  const pages=recs.map(r=>{
    const ws=r.work_sigs||{};
    const pRows=(r.work_parts||[]).length
      ?(r.work_parts||[]).map((p,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${p.part_name||p.name||''}</td><td style="text-align:center">${p.quantity||p.qty||''}</td><td style="text-align:right">${usd(p.unit_price||p.price)}</td><td style="text-align:right">${usd(p.sub_total||((p.quantity||p.qty||0)*(p.unit_price||p.price||0)))}</td></tr>`).join('')
      :`<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px">—</td></tr>`;
    const lRows=(r.work_labor||[]).length
      ?(r.work_labor||[]).map((l,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${l.worker_name||l.name||''}</td><td style="text-align:center">${l.hours||''}</td><td style="text-align:right">${usd(l.hourly_rate||l.rate)}</td><td style="text-align:right">${usd(l.sub_total||((l.hours||0)*(l.hourly_rate||l.rate||0)))}</td></tr>`).join('')
      :`<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px">—</td></tr>`;
    const workBlock=`
      <div class="st">គ្រឿងបម្លាស់ដែលបានផ្លាស់ប្ដូរ</div>
      <table><thead><tr><th style="width:34px">លរ</th><th style="text-align:left">ឈ្មោះគ្រឿង</th><th style="width:58px">ចំនួន</th><th style="width:90px">តម្លៃ ($)</th><th style="width:98px">សរុប ($)</th></tr></thead>
      <tbody>${pRows}</tbody>
      <tfoot><tr class="tt"><td colspan="4" style="text-align:right;padding:5px 8px;font-weight:700">សរុបតម្លៃគ្រឿង (១)</td><td style="text-align:right;padding:5px 8px">${usd(r.parts_total)}</td></tr></tfoot></table>
      <div class="st" style="margin-top:8px">ការងារដែលជាងបានធ្វើ</div>
      <table><thead><tr><th style="width:34px">លរ</th><th style="text-align:left">ឈ្មោះជាង</th><th style="width:58px">ម៉ោង</th><th style="width:90px">តម្លៃ/ម៉ោង ($)</th><th style="width:98px">សរុប ($)</th></tr></thead>
      <tbody>${lRows}</tbody>
      <tfoot>
        <tr class="tt"><td colspan="4" style="text-align:right;padding:5px 8px;font-weight:700">សរុបថ្លៃឈ្នួលជាង (២)</td><td style="text-align:right;padding:5px 8px">${usd(r.labor_total)}</td></tr>
        <tr class="gt"><td colspan="4" style="text-align:right;padding:6px 8px;font-weight:700">តម្លៃសរុបរួម = (១)+(២)</td><td style="text-align:right;padding:6px 8px">${usd(r.grand_total)}</td></tr>
      </tfoot></table>
      ${r.report?`<div style="margin:8px 0;padding:7px 10px;background:#f5f8fd;border:1px solid #b8cde8;border-radius:4px;font-size:15px"><strong>រាយការណ៍:</strong> ${r.report}</div>`:''}`;
    const sigComp=`<div class="st" style="margin-top:8px">ការអនុម័ត (ជួសជុលរួចរាល់)</div>
      <table class="sg">
        <thead><tr><th style="width:68px"></th><th>ស្នើរការងារ</th><th>ឯកភាព</th><th>ពិនិត្យ និងសម្រេច</th><th>បញ្ជាក់</th></tr></thead>
        <tbody>
          <tr><td class="rl">ឈ្មោះពេញ</td><td>${ws.agent_req||''}</td><td>${ws.agent_appr||''}</td><td>${ws.agent_legal||''}</td><td>${ws.agent_conf||''}</td></tr>
          <tr><td class="rl">តួនាទី</td><td>${ws.base_req||''}</td><td>${ws.base_appr||''}</td><td>${ws.base_legal||''}</td><td>${ws.base_conf||''}</td></tr>
          <tr><td class="rl">ហត្ថលេខា</td><td style="height:44px">${ws.sign_req||''}</td><td>${ws.sign_appr||''}</td><td>${ws.sign_legal||''}</td><td>${ws.sign_conf||''}</td></tr>
          <tr><td class="rl">ថ្ងៃខែ</td><td>${fmtD(ws.date_req)}</td><td>${fmtD(ws.date_appr)}</td><td>${fmtD(ws.date_legal)}</td><td>${fmtD(ws.date_conf)}</td></tr>
        </tbody>
      </table>`;
    return `<div class="w">
      <div class="hd"><div class="lg">ELYTHONG</div><h1>ប័ណ្ណស្នើការជួសជុលគ្រឿងចក្រ</h1><div class="rn">លេខ: ${r.receipt}</div></div>
      <div class="inf"><div class="ig">
        <div class="ii"><div class="lb">ថ្ងៃខែ</div><div class="vl">${fmtD(r.date)}</div></div>
        <div class="ii"><div class="lb">ប្រភេទ</div><div class="vl">${r.machine_type||'—'}</div></div>
        <div class="ii"><div class="lb">លេខសម្គាល់</div><div class="vl">${r.machine_code||'—'}</div></div>
        <div class="ii"><div class="lb">អ្នកស្នើ</div><div class="vl">${r.requester||'—'}</div></div>
        <div class="ii"><div class="lb">ទូរស័ព្ទ</div><div class="vl">${r.phone||'—'}</div></div>
        <div class="ii"><div class="lb">ទីតាំង</div><div class="vl">${r.location||'—'}</div></div>
        <div class="ii f"><div class="lb">ពណ៌នា</div><div class="vl">${r.description||'—'}</div></div>
        <div class="ii"><div class="lb">ថ្ងៃស្នើ</div><div class="vl">${fmtD(r.req_date)}</div></div>
        <div class="ii"><div class="lb">ថ្ងៃរួច</div><div class="vl" style="color:green;font-weight:700">${fmtD(r.done_date)}</div></div>
      </div></div>
      ${workBlock}${sigComp}
      <div class="ft">ELYTHONG — ប័ណ្ណ #${r.receipt} — បោះពុម្ព ${new Date().toLocaleDateString('km-KH')}</div>
    </div>`;
  }).join('<div style="page-break-after:always"></div>');

  const html=`<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8">
<title>បោះពុម្ព ${recs.length} ប័ណ្ណ</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Kantumruy Pro',sans-serif;font-size:16px;color:#1a2340;background:#fff;padding:14px}.w{max-width:720px;margin:0 auto 30px;border:2px solid #1a4fa0;border-radius:8px;overflow:hidden}.hd{display:flex;align-items:center;background:#1a4fa0;color:#fff;padding:10px 16px;gap:10px}.hd .lg{font-size:15px;font-weight:700;letter-spacing:2px;color:#ffe082}.hd h1{flex:1;font-size:16px;font-weight:700;text-align:center}.hd .rn{background:rgba(255,255,255,.15);border-radius:4px;padding:3px 10px;font-size:16px;font-weight:700}.inf{padding:9px 14px 7px;border-bottom:1.5px solid #b8cde8;background:#f5f8fd}.ig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px}.ii{font-size:15px}.ii.f{grid-column:1/-1}.ii .lb{color:#1a4fa0;font-weight:700;font-size:14px}.ii .vl{border-bottom:1px solid #b8cde8;min-height:14px;padding:1px 3px}.st{background:#1a4fa0;color:#fff;font-weight:700;font-size:15px;padding:5px 12px}table{width:100%;border-collapse:collapse;font-size:15px}th{background:#dbe8f8;color:#1a4fa0;font-weight:700;padding:5px 7px;border:1px solid #b8cde8;text-align:center}td{padding:4px 7px;border:1px solid #d0dff0}tr:nth-child(even) td{background:#f0f6ff}.tt td{background:#dbe8f8!important;font-weight:700;color:#1a4fa0}.gt td{background:#1a4fa0!important;color:#fff!important;font-weight:700;font-size:16px}.sg .rl{background:#dbe8f8;font-weight:700;color:#1a4fa0;text-align:center;font-size:14px}.sg td{height:28px;text-align:center;vertical-align:middle}.ft{padding:6px 14px;font-size:14px;color:#888;border-top:1px solid #b8cde8;text-align:center}@media print{.np{display:none!important}}
/* ── LOGIN ─────────────────────────────────────────── */
#login-screen{position:fixed;inset:0;background:linear-gradient(135deg,#1a4fa0 0%,#0d2d6b 100%);z-index:9999;display:flex;align-items:center;justify-content:center}
#login-screen.hidden{display:none}
.login-box{background:#fff;border-radius:14px;padding:40px 36px;width:340px;box-shadow:0 8px 40px rgba(0,0,0,.3);text-align:center}
.login-logo{font-size:28px;font-weight:700;letter-spacing:3px;color:#1a4fa0;margin-bottom:4px}
.login-sub{font-size:13px;color:#888;margin-bottom:28px}
.login-box .fg{text-align:left;margin-bottom:14px}
.login-box label{font-size:12px;font-weight:700;color:#1a4fa0;display:block;margin-bottom:4px}
.login-box input{width:100%;font-family:'Kantumruy Pro',sans-serif;font-size:14px;padding:10px 12px;border:1.5px solid #b8cde8;border-radius:7px;outline:none;transition:border-color .2s}
.login-box input:focus{border-color:#1a4fa0;box-shadow:0 0 0 3px rgba(26,79,160,.1)}
.login-err{color:#c0392b;font-size:12px;font-weight:600;margin-bottom:10px;min-height:18px}
.login-btn{width:100%;background:#1a4fa0;color:#fff;border:none;border-radius:7px;padding:11px;font-family:'Kantumruy Pro',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s;margin-top:4px}
.login-btn:hover{opacity:.88}
.login-btn:active{transform:scale(.98)}
</style></head><body>
<div id="login-screen">
  <div class="login-box">
    <div class="login-logo">ELYTHONG</div>
    <div class="login-sub">ប្រព័ន្ធតាមដានការជួសជុលគ្រឿងចក្រ</div>
    <div class="fg">
      <label>Username</label>
      <input type="text" id="lg-user" placeholder="Username" autocomplete="username" onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div class="fg">
      <label>Password</label>
      <input type="password" id="lg-pass" placeholder="Password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div class="login-err" id="lg-err"></div>
    <button class="login-btn" onclick="doLogin()">🔐 ចូលប្រើប្រាស់</button>
  </div>
</div>

${pages}
<div class="np" style="text-align:center;margin-top:14px;display:flex;gap:10px;justify-content:center">
  <button onclick="window.print()" style="font-family:'Kantumruy Pro',sans-serif;background:#1a4fa0;color:#fff;border:none;padding:9px 26px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer">🖨 បោះពុម្ព (${recs.length} ប័ណ្ណ)</button>
  <button onclick="window.close()" style="font-family:'Kantumruy Pro',sans-serif;background:#888;color:#fff;border:none;padding:9px 16px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer">✕ បិទ</button>
</div></body></html>`;
  const win=window.open('','_blank','width=820,height=960');
  win.document.write(html); win.document.close();
}

// ── TAB 4 ────────────────────────────────────────────────────
const MONTH_KM=['','មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];

function initT4Years() {
  const sel=document.getElementById('t4-year');
  const curYear=new Date().getFullYear();
  const years=new Set(records.filter(r=>r.status==='done'&&r.done_date).map(r=>r.done_date.substring(0,4)));
  years.add(String(curYear));
  const sorted=[...years].sort((a,b)=>b-a);
  const cur=sel.value;
  sel.innerHTML=sorted.map(y=>`<option value="${y}" ${y===cur?'selected':''}>${y}</option>`).join('');
  if(!sel.value) sel.value=String(curYear);
}

function renderT4() {
  const year=val('t4-year'); const month=val('t4-month'); const q=(val('t4-search')||'').toLowerCase();
  let base=records.filter(r=>r.status==='done'&&r.done_date&&r.done_date.startsWith(year)&&
    (!month||r.done_date.substring(5,7)===month)&&
    (!q||[r.machine_code,r.machine_type,r.requester,r.receipt].join(' ').toLowerCase().includes(q)));
  const totalParts=base.reduce((s,r)=>s+(r.parts_total||0),0);
  const totalLabor=base.reduce((s,r)=>s+(r.labor_total||0),0);
  const totalGrand=base.reduce((s,r)=>s+(r.grand_total||0),0);
  document.getElementById('t4-cards').innerHTML=`
    <div style="background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:14px;text-align:center"><div style="font-size:15px;color:var(--blue);font-weight:700;margin-bottom:4px">ចំនួនប័ណ្ណ</div><div style="font-size:22px;font-weight:700;color:var(--orange)">${base.length}</div></div>
    <div style="background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:14px;text-align:center"><div style="font-size:15px;color:var(--blue);font-weight:700;margin-bottom:4px">តម្លៃគ្រឿង</div><div style="font-size:20px;font-weight:700;color:var(--blue)">${usd(totalParts)}</div></div>
    <div style="background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:14px;text-align:center"><div style="font-size:15px;color:var(--blue);font-weight:700;margin-bottom:4px">តម្លៃជាង</div><div style="font-size:20px;font-weight:700;color:var(--blue)">${usd(totalLabor)}</div></div>
    <div style="background:var(--blue);border-radius:8px;padding:14px;text-align:center"><div style="font-size:15px;color:rgba(255,255,255,.8);font-weight:700;margin-bottom:4px">សរុបរួម</div><div style="font-size:20px;font-weight:700;color:#fff">${usd(totalGrand)}</div></div>`;
  const wrap=document.getElementById('t4-monthly-wrap'); wrap.innerHTML='';
  if(base.length===0){ wrap.innerHTML='<div class="no-data">📊 មិនទាន់មានទិន្នន័យ</div>'; return; }
  const byMonth={};
  base.forEach(r=>{ const m=r.done_date.substring(5,7); if(!byMonth[m]) byMonth[m]=[]; byMonth[m].push(r); });
  Object.keys(byMonth).sort().forEach(m=>{
    const monthRecs=byMonth[m]; const mLabel=MONTH_KM[parseInt(m)]+' '+year;
    const byDay={}; monthRecs.forEach(r=>{ const d=r.done_date.substring(8,10); if(!byDay[d]) byDay[d]=[]; byDay[d].push(r); });
    let tableRows=''; let mP=0,mL=0,mG=0;
    Object.keys(byDay).sort().forEach(day=>{
      byDay[day].forEach(r=>{
        mP+=r.parts_total||0; mL+=r.labor_total||0; mG+=r.grand_total||0;
        tableRows+=`<tr><td style="text-align:center;font-weight:600">${day}/${m}/${year}</td><td style="text-align:center;font-weight:600;color:var(--blue)">${r.machine_code||'—'}</td><td>${r.machine_type||'—'}</td><td>${r.requester||'—'}</td><td style="text-align:right">${usd(r.parts_total)}</td><td style="text-align:right">${usd(r.labor_total)}</td><td style="text-align:right;font-weight:700;color:var(--blue)">${usd(r.grand_total)}</td><td style="text-align:center"><span class="badge b-done" style="font-size:14px">#${r.receipt}</span></td></tr>`;
      });
    });
    const block=document.createElement('div'); block.style.marginBottom='20px';
    block.innerHTML=`<div style="background:var(--blue);color:#fff;font-weight:700;font-size:16px;padding:8px 14px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center"><span>📅 ${mLabel}</span><span style="font-size:15px;opacity:.85">${monthRecs.length} ប័ណ្ណ &nbsp;|&nbsp; ${usd(mG)}</span></div>
    <div style="border:1.5px solid var(--border);border-radius:0 0 7px 7px;overflow:hidden"><table><thead><tr><th style="width:100px">ថ្ងៃខែ</th><th style="width:80px">លេខសម្គាល់</th><th>ប្រភេទ</th><th>អ្នកស្នើ</th><th style="width:90px">គ្រឿង ($)</th><th style="width:80px">ជាង ($)</th><th style="width:95px">សរុប ($)</th><th style="width:70px">ប័ណ្ណ</th></tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot><tr style="background:var(--hbg)!important"><td colspan="4" style="text-align:right;font-weight:700;color:var(--blue);padding:7px 10px">សរុបខែ ${mLabel}</td><td style="text-align:right;font-weight:700;color:var(--blue);padding:7px 10px">${usd(mP)}</td><td style="text-align:right;font-weight:700;color:var(--blue);padding:7px 10px">${usd(mL)}</td><td style="text-align:right;font-weight:700;color:var(--blue);padding:7px 10px">${usd(mG)}</td><td></td></tr></tfoot></table></div>`;
    wrap.appendChild(block);
  });
}

function printT4() {
  const year=val('t4-year'); const month=val('t4-month');
  window.open(API+'/monthly-report?year='+year+(month?'&month='+month:''),'_blank');
}

// ── LOGIN ──────────────────────────────────────────────────────
const CREDENTIALS       = { username: 'AdminPheng',  password: '168' };
const CREDENTIALS_VIEW  = { username: 'ViewerPheng', password: '168view' };
let isViewer = false;

function doLogin(btnEl) {
  const btn = btnEl || document.querySelector('.login-btn');
  const u = document.getElementById('lg-user').value.trim();
  const p = document.getElementById('lg-pass').value;
  const err = document.getElementById('lg-err');

  const isAdmin = (u === CREDENTIALS.username     && p === CREDENTIALS.password);
  const isView  = (u === CREDENTIALS_VIEW.username && p === CREDENTIALS_VIEW.password);

  if (isAdmin || isView) {
    if(btn) setLoading(btn, true);
    isViewer = isView;
    setTimeout(() => {
      document.getElementById('login-screen').classList.add('hidden');
      sessionStorage.setItem('elythong_auth', isView ? 'viewer' : '1');
      err.textContent = '';
      applyViewerMode();
      if(btn) setLoading(btn, false);
    }, 400);
  } else {
    err.textContent = '❌ Username ឬ Password មិនត្រឹមត្រូវ!';
    document.getElementById('lg-pass').value = '';
    document.getElementById('lg-pass').focus();
  }
}

// Apply viewer-only restrictions to UI
function applyViewerMode() {
  if (!isViewer) return;
  if (document.body.classList.contains('is-viewer')) return; // already applied
  document.body.classList.add('is-viewer');
  // Show viewer banner
  const banner = document.querySelector('.viewer-banner');
  if(banner) banner.style.display = 'block';
  // Hide Tab 1 (form) entirely — viewers cannot submit new requests
  const tab1Btn = document.querySelector(`.tab-btn[onclick*="'t1'"]`);
  if(tab1Btn) tab1Btn.style.display = 'none';
  // Add viewer badge to header
  const badgeNum = document.getElementById('hdrNum');
  if(badgeNum && !document.getElementById('viewer-badge')) {
    badgeNum.insertAdjacentHTML('beforebegin', '<span id="viewer-badge" style="background:#e07b2a;color:#fff;border-radius:5px;padding:3px 10px;font-size:13px;font-weight:700">👁 មើលតែ</span>');
  }
  // Switch to tab 2
  showTab('t2');
  // Re-render tables to strip action buttons
  renderT2(); renderT3();
}

// Check session on load
(function() {
  const auth = sessionStorage.getItem('elythong_auth');
  if (auth === '1' || auth === 'viewer') {
    isViewer = (auth === 'viewer');
    document.getElementById('login-screen').classList.add('hidden');
    // applyViewerMode() is called at end of window.onload after data is ready
  } else {
    setTimeout(() => document.getElementById('lg-user').focus(), 100);
  }
})();