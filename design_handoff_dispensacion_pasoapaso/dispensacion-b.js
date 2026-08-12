const I={x:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 6l12 12M18 6L6 18"/></svg>',
dots:'<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
bar:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M18 5v14M21 5v14"/></svg>',
check:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12.5l5.2 5L20 6.5"/></svg>',
flask:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 3h6M10 3v6L5 19a2 2 0 002 2h10a2 2 0 002-2l-5-10V3"/></svg>',
print:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 8V3h10v5M7 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z"/></svg>',
eye:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
expand:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 4H4v5M15 20h5v-5M20 9V4h-5M4 15v5h5"/></svg>',
down:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16"/></svg>',
info:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
alert:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
clock:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
pill:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="9" width="18" height="7" rx="3.5"/><path d="M12 9v7"/></svg>',
receipt:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
arrow:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h13m0 0l-5-5m5 5l-5 5"/></svg>'};
function barcode(code,h,scale){let seq='';for(const ch of String(code)){const d=parseInt(ch,10)||0;seq+=[1,2,1,3,1,2,3,1,2,1][d]+','+[1,1,2,1,3,2,1,2,1,3][(d+3)%10]+','}
 const parts=seq.split(',').filter(Boolean).map(Number);const u=scale||1.4;let x=0,bars='';
 parts.forEach((w,i)=>{if(i%2===0)bars+=`<rect x="${(x*u).toFixed(2)}" y="0" width="${(w*u).toFixed(2)}" height="${h}" fill="currentColor"/>`;x+=w});
 return `<svg width="${(x*u).toFixed(0)}" height="${h}" viewBox="0 0 ${(x*u).toFixed(2)} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${bars}</svg>`}
const DOC={nm:'Constancia IP — Susana Rodríguez.pdf',mt:'1,0 MB · 1 página · subido 11/08/2026 17:12 por Coordinación'};
const S={step:'prep',printed:false,err:null,code:'',toast:null,viewer:false,zoom:.78,
 swap:null,
 items:[{nm:'Alvetide 92/22 mcg',ds:'inhalador',drug:'Salmeterol + fluticasona',qty:1,n:0,ean:'7791234567890',
   alts:[{nm:'Seretide 92/22 mcg',mt:'inhalador · 6 u. en stock'},{nm:'Salmeterol + fluticasona — genérico',mt:'inhalador · 14 u. en stock'},{nm:'Salmeterol + fluticasona 46/11 mcg',mt:'otra concentración · requiere autorización del IP',no:1}]},
  {nm:'Ibuprofeno 400 mg',ds:'comprimidos',drug:'Ibuprofeno',qty:3,n:0,ean:'7791122334455',
   alts:[{nm:'Ibupirac 400 mg',mt:'comprimidos · 24 u. en stock'},{nm:'Ibuprofeno 400 mg — genérico',mt:'comprimidos · 8 u. en stock'},{nm:'Ibuprofeno 600 mg',mt:'otra concentración · requiere autorización del IP',no:1}]},
  {nm:'Donepecilo 10 mg',ds:'comprimidos',drug:'Donepecilo',qty:2,n:0,ean:'7790987654321',
   alts:[{nm:'Eranz 10 mg',mt:'comprimidos · 20 u. en stock'},{nm:'Donepecilo 5 mg',mt:'otra concentración · requiere autorización del IP',no:1}]}]};
const uTot=()=>S.items.reduce((a,i)=>a+i.qty,0),uOk=()=>S.items.reduce((a,i)=>a+i.n,0);
const nOk=()=>S.items.filter(i=>i.n>=i.qty).length,allOk=()=>S.items.every(i=>i.n>=i.qty),nextItem=()=>S.items.find(i=>i.n<i.qty);
function gate(){if(!S.printed)return{t:'Falta imprimir la constancia del IP'};
 const f=uTot()-uOk();
 if(f===uTot())return{t:'Falta escanear las '+uTot()+' unidades'};
 if(f)return{t:'Faltan '+f+(f===1?' unidad':' unidades')+' por escanear'};return null}
function scan(val){const v=(val||'').trim(),p=nextItem();if(!p)return;
 if(!v){p.n++;S.err=null}
 else{const m=S.items.find(i=>i.ean===v);
  if(!m)S.err='Código '+v+' — no corresponde a ningún producto de esta dispensación.';
  else if(m.n>=m.qty)S.err=m.nm+' ya tiene sus '+m.qty+(m.qty===1?' unidad':' unidades')+'. Escaneá '+(nextItem()?nextItem().nm:'');
  else{m.n++;S.err=null}}
 S.code='';const fin=!S.err&&allOk();render();focus();if(fin)flash('Las '+uTot()+' unidades están escaneadas')}
function flash(m){S.toast=m;render();clearTimeout(S._t);S._t=setTimeout(()=>{S.toast=null;render()},2600)}
function focus(){const el=document.querySelector('[data-scan]');if(el&&!S.viewer)el.focus()}
function reset(){clearTimeout(S._t);Object.assign(S,{step:'prep',printed:false,err:null,code:'',toast:null,viewer:false,zoom:.78,swap:null,
 items:S.items.map(i=>({...i,n:0}))});render()}
function toggleSwap(n){S.swap=S.swap===n?null:n;render()}
function pickAlt(n,a){const it=S.items[n],alt=it.alts[a];it.nm=alt.nm;it.swapped=true;S.swap=null;render();focus();flash('Sustituido por '+alt.nm+' · registrado en trazabilidad')}
function openDoc(){S.viewer=true;render()}
function closeDoc(){S.viewer=false;render();focus()}
function zoom(d){S.zoom=Math.min(1.6,Math.max(.4,+(S.zoom+d).toFixed(2)));render()}
function print(){S.printed=true;render();focus();flash('Constancia enviada a la impresora')}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.viewer)closeDoc()});

const sheet=`<div class="sheet">
 <div class="sh"><div class="brand">Spira<span>Producto en investigación</span></div>
  <div class="rt">Protocolo <b>ACT18301</b><br>Sitio 042 · Hospital Español<br>Constancia N° CI-1046</div></div>
 <h1>Constancia de entrega de producto en investigación</h1>
 <p class="st">Emitida por Coordinación el 11/08/2026 · válida para la visita del día</p>
 <div class="grid2">
  <div class="fld"><dt>Participante</dt><dd>Susana Rodríguez</dd></div>
  <div class="fld"><dt>N° de participante</dt><dd>03200070001</dd></div>
  <div class="fld"><dt>Visita</dt><dd>V6 · Semana 24</dd></div>
  <div class="fld"><dt>Investigador principal</dt><dd>Dra. M. Ferreyra</dd></div>
 </div>
 <table><thead><tr><th>Producto</th><th>Kit</th><th>Cant.</th><th>Vencimiento</th></tr></thead>
 <tbody><tr><td>Alvetide 92/22 mcg — inhalador</td><td>KIT-8841<div class="bc" style="margin-top:5px"><span class="bars">${barcode('7791234567890',15,1)}</span></div></td><td>1</td><td>03/2027</td></tr>
 <tr><td>Donepecilo 10 mg — comprimidos</td><td>KIT-8842<div class="bc" style="margin-top:5px"><span class="bars">${barcode('7790987654321',15,1)}</span></div></td><td>2</td><td>11/2026</td></tr></tbody></table>
 <p class="decl">El participante recibe el producto en investigación detallado, fue instruido sobre su conservación y posología, y se compromete a devolver los envases vacíos en la próxima visita. La farmacia conserva copia firmada de esta constancia.</p>
 <div class="sigs"><div class="sig"><b>Firma del participante</b>Aclaración y fecha</div>
  <div class="sig"><b>Firma del farmacéutico</b>Matrícula y sello</div></div>
 <div class="sfoot"><span>ACT18301 · CI-1046</span><span>Página 1 de 1</span></div></div>`;

function head(){const lb=S.step==='prep'?'Preparando':S.step==='lista'?'Lista para retirar':'Entregada';
 return `<div class="hd"><div class="hd-top"><div style="min-width:0;flex:1">
 <h2>D-1046 · ${lb}</h2>
 <div class="sub"><span style="color:var(--ink);font-weight:600">Susana Rodríguez</span><span class="d"></span><span>03200070001</span><span class="d"></span><span>ACT18301</span><span class="d"></span><span>Fuera de cronograma</span></div>
 </div><button class="icobtn" title="Rechazar, reasignar, historial">${I.dots}</button><button class="icobtn" title="Cerrar">${I.x}</button></div></div>`}
function itemRows(undo){return S.items.map(i=>{const n=S.items.indexOf(i),full=i.n>=i.qty,open=S.swap===n,pct=Math.min(1,i.n/i.qty);
 return `<div class="ccard ${full?'full':''}">
 <span class="fill" style="width:${(pct*100).toFixed(0)}%"></span>
 <div class="in">
  <span class="dial ${full?'full':''}" style="background:conic-gradient(${full?'var(--good)':'var(--ph)'} ${pct}turn,var(--line) ${pct}turn)"><span>${i.n}/${i.qty}</span></span>
  <div class="nmcol"><div class="nm">${i.nm}</div><div class="mt">${i.ds}${i.swapped?' · sustituido':full?' · completo':i.n?(i.qty-i.n===1?' · falta 1 u.':' · faltan '+(i.qty-i.n)+' u.'):''}</div></div>
  <div class="fcol"><div class="lbl">Fármaco</div><div class="val">${i.drug}</div></div>
  ${full?`<span class="tick">${I.check}</span>${undo?`<button class="cancel" onclick="S.items[${n}].n=0;render();focus()">Cancelar</button>`:''}`
  :undo?`<button class="sust${open?' on':''}" onclick="toggleSwap(${n})">Sustituir</button>`:''}
 </div>
 ${open?`<div class="swap"><div class="swaplb">Mismo fármaco · <b>${i.drug.toLowerCase()}</b></div>
  ${i.alts.map((a,ai)=>`<div class="alt ${a.no?'no':''}"><div style="flex:1;min-width:0"><div class="anm">${a.nm}</div><div class="amt">${a.mt}</div></div>
   <button class="pick" ${a.no?'disabled':`onclick="pickAlt(${n},${ai})"`}>${a.no?'Bloqueado':'Usar este'}</button></div>`).join('')}
  <div class="swapfoot"><span class="pend"></span>La sustitución queda registrada en la trazabilidad de la dispensación.</div></div>`:''}</div>`}).join('')}
function comp(green){return `<div class="comp" style="${green?'border-color:rgba(92,138,90,.42);background:rgba(92,138,90,.10)':''}">
 <div style="color:${green?'var(--good)':'var(--teal)'};display:flex;justify-content:center;margin-bottom:6px">${I.receipt}</div>
 <div class="n" style="${green?'color:var(--good)':''}">N° 1046</div><div class="l">Comprobante de dispensación</div></div>`}
const ipcard=()=>`<div class="ipcard ${S.printed?'ok':''}">
 <div class="thumb" onclick="openDoc()" title="Abrir la constancia"><div class="mini">${sheet}</div><span class="zoom">${I.expand}</span></div>
 <div class="txt"><div class="t1">${S.printed?`<span style="color:var(--teal);display:flex">${I.flask}</span>Constancia del IP impresa`:`<span style="color:var(--deep);display:flex">${I.alert}</span>Falta imprimir la constancia del IP`}</div>
  <div class="t2">${DOC.nm}</div>
  <div style="margin-top:9px;display:flex;gap:7px"><button class="btn out sm" onclick="openDoc()">${I.eye} Ver</button>
   <button class="btn out sm" onclick="flash('Descargando la constancia…')">${I.down} Descargar</button>
   <button class="btn ${S.printed?'out':'pri'} sm" onclick="print()">${I.print} ${S.printed?'Imprimir de nuevo':'Imprimir'}</button></div></div></div>`;
const viewer=()=>`<div class="viewer ${S.viewer?'on':''}">
 <div class="vbar"><div style="min-width:0;flex:1"><div class="fn">${DOC.nm}</div><div class="fm">${DOC.mt}</div></div>
  <div class="vzoom"><button onclick="zoom(-.15)" title="Alejar">−</button><span class="lv">${Math.round(S.zoom*100)}%</span><button onclick="zoom(.15)" title="Acercar">+</button></div>
  <button class="vbtn" onclick="S.zoom=.78;render()">Ajustar</button>
  <button class="vbtn" title="Descargar">${I.down}</button>
  <button class="vbtn ${S.printed?'':'solid'}" onclick="print()">${I.print} Imprimir</button>
  <button class="vbtn" onclick="closeDoc()" title="Cerrar (Esc)">${I.x}</button></div>
 <div class="vscroll"><div class="vpage" style="transform:scale(${S.zoom})">${sheet}</div></div></div>`;

function render(){const idx=S.step==='prep'?0:S.step==='lista'?1:2,g=gate(),p=nextItem();
 const req=[{t:'Constancia del IP impresa',ok:S.printed,ct:''},...S.items.map(i=>({t:i.nm,ok:i.n>=i.qty,ct:i.n+'/'+i.qty}))];
 const firstPend=req.find(r=>!r.ok);
 const ring='<span class="gl"><span class="ring"></span></span>',tk=`<span class="gl">${I.check}</span>`;
 const reqs=`<div class="reqs">${req.map(r=>`<div class="req ${r.ok?'ok':r===firstPend?'on':''}${r.ct?' hasct':''}">${r.ok?tk:ring}<span class="tx">${r.t}</span>${r.ct?`<span class="ct">${r.ct}</span>`:''}</div>`).join('')}</div>`;
 const node=(n,label,cls,inner)=>`<div class="rnode ${cls}"><span class="dot">${cls.includes('done')?I.check:n}</span><div class="rbody"><div class="tt">${label}</div>${inner||''}</div></div>`;
 const rail=`<div class="rail"><span class="eyebrow">Proceso</span>
  <div class="rflow"><i class="prog" style="height:${idx===0?0:idx===1?38:76}%"></i>
  ${node(1,'Preparar y escanear',idx>0?'done':'cur',idx===0?reqs:'')}
  ${node(2,'Lista para retirar',idx>1?'done':idx===1?'cur':'',idx===1?`<div class="reqs"><div class="req ok">${tk}<span class="tx">Comprobante N° 1046</span></div><div class="req on">${ring}<span class="tx">Imprimir para el mostrador</span></div></div>`:'')}
  ${node(3,'Entregar',idx===2?'done cur':'','')}</div>
  <div class="railfoot">${g?`<span class="pend"></span><span>${g.t}</span>`:`<span style="color:var(--good);display:flex;gap:7px;align-items:flex-start">${I.check}<span>Sin pendientes</span></span>`}</div></div>`;
 let body,ft;
 if(S.step==='lista'){body=`${comp()}
  <div class="note" style="background:rgba(46,125,116,.08);border-color:rgba(46,125,116,.28);color:var(--ink-soft)">${I.info}<span>Verificada y con comprobante emitido. Imprimilo para el mostrador: al retirar se entrega sellado y firmado.</span></div>
  <div class="eyebrow" style="display:block;margin:20px 0 9px">Contenido verificado</div><div class="groups">${itemRows(false)}</div>`;
  ft=`<div class="ftrow"><button class="btn out">${I.print} Imprimir comprobante</button><div class="spacer"></div><button class="btn teal" onclick="S.step='entregada';render();flash('Entregada · stock descontado')">Entregar al paciente ${I.arrow}</button></div>`}
 else if(S.step==='entregada'){body=`${comp(1)}
  <div class="eyebrow" style="display:block;margin:20px 0 9px">Entregado 11/08/2026 · 17:41 · farmacia</div><div class="groups">${itemRows(false)}</div>
  <div class="note">${I.clock}<span>Stock descontado y kits de producto en investigación declarados con la constancia firmada.</span></div>`;
  ft=`<div class="ftrow"><button class="btn ghost" onclick="reset()">Reiniciar demo</button><div class="spacer"></div><button class="btn out">${I.print} Imprimir comprobante</button></div>`}
 else{body=`<h3 class="h6">Preparar y escanear</h3><p class="lede">Dos requisitos: la constancia impresa y cada medicamento confirmado con el lector.</p>
  ${ipcard()}
  <div class="scan"><input data-scan placeholder="Escaneá o tipeá el código…" value="${S.code}" onkeydown="if(event.key==='Enter')scan(this.value)"><button class="btn pri" onclick="scan(this.previousElementSibling.value)">${I.bar} Confirmar</button></div>
  ${S.err?`<div class="err">${I.alert}<span>${S.err}</span></div>`:`<div class="hint">${allOk()?'Todo escaneado':'El lector escribe y confirma solo · una pasada por unidad'}</div>`}
  <div class="ctop"><span class="k">${uOk()}/${uTot()}</span><span class="l">unidades escaneadas</span><span class="r ${allOk()?'ok':''}">${allOk()?'Completo':'Faltan '+(uTot()-uOk())}</span></div>
  <div class="groups">${itemRows(true)}</div>
  <div class="note">${I.clock}<span>Al marcar lista se emite el comprobante y se descuenta el stock. Los kits de IP se declaran al entregar.</span></div>`;
  ft=`<div class="ftrow"><button class="btn ghost">Cancelar</button><div class="spacer"></div>
  <button class="btn teal" ${g?'disabled':''} onclick="S.step='lista';render();flash('Comprobante N° 1046 emitido')">Marcar lista para retirar</button></div>`}
 const el=document.getElementById('B');const a=document.activeElement,was=a&&a.hasAttribute&&a.hasAttribute('data-scan');
 el.innerHTML=`${head()}<div class="split">${rail}<div class="work"><div class="body">${body}</div><div class="ft">${ft}</div></div></div>${viewer()}${S.toast?`<div class="toast on">${I.check}<span>${S.toast}</span></div>`:'<div class="toast"></div>'}`;
 if(was)focus()}
render();focus();
