/* CRM Content Script - El Araby Extensions */
(()=>{var ue=Object.defineProperty;var Z=(n,e,t)=>()=>{if(t)throw t[0];try{return n&&(e=n(n=0)),e}catch(r){throw t=[r],r}};var pe=(n,e)=>{for(var t in e)ue(n,t,{get:e[t],enumerable:!0})};function ye(n){return`
/* XLSX Web Worker for El Araby Extensions */
const XLSX_URL = "${chrome.runtime.getURL("lib/xlsx.full.min.js")}";
const WASM_URL = ${n?`"${n}"`:"null"};

let XLSX: any = null;

async function loadXLSX() {
  if (XLSX) return XLSX;

  // Load XLSX library from the extension (Web Workers use importScripts)
  importScripts(XLSX_URL);

  // Wait for XLSX to be available on self
  let attempts = 0;
  while (!self.XLSX && attempts < 50) {
    importScripts(XLSX_URL);
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }
  XLSX = self.XLSX;
  return XLSX;
}

function parseArrayBuffer(buffer: ArrayBuffer, options: any = {}): { headers: string[]; rows: any[]; sheetName: string } {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true, ...options });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON with header row
  const json = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: options.defval || '',
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!json.length) return { headers: [], rows: [], sheetName };

  const headerRow = options.headerRow ?? 0;
  const headers = (json[headerRow] || []).map((h: any) => String(h || '').trim());
  const rows = json.slice(headerRow + 1).map((row: any[]) => {
    const obj: Record<string, any> = {};
    headers.forEach((h: string, i: number) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  return { headers, rows, sheetName };
}

function writeWorkbook(data: any[], options: any = {}): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data, { header: Object.keys(data[0] || {}), ...options });
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');
  return XLSX.write(workbook, { type: 'array', bookType: options.bookType || 'xlsx' });
}

/**
 * Merge CRM extraction results into the ORIGINAL workbook preserving formatting.
 * Reads the original buffer with cellStyles:true, appends report/time columns to
 * the right of the existing range, fills them per-row by SAP match, and writes
 * back with cellStyles:true so every original cell keeps its styles/widths.
 */
function mergeCRMResults(buffer: ArrayBuffer, options: any = {}): ArrayBuffer {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true });
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('Sheet not found: ' + sheetName);

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const results = options.results || [];
  const bySap = new Map<string, any>();
  results.forEach((r: any) => bySap.set(String(r.sap || '').trim().toUpperCase(), r));

  const sapCol = options.sapColumnIndex != null ? options.sapColumnIndex : 0;

  // Determine max report count across results (for header row)
  let maxReports = 0;
  results.forEach((r: any) => {
    const n = (r.reports || []).length;
    if (n > maxReports) maxReports = n;
  });

  // New columns start right after the current last column
  const startCol = range.e.c + 1;
  const timeCol = startCol + maxReports;

  // Header cells for appended columns
  for (let hi = 0; hi < maxReports; hi++) {
    worksheet[XLSX.utils.encode_cell({ r: 0, c: startCol + hi })] = {
      t: 's', v: (options.reportLabel || '\u0631\u0642\u0645 \u0627\u0644\u062A\u0642\u0631\u064A\u0631') + ' ' + (hi + 1)
    };
  }
  worksheet[XLSX.utils.encode_cell({ r: 0, c: timeCol })] = {
    t: 's', v: options.timeLabel || '\u0648\u0642\u062A \u0627\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C'
  };

  // Fill per data row by matching the SAP cell value
  for (let R = 1; R <= range.e.R; R++) {
    const sapCell = worksheet[XLSX.utils.encode_cell({ r: R, c: sapCol })];
    if (!sapCell) continue;
    const raw = sapCell.v != null ? sapCell.v : sapCell.w;
    if (raw == null) continue;
    const sapVal = String(raw).trim().toUpperCase();
    if (!sapVal) continue;
    const rr = bySap.get(sapVal);
    if (!rr) continue;

    const reports = rr.reports || [];
    for (let c = 0; c < reports.length && c < maxReports; c++) {
      worksheet[XLSX.utils.encode_cell({ r: R, c: startCol + c })] = { t: 's', v: String(reports[c]) };
    }
    if (rr.extractedAt) {
      worksheet[XLSX.utils.encode_cell({ r: R, c: timeCol })] = { t: 's', v: String(rr.extractedAt) };
    }
  }

  // Extend the reference range to cover the new columns
  range.e.c = Math.max(range.e.c, timeCol);
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  return XLSX.write(workbook, { type: 'array', bookType: options.bookType || 'xlsx', cellStyles: true });
}

self.onmessage = async function(e) {
  const { id, action, payload } = e.data;

  try {
    await loadXLSX();

    let result: any;
    if (action === 'parse') {
      result = parseArrayBuffer(payload.buffer, payload.options);
    } else if (action === 'write') {
      result = writeWorkbook(payload.data, payload.options);
    } else if (action === 'merge') {
      result = mergeCRMResults(payload.buffer, payload.options);
    } else {
      throw new Error('Unknown action: ' + action);
    }

    self.postMessage({ id, success: true, data: result });
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message });
  }
};
`}function U(n){return D||(D=new j(n)),D}var j,D,oe=Z(()=>{j=class{worker=null;pending=new Map;requestId=0;constructor(e){this.#e(e)}#e(e){let t=ye(e),r=new Blob([t],{type:"application/javascript"});this.worker=new Worker(URL.createObjectURL(r)),this.worker.onmessage=s=>{let{id:a,success:i,data:o,error:c}=s.data,d=this.pending.get(a);d&&(i?d.resolve(o):d.reject(new Error(c)),this.pending.delete(a))},this.worker.onerror=s=>{console.error("[XLSXWorker] Worker error:",s),this.pending.forEach(({reject:a})=>a(new Error("Worker error: "+s.message))),this.pending.clear()}}async parse(e,t={}){if(!this.worker)throw new Error("Worker not initialized");let r=`parse_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;return new Promise((s,a)=>{this.pending.set(r,{resolve:s,reject:a}),this.worker.postMessage({id:r,action:"parse",payload:{buffer:e,options:t}},[e])})}async write(e,t={}){if(!this.worker)throw new Error("Worker not initialized");let r=`write_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;return new Promise((s,a)=>{this.pending.set(r,{resolve:s,reject:a}),this.worker.postMessage({id:r,action:"write",payload:{data:e,options:t}})})}async merge(e,t={}){if(!this.worker)throw new Error("Worker not initialized");let r=`merge_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;return new Promise((s,a)=>{this.pending.set(r,{resolve:s,reject:a}),this.worker.postMessage({id:r,action:"merge",payload:{buffer:e,options:t}},[e])})}terminate(){var e;(e=this.worker)==null||e.terminate(),this.worker=null,this.pending.clear()}},D=null});var le={};pe(le,{parseCRMExcel:()=>we,writeCRMResults:()=>F});async function we(n){let e=await n.arrayBuffer(),r=await U().parse(e,{headerRow:0,defval:""}),{headers:s,rows:a}=r,i=-1;for(let l=0;l<s.length;l++){let p=s[l].toLowerCase();if(ve.some(h=>p.includes(h))){i=l;break}}if(i<0&&a.length>0)for(let l=0;l<s.length;l++){let p=a.slice(0,10).map(h=>String(h[s[l]]||"")).join(" ");if(ie.some(h=>h.test(p))){i=l;break}}let o=-1;for(let l=0;l<s.length;l++){let p=s[l].toLowerCase();if(xe.some(h=>p.includes(h))){o=l;break}}let c=[],d=new Set,u=0;for(let l of a){let p=String(l[s[i]]||"").trim();if(!p)continue;u++;let h=p.replace(/[^\dA-Z]/gi,"").toUpperCase();h&&ie.some(g=>g.test(h))&&(d.has(h)||(d.add(h),c.push(h)))}return{sapNumbers:c,headers:s,sapColumnIndex:i,notesColumnIndex:o,totalRows:u||a.length}}async function F(n,e,t,r){let s=await n.arrayBuffer(),i=await U().merge(s,{results:e,sapColumnIndex:r,reportLabel:"\u0631\u0642\u0645 \u0627\u0644\u062A\u0642\u0631\u064A\u0631",timeLabel:"\u0648\u0642\u062A \u0627\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C",bookType:"xlsx"});return new Blob([i],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}var ie,ve,xe,W=Z(()=>{oe();ie=[/^CAS\d+/i,/^CRM\d+/i,/^\d{10,}$/],ve=["\u0628\u0644\u0627\u063A","crm","cas","\u0631\u0642\u0645","sap"],xe=["\u0645\u0644\u0627\u062D\u0638\u0627\u062A","notes","\u0648\u0635\u0641","description","\u062A\u0641\u0627\u0635\u064A\u0644"]});function $(){return typeof window<"u"&&typeof window.storageGet=="function"&&typeof window.storageSet=="function"}async function Q(n){var t;let e=Array.isArray(n)?n:[n];return $()?window.storageGet(e):typeof chrome<"u"&&((t=chrome.storage)!=null&&t.local)?new Promise(r=>{chrome.storage.local.get(e,s=>r(s))}):{}}async function ee(n){var e;if($()){await window.storageSet(n);return}if(typeof chrome<"u"&&((e=chrome.storage)!=null&&e.local))return new Promise(t=>chrome.storage.local.set(n,t))}async function te(n){var t;let e=Array.isArray(n)?n:[n];if($()){await window.storageRemove(e);return}if(typeof chrome<"u"&&((t=chrome.storage)!=null&&t.local))return new Promise(r=>chrome.storage.local.remove(e,r))}var M={addEntry:async(n,e={})=>{var t;typeof window<"u"&&((t=window.SmartLog)!=null&&t.addEntry)?await window.SmartLog.addEntry(n,e):typeof window<"u"&&window.logEvent&&await window.logEvent(n,e)},getEntries:async(n=500)=>{var e;return typeof window<"u"&&((e=window.SmartLog)!=null&&e.getEntries)?window.SmartLog.getEntries(n):typeof window<"u"&&window.getLog?window.getLog({filter:"all"}):[]},clearAll:async()=>{var n;typeof window<"u"&&((n=window.SmartLog)!=null&&n.clearAll)?await window.SmartLog.clearAll():typeof window<"u"&&window.clearLog&&await window.clearLog()}};var H=class n{static instance;handlers=new Map;pendingRequests=new Map;port=null;requestCounter=0;constructor(){this.#e()}static getInstance(){return n.instance||(n.instance=new n),n.instance}#e(){var e;typeof chrome>"u"||!((e=chrome.runtime)!=null&&e.onMessage)||(chrome.runtime.onMessage.addListener((t,r,s)=>{if(!(t!=null&&t.action))return!0;let a=this.handlers.get(t.action);if(a){let i=t.payload,o=c=>{s(c)};return Promise.resolve(a(t.payload,o)).catch(c=>{s({success:!1,error:c.message})}),!0}return!1}),chrome.runtime.onConnect.addListener(t=>{t.onMessage.addListener(r=>{if(!(r!=null&&r.action))return;let s=this.handlers.get(r.action);s&&Promise.resolve(s(r.payload,a=>{t.postMessage({...a,requestId:r.requestId})})).catch(a=>{t.postMessage({success:!1,error:a.message,requestId:r.requestId})})})}))}on(e,t){return this.handlers.set(e,t),()=>this.handlers.delete(e)}async send(e,t,r=1e4){let s=`req_${Date.now()}_${++this.requestCounter}`;return new Promise((a,i)=>{let o=setTimeout(()=>{this.pendingRequests.delete(s),i(new Error(`Message timeout: ${e}`))},r);this.pendingRequests.set(s,{resolve:a,reject:i});let c={action:e,payload:t,requestId:s};(()=>{var u;typeof chrome<"u"&&((u=chrome.runtime)!=null&&u.sendMessage)?chrome.runtime.sendMessage({...c,requestId:s},l=>{clearTimeout(o),this.pendingRequests.delete(s),chrome.runtime.lastError?i(new Error(chrome.runtime.lastError.message)):l!=null&&l.success?a(l.data):i(new Error((l==null?void 0:l.error)||"Unknown error"))}):(clearTimeout(o),this.pendingRequests.delete(s),i(new Error("chrome.runtime not available")))})()})}notify(e,t){var r;typeof chrome<"u"&&((r=chrome.runtime)!=null&&r.sendMessage)&&chrome.runtime.sendMessage({action:e,payload:t}).catch(()=>{})}connect(e){var t;if(typeof chrome<"u"&&((t=chrome.runtime)!=null&&t.connect)){let r=chrome.runtime.connect({name:e});return r.onDisconnect.addListener(()=>{}),r}return null}},re=H.getInstance(),se=(n,e,t)=>re.send(n,e,t);var ae=(n,e)=>re.on(n,e);var B=class extends HTMLElement{static get observedAttributes(){return["config"]}#e;#t={columns:[],data:[],pagination:!0,pageSize:10};#r=1;#a=null;#n="asc";#s=new Set;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#o()}attributeChangedCallback(e,t,r){if(e==="config")try{this.#t=JSON.parse(r),this.#r=1,this.#o()}catch(s){console.error("[el-table] Invalid config JSON:",s)}}#o(){let{columns:e,data:t,pagination:r,pageSize:s=10,selectable:a,emptyMessage:i="\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A",striped:o=!0,hoverable:c=!0}=this.#t,d=r?Math.ceil(t.length/s):1,u=r?(this.#r-1)*s:0,l=r?u+s:t.length,p=t.slice(u,l),h=a&&this.#s.size>0;this.#e.innerHTML=`
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .table-container { overflow-x: auto; border: 1px solid var(--ea-border); border-radius: 8px; background: var(--ea-surface); }
        table { width: 100%; border-collapse: collapse; font-family: inherit; font-size: 13px; direction: rtl; }
        thead { background: var(--ea-faint); }
        th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--ea-border); white-space: nowrap; }
        th { font-weight: 700; color: var(--ea-text); cursor: pointer; user-select: none; position: sticky; top: 0; background: var(--ea-faint); z-index: 1; }
        th.sortable:hover { background: var(--ea-faint-2); }
        th .sort-icon { display: inline-flex; margin-right: 6px; width: 14px; height: 14px; }
        tr:hover td { background: var(--ea-faint); }
        tbody tr.selected { background: var(--ea-row-selected) !important; }
        td { color: var(--ea-text); }
        .cell-center { text-align: center; }
        .cell-left { text-align: left; }
        .cell-right { text-align: right; }
        .empty-row td { text-align: center; padding: 40px 20px; color: var(--ea-icon-fill); font-size: 14px; }
        .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-top: 1px solid var(--ea-border); background: var(--ea-faint); }
        .page-btn { padding: 6px 12px; border: 1px solid var(--ea-border); border-radius: 6px; background: var(--ea-surface); color: var(--ea-text); cursor: pointer; font-size: 13px; transition: all 0.15s; }
        .page-btn:hover:not(:disabled) { background: var(--ea-brand); color: var(--ea-on-brand); border-color: var(--ea-brand); }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-btn.active { background: var(--ea-brand); color: var(--ea-on-brand); border-color: var(--ea-brand); }
        .page-info { font-size: 13px; color: var(--ea-muted); }
        .select-all { width: 16px; height: 16px; cursor: pointer; }
        .sort-icon { transition: transform 0.15s; }
        .sort-icon.asc { transform: rotate(180deg); }
      </style>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              ${a?'<th style="width:40px"><input type="checkbox" class="select-all" id="select-all"></th>':""}
              ${e.map((g,v)=>`
                <th class="${g.sortable!==!1?"sortable":""}" data-key="${g.key}" style="${g.width?`width:${g.width};`:""}">
                  ${g.label}
                  ${g.sortable!==!1?'<span class="sort-icon" data-key="${col.key}">\u25BC</span>':""}
                </th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${p.length===0?`
              <tr class="empty-row"><td colspan="${e.length+(a?1:0)}">${i}</td></tr>
            `:p.map((g,v)=>{let y=u+v,x=this.#s.has(y);return`
                <tr data-index="${y}" class="${x?"selected":""} ${o&&v%2===1?"striped":""}">
                  ${a?`<td><input type="checkbox" class="row-checkbox" value="${y}" ${x?"checked":""}></td>`:""}
                  ${e.map(b=>{let C=g[b.key],de=b.align==="left"?"cell-left":b.align==="center"?"cell-center":"cell-right",R=C;if(b.render){let Y=b.render(C,g,y);Y instanceof HTMLElement?R="[rendered]":R=Y}else C==null&&(R="\u2014");return`<td class="${de}" data-key="${b.key}">${R}</td>`}).join("")}
                </tr>
              `}).join("")}
          </tbody>
        </table>
        ${r&&d>1?`
          <div class="pagination">
            <button class="page-btn" data-page="prev" ${this.#r===1?"disabled":""}>\u0627\u0644\u0633\u0627\u0628\u0642</button>
            <span class="page-info">\u0635\u0641\u062D\u0629 ${this.#r} \u0645\u0646 ${d}</span>
            <button class="page-btn" data-page="next" ${this.#r===d?"disabled":""}>\u0627\u0644\u062A\u0627\u0644\u064A</button>
          </div>
        `:""}
      </div>
    `,this.#i()}#i(){this.#e.querySelectorAll("th.sortable").forEach(t=>{t.addEventListener("click",r=>{let s=t.getAttribute("data-key");this.#a===s?this.#n=this.#n==="asc"?"desc":"asc":(this.#a=s,this.#n="asc"),this.#c(),this.#o()})});let e=this.#e.querySelector("#select-all");e&&e.addEventListener("change",t=>{let r=t.target.checked;this.#e.querySelectorAll(".row-checkbox").forEach(s=>{s.checked=r;let a=parseInt(s.value);r?this.#s.add(a):this.#s.delete(a)}),this.#l()}),this.#e.querySelectorAll(".row-checkbox").forEach(t=>{t.addEventListener("change",r=>{let s=parseInt(r.target.value);r.target.checked?this.#s.add(s):this.#s.delete(s),this.#l()})}),this.#e.querySelectorAll(".page-btn").forEach(t=>{t.addEventListener("click",()=>{let r=t.getAttribute("data-page");r==="prev"&&this.#r>1?this.#r--:r==="next"&&this.#r++,this.#o()})}),this.#t.selectable||this.#e.querySelectorAll("tbody tr").forEach(t=>{t.addEventListener("click",()=>{let r=parseInt(t.getAttribute("data-index"));this.dispatchEvent(new CustomEvent("el-row-click",{detail:{index:r,data:this.#t.data[r]},bubbles:!0,composed:!0}))})})}#c(){if(!this.#a)return;let e=this.#t.columns.find(t=>t.key===this.#a);!e||e.sortable===!1||this.#t.data.sort((t,r)=>{let s=t[this.#a],a=r[this.#a];return s<a?this.#n==="asc"?-1:1:s>a?this.#n==="asc"?1:-1:0})}#l(){let e=Array.from(this.#s).map(t=>this.#t.data[t]);this.dispatchEvent(new CustomEvent("el-selection-change",{detail:{indices:Array.from(this.#s),data:e},bubbles:!0,composed:!0}))}setData(e){this.#t.data=e,this.#r=1,this.#s.clear(),this.#o()}setConfig(e){this.#t={...this.#t,...e},this.#r=1,this.#s.clear(),this.#o()}getSelectedData(){return Array.from(this.#s).map(e=>this.#t.data[e])}getSelectedIndices(){return Array.from(this.#s)}clearSelection(){this.#s.clear(),this.#o()}setPage(e){this.#r=e,this.#o()}};customElements.get("el-table")||customElements.define("el-table",B);var z=class extends HTMLElement{static get observedAttributes(){return["variant","disabled","loading","size","full-width"]}#e;#t;#r;#a;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#n(),this.#t=this.#e.querySelector("button"),this.#r=this.#e.querySelector(".spinner"),this.#a=this.#e.querySelector(".btn-text"),this.#t.addEventListener("click",e=>this.#i(e))}attributeChangedCallback(e,t,r){switch(e){case"disabled":this.#t.disabled=r!==null;break;case"loading":this.#s(r!==null);break;case"variant":case"size":case"full-width":this.#o();break}}#n(){let e=this.getAttribute("variant")||"primary",t=this.getAttribute("size")||"md",r=this.hasAttribute("full-width"),s=this.hasAttribute("disabled"),a=this.hasAttribute("loading"),i=this.getAttribute("label")||this.textContent||"Button";this.#e.innerHTML=`
      <style>
        :host {
          display: inline-flex;
        }
        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 8px;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          text-decoration: none;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .spinner {
          display: none;
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        .btn-text {
          display: inline;
        }
        button.loading .spinner { display: block; }
        button.loading .btn-text { display: none; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Variants */
        .variant-primary { background: var(--ea-brand); color: var(--ea-on-brand); }
        .variant-primary:hover:not(:disabled) { background: var(--ea-brand-dark); }
        .variant-secondary { background: var(--ea-neutral); color: var(--ea-on-brand); }
        .variant-secondary:hover:not(:disabled) { background: var(--ea-neutral-2); }
        .variant-success { background: var(--ea-success); color: var(--ea-on-brand); }
        .variant-success:hover:not(:disabled) { background: var(--ea-success-strong); }
        .variant-danger { background: var(--ea-error); color: var(--ea-on-brand); }
        .variant-danger:hover:not(:disabled) { background: var(--ea-error-strong); }
        .variant-outline { background: transparent; border: 2px solid var(--ea-brand); color: var(--ea-brand); }
        .variant-outline:hover:not(:disabled) { background: var(--ea-brand); color: var(--ea-on-brand); }
        .variant-ghost { background: transparent; color: var(--ea-brand); }
        .variant-ghost:hover:not(:disabled) { background: var(--ea-brand-bg); }

        /* Sizes */
        .size-sm { padding: 6px 12px; font-size: 12px; min-height: 32px; }
        .size-md { padding: 10px 20px; font-size: 14px; min-height: 40px; }
        .size-lg { padding: 14px 28px; font-size: 16px; min-height: 48px; }

        /* Full width */
        .full-width { width: 100%; }
      </style>
      <button
        class="variant-${e} size-${t} ${r?"full-width":""} ${a?"loading":""}"
        ${s?"disabled":""}
        type="button"
      >
        <span class="spinner" aria-hidden="true"></span>
        <span class="btn-text">${i}</span>
      </button>
    `}#s(e){this.#t.classList.toggle("loading",e),this.#t.disabled=e||this.hasAttribute("disabled")}#o(){let e=this.getAttribute("variant")||"primary",t=this.getAttribute("size")||"md",r=this.hasAttribute("full-width");this.#t.className=`variant-${e} size-${t} ${r?"full-width":""}`}#i(e){if(this.hasAttribute("disabled")||this.hasAttribute("loading")){e.preventDefault(),e.stopImmediatePropagation();return}this.dispatchEvent(new CustomEvent("el-button-click",{detail:{originalEvent:e},bubbles:!0,composed:!0}))}setLoading(e){e?this.setAttribute("loading",""):this.removeAttribute("loading")}setDisabled(e){e?this.setAttribute("disabled",""):this.removeAttribute("disabled")}};customElements.get("el-button")||customElements.define("el-button",z);var q=class extends HTMLElement{static get observedAttributes(){return["variant","size","dot","removable","icon"]}#e;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#t()}attributeChangedCallback(e,t,r){this.#t()}#t(){let e=this.getAttribute("variant")||"default",t=this.getAttribute("size")||"md",r=this.hasAttribute("dot"),s=this.hasAttribute("removable"),a=this.getAttribute("icon")||"",i=this.textContent||this.getAttribute("label")||"";if(this.#e.innerHTML=`
      <style>
        :host { display: inline-flex; align-items: center; gap: 4px; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 9999px; font-weight: 600; white-space: nowrap; }
        .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .badge-icon { display: inline-flex; flex-shrink: 0; }
        .badge-label { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .badge-remove { width: 16px; height: 16px; border: none; background: transparent; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: inherit; opacity: 0.7; transition: opacity 0.15s; margin-right: -4px; padding: 0; }
        .badge-remove:hover { opacity: 1; background: rgba(0,0,0,0.1); border-radius: 50%; }
        .size-xs { padding: 2px 8px; font-size: 10px; gap: 3px; }
        .size-sm { padding: 3px 10px; font-size: 11px; gap: 4px; }
        .size-md { padding: 4px 12px; font-size: 12px; gap: 5px; }
        .size-lg { padding: 6px 16px; font-size: 13px; gap: 6px; }
        .variant-default { background: var(--ea-badge-default-bg); color: var(--ea-badge-default-text); }
        .variant-primary { background: var(--ea-badge-primary-bg); color: var(--ea-badge-primary-text); }
        .variant-success { background: var(--ea-badge-success-bg); color: var(--ea-badge-success-text); }
        .variant-warning { background: var(--ea-badge-warn-bg); color: var(--ea-badge-warn-text); }
        .variant-danger { background: var(--ea-badge-danger-bg); color: var(--ea-badge-danger-text); }
        .variant-info { background: var(--ea-badge-info-bg); color: var(--ea-badge-info-text); }
      </style>
      <span class="badge variant-${this.getAttribute("variant")||"default"} size-${this.getAttribute("size")||"md"}">
        ${this.hasAttribute("dot")?'<span class="badge-dot"></span>':""}
        ${this.getAttribute("icon")?`<span class="badge-icon">${this.getAttribute("icon")}</span>`:""}
        <span class="badge-label">${this.textContent||this.getAttribute("label")||""}</span>
        ${this.hasAttribute("removable")?'<button class="badge-remove" aria-label="\u0625\u0632\u0627\u0644\u0629">\xD7</button>':""}
      </span>
    `,s){let o=this.#e.querySelector(".badge-remove");o==null||o.addEventListener("click",c=>{c.stopPropagation(),this.dispatchEvent(new CustomEvent("el-badge-remove",{bubbles:!0,composed:!0})),this.remove()})}}connectedCallback(){this.#t()}setVariant(e){this.setAttribute("variant",e)}setSize(e){this.setAttribute("size",e)}};customElements.get("el-badge")||customElements.define("el-badge",q);var _=class extends HTMLElement{static get observedAttributes(){return["type","placeholder","value","disabled","required","readonly","error","label","full-width"]}#e;#t;#r;#a;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#n(),this.#t=this.#e.querySelector("input"),this.#r=this.#e.querySelector("label"),this.#a=this.#e.querySelector(".error-text"),this.#t.addEventListener("input",e=>this.#i(e)),this.#t.addEventListener("blur",e=>this.#c(e)),this.#t.addEventListener("focus",e=>this.#l(e))}connectedCallback(){this.#s()}attributeChangedCallback(e,t,r){switch(e){case"value":this.#s();break;case"disabled":this.#t.disabled=r!==null;break;case"required":this.#t.required=r!==null;break;case"readonly":this.#t.readOnly=r!==null;break;case"placeholder":this.#t.placeholder=r||"";break;case"error":this.#o(r);break;case"label":this.#r&&(this.#r.textContent=r||"");break;case"full-width":this.#d();break;case"type":this.#t.type=r||"text";break}}#n(){let e=this.getAttribute("type")||"text",t=this.getAttribute("placeholder")||"",r=this.getAttribute("value")||"",s=this.hasAttribute("disabled"),a=this.hasAttribute("required"),i=this.hasAttribute("readonly"),o=this.getAttribute("error")||"",c=this.getAttribute("label")||"",d=this.hasAttribute("full-width"),u=this.getAttribute("name")||"";this.#e.innerHTML=`
      <style>
        :host {
          display: inline-flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        label {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--ea-text);
        }
        input {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-size: 14px;
          padding: 10px 12px;
          border: 2px solid var(--ea-border);
          border-radius: 8px;
          background: var(--ea-surface);
          color: var(--ea-text);
          transition: all 0.15s ease;
          width: 100%;
          box-sizing: border-box;
          direction: rtl;
        }
        input:focus {
          outline: none;
          border-color: var(--ea-brand);
          box-shadow: var(--ea-focus-ring);
        }
        input:disabled {
          background: var(--ea-input-disabled);
          color: var(--ea-input-disabled-text);
          cursor: not-allowed;
        }
        input[readonly] {
          background: var(--ea-faint);
        }
        input.error {
          border-color: var(--ea-error);
        }
        input.error:focus {
          box-shadow: 0 0 0 3px var(--ea-error-border);
        }
        .error-text {
          display: none;
          font-size: 12px;
          color: var(--ea-error);
          font-weight: 500;
        }
        .error-text.visible { display: block; }
        .full-width { width: 100%; }
      </style>
      <div class="input-wrapper ${d?"full-width":""}">
        ${c?`<label>${c}${a?' <span style="color:var(--ea-error)">*</span>':""}</label>`:""}
        <input
          type="${e}"
          placeholder="${t}"
          value="${r}"
          ${s?"disabled":""}
          ${a?"required":""}
          ${i?"readonly":""}
          ${u?`name="${u}"`:""}
          autocomplete="off"
        />
        <span class="error-text">${o}</span>
      </div>
    `}#s(){this.#t&&this.#t.value!==this.getAttribute("value")&&(this.#t.value=this.getAttribute("value")||"")}#o(e){this.#a&&(this.#a.textContent=e,this.#a.classList.toggle("visible",!!e)),this.#t.classList.toggle("error",!!e)}#i(e){let t=e.target;this.setAttribute("value",t.value),this.removeAttribute("error"),this.dispatchEvent(new CustomEvent("el-input",{detail:{value:t.value},bubbles:!0,composed:!0}))}#c(e){this.dispatchEvent(new CustomEvent("el-blur",{bubbles:!0,composed:!0}))}#l(e){this.dispatchEvent(new CustomEvent("el-focus",{bubbles:!0,composed:!0}))}#d(){let e=this.#e.querySelector(".input-wrapper");e&&e.classList.toggle("full-width",this.hasAttribute("full-width"))}get value(){return this.#t.value}set value(e){this.setAttribute("value",e),this.#s()}setError(e){this.setAttribute("error",e)}clearError(){this.removeAttribute("error")}setDisabled(e){e?this.setAttribute("disabled",""):this.removeAttribute("disabled")}};customElements.get("el-input")||customElements.define("el-input",_);var X=class extends HTMLElement{static get observedAttributes(){return["placeholder","value","disabled","required","error","label","full-width","multiple"]}#e;#t;#r;#a;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#n(),this.#t=this.#e.querySelector("select"),this.#r=this.#e.querySelector("label"),this.#a=this.#e.querySelector(".error-text"),this.#t.addEventListener("change",e=>this.#c(e)),this.#t.addEventListener("blur",()=>this.dispatchEvent(new CustomEvent("el-blur",{bubbles:!0,composed:!0})))}attributeChangedCallback(e,t,r){switch(e){case"value":this.#t.value!==r&&(this.#t.value=r);break;case"disabled":this.#t.disabled=r!==null;break;case"required":this.#t.required=r!==null;break;case"placeholder":this.#o(r);break;case"error":this.#i(r);break;case"label":this.#r&&(this.#r.textContent=r||"");break;case"full-width":this.#l();break;case"multiple":this.#t.multiple=r!==null;break}}#n(){let e=this.getAttribute("placeholder")||"\u0627\u062E\u062A\u0631...",t=this.getAttribute("value")||"",r=this.hasAttribute("disabled"),s=this.hasAttribute("required"),a=this.getAttribute("error")||"",i=this.getAttribute("label")||"",o=this.hasAttribute("full-width"),c=this.hasAttribute("multiple"),d=this.getAttribute("name")||"",u=this.#s();this.#e.innerHTML=`
      <style>
        :host { display: inline-flex; flex-direction: column; gap: 6px; }
        .select-wrapper { position: relative; display: flex; flex-direction: column; gap: 4px; }
        label { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; font-size: 13px; font-weight: 600; color: var(--ea-text); }
        select {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-size: 14px;
          padding: 10px 12px;
          border: 2px solid var(--ea-border);
          border-radius: 8px;
          background: var(--ea-surface);
          color: var(--ea-text);
          transition: all 0.15s ease;
          width: 100%;
          box-sizing: border-box;
          direction: rtl;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
          background-position: left 10px center;
          background-repeat: no-repeat;
          background-size: 16px;
          padding-left: 40px;
        }
        select:focus { outline: none; border-color: var(--ea-brand); box-shadow: var(--ea-focus-ring); }
        select:disabled { background: var(--ea-input-disabled); color: var(--ea-input-disabled-text); cursor: not-allowed; }
        select.error { border-color: var(--ea-error); }
        select.error:focus { box-shadow: 0 0 0 3px var(--ea-error-border); }
        .error-text { display: none; font-size: 12px; color: var(--ea-error); font-weight: 500; }
        .error-text.visible { display: block; }
        .full-width { width: 100%; }
      </style>
      <div class="select-wrapper ${o?"full-width":""}">
        ${i?`<label>${i}${s?' <span style="color:var(--ea-error)">*</span>':""}</label>`:""}
        <select ${r?"disabled":""} ${s?"required":""} ${c?"multiple":""} ${d?`name="${d}"`:""}>
          <option value="" disabled ${t?"":"selected"}>${e}</option>
          ${u}
        </select>
        <span class="error-text">${a}</span>
      </div>
    `,this.#t=this.#e.querySelector("select"),this.#r=this.#e.querySelector("label"),this.#a=this.#e.querySelector(".error-text"),t&&(this.#t.value=t)}#s(){let e=Array.from(this.querySelectorAll("option"));if(e.length>0)return e.map(r=>`<option value="${r.value}" ${r.selected?"selected":""}>${r.textContent}</option>`).join("");let t=this.getAttribute("options");if(t)try{return JSON.parse(t).map(s=>`<option value="${s.value}" ${s.selected?"selected":""}>${s.label}</option>`).join("")}catch{return""}return""}#o(e){let t=this.#t.querySelector('option[value=""]');t&&(t.textContent=e)}#i(e){this.#a&&(this.#a.textContent=e,this.#a.classList.toggle("visible",!!e)),this.#t.classList.toggle("error",!!e)}#c(e){let t=e.target;this.setAttribute("value",t.value),this.removeAttribute("error"),this.dispatchEvent(new CustomEvent("el-change",{detail:{value:t.value,values:Array.from(t.selectedOptions).map(r=>r.value)},bubbles:!0,composed:!0}))}#l(){let e=this.#e.querySelector(".select-wrapper");e&&e.classList.toggle("full-width",this.hasAttribute("full-width"))}connectedCallback(){this.#n()}get value(){return this.#t.value}set value(e){this.setAttribute("value",e),this.#t&&(this.#t.value=e)}get values(){return Array.from(this.#t.selectedOptions).map(e=>e.value)}setOptions(e){this.#t.innerHTML=`<option value="" disabled selected>${this.getAttribute("placeholder")||"\u0627\u062E\u062A\u0631..."}</option>`+e.map(t=>`<option value="${t.value}">${t.label}</option>`).join("")}setError(e){this.setAttribute("error",e)}clearError(){this.removeAttribute("error")}setDisabled(e){e?this.setAttribute("disabled",""):this.removeAttribute("disabled")}};customElements.get("el-select")||customElements.define("el-select",X);var O=class extends HTMLElement{static get observedAttributes(){return["value","max","label","show-percent","color","size","striped","animated"]}#e;#t;#r;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#a(),this.#t=this.#e.querySelector(".progress-bar"),this.#r=this.#e.querySelector(".progress-label")}attributeChangedCallback(e,t,r){switch(e){case"value":case"max":this.#s();break;case"label":this.#r&&(this.#r.textContent=r||"");break;case"color":case"size":case"striped":case"animated":this.#o();break;case"show-percent":this.#s();break}}#a(){let e=parseFloat(this.getAttribute("value")||"0"),t=parseFloat(this.getAttribute("max")||"100"),r=this.getAttribute("label")||"",s=this.hasAttribute("show-percent"),a=this.getAttribute("color")||"primary",i=this.getAttribute("size")||"md",o=this.hasAttribute("striped"),c=this.hasAttribute("animated"),d=Math.min(100,Math.max(0,e/t*100));this.#e.innerHTML=`
      <style>
        :host { display: inline-flex; flex-direction: column; gap: 6px; width: 100%; }
        .progress-wrapper { width: 100%; }
        .progress-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--ea-muted); margin-bottom: 4px; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .progress-track {
          width: 100%; background: var(--ea-track); border-radius: 9999px; overflow: hidden;
        }
        .progress-bar {
          height: 100%; border-radius: 9999px; transition: width 0.3s ease;
          background: var(--ea-brand);
        }
        .size-xs .progress-track { height: 4px; }
        .size-sm .progress-track { height: 6px; }
        .size-md .progress-track { height: 8px; }
        .size-lg .progress-track { height: 12px; }
        .color-primary .progress-bar { background: var(--ea-brand); }
        .color-success .progress-bar { background: var(--ea-success); }
        .color-warning .progress-bar { background: var(--ea-warn); }
        .color-danger .progress-bar { background: var(--ea-error); }
        .color-info .progress-bar { background: var(--ea-info); }
        .striped .progress-bar { background-image: linear-gradient(45deg, var(--ea-stripe) 25%, transparent 25%, transparent 50%, var(--ea-stripe) 50%, var(--ea-stripe) 75%, transparent 75%, transparent); background-size: 1rem 1rem; }
        .animated .progress-bar { animation: progress-stripe 1s linear infinite; }
        @keyframes progress-stripe { 0% { background-position: 1rem 0; } 100% { background-position: 0 0; } }
      </style>
      <div class="progress-wrapper size-${this.getAttribute("size")||"md"} ${this.hasAttribute("striped")?"striped":""} ${this.hasAttribute("animated")?"animated":""} color-${this.getAttribute("color")||"primary"}">
        ${this.getAttribute("label")?`<div class="progress-label"><span>${this.getAttribute("label")}</span><span class="progress-value">${this.#n()}</span></div>`:""}
        <div class="progress-track">
          <div class="progress-bar" style="width: ${this.#n()}%"></div>
        </div>
      </div>
    `}#n(){let e=parseFloat(this.getAttribute("value")||"0"),t=parseFloat(this.getAttribute("max")||"100"),r=Math.min(100,Math.max(0,e/t*100));return this.hasAttribute("show-percent")?`${Math.round(r)}%`:""}#s(){let e=this.#e.querySelector(".progress-wrapper"),t=this.#e.querySelector(".progress-bar"),r=this.#e.querySelector(".progress-value");t&&(t.style.width=this.#n()),r&&(r.textContent=this.#n())}#o(){}connectedCallback(){this.#a()}setValue(e){this.setAttribute("value",String(e))}setMax(e){this.setAttribute("max",String(e))}setLabel(e){this.setAttribute("label",e)}};customElements.get("el-progress")||customElements.define("el-progress",O);var w=class extends HTMLElement{#e;#t=new Map;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#r()}#r(){this.#e.innerHTML=`
      <style>
        :host { position: fixed; bottom: 20px; left: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
        .toast {
          pointer-events: auto;
          min-width: 280px; max-width: 420px;
          background: var(--ea-surface); border-radius: 12px; box-shadow: var(--ea-shadow-2);
          border-left: 4px solid var(--ea-brand); overflow: hidden;
          animation: slideIn 0.3s ease;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .toast.removing { animation: slideOut 0.3s ease forwards; }
        @keyframes slideOut { to { transform: translateX(100%); opacity: 0; } }
        .toast-content { padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start; }
        .toast-icon { width: 24px; height: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .toast-body { flex: 1; min-width: 0; }
        .toast-title { font-weight: 700; font-size: 14px; color: var(--ea-text); margin-bottom: 2px; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .toast-message { font-size: 13px; color: var(--ea-text-strong); line-height: 1.5; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .toast-close { width: 28px; height: 28px; border: none; background: transparent; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ea-icon-fill); flex-shrink: 0; transition: all 0.15s; }
        .toast-close:hover { background: var(--ea-faint-2); color: var(--ea-text); }
        .toast-action { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ea-border); display: flex; justify-content: flex-end; }
        .toast-action-btn { padding: 6px 12px; font-size: 12px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; }
        .variant-info { border-left-color: var(--ea-info); }
        .variant-success { border-left-color: var(--ea-success); }
        .toast-icon.success { color: var(--ea-success); }
        .variant-warning { border-left-color: var(--ea-warn); }
        .toast-icon.warning { color: var(--ea-warn); }
        .variant-danger { border-left-color: var(--ea-error); }
        .toast-icon.danger { color: var(--ea-error); }
        .toast-icon.info { color: var(--ea-info); }
      </style>
      <div id="toast-root"></div>
    `}show(e){let t=`toast-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,r=e.variant||"info",s=e.duration??5e3,a=e.closable!==!1,i=document.createElement("div");i.className=`toast variant-${r}`,i.dataset.id=t;let o=this.#a(r),c=e.action?`
      <div class="toast-action">
        <button class="toast-action-btn" style="background: var(--action-bg, var(--ea-brand)); color: var(--ea-on-brand); border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;">
          ${e.action.label}
        </button>
      </div>
    `:"";i.innerHTML=`
      <div class="toast-content">
        <div class="toast-icon ${r}">${this.#a(r)}</div>
        <div class="toast-body">
          ${e.title?`<div class="toast-title">${e.title}</div>`:""}
          <div class="toast-message">${e.message}</div>
          ${c}
        </div>
        ${a?'<button class="toast-close" aria-label="\u0625\u063A\u0644\u0627\u0642"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>':""}
      </div>
    `,this.#e.getElementById("toast-root").appendChild(i),this.#t.set(t,i);let u=i.querySelector(".toast-close");u==null||u.addEventListener("click",()=>this.remove(t));let l=i.querySelector(".toast-action-btn");return l&&e.action&&l.addEventListener("click",()=>{e.action.callback(),s>0&&this.remove(t)}),s>0&&setTimeout(()=>this.remove(t),s),t}remove(e){let t=this.#t.get(e);t&&(t.classList.add("removing"),setTimeout(()=>{t.remove(),this.#t.delete(e)},300))}clear(){this.#t.forEach((e,t)=>this.remove(t))}#a(e){switch(e){case"success":return'<svg class="success" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';case"warning":return'<svg class="warning" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';case"danger":return'<svg class="danger" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';default:return'<svg class="info" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'}}connectedCallback(){this.#r()}static show(e){let t=document.querySelector("el-toast-container");return t||(t=document.createElement("el-toast-container"),document.body.appendChild(t)),t.show(e)}};customElements.get("el-toast-container")||customElements.define("el-toast-container",w);var f=class{static SELECTORS={textbox:"#ContentPlaceHolder1_TextBox1",dropdown:"#ContentPlaceHolder1_DropDownList2",searchBtn:"#ContentPlaceHolder1_Button1",grid:"#ContentPlaceHolder1_GridView1",pager:"tr.pager, .pager, .grid-pager",nextPage:'a:contains("\u0627\u0644\u062A\u0627\u0644\u064A"), a:contains("Next"), a[href*="Page$"]'};static isOnSelectReportPage(){return window.location.href.includes("SelectReport.aspx")}static getSearchElements(){let e=document.querySelector(this.SELECTORS.textbox),t=document.querySelector(this.SELECTORS.dropdown),r=document.querySelector(this.SELECTORS.searchBtn),s=document.querySelector(this.SELECTORS.grid);return{textbox:e,dropdown:t,searchBtn:r,grid:s}}static async searchCRMNumbers(e){let{textbox:t,dropdown:r,searchBtn:s}=this.getSearchElements();if(!t||!s)throw new Error("Search elements not found");let a=document.querySelector(this.SELECTORS.dropdown);a&&a.value!=="CRM"&&(a.value="CRM",a.dispatchEvent(new Event("change",{bubbles:!0})),await new Promise(i=>setTimeout(i,300))),t.value=e.join(`
`),t.dispatchEvent(new Event("input",{bubbles:!0})),t.dispatchEvent(new Event("change",{bubbles:!0})),s.click()}static extractTableData(){let e=document.querySelector(this.SELECTORS.grid);if(!e)return null;let t=this.#e(e);if(t.crmCol<0)return null;let r=[];e.querySelectorAll("tbody tr, tr:not(:first-child)").forEach((o,c)=>{var h,g,v,y;let d=o.querySelectorAll("td");if(d.length<2)return;let u="";for(let x=0;x<d.length;x++){let b=((h=d[x].textContent)==null?void 0:h.trim())||"";if(/^CAS\d/i.test(b)||/^CRM\d/i.test(b)){u=b;break}}!u&&d[t.crmCol]&&(u=((g=d[t.crmCol].textContent)==null?void 0:g.trim())||"");let l=t.statusCol>=0&&d[t.statusCol]&&((v=d[t.statusCol].textContent)==null?void 0:v.trim())||"",p=t.reportCol>=0&&d[t.reportCol]&&((y=d[t.reportCol].textContent)==null?void 0:y.trim())||"";u&&r.push({crm:u,status:l,report:p,rowIndex:c})});let{hasNextPage:a,nextPageLink:i}=this.#t(e);return{rows:r,columns:t,hasNextPage:a,nextPageLink:i}}static#e(e){let t=e.querySelector("thead tr, tr:first-child");if(!t)return{crmCol:0,reportCol:-1,statusCol:-1,headers:[]};let r=t.querySelectorAll("th, td"),s={crmCol:0,reportCol:-1,statusCol:-1,headers:[]};return r.forEach((a,i)=>{var c;let o=((c=a.textContent)==null?void 0:c.trim())||"";s.headers.push(o),/^(بلاغ|رقم البلاغ|CAS|CRM)/i.test(o)&&(s.crmCol=i),o.indexOf("\u062A\u0642\u0631\u064A\u0631")>=0&&(s.reportCol=i),o.indexOf("\u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0631\u0643\u0632")>=0&&(s.statusCol=i)}),s}static#t(e){let t=e.querySelector("tr:last-child");if(!t)return{hasNextPage:!1,nextPageLink:null};let r=t.querySelector("td[colspan]");if(!r)return{hasNextPage:!1,nextPageLink:null};let s=r.querySelector("span");if(!s)return{hasNextPage:!1,nextPageLink:null};let a=parseInt(s.textContent||"");if(isNaN(a))return{hasNextPage:!1,nextPageLink:null};let i=r.querySelectorAll("a");for(let o of i)if(parseInt(o.textContent||"")===a+1)return{hasNextPage:!0,nextPageLink:o};return{hasNextPage:!1,nextPageLink:null}}static async clickNextPage(){let e=this.extractTableData();return!(e!=null&&e.hasNextPage)||!e.nextPageLink?!1:(e.nextPageLink.click(),await new Promise(t=>setTimeout(t,1500)),!0)}static async waitForTable(e=1e4){let t=Date.now();for(;Date.now()-t<e;){let r=document.querySelector(this.SELECTORS.grid);if(r&&r.querySelectorAll("tr").length>1)return r;await new Promise(s=>setTimeout(s,200))}return null}static getCRMAccount(){return window.crmAccount||null}};var A="crmExtractorState",he={sapList:[],results:[],batchCurrent:0,batchSaps:[],pageRows:[],running:!1,logs:[],latestExtracts:[],panelOpen:!1},N=25,ge=["canceled","postpone"],m=class{static async getState(){let e=await Q(A);return{...he,...e[A]||{}}}static async saveState(e){let r={...await this.getState(),...e};await ee({[A]:r})}static async clearState(){await te(A)}static addLog(e,t,r="info"){let s=new Date,a=`${s.getHours().toString().padStart(2,"0")}:${s.getMinutes().toString().padStart(2,"0")}:${s.getSeconds().toString().padStart(2,"0")}`;e.logs.push({t:a,m:t,c:r}),e.logs.length>200&&e.logs.shift()}static async logSmartLog(e,t){await M.addEntry(e,t)}static getNextBatch(e){let t=e.batchCurrent*N;return e.sapList.slice(t,t+N)}static processBatchResults(e,t){let r={};for(let o of t){let c=(o.status||"").toLowerCase();ge.some(d=>c.includes(d))||(r[o.crm]||(r[o.crm]={reports:[]}),o.report&&r[o.crm].reports.push(o.report))}let a=new Date().toISOString(),i=[];for(let o of e.batchSaps){let d=(r[o]||{reports:[]}).reports.filter(Boolean);i.push({sap:o,reports:d,status:d.length?"found":"empty",extractedAt:new Date().toISOString()}),d.length>0?this.addLog(e,`\u2705 ${o} : ${d.length} \u062A\u0642\u0631\u064A\u0631`,"ok"):this.addLog(e,`\u274C ${o} : \u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0642\u0627\u0631\u064A\u0631`,"error")}return i}static getProgress(e){let t=e.sapList.length,r=e.results.length,s=Math.ceil(t/N),a=t>0?Math.round(r/t*100):0;return{total:t,done:r,pct:a,currentBatch:e.batchCurrent+1,totalBatches:s}}static getSummary(e){let t=e.results.filter(r=>r.reports&&r.reports.length>0).length;return{withReports:t,withoutReports:e.results.length-t}}};async function ne(n,e={},t=3e4){try{return{success:!0,data:await se(n,e,t)}}catch(r){return{success:!1,error:r.message}}}function E(n,e){return ae(n,async(t,r)=>{try{await e(t,s=>r(s))}catch(s){r({success:!1,error:s.message})}})}var S={START_EXTRACTION:"crm:startExtraction",STOP_EXTRACTION:"crm:stopExtraction",GET_STATUS:"crm:getStatus",EXPORT_RESULTS:"crm:exportResults",EXTRACTION_PROGRESS:"crm:extractionProgress",EXTRACTION_COMPLETE:"crm:extractionComplete",EXTRACTION_ERROR:"crm:extractionError",BATCH_COMPLETE:"crm:batchComplete",LOG:"crm:log",GET_STORAGE:"crm:getStorage",SET_STORAGE:"crm:setStorage"};var k=25,me=["canceled","postpone"],be=12e3,fe=500,P=class{state;isRunning=!1;shouldStop=!1;abortController=null;onUpdate;constructor(e,t){this.state={sapList:[],results:[],batchCurrent:0,batchSaps:[],pageRows:[],running:!1,logs:[],latestExtracts:[],...e},this.onUpdate=t}async start(e){if(!this.isRunning){this.isRunning=!0,this.shouldStop=!1,this.abortController=new AbortController,this.state.sapList=[...new Set(e)],this.state.results=[],this.state.batchCurrent=0,this.state.running=!0,this.state.logs=[],this.state.latestExtracts=[],await m.saveState(this.state),await this.#s("started",{total:this.state.sapList.length}),m.addLog(this.state,`\u{1F680} \u0628\u062F\u0621 \u0627\u0633\u062A\u062E\u0631\u0627\u062C ${this.state.sapList.length} \u0628\u0644\u0627\u063A`,"info"),await M.addEntry("crm_extraction_start",{total:this.state.sapList.length});try{await this.#e()}catch(t){t.name==="AbortError"?m.addLog(this.state,"\u{1F6D1} \u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C","warn"):(m.addLog(this.state,`\u274C \u062E\u0637\u0623: ${t.message}`,"error"),await this.#s("error",{error:t.message}))}finally{this.isRunning=!1,this.state.running=!1,await m.saveState(this.state),await this.#s("completed",{results:this.state.results})}}}stop(){var e;this.shouldStop=!0,(e=this.abortController)==null||e.abort()}async#e(){let e=Math.ceil(this.state.sapList.length/k);for(let t=0;t<e;t++){if(this.shouldStop)throw new DOMException("Aborted","AbortError");this.state.batchCurrent=t,this.state.batchSaps=this.state.sapList.slice(t*k,(t+1)*k),m.addLog(this.state,`\u{1F4E6} \u0627\u0644\u062F\u0641\u0639\u0629 ${t+1}/${Math.ceil(this.state.sapList.length/k)} (${this.state.batchSaps.length} \u0628\u0644\u0627\u063A)`,"info"),await this.#n(),await this.#t(this.state.batchSaps)}}async#t(e){if(await this.#r(e),!await f.waitForTable(be))throw new Error("\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062C\u062F\u0648\u0644 \u0627\u0644\u0646\u062A\u0627\u0626\u062C");let r=!0,s=0,a=50;for(;r&&s<a&&!this.shouldStop;){s++;let o=f.extractTableData();if(!o||o.rows.length===0)break;if(this.state.pageRows=o.rows,await this.#a(o.rows),r=o.hasNextPage,r){if(!await f.clickNextPage())break;await new Promise(d=>setTimeout(d,1e3))}}let i=new Set(this.state.pageRows.map(o=>o.crm));for(let o of this.state.batchSaps)if(!i.has(o)&&!this.state.results.some(c=>c.sap===o)){let c=new Date().toISOString();this.state.results.push({sap:o,reports:[],status:"empty",extractedAt:c}),m.addLog(this.state,`\u274C ${o} : \u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0642\u0627\u0631\u064A\u0631`,"error")}await this.#n()}async#r(e){let{dropdown:t,searchBtn:r,textbox:s}=f.getSearchElements();if(!s||!r)throw new Error("\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0628\u062D\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");let a=document.querySelector("#ContentPlaceHolder1_DropDownList2");a&&a.value!=="CRM"&&(a.value="CRM",a.dispatchEvent(new Event("change",{bubbles:!0})),await new Promise(i=>setTimeout(i,300))),s.value=e.join(`
`),s.dispatchEvent(new Event("input",{bubbles:!0})),await new Promise(i=>setTimeout(i,fe)),r.click()}async#a(e){let t={};for(let a of e){let i=(a.status||"").toLowerCase();me.some(o=>i.includes(o))||(t[a.crm]||(t[a.crm]={reports:[]}),a.report&&t[a.crm].reports.push(a.report))}let r=new Date().toISOString(),s=[];for(let a of this.state.batchSaps){let o=(t[a]||{reports:[]}).reports.filter(Boolean),c=o.length?"found":"empty";this.state.results.push({sap:a,reports:o,status:c,extractedAt:r}),o.length>0?(m.addLog(this.state,`\u2705 ${a} : ${o.length} \u062A\u0642\u0631\u064A\u0631`,"ok"),s.push({crm:a,count:o.length,first:o[0].substring(0,25)})):(m.addLog(this.state,`\u274C ${a} : \u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0642\u0627\u0631\u064A\u0631`,"error"),s.push({crm:a,count:0,first:"-"}))}this.state.latestExtracts=s.slice(-5),await this.#n()}async#n(){var t;await m.saveState(this.state);let e={running:this.state.running,total:this.state.sapList.length,done:this.state.results.length,pct:this.state.sapList.length>0?Math.round(this.state.results.length/this.state.sapList.length*100):0,currentBatch:this.state.batchCurrent+1,totalBatches:Math.ceil(this.state.sapList.length/k),latestExtracts:this.state.latestExtracts,summary:{done:this.state.results.length,found:this.state.results.filter(r=>r.status==="found").length,empty:this.state.results.filter(r=>r.status==="empty").length},results:[...this.state.results]};(t=this.onUpdate)==null||t.call(this,e),await this.#s("progress",e)}async#s(e,t){try{await ne(`crm:${e}`,t)}catch{}}getState(){return{...this.state}}getResults(){return this.state.results}isActive(){return this.isRunning}};W();var G=class extends HTMLElement{#e;#t;#r;#a;#n;#s;#o;#i;#c=null;#l=null;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#d(),this.#u(),this.#i=new w,this.#e.appendChild(this.#i)}#d(){this.#e.innerHTML=`
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .section { margin-bottom: 16px; }
        .section-title { font-size: 14px; font-weight: 700; color: var(--ea-text); margin-bottom: 8px; }
        .dropzone {
          border: 2px dashed var(--ea-border-strong); border-radius: 12px; padding: 24px;
          text-align: center; cursor: pointer; transition: all 0.2s;
          background: var(--ea-faint); position: relative;
        }
        .dropzone:hover, .dropzone.drag-over { border-color: var(--ea-brand); background: var(--ea-brand-bg); }
        .dropzone-icon { font-size: 32px; margin-bottom: 8px; display: block; }
        .dropzone-text { color: var(--ea-muted); font-size: 14px; }
        .dropzone-text strong { color: var(--ea-brand); }
        .file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .file-info { margin-top: 12px; padding: 12px; background: var(--ea-brand-bg); border-radius: 8px; display: none; }
        .file-info.visible { display: block; }
        .file-info-row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
        .file-info-label { color: var(--ea-muted); }
        .file-info-value { font-weight: 600; color: var(--ea-text); }
        .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .progress-section { margin-top: 16px; display: none; }
        .progress-section.visible { display: block; }
        .progress-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--ea-muted); margin-bottom: 4px; }
        .actions { display: flex; gap: 10px; margin-top: 16px; }
        .btn-primary { background: var(--ea-brand); color: var(--ea-on-brand); }
        .btn-primary:hover:not(:disabled) { background: var(--ea-brand-dark); }
        .btn-secondary { background: var(--ea-neutral); color: var(--ea-on-brand); }
      </style>
      <div class="section">
        <div class="section-title">\u{1F4C1} \u0631\u0641\u0639 \u0645\u0644\u0641 Excel</div>
        <div class="dropzone" id="dropzone">
          <span class="dropzone-icon">\u{1F4C2}</span>
          <div class="dropzone-text">\u0627\u0633\u062D\u0628 \u0627\u0644\u0645\u0644\u0641 \u0647\u0646\u0627<br>\u0623\u0648 <strong>\u0627\u0636\u063A\u0637 \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631</strong></div>
          <input type="file" class="file-input" id="fileInput" accept=".xlsx,.xls">
        </div>
        <div class="file-info" id="fileInfo">
          <div class="file-info-row"><span class="file-info-label">\u0627\u0644\u0645\u0644\u0641:</span><span class="file-info-value" id="infoName">-</span></div>
          <div class="file-info-row"><span class="file-info-label">\u0627\u0644\u062D\u062C\u0645:</span><span class="file-info-value" id="infoSize">-</span></div>
          <div class="file-info-row"><span class="file-info-label">\u0627\u0644\u0635\u0641\u0648\u0641:</span><span class="file-info-value" id="infoRows">-</span></div>
          <div class="file-info-row"><span class="file-info-label">\u0623\u0631\u0642\u0627\u0645 CRM:</span><span class="file-info-value" id="infoCount">-</span></div>
          <div class="badges" id="badges"></div>
        </div>
      </div>
      <div class="progress-section" id="progressSection">
        <div class="section-title">\u23F3 \u062C\u0627\u0631\u064A \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u0644\u0641...</div>
        <el-progress id="parseProgress" value="0" max="100" label="\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u0644\u0641" show-percent size="md" color="primary" striped animated></el-progress>
      </div>
      <div class="actions">
        <el-button id="startBtn" variant="primary" size="md" full-width disabled label="\u{1F680} \u0628\u062F\u0621 \u0627\u0644\u0628\u062D\u062B"></el-button>
        <el-button id="resetBtn" variant="secondary" size="md" label="\u{1F504} \u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646" style="display:none"></el-button>
      </div>
    `,this.#t=this.#e.getElementById("fileInput"),this.#r=this.#e.getElementById("dropzone"),this.#a=this.#e.getElementById("fileInfo"),this.#n=this.#e.getElementById("startBtn"),this.#s=this.#e.getElementById("progressSection"),this.#o=this.#e.getElementById("badges"),this.#i=this.#e.querySelector("el-toast-container")}#u(){this.#r.addEventListener("click",()=>this.#t.click()),this.#r.addEventListener("dragover",t=>{t.preventDefault(),this.#r.classList.add("drag-over")}),this.#r.addEventListener("dragleave",()=>this.#r.classList.remove("drag-over")),this.#r.addEventListener("drop",t=>{t.preventDefault(),this.#r.classList.remove("drag-over");let r=t.dataTransfer.files[0];r&&this.#p(r)}),this.#t.addEventListener("change",t=>{var s;let r=(s=t.target.files)==null?void 0:s[0];r&&this.#p(r)}),this.#n.addEventListener("el-button-click",()=>this.dispatchEvent(new CustomEvent("crm-start",{detail:{file:this.#c,parseResult:this.#l},bubbles:!0,composed:!0})));let e=this.#e.getElementById("resetBtn");e==null||e.addEventListener("el-button-click",()=>this.#h())}async#p(e){if(!e.name.match(/\.(xlsx|xls)$/i)){this.#i.show({message:"\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0644\u0641 Excel (.xlsx \u0623\u0648 .xls)",variant:"warning"});return}this.#c=e,this.#a.classList.add("visible"),this.#r.style.display="none",this.#e.getElementById("infoName").textContent=e.name,this.#e.getElementById("infoSize").textContent=this.#m(e.size),this.#s.classList.add("visible");let t=this.#e.querySelector("el-progress");try{t.setAttribute("label","\u062C\u0627\u0631\u064A \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u0644\u0641...");let r=await this.#g(e);this.#l=r,this.#e.getElementById("infoRows").textContent=r.totalRows.toLocaleString("ar-EG"),this.#e.getElementById("infoCount").textContent=r.sapNumbers.length.toLocaleString("ar-EG"),this.#o.innerHTML=`
        <el-badge variant="primary" label="\u0639\u0645\u0648\u062F CRM: ${r.sapColumnIndex>=0?"\u0645\u0643\u062A\u0634\u0641":"\u063A\u064A\u0631 \u0645\u0643\u062A\u0634\u0641"}"></el-badge>
        <el-badge variant="${r.notesColumnIndex>=0?"success":"warning"}" label="\u0639\u0645\u0648\u062F \u0645\u0644\u0627\u062D\u0638\u0627\u062A: ${r.notesColumnIndex>=0?"\u0645\u0643\u062A\u0634\u0641":"\u063A\u064A\u0631 \u0645\u0643\u062A\u0634\u0641"}"></el-badge>
      `,this.#n.removeAttribute("disabled"),this.#n.setAttribute("label","\u{1F680} \u0628\u062F\u0621 \u0627\u0644\u0628\u062D\u062B");let s=this.#e.getElementById("resetBtn");s.style.display="inline-flex",this.#i.show({message:`\u062A\u0645 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u0644\u0641: ${r.sapNumbers.length} \u0631\u0642\u0645 CRM`,variant:"success"})}catch(r){this.#i.show({message:`\u062E\u0637\u0623 \u0641\u064A \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u0644\u0641: ${r.message}`,variant:"danger"}),this.#h()}}async#g(e){let{parseCRMExcel:t}=await Promise.resolve().then(()=>(W(),le));return t(e)}#h(){this.#c=null,this.#l=null,this.#a.classList.remove("visible"),this.#s.classList.remove("visible"),this.#r.style.display="block",this.#t.value="",this.#n.setAttribute("disabled",""),this.#n.setAttribute("label","\u{1F680} \u0628\u062F\u0621 \u0627\u0644\u0628\u062D\u062B");let e=this.#e.getElementById("resetBtn");e&&(e.style.display="none"),this.#o.innerHTML="",this.#e.getElementById("fileInput").value=""}#m(e){return e<1024?e+" \u0628\u0627\u064A\u062A":e<1024*1024?(e/1024).toFixed(1)+" KB":(e/(1024*1024)).toFixed(1)+" MB"}getFile(){return this.#c}getParseResult(){return this.#l}isReady(){return this.#c!==null&&this.#l!==null}};customElements.get("crm-file-uploader")||customElements.define("crm-file-uploader",G);var V=class extends HTMLElement{#e;#t;#r;#a;#n;#s;constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#o(),this.#t=this.#e.querySelector("el-progress"),this.#r=this.#e.getElementById("pct"),this.#a=this.#e.getElementById("info"),this.#n=this.#e.getElementById("liveFeed"),this.#s=this.#e.getElementById("summary")}#o(){this.#e.innerHTML=`
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .panel { background: var(--ea-surface); border: 1px solid var(--ea-border); border-radius: 12px; overflow: hidden; }
        .section { padding: 16px; border-bottom: 1px solid var(--ea-border); }
        .section:last-child { border-bottom: none; }
        .section-title { font-size: 13px; font-weight: 700; color: var(--ea-text); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .running-dot { width: 8px; height: 8px; background: var(--ea-success); border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .progress-wrap { margin-top: 8px; }
        .progress-info { display: flex; justify-content: space-between; font-size: 12px; color: var(--ea-muted); margin-bottom: 4px; }
        .live-feed { max-height: 200px; overflow-y: auto; }
        .live-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12px; margin-bottom: 4px; }
        .live-item.ok { background: var(--ea-badge-success-bg); color: var(--ea-badge-success-text); }
        .live-item.empty { background: var(--ea-badge-danger-bg); color: var(--ea-badge-danger-text); }
        .live-crm { font-family: monospace; font-size: 11px; font-weight: 600; }
        .live-badge { font-size: 11px; padding: 2px 6px; border-radius: 9999px; }
        .summary { display: flex; gap: 16px; }
        .summary-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .summary-label { font-size: 11px; color: var(--ea-muted); }
        .summary-value { font-size: 18px; font-weight: 700; color: var(--ea-text); }
        .summary-value.success { color: var(--ea-success); }
        .summary-value.danger { color: var(--ea-error); }
      </style>
      <div class="panel">
        <div class="section">
          <div class="section-title"><span class="running-dot"></span> \u062C\u0627\u0631\u064A \u0627\u0644\u0628\u062D\u062B...</div>
          <div class="progress-wrap">
            <div class="progress-info">
              <span id="info">0 / 0 \u0628\u0644\u0627\u063A</span>
              <span>\u062F\u0641\u0639\u0629 <span id="currentBatch">1</span> \u0645\u0646 <span id="totalBatches">1</span></span>
            </div>
            <el-progress id="progress" value="0" max="100" label="\u0627\u0644\u062A\u0642\u062F\u0645" show-percent size="md" color="primary" striped animated></el-progress>
          </div>
        </div>
        <div class="section">
          <div class="section-title">\u{1F4E1} \u0622\u062E\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0627\u062A</div>
          <div class="live-feed" id="liveFeed">\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0633\u062A\u062E\u0631\u062C\u0627\u062A \u0628\u0639\u062F</div>
        </div>
        <div class="section">
          <div class="section-title">\u{1F4CA} \u0645\u0644\u062E\u0635</div>
          <div class="summary" id="summary">
            <div class="summary-item"><span class="summary-label">\u062A\u0645 \u0627\u0644\u0628\u062D\u062B</span><span class="summary-value" id="sumDone">0</span></div>
            <div class="summary-item"><span class="summary-label">\u0628\u0647\u0627 \u062A\u0642\u0627\u0631\u064A\u0631</span><span class="summary-value success" id="sumFound">0</span></div>
            <div class="summary-item"><span class="summary-label">\u0628\u062F\u0648\u0646 \u062A\u0642\u0627\u0631\u064A\u0631</span><span class="summary-value danger" id="sumEmpty">0</span></div>
          </div>
        </div>
      </div>
    `,this.#r=this.#e.getElementById("pct"),this.#a=this.#e.getElementById("info"),this.#n=this.#e.getElementById("liveFeed"),this.#s=this.#e.getElementById("summary")}setState(e){let t=this.#e.querySelector("el-progress");t&&t.setAttribute("value",String(e.pct)),this.#a.textContent=`${e.done} / ${e.total} \u0628\u0644\u0627\u063A`,this.#e.getElementById("currentBatch").textContent=String(e.currentBatch),this.#e.getElementById("totalBatches").textContent=String(e.totalBatches),e.latestExtracts&&e.latestExtracts.length>0?this.#n.innerHTML=e.latestExtracts.slice().reverse().map(r=>`
          <div class="live-item ${r.count>0?"ok":"empty"}">
            <span class="live-crm">${r.crm.substring(0,20)}</span>
            <span class="live-badge ${r.count>0?"variant-success":"variant-danger"}">
              ${r.count>0?"\u2705 "+r.count:"\u274C"}
            </span>
          </div>
        `).join(""):this.#n.innerHTML="\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0633\u062A\u062E\u0631\u062C\u0627\u062A \u0628\u0639\u062F",e.summary&&(this.#e.getElementById("sumDone").textContent=String(e.summary.done||e.done),this.#e.getElementById("sumFound").textContent=String(e.summary.found||e.found),this.#e.getElementById("sumEmpty").textContent=String(e.summary.empty||e.empty))}};customElements.get("crm-progress-panel")||customElements.define("crm-progress-panel",V);var J=class extends HTMLElement{#e;#t;#r;#a;#n;#s=[];constructor(){super(),this.#e=this.attachShadow({mode:"open"}),this.#o(),this.#t=this.#e.querySelector("el-table"),this.#r=this.#e.getElementById("filterInput"),this.#a=this.#e.getElementById("statusFilter"),this.#n=this.#e.getElementById("exportBtn"),this.#i()}#o(){this.#e.innerHTML=`
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .toolbar-group { display: flex; gap: 8px; align-items: center; }
        .filter-wrapper { position: relative; flex: 1; min-width: 200px; max-width: 400px; }
        .filter-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--ea-icon-fill); pointer-events: none; }
        .table-container { border: 1px solid var(--ea-border); border-radius: 8px; overflow: hidden; background: var(--ea-surface); }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--ea-icon-fill); }
        .export-btn { background: var(--ea-brand); color: var(--ea-on-brand); }
      </style>
      <div class="toolbar">
        <div class="toolbar-group filter-wrapper">
          <svg class="filter-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 3 6 3 2 9 2 15 6 21 22 21 18 15 12 9 14 3"/></svg>
          <el-input id="filterInput" placeholder="\u{1F50D} \u0628\u062D\u062B \u0628\u0627\u0633\u0645 \u0627\u0644\u0628\u0644\u0627\u063A \u0623\u0648 SAP..." full-width size="sm"></el-input>
        </div>
        <el-select id="statusFilter" placeholder="\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A" size="sm">
          <option value="">\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A</option>
          <option value="found">\u2705 \u0628\u0647\u0627 \u062A\u0642\u0627\u0631\u064A\u0631</option>
          <option value="empty">\u274C \u0628\u062F\u0648\u0646 \u062A\u0642\u0627\u0631\u064A\u0631</option>
          <option value="error">\u26A0\uFE0F \u062E\u0637\u0623</option>
        </el-select>
        <el-button id="exportBtn" variant="primary" size="sm" label="\u{1F4BE} \u062A\u0635\u062F\u064A\u0631 Excel"></el-button>
      </div>
      <div class="table-container">
        <el-table id="resultsTable"></el-table>
      </div>
    `,this.#t=this.#e.querySelector("el-table"),this.#r=this.#e.getElementById("filterInput"),this.#a=this.#e.getElementById("statusFilter"),this.#n=this.#e.getElementById("exportBtn")}#i(){this.#r.addEventListener("el-input",()=>this.#u()),this.#a.addEventListener("el-change",()=>this.#u()),this.#n.addEventListener("el-button-click",()=>this.#p())}setData(e){this.#s=e,this.#c()}#c(){let e=[{key:"sap",label:"\u0631\u0642\u0645 \u0627\u0644\u0628\u0644\u0627\u063A",sortable:!0,width:"180px"},{key:"status",label:"\u0627\u0644\u062D\u0627\u0644\u0629",sortable:!0,width:"120px",render:this.#l},{key:"reports",label:"\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631",sortable:!1,width:"250px",render:this.#d},{key:"extractedAt",label:"\u0648\u0642\u062A \u0627\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C",sortable:!0,width:"180px"}];this.#t.setAttribute("config",JSON.stringify({columns:e,data:this.#s,sortable:!0,pagination:!0,pageSize:20,striped:!0,hoverable:!0,emptyMessage:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C"}))}#l=(e,t)=>{let s={found:{variant:"success",label:"\u2705 \u0628\u0647\u0627 \u062A\u0642\u0627\u0631\u064A\u0631"},empty:{variant:"warning",label:"\u274C \u0628\u062F\u0648\u0646 \u062A\u0642\u0627\u0631\u064A\u0631"},error:{variant:"danger",label:"\u26A0\uFE0F \u062E\u0637\u0623"}}[t.status]||{variant:"default",label:t.status};return`<el-badge variant="${s.variant}" size="sm" label="${s.label}"></el-badge>`};#d=(e,t)=>!t.reports||t.reports.length===0?'<span style="color:var(--ea-icon-fill)">\u2014</span>':t.reports.slice(0,3).map(r=>`<el-badge variant="info" size="xs" label="${r}"></el-badge>`).join(" ")+(t.reports.length>3?`<el-badge variant="default" size="xs" label="+${t.reports.length-3} \u0623\u062E\u0631\u0649"></el-badge>`:"");#u(){let e=this.#r.value.toLowerCase().trim(),t=this.#a.value,r=this.#s.filter(s=>!(e&&!s.sap.toLowerCase().includes(e)&&!JSON.stringify(s.reports).toLowerCase().includes(e)||t&&s.status!==t));this.#t.setAttribute("config",JSON.stringify({columns:[{key:"sap",label:"\u0631\u0642\u0645 \u0627\u0644\u0628\u0644\u0627\u063A",sortable:!0,width:"180px"},{key:"status",label:"\u0627\u0644\u062D\u0627\u0644\u0629",sortable:!0,width:"120px",render:this.#l},{key:"reports",label:"\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631",sortable:!1,width:"250px",render:this.#d},{key:"extractedAt",label:"\u0648\u0642\u062A \u0627\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C",sortable:!0,width:"180px"}],data:r,sortable:!0,pagination:!0,pageSize:20,striped:!0,hoverable:!0,emptyMessage:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0637\u0627\u0628\u0642\u0629"}))}#p(){this.dispatchEvent(new CustomEvent("crm-export",{detail:{data:this.#s},bubbles:!0,composed:!0}))}clear(){this.#s=[],this.#c()}};customElements.get("crm-results-table")||customElements.define("crm-results-table",J);document.getElementById("__crm-extractor-root")?console.log("[CRM Extractor] Already loaded"):(console.log("[CRM Extractor] v2.0 loading..."),Ee());async function Ee(){if(!f.isOnSelectReportPage()){console.log("[CRM Extractor] Not on SelectReport.aspx, exiting");return}if(!f.getSearchElements().textbox){console.log("[CRM Extractor] Required elements not found, exiting");return}console.log("[CRM Extractor] Page detected, initializing...");try{let e=await m.getState();(!e||typeof e!="object")&&(e={});let t=document.createElement("div");t.id="__crm-extractor-root",t.setAttribute("data-theme","light"),t.style.cssText=["position:fixed;top:20px;right:20px;z-index:999999;direction:rtl;","width:420px;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);","overflow:auto;background:var(--ea-surface,#ffffff);border:1px solid var(--ea-border,#d5e0ee);","border-radius:14px;box-shadow:0 12px 40px rgba(11,18,32,.28);padding:16px;","font-family:Cairo,Segoe UI,Tahoma,sans-serif;"].join(""),t.style.display="none",document.body.appendChild(t);let r=document.createElement("div");r.style.cssText=["display:flex;align-items:center;justify-content:space-between;","margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--ea-border,#d5e0ee);"].join(""),r.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:var(--ea-text,#1a2a44);">
      <span style="font-size:16px;">\u{1F4C4}</span> \u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0628\u0644\u0627\u063A \u2014 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631
    </div>
    <button id="crmPanelClose" type="button" aria-label="\u0625\u063A\u0644\u0627\u0642"
      style="width:28px;height:28px;border:none;border-radius:8px;background:var(--ea-faint,#eef3f9);color:var(--ea-muted,#5b7394);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;">\u2715</button>
  `,t.appendChild(r),r.querySelector("#crmPanelClose").addEventListener("click",()=>T(!1));let s=Se();T(!!e.panelOpen);let a=document.createElement("div");a.id="__crm-extractor-ui",a.innerHTML=`
    <crm-file-uploader></crm-file-uploader>
    <crm-progress-panel style="display:none; margin-top: 16px;"></crm-progress-panel>
    <crm-results-table style="display:none; margin-top: 16px;"></crm-results-table>
  `,t.appendChild(a);let i=a.querySelector("crm-progress-panel"),o=a.querySelector("crm-results-table"),c=new P(e,l=>{var p;i&&i.setState(l),l.results&&o&&o.setData(l.results),l.running!==!0&&l.total>0&&((p=l.results)==null?void 0:p.length)>=l.total&&Le()});window.crmExtractor=c;let d=null,u=null;t.addEventListener("crm-start",async l=>{var g;let p=l.detail||{},h=(((g=p.parseResult)==null?void 0:g.sapNumbers)||[]).map(String);if(!h.length){L("\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0631\u0642\u0627\u0645 \u0628\u0644\u0627\u063A \u0641\u064A \u0627\u0644\u0645\u0644\u0641","warning");return}d=p.file||null,u=p.parseResult||null,ke(),await c.start(h)}),t.addEventListener("crm-export",async l=>{let h=(l.detail||{}).data||c.getResults();if(!h||h.length===0){L("\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0644\u0644\u062A\u0635\u062F\u064A\u0631","warning");return}try{if(d&&u){let g=await F(d,h,u.headers,u.sapColumnIndex);Te(g,`crm-results-${new Date().toISOString().slice(0,10)}.xlsx`),L("\u062A\u0645 \u062A\u0635\u062F\u064A\u0631 Excel \u0628\u0646\u0641\u0633 \u0627\u0644\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u0623\u0635\u0644\u064A","success")}else ce(h)}catch(g){console.error("[CRM Extractor] Export failed:",g),L("\u0641\u0634\u0644 \u062A\u0635\u062F\u064A\u0631 Excel\u060C \u062A\u0645 \u0627\u0644\u062A\u0635\u062F\u064A\u0631 \u0643\u0640 CSV","warning"),ce(h)}}),E(S.START_EXTRACTION,async(l,p)=>{I(),c.start((l.sapNumbers||[]).map(String)).catch(()=>{}),p({success:!0,data:{ok:!0}})}),E(S.STOP_EXTRACTION,async(l,p)=>{I(),c.stop(),p({success:!0,data:{ok:!0}})}),E(S.GET_STATUS,async(l,p)=>{I(),p({success:!0,data:c.getState()})}),E(S.EXPORT_RESULTS,async(l,p)=>{I(),p({success:!0,data:{results:c.getResults()}})}),console.log("[CRM Extractor] Ready")}catch(e){console.error("[CRM Extractor] Init failed:",e),document.getElementById("__crm-extractor-root")&&T(!0)}}function I(){T(!0);let n=document.getElementById("__crm-extractor-ui");n&&n.querySelectorAll("crm-progress-panel, crm-results-table").forEach(t=>{t.style.display="block"})}var K="__crm-extractor-fab";function Se(){let n=document.getElementById(K);if(n)return n;let e=document.createElement("button");return e.id=K,e.type="button",e.title="\u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0628\u0644\u0627\u063A \u2014 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u062A\u0642\u0627\u0631\u064A\u0631 CRM",e.setAttribute("aria-label","\u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0628\u0644\u0627\u063A"),e.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',e.style.cssText=["position:fixed;bottom:24px;right:24px;z-index:999998;width:52px;height:52px;","border-radius:50%;border:2px solid var(--ea-brand,#0e7490);cursor:pointer;","background:linear-gradient(135deg,#0e7490,#155e75);color:#e0f2fe;","display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(14,116,144,.45);","transition:transform .15s ease,box-shadow .15s ease;"].join(""),e.addEventListener("click",()=>{let t=document.getElementById("__crm-extractor-root");if(!t)return;let r=t.style.display!=="block";T(r)}),e.addEventListener("mouseenter",()=>{e.style.transform="scale(1.08)",e.style.boxShadow="0 10px 28px rgba(14,116,144,.6)"}),e.addEventListener("mouseleave",()=>{e.style.transform="scale(1)",e.style.boxShadow="0 8px 24px rgba(14,116,144,.45)"}),document.body.appendChild(e),e}function T(n){let e=document.getElementById("__crm-extractor-root");e&&(e.style.display=n?"block":"none");let t=document.getElementById(K);t&&(t.style.background=n?"linear-gradient(135deg,#0f766e,#0d9488)":"linear-gradient(135deg,#0e7490,#155e75)",t.title=n?"\u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0628\u0644\u0627\u063A \u2014 \u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u0644\u0648\u062D\u0629":"\u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0628\u0644\u0627\u063A \u2014 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u062A\u0642\u0627\u0631\u064A\u0631 CRM"),m.saveState({panelOpen:n}).catch(()=>{})}function ke(){let n=document.getElementById("__crm-extractor-ui");if(!n)return;let e=n.querySelector("crm-file-uploader"),t=n.querySelector("crm-progress-panel"),r=n.querySelector("crm-results-table");e&&(e.style.display="none"),t&&(t.style.display="block"),r&&(r.style.display="none")}function Le(){let n=document.getElementById("__crm-extractor-ui");if(!n)return;let e=n.querySelector("crm-file-uploader"),t=n.querySelector("crm-progress-panel"),r=n.querySelector("crm-results-table");e&&(e.style.display="none"),t&&(t.style.display="none"),r&&(r.style.display="block")}function L(n,e="info"){let t=document.createElement("el-toast-container");document.body.appendChild(t),t.show({message:n,variant:e}),setTimeout(()=>t.remove(),5500)}function Te(n,e){let t=URL.createObjectURL(n),r=document.createElement("a");r.href=t,r.download=e,document.body.appendChild(r),r.click(),setTimeout(()=>{URL.revokeObjectURL(t),r.remove()},1e3)}function ce(n){if(!n||n.length===0){L("\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0644\u0644\u062A\u0635\u062F\u064A\u0631","warning");return}let e=n.map(o=>[o.sap,o.status==="found"?"\u0628\u0647\u0627 \u062A\u0642\u0627\u0631\u064A\u0631":o.status==="empty"?"\u0628\u062F\u0648\u0646 \u062A\u0642\u0627\u0631\u064A\u0631":"\u062E\u0637\u0623",(o.reports||[]).join(" | "),o.extractedAt]),r="\uFEFF"+[["\u0631\u0642\u0645 \u0627\u0644\u0628\u0644\u0627\u063A","\u0627\u0644\u062D\u0627\u0644\u0629","\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631","\u0648\u0642\u062A \u0627\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C"],...e].map(o=>o.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join(`
`),s=new Blob([r],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),i=document.createElement("a");i.href=a,i.download=`crm-results-${new Date().toISOString().slice(0,10)}.csv`,document.body.appendChild(i),i.click(),setTimeout(()=>{URL.revokeObjectURL(a),i.remove()},1e3)}})();
//# sourceMappingURL=crm-content.js.map
