const tryLoadBtn = document.getElementById('tryLoadBtn');
const resetBtn = document.getElementById('resetBtn');
const capsuleTabs = document.getElementById('capsuleTabs');
const capsuleIndicator = document.getElementById('capsuleIndicator');
const subTabsContainer = document.getElementById('subTabsContainer');
const widgetsContainer = document.getElementById('widgetsContainer');
const processedChips = document.getElementById('processedChips');
const pendingChips = document.getElementById('pendingChips');
const tableBody = document.querySelector('#empTable tbody');
const tableInfo = document.getElementById('tableInfo');
const searchInput = document.getElementById('searchInput');
const pageSizeSelect = document.getElementById('pageSize');
const pager = document.getElementById('pager');

let rawData = [];
let normalized = [];
let periods = [];
let activePeriod = null;
let offices = [];
let activeOffice = null;
let visibleRows = [];
let sortState = { key: 'Avg Time (mins)', dir: 'asc' };
let page = 1;
let lastFilteredData = [];   // will hold the most recent filtered dataset
let lastFileName = "export"; // default filename


/* helper to safely read various key name variants */
function pick(row, keys){
  for(const k of keys){
    if(k in row && row[k] !== null && row[k] !== undefined && String(row[k]).trim() !== '') return row[k];
  }
  return null;
}

const mapKeys = {
  period: ['Period','period'],
  employee: ['Employee','employee','holder'],
  office: ['Office_Type','office_type','Office Type','OfficeType'],
  cadre: ['Cadre_Type','cadre_type','Cadre Type','CadreType'],
  opening: ['Opening Balance','Opening','Opening_Balance'],
  received: ['Received Files','Received','Received_Files'],
  processed: ['Processed Files','Processed','Processed_Files'],
  closed: ['Closed Files','Closed','Closed_Files'],
  pending: ['Pending Files','Pending','Pending_Files'],
  parked: ['Parked Files','Parked','Parked_Files'],
  avg: ['Avg Time (mins)','Avg Time','AvgTime'],
  median: ['Median Time (mins)','MedianTime']
};

/* bucket keys */
const bucketKeys = {
  p1: ['Processed ≤1d','Processed <=1d','Processed <= 1d','Processed <= 1 day'],
  p2: ['Processed ≤2d','Processed <=2d'],
  p3: ['Processed ≤3d'],
  p1w:['Processed ≤1w'],
  p1m:['Processed ≤1m'],
  pgt1m:['Processed >1m'],
  pending_lt7:['Pending <7Days','Pending < 7Days'],
  pending_ge7:['Pending ≥7Days','Pending >=7Days','Pending >= 7Days'],
  pending_ge15:['Pending ≥15Days'],
  pending_ge30:['Pending ≥30Days'],
  pending_ge60:['Pending ≥60Days'],
  pending_ge90:['Pending ≥90Days'],
  pending_ge120:['Pending ≥120Days']
};

/* normalize rows */
function normalizeRows(rows){
  return rows.map(r=>{
    const out = Object.assign({}, r);
    out._period = pick(r, mapKeys.period) || 'Unknown';
    out._employee = pick(r, mapKeys.employee) || 'Unknown';
    out._office = pick(r, mapKeys.office) || 'Unknown';
    out._cadre = pick(r, mapKeys.cadre) || '';
    out._opening = Number(pick(r, mapKeys.opening)) || 0;
    out._received = Number(pick(r, mapKeys.received)) || 0;
    out._processed = Number(pick(r, mapKeys.processed)) || 0;
    out._closed = Number(pick(r, mapKeys.closed)) || 0;
    out._pending = Number(pick(r, mapKeys.pending)) || 0;
    out._parked = Number(pick(r, mapKeys.parked)) || 0;
    out._avg = Number(pick(r, mapKeys.avg));
    out._median = Number(pick(r, mapKeys.median));

    out._b = {};
    for(const k in bucketKeys){
      out._b[k] = Number(pick(r, bucketKeys[k])) || 0;
    }
    return out;
  });
}

function formatMinutes(mins) {
  if (mins == null || isNaN(mins) || mins <= 0) return '-';
  const days = Math.floor(mins / (60*24));
  const hours = Math.floor((mins % (60*24)) / 60);
  const minutes = Math.round(mins % 60);
  return `${days} D ${hours} H ${minutes} M`;
}


/* main loader */
function loadData(rows){
  rawData = rows;
  normalized = normalizeRows(rows);
  periods = Array.from(new Set(normalized.map(r=>r._period)));
  if(periods.length===0) periods = ['Entire Period'];
  activePeriod = periods[0];
  renderPeriodCapsule();
  computeOffices();
  renderSubTabs();
  setActivePeriod(activePeriod);
}

/* capsule tabs */
function renderPeriodCapsule(){
  capsuleTabs.querySelectorAll('.tab').forEach(n=>n.remove());
  periods.forEach((p)=>{
    const el = document.createElement('div');
    el.className = 'tab';
    el.setAttribute('role','tab');
    el.textContent = p;
    el.onclick = ()=> setActivePeriod(p);
    capsuleTabs.appendChild(el);
  });
  requestAnimationFrame(()=> updateIndicatorToActive() );
}

function setActivePeriod(p){
  activePeriod = p;
  [...capsuleTabs.querySelectorAll('.tab')].forEach(t=> t.classList.toggle('active', t.textContent===p));
  updateIndicatorToActive();
  computeOffices();
  renderSubTabs();
  setActiveOffice(offices[0] || null);
  
}

function updateIndicatorToActive(){
  const tabs = [...capsuleTabs.querySelectorAll('.tab')];
  const active = tabs.find(t=>t.classList.contains('active'));
  if(!active){ capsuleIndicator.style.width = '0px'; return; }
  const left = active.offsetLeft - 6;
  const width = active.offsetWidth;
  capsuleIndicator.style.transform = `translateX(${left}px)`;
  capsuleIndicator.style.width = width + 'px';
}

/* offices */
function computeOffices(){
  offices = Array.from(new Set(normalized.filter(r=>r._period===activePeriod).map(r=>r._office))).sort();
}

function renderSubTabs(){
  subTabsContainer.innerHTML = '';
  if(!offices.length){ subTabsContainer.innerHTML = '<div class="small" style="color:var(--muted)">No offices</div>'; return; }
  offices.forEach((o, idx)=>{
    const b = document.createElement('div');
    b.className = 'tab' + (idx===0?' active':'');
    b.textContent = o;
    b.onclick = ()=> setActiveOffice(o);
    subTabsContainer.appendChild(b);
  });
}

function setActiveOffice(o){
  activeOffice = o;
  [...subTabsContainer.querySelectorAll('.tab')].forEach(t=> t.classList.toggle('active', t.textContent===o));
  renderActiveView();
}

function rowsForActive(){
  return normalized.filter(r => r._period === activePeriod && (activeOffice ? r._office === activeOffice : true));
}

/* render active view */
function renderActiveView(){
  const rows = rowsForActive();
  visibleRows = rows;
  renderWidgets(rows);
  renderBuckets(rows);
  renderTable(rows);
  updateTableInfo();
  
}

/* animate number */
function animateNumber(el, to, opts = {}) {
  const duration = opts.duration || 750;
  const from = Number(el.dataset.from) || 0;
  const formatter = opts.formatter || (v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  el.dataset.from = to;
  const start = performance.now();
  
  function step(now){
    const t = Math.min(1, (now - start)/duration);
    const v = from + (to - from) * easeOutCubic(t);
    el.textContent = formatter(Math.round(v));
    if(t < 1) requestAnimationFrame(step);
  }
  
  requestAnimationFrame(step);
}

function easeOutCubic(t){ return (--t)*t*t+1; }

/* sparkline */
function makeSparklineSVG(rowset){
  const keys = ['p1','p2','p3','p1w','p1m','pgt1m'];
  const vals = keys.map(k => rowset.reduce((s,r)=> s + (r._b[k]||0), 0));
  const max = Math.max(...vals,1);
  const w = 120, h = 34, pad = 4;
  const step = (w - pad*2) / (vals.length - 1);
  const points = vals.map((v,i)=> `${pad + i*step},${h - pad - (v/max)*(h - pad*2)}`);
  const path = 'M' + points.join(' L ') + ` L ${w-pad},${h-pad} L ${pad},${h-pad} Z`;
  const poly = `<polyline points="${points.join(' ')}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
  const area = `<path d="${path}" fill="rgba(7,199,216,0.06)"></path>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${area}${poly}</svg>`;
}

/* widgets */
function renderWidgets(rows){
  widgetsContainer.innerHTML = '';
  const opening = rows.reduce((s,r)=> s + r._opening,0);
  const received = rows.reduce((s,r)=> s + r._received,0);
  const processed = rows.reduce((s,r)=> s + r._processed,0);
  const closed = rows.reduce((s,r)=> s + r._closed,0);
  const pending = rows.reduce((s,r)=> s + r._pending,0);
  const parked = rows.reduce((s,r)=> s + r._parked,0);
  const avg = meanWeighted(rows, r => r._avg, r => r._processed);
  const median = medianOf(rows.map(r => r._median).filter(v=>!isNaN(v)));

  const items = [
    {title:'Opening Balance', value: opening, icon: svgOpeningBalance()},
    {title:'Files Received', value: received, icon: svgReceivedFiles()},
    {title:'Files Processed', value: processed, icon: svgProcessedFiles()},
    {title:'Files Closed', value: closed, icon: svgFilesClosed()},
    {title:'Files Pending', value: pending, icon: svgFilesPending()},
    {title:'Files Parked', value: parked, icon: svgFilesParked()},
    {title:'Avg Processing Time', value: avg, formatter: formatMinutes, icon: svgAvgProcessingTime()},
    {title:'Median Processing Time', value: median, formatter: formatMinutes, icon: svgMedianProcessingTime()},
  ];

  items.forEach(it=>{
    const w = document.createElement('div');
    w.className = 'widget';
    const displayValue = it.formatter ? it.formatter(it.value) : it.value;
    w.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="title">${it.title}</div>
          <div class="value"><span class="num" data-from="0">${displayValue}</span></div>
          <div class="sub">for ${activeOffice || 'All Offices'} · ${activePeriod}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <div class="ring" style="background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(255,255,255,0.01));">
            ${it.icon}
          </div>
          <div style="opacity:.85;font-size:12px;color:var(--muted)">${makeSparklineSVG(rows)}</div>
        </div>
      </div>`;

    widgetsContainer.appendChild(w);
    const numEl = w.querySelector('.num');

    // Animate only if there is no formatter (skip Avg & Median)
    if(!it.formatter){
      animateNumber(numEl, (typeof it.value === 'number') ? it.value : (isNaN(Number(it.value))?0:Number(it.value)));
    }
  });
}


/* mean weighted & median */
function meanWeighted(rows, valFn, weightFn){
  let num=0, den=0;
  rows.forEach(r=>{ const v=valFn(r); const w=weightFn(r); if(!isNaN(v)&&!isNaN(w)&&w>0){num+=v*w; den+=w;} });
  if(den>0) return num/den;
  const vs = rows.map(r=>valFn(r)).filter(v=>!isNaN(v));
  if(!vs.length) return null;
  return vs.reduce((a,b)=>a+b,0)/vs.length;
}
function medianOf(arr){ if(!arr.length) return null; arr = arr.slice().sort((a,b)=>a-b); const m=Math.floor(arr.length/2); return arr.length%2?arr[m]:(arr[m-1]+arr[m])/2; }

/* processed/pending chips */
/* processed/pending chips */
function renderBuckets(rows) {
  processedChips.innerHTML = '';
  const pKeys = ['p1','p2','p3','p1w','p1m','pgt1m'];
  const pLabels = ['Processed ≤1D','Processed ≤2D','Processed ≤3D','Processed ≤1W','Processed ≤1M','Processed >1M'];
  const pVals = pKeys.map(k => rows.reduce((s,r)=> s + (r._b[k]||0),0));
  const maxPVal = Math.max(1, ...pVals);

  pKeys.forEach((k,i)=>{
  const c = document.createElement('div');
  c.className = `chip chip-processed ${k}`;
  const percent = Math.min(100, Math.round((pVals[i] / maxPVal) * 100));
  c.innerHTML = `
    <small>${pLabels[i]}</small>
    <strong>${pVals[i]}</strong>
    <div class="chip-bar">
      <div class="chip-bar-fill ${k}" style="width:${percent}%"></div>
    </div>`;
  processedChips.appendChild(c);
  if (k === 'pgt1m' ) {
  c.classList.add('heartbeat');
}
});

  pendingChips.innerHTML = '';
  const pendKeys = ['pending_ge7','pending_ge15','pending_ge30','pending_ge60','pending_ge90','pending_ge120'];
  const pendLabels = ['Pending ≥7D','Pending ≥15D','Pending ≥30D','Pending ≥60D','Pending ≥90D','Pending ≥120D'];
  const pendVals = pendKeys.map(k => rows.reduce((s,r)=> s + (r._b[k]||0),0));
  const maxPendVal = Math.max(1, ...pendVals);

  pendKeys.forEach((k,i)=>{
  const c = document.createElement('div');
  c.className = `chip chip-pending ${k}`;
  const percent = Math.min(100, Math.round((pendVals[i] / maxPendVal) * 100));
  c.innerHTML = `
    <small>${pendLabels[i]}</small>
    <strong>${pendVals[i]}</strong>
    <div class="chip-bar">
      <div class="chip-bar-fill ${k}" style="width:${percent}%"></div>
    </div>`;
  pendingChips.appendChild(c);
  // Example: make pending >= 30D flash
if (k === 'pending_ge90' || k === 'pending_ge120') {
  c.classList.add('heartbeat');
}

});
}


/* table rendering */
const columns = [
  'Employee','Avg Time for a file','Median Time for a FIle','Opening Balance','Received Files','Processed Files','Closed Files','Pending Files','Parked Files',
  'Processed ≤1d','Processed ≤2d','Processed ≤3d','Processed ≤1W','Processed ≤1M','Processed >1M',
  'Pending <7Days','Pending ≥7Days','Pending ≥15Days','Pending ≥30Days','Pending ≥60Days','Pending ≥90Days','Pending ≥120Days'
];

function renderTable(rows){
  const q = (searchInput.value || '').trim().toLowerCase();
  let filtered = rows.filter(r=> !q || (r._employee && r._employee.toLowerCase().includes(q)));
  
  // Sorting
  if(sortState.key){
    const key = sortState.key;
    filtered.sort((a,b)=>{
      const av = valForKey(a,key), bv = valForKey(b,key);
      if(av===bv) return 0;
      return sortState.dir==='asc'? (av>bv?1:-1):(av<bv?1:-1);
    });
  }

  const pageSize = Number(pageSizeSelect.value);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if(page>totalPages) page=totalPages;
  const start = (page-1)*pageSize;
  const pageRows = filtered.slice(start,start+pageSize);

  tableBody.innerHTML='';
  pageRows.forEach((r, i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;font-weight:800;color:#02011b;">${start+i+1}</td>
  <td class="col-emp">${escapeHtml(r._employee)}</td>
  <td><data-emp="${r._employee}" data-metric="avg">${formatMinutes(r._avg)}</span></td>
  <td><data-emp="${r._employee}" data-metric="median">${formatMinutes(r._median)}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="opening">${r._opening}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="received">${r._received}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="processed">${r._processed}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="closed">${r._closed}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="pending">${r._pending}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="parked">${r._parked}</span></td>
  <td><span class="clickable" data-emp="${r._employee}" data-metric="p1">${r._b.p1}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="p2">${r._b.p2}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="p3">${r._b.p3}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="p1w">${r._b.p1w}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="p1m">${r._b.p1m}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pgt1m">${r._b.pgt1m}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_lt7">${r._b.pending_lt7}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_ge7">${r._b.pending_ge7}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_ge15">${r._b.pending_ge15}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_ge30">${r._b.pending_ge30}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_ge60">${r._b.pending_ge60}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_ge90">${r._b.pending_ge90}</span></td>
<td><span class="clickable" data-emp="${r._employee}" data-metric="pending_ge120">${r._b.pending_ge120}</span></td>
`;
    tableBody.appendChild(tr);
  });

  renderPager(filtered.length,pageSize,page);
  tableInfo.textContent = `${filtered.length} employees (${pageRows.length} shown)`;
  // 🔹 Build charts ONLY for the employees visible on this page
  renderCharts(pageRows);
}


function valForKey(row,key){
  switch(key){
    case 'Employee': return row._employee || '';
    case 'Office_Type': return row._office || '';
    case 'Cadre_Type': return row._cadre || '';
    case 'Avg Time (mins)': return isNaN(row._avg)?-1:row._avg;
    case 'Median Time (mins)': return isNaN(row._median)?-1:row._median;
    case 'Opening Balance': return row._opening;
    case 'Received Files': return row._received;
    case 'Processed Files': return row._processed;
    case 'Closed Files': return row._closed;
    case 'Pending Files': return row._pending;
    case 'Parked Files': return row._parked;
    case 'Processed ≤1d': return row._b.p1;
    case 'Processed ≤2d': return row._b.p2;
    case 'Processed ≤3d': return row._b.p3;
    case 'Processed ≤1w': return row._b.p1w;
    case 'Processed ≤1m': return row._b.p1m;
    case 'Processed >1m': return row._b.pgt1m;
    case 'Pending <7Days': return row._b.pending_lt7;
    case 'Pending ≥7Days': return row._b.pending_ge7;
    case 'Pending ≥15Days': return row._b.pending_ge15;
    case 'Pending ≥30Days': return row._b.pending_ge30;
    case 'Pending ≥60Days': return row._b.pending_ge60;
    case 'Pending ≥90Days': return row._b.pending_ge90;
    case 'Pending ≥120Days': return row._b.pending_ge120;
    default: return '';
  }
}

/* pagination */
function renderPager(totalCount,pageSize,currentPage){
  pager.innerHTML='';
  const totalPages = Math.max(1, Math.ceil(totalCount/pageSize));
  const left = document.createElement('button'); left.className='page-btn'; left.textContent='‹'; left.disabled=currentPage===1;
  left.onclick = ()=>{if(currentPage>1){page--;renderActiveView();}};
  pager.appendChild(left);

  const start = Math.max(1,currentPage-3);
  const end = Math.min(totalPages,start+6);
  for(let p=start;p<=end;p++){
    const btn = document.createElement('button');
    btn.className='page-btn'+(p===currentPage?' active':'');
    btn.textContent=p;
    btn.onclick=()=>{page=p; renderActiveView();};
    pager.appendChild(btn);
  }

  const right = document.createElement('button'); right.className='page-btn'; right.textContent='›'; right.disabled=currentPage===totalPages;
  right.onclick = ()=>{if(currentPage<totalPages){page++;renderActiveView();}};
  pager.appendChild(right);
}

/* table header sorting */
document.querySelectorAll('#empTable thead th').forEach(th=>{
  th.style.cursor='pointer';
  th.addEventListener('click',()=>{
    const key=th.dataset.key;
    if(sortState.key===key) sortState.dir = sortState.dir==='asc'?'desc':'asc';
    else { sortState.key=key; sortState.dir='asc'; }
    document.querySelectorAll('#empTable thead th .sort-ind').forEach(el=>el.textContent='↕');
    th.querySelector('.sort-ind').textContent = sortState.dir==='asc'?'▲':'▼';
    renderActiveView();
  });
});

searchInput.addEventListener('input',()=>{page=1;renderActiveView();});
pageSizeSelect.addEventListener('change',()=>{page=1;renderActiveView();});


/* helpers */
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toNumber(x){return isNaN(Number(x))?0:Number(x);}

/* SVG icons */
/* Inbox – bluish theme */
function svgInbox() {
  return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradInbox" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stop-color="#4FC3F7"/>
        <stop offset="1" stop-color="#0288D1"/>
      </linearGradient>
    </defs>
    <path d="M4 7h5l2 3h2l2-3h5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
          stroke="url(#gradInbox)" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* Folder – amber theme */
/* Opening Balance – Inbox */
function svgOpeningBalance() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradOpening" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#42A5F5"/>
        <stop offset="1" stop-color="#1565C0"/>
      </linearGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
    </defs>
    <path d="M4 7h5l2 3h2l2-3h5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
          stroke="url(#gradOpening)" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Received Files – Arrow Down */
function svgReceivedFiles() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradReceived" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#29B6F6"/>
        <stop offset="1" stop-color="#0277BD"/>
      </linearGradient>
    </defs>
    <path d="M12 3v14m0 0l-5-5m5 5l5-5"
          stroke="url(#gradReceived)" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Processed Files – Lightning */
function svgProcessedFiles() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradProcessed" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#FFB74D"/>
        <stop offset="1" stop-color="#E65100"/>
      </linearGradient>
    </defs>
    <path d="M13 2L3 14h7l-1 8L21 10h-7l-1-8z"
          stroke="url(#gradProcessed)" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Files Closed – Checkmark */
function svgFilesClosed() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradClosed" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#81C784"/>
        <stop offset="1" stop-color="#2E7D32"/>
      </linearGradient>
    </defs>
    <path d="M20 6L9 17l-5-5"
          stroke="url(#gradClosed)" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Files Pending – Hourglass */
function svgFilesPending() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradPending" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#EF9A9A"/>
        <stop offset="1" stop-color="#C62828"/>
      </linearGradient>
    </defs>
    <path d="M6 2h12M6 22h12M6 2l12 8-12 8 12 8-12-8z"
          stroke="url(#gradPending)" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Files Parked – Pause */
function svgFilesParked() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradParked" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#FFCC80"/>
        <stop offset="1" stop-color="#F57C00"/>
      </linearGradient>
    </defs>
    <path d="M9 5v14M15 5v14"
          stroke="url(#gradParked)" stroke-width="2.2"
          stroke-linecap="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Average Processing Time – Clock */
function svgAvgProcessingTime() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradAvgTime" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#BA68C8"/>
        <stop offset="1" stop-color="#6A1B9A"/>
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="9"
            stroke="url(#gradAvgTime)" stroke-width="1.8"
            filter="url(#shadow)"/>
    <path d="M12 8v4l2 2"
          stroke="url(#gradAvgTime)" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"
          filter="url(#shadow)"/>
  </svg>`;
}

/* Median Processing Time – Median Lines */
function svgMedianProcessingTime() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gradMedianTime" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#4DB6AC"/>
        <stop offset="1" stop-color="#00695C"/>
      </linearGradient>
    </defs>
    <path d="M12 3v18"
          stroke="url(#gradMedianTime)" stroke-width="1.8"
          stroke-linecap="round"
          filter="url(#shadow)"/>
    <path d="M3 8h18M3 16h18"
          stroke="url(#gradMedianTime)" stroke-opacity="0.7"
          stroke-width="1.8" stroke-linecap="round"
          filter="url(#shadow)"/>
  </svg>`;
}




function renderCharts(pageRows) {
  const container = document.getElementById("chartsContainer");
  container.innerHTML = "";
  if (!pageRows || !pageRows.length) return;

  // Employees currently displayed in the table (this page)
  const employeesOnPage = [...new Set(pageRows.map(r => r._employee))];

  // Scope dataset for those employees; respect activeOffice if selected
  const scoped = normalized.filter(r =>
    employeesOnPage.includes(r._employee) &&
    (!activeOffice || r._office === activeOffice)
  );

  // All periods available for this scope
  let allPeriods = [...new Set(scoped.map(r => r._period))];

  // 🔹 Move "Entire Period" to the end
  allPeriods.sort((a, b) => {
    if (a === "Entire Period") return 1;
    if (b === "Entire Period") return -1;
    return 0;
  });

  // Group rows by employee
  const byEmp = {};
  scoped.forEach(r => {
    (byEmp[r._employee] ||= []).push(r);
  });

  // 🔹 Build charts in the same order as the table
  const seen = new Set();
  pageRows.forEach(row => {
    const emp = row._employee;
    if (seen.has(emp)) return; // skip duplicates
    seen.add(emp);

    const empRows = byEmp[emp] || [];

    // Compute averages across all periods
    const averages = allPeriods.map(p => {
      const periodRows = empRows.filter(r => r._period === p);
      return meanWeighted(periodRows, r => r._avg, r => r._processed);
    });

    // Create chart card
    const card = document.createElement("div");
    card.className = "chart-card";
    card.innerHTML = `
  <div class="chart-title">${emp}</div>
  <div style="height:300px">
    <canvas></canvas>
  </div>
`;

    container.appendChild(card);

    // Initialize Chart.js
    new Chart(card.querySelector("canvas"), {
  type: "bar",
  data: {
    labels: allPeriods,
    datasets: [{
      label: "Avg Time (mins)",
      data: averages,
      backgroundColor: "#696A94",
      borderRadius: 12
    }]
  },
  options: {
    maintainAspectRatio: false,   // allow custom height
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = Number(ctx.raw);
            if (!isFinite(val)) return "-";
            const d = Math.floor(val / 1440);
            const h = Math.floor((val % 1440) / 60);
            const m = Math.floor(val % 60);
            return `${d}D ${h}H ${m}M`;
          }
        }
      }
    },
    scales: { 
      y: { 
        beginAtZero: true,
        grid: { display: false, drawTicks: false }, // 🔹 remove grid lines
        ticks: { display: false },                  // 🔹 remove tick numbers
        border: { display: false }                  // 🔹 remove Y axis line
      },
      x: {
        ticks: { font: { size: 12 } },
        grid: { display: false }                    // 🔹 no vertical grid lines
      }
    }
  }
});
 });
}

function formatDateTime(val){
  if(!val) return "";
  const d = (val instanceof Date) ? val : new Date(val);
  if(isNaN(d)) return val;
  const pad = n => n.toString().padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}


// Popup elements
const popup = document.getElementById("popupModal");
const popupTitle = document.getElementById("popupTitle");
const popupBody = document.getElementById("popupBody");
const closeBtn = document.querySelector(".close-btn");

// Close popup
closeBtn.onclick = ()=> popup.style.display="none";
window.onclick = (e)=>{ if(e.target===popup) popup.style.display="none"; };

// Helper: parse dates
function toDate(s){
  if(s === null || s === undefined) return null;
  if(typeof s === "number" || /^\d+$/.test(s)) {
    return new Date(Number(s));  // epoch ms
  }
  return new Date(s);            // ISO or other formats
}


// Filtering function
function filterDataByMetric(data, metric, periodRange){
  const [startDate, endDate] = periodRange || [null, null];
  const now = new Date();
  return data.filter(d=>{
    const st = d._startDate;
const en = d._endDate;

    const state = (d.state||"").toUpperCase();
    const durMins = (st && en) ? (en - st) / 60000 : null; // duration in mins
    const ageDays = (!en && st) ? Math.floor((now - st)/86400000) : null;

    switch(metric){
      // ---- main counters ----
      case "opening": return st && startDate && st < startDate && (!en || en >= startDate);
      case "received": return st && startDate && endDate && st >= startDate && st <= endDate;
      case "processed": return en && startDate && endDate && en >= startDate && en <= endDate;
      case "closed": return !en && state === "CLOSED";
      case "pending": return !en && state !== "CLOSED";
      case "parked": return !en && state === "PARKED";
      case "avg":
      case "median": return true;

      // ---- processed buckets ----
      case "p1": return durMins !== null && durMins <= 1440; // 1d
      case "p2": return durMins !== null && durMins > 1440 && durMins <= 2880; // 2d
      case "p3": return durMins !== null && durMins > 2880 && durMins <= 4320; // 3d
      case "p1w": return durMins !== null && durMins > 4320 && durMins <= 10080; // 7d
      case "p1m": return durMins !== null && durMins > 10080 && durMins <= 43200; // 30d
      case "pgt1m": return durMins !== null && durMins > 43200; // >30d

      // ---- pending buckets ----
      case "pending_lt7": return !en && state!=="CLOSED" && ageDays !== null && ageDays < 7;
      case "pending_ge7": return !en && state!=="CLOSED" && ageDays !== null && ageDays >=7 && ageDays <15;
      case "pending_ge15": return !en && state!=="CLOSED" && ageDays !== null && ageDays >=15 && ageDays <30;
      case "pending_ge30": return !en && state!=="CLOSED" && ageDays !== null && ageDays >=30 && ageDays <60;
      case "pending_ge60": return !en && state!=="CLOSED" && ageDays !== null && ageDays >=60 && ageDays <90;
      case "pending_ge90": return !en && state!=="CLOSED" && ageDays !== null && ageDays >=90 && ageDays <120;
      case "pending_ge120": return !en && state!=="CLOSED" && ageDays !== null && ageDays >=120;

      default: return true;
    }
  });
}


// Delegate clicks on table cells
tableBody.addEventListener("click", async (e)=>{
  const cell = e.target.closest(".clickable");
  if(!cell) return;

  const emp = cell.dataset.emp;
  const metric = cell.dataset.metric;
  popup.style.display = "block";
  popupTitle.textContent = `DETAILS OF FILES - ${emp}`;
  popupBody.innerHTML = "Loading...";

  try {
    // Convert employee name to underscored filename
function empToFilename(emp) {
  return emp
    .split("")                           // split into characters
    .map(c => /[a-zA-Z0-9]/.test(c) ? c : "_")  // keep alnum, replace others
    .join("") + ".json";
}


const resp = await fetch(`${empToFilename(emp)}`);


    if(!resp.ok) throw new Error("File not found");
    let data = await resp.json();

// 🔹 normalize dates immediately
data.forEach(d => {
  d._startDate = toDate(d.start);
  d._endDate   = toDate(d.end);
});


    // Find period range
    const activeRows = rowsForActive().filter(r => r._employee === emp);
    let periodRange = [null,null];
    if(activeRows.length){
      const p = activeRows[0]._period;
      const per = normalized.find(r=>r._period===p);
      if(per){
        const fromVal = per["From Date"];
const toVal = per["To Date"];
periodRange = [
  fromVal ? new Date(Number(fromVal)) : null,
  toVal ? new Date(Number(toVal)) : null
];

      }
    }

    
    // Apply filtering
let filtered = filterDataByMetric(data, metric, periodRange);


// 🔹 Sort by duration (descending)
filtered.sort((a,b)=>{
  const da = parseFloat(a["Duration (mins)"]||0);
  const db = parseFloat(b["Duration (mins)"]||0);
  return db - da;
});

// Save for export
lastFilteredData = filtered;
lastFileName = emp.replace(/\s+/g, "_") + "_" + metric;



    if(!filtered.length){
      popupBody.innerHTML = `<div style="padding:20px;color:#900;font-weight:bold">No records found for this metric</div>`;
      return;
    }

    // Render table
    let html = `<table class="popup-table">
  <thead>
    <tr>
      <th>Computer No</th>
      <th>Post Held</th>
      <th>Department</th>
      <th>Subject</th>
      <th>Received On</th>
      <th>Forwarded On</th>
      <th>Duration</th>
      </tr>
  </thead>
  <tbody>`;

filtered.forEach(d=>{
  html += `<tr>
    <td>${d.fileNo||""}</td>
    <td>${d.post_name||""}</td>
    <td>${d.Dept||""}</td>
    <td>${escapeHtml(d.subject||"")}</td>
    <td>${formatDateTime(d._startDate)}</td>
    <td>${formatDateTime(d._endDate)}</td>
    <td>${formatMinutes(parseFloat(d["Duration (mins)"]||0))}</td>
    </tr>`;
});

html += "</tbody></table>";
popupBody.innerHTML = html;


  } catch(err) {
    popupBody.innerHTML = `<div style="color:red">Error: ${err.message}</div>`;
  }
});

// Export to CSV
function exportToCSV(data, filename){
  if(!data || !data.length){
    alert("No data to export");
    return;
  }

  // Extract headers
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${(row[h]||"").toString().replace(/"/g,'""')}"`).join(","));
  const csvContent = [headers.join(","), ...rows].join("\n");

  // Create Blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename + ".csv";
  link.click();
}

// Download button
document.getElementById("downloadBtn").addEventListener("click", ()=>{
  exportToCSV(lastFilteredData, lastFileName);
});

/* initialize */
(async ()=>{
  try{
    const r = await fetch('employee_report_01.09.25.json',{cache:'no-store'});
    if(r.ok){
      const json = await r.json();
      if(Array.isArray(json)) loadData(json);
    }
  } catch(e){}
})();
