// Each point of the dive plan is one freeform formation:
// {name, rows, cols, cells, bench}. S is the ACTIVE point (S===PTS[PI]);
// switching points swaps S wholesale, so cur()/render() and everything below
// keep working on whichever point is active.
let S={name:'Point 1',rows:5,cols:5,cells:{},bench:[]};
let PTS=[S],PI=0;
let AF=false; // autofit toggle; off = static 9x9 grid
const PALETTE=['#1a1d22','#94a3b8','#f8f9fa','#d93025','#e8590c','#fcc419','#82c91e','#1d9e75','#0ca678','#15aabf','#1971c2','#4263eb','#7950f2','#d6336c'];
let ekey=null,rkey=null,lastEdit=null,lastFocused=null,_suppressAnim=false,_drag=null,_dragMoved=false;
let _selected=new Set();
function cur(){return S;}

function switchPoint(i){
  if(i===PI||i<0||i>=PTS.length)return;
  PI=i;
  S=PTS[i];
  clearSelection();
  render();
}

function addPoint(){
  const cp=JSON.parse(JSON.stringify({rows:S.rows,cols:S.cols,cells:S.cells,bench:S.bench}));
  cp.name='Point '+(PTS.length+1);
  PTS.splice(PI+1,0,cp);
  switchPoint(PI+1);
}

function delPoint(){
  if(PTS.length<2)return;
  if(!confirm(`Delete "${S.name}" and its formation?`))return;
  PTS.splice(PI,1);
  PI=Math.min(PI,PTS.length-1);
  S=PTS[PI];
  clearSelection();
  render();
}

function renamePoint(){
  const n=prompt('Point name:',S.name);
  if(n&&n.trim())S.name=n.trim().slice(0,24);
  render();
}

function movePoint(d){
  const j=PI+d;
  if(j<0||j>=PTS.length)return;
  [PTS[PI],PTS[j]]=[PTS[j],PTS[PI]];
  PI=j;
  render();
}
function bkey(i){return 'b:'+i;}
function isBench(k){return typeof k==='string'&&k.startsWith('b:');}
function getPilot(k){return isBench(k)?cur().bench[+k.slice(2)]:cur().cells[k];}
function pilotInPoint(name,pt){
  const lo=name.toLowerCase().trim();
  if(!lo)return false;
  for(const k in pt.cells)if(pt.cells[k].name.toLowerCase().trim()===lo)return true;
  return pt.bench.some(p=>p.name.toLowerCase().trim()===lo);
}
const $=id=>document.getElementById(id);

function key(r,c){return r+','+c;}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

function ws(color,sz){
  const s=sz||56,c=color||'#1d9e75';
  return `<svg width="${s}" height="${s}" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="translate(28,28)">
      <path d="M-3.5,-15 Q-12,-15 -22,-12 L-14,8 L-14,22 L14,22 L14,8 L22,-12 Q12,-15 3.5,-15 Z" fill="${c}" opacity=".88"/>
      <path d="M-3.5,-15 L3.5,-15 L5.5,8 L-5.5,8 Z" fill="${c}"/>
      <ellipse cx="-20" cy="-11" rx="1.6" ry="1.2" fill="#2a2f38"/>
      <ellipse cx="20" cy="-11" rx="1.6" ry="1.2" fill="#2a2f38"/>
      <ellipse cx="-13" cy="21" rx="1.6" ry="1.2" fill="#2a2f38"/>
      <ellipse cx="13" cy="21" rx="1.6" ry="1.2" fill="#2a2f38"/>
      <circle cx="0" cy="-19" r="3" fill="#2a2f38"/>
      <ellipse cx="0" cy="-20" rx="1.6" ry=".7" fill="#fff" opacity=".4"/>
    </g>
  </svg>`;
}

function coordLabel(r,c){return `R${r+1}·X${c}`;}

function makeSlot(k,d,i,extra,compact){
  const [r,c]=k.split(',').map(Number);
  const el=document.createElement('button');
  el.type='button';
  el.className='slot'+(d?' filled':'')+(compact?' compact':'');
  el.dataset.key=k;
  el.style.setProperty('--i',i);
  if(d) el.style.setProperty('--suit',d.color);
  el.setAttribute('aria-label',d
    ?`Slot ${coordLabel(r,c)}, ${d.name||'unnamed'}, ${d.color} suit, click to edit`
    :`Slot ${coordLabel(r,c)}, empty, click to assign pilot`);
  if(extra) Object.assign(el.style,extra);
  const inner=d
    ? `<div class="slot-svg">${ws(d.color,40)}</div><div class="slot-name">${esc(d.name||'(unnamed)')}</div>`
    : `<div class="slot-cross"></div>`;
  el.innerHTML=inner;
  el.addEventListener('click',e=>{
    if(_dragMoved){_dragMoved=false;return;}
    if((e.metaKey||e.ctrlKey)&&d){toggleSelect(k);return;}
    openModal(k);
  });
  if(d) attachDragSource(el,k);
  return el;
}

function attachDragSource(el,k){
  el.draggable=true;
  el.addEventListener('dragstart',e=>{
    let multi=null;
    if(_selected.has(k)&&_selected.size>1){
      multi=computeMultiOffsets(k);
      document.querySelectorAll('.slot.selected').forEach(s=>s.classList.add('dragging'));
    } else {
      el.classList.add('dragging');
      if(!_selected.has(k))clearSelection();
    }
    _drag={src:k,multi:multi};
    _dragMoved=false;
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',k);
  });
  el.addEventListener('dragend',()=>{
    document.querySelectorAll('.dragging').forEach(s=>s.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach(s=>s.classList.remove('drag-over'));
    _drag=null;
  });
  el.addEventListener('touchstart',e=>touchStart(el,k,e),{passive:true});
}

// Touch drag — HTML5 drag events don't fire on mobile browsers. Long-press
// (200ms) lifts the pilot, a fixed-position ghost follows the finger, and
// release hands off to the same reducers as the mouse path. A quick tap or
// an early move (scroll) cancels the pending lift.
const _touch={pending:null,active:false,ghost:null,overEl:null,scroll:0,scrollT:null};

// While a touch drag holds near the top/bottom of the viewport, scroll the
// page so off-screen targets (e.g. the bench below a tall canvas) are
// reachable — native scrolling is suppressed during the drag.
function touchAutoScroll(y){
  const M=70;
  _touch.scroll=y>innerHeight-M?8:y<M?-8:0;
  if(_touch.scroll&&!_touch.scrollT){
    _touch.scrollT=setInterval(()=>{
      if(!_touch.active||!_touch.scroll){
        clearInterval(_touch.scrollT);
        _touch.scrollT=null;
        return;
      }
      window.scrollBy(0,_touch.scroll);
    },16);
  }
}

function touchStart(el,k,e){
  if(e.touches.length!==1){touchReset();return;}
  const t=e.touches[0];
  _touch.pending={el,k,x:t.clientX,y:t.clientY,timer:setTimeout(touchLift,200)};
}

function touchLift(){
  const p=_touch.pending;
  if(!p||!document.contains(p.el))return;
  const r=p.el.getBoundingClientRect();
  const g=p.el.cloneNode(true);
  g.classList.add('touch-ghost');
  g.classList.remove('selected','dragging');
  g.style.cssText=`position:fixed;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;`;
  let multi=null;
  if(_selected.has(p.k)&&_selected.size>1){
    multi=computeMultiOffsets(p.k);
    document.querySelectorAll('.slot.selected').forEach(s=>s.classList.add('dragging'));
  } else {
    p.el.classList.add('dragging');
    if(!_selected.has(p.k))clearSelection();
  }
  _drag={src:p.k,multi:multi};
  _dragMoved=false;
  document.body.appendChild(g);
  _touch.ghost=g;
  _touch.active=true;
  touchMoveGhost(p.x,p.y);
  if(navigator.vibrate)navigator.vibrate(10);
}

function touchMoveGhost(x,y){
  const g=_touch.ghost;
  g.style.transform=`translate(${Math.round(x-g.offsetWidth/2)}px,${Math.round(y-g.offsetHeight/2-18)}px)`;
}

function touchTarget(x,y){
  const el=document.elementFromPoint(x,y);
  if(!el)return null;
  const canvas=el.closest('.ff-canvas');
  if(canvas&&canvas._snap){
    const k=canvas._snap(x,y);
    return {kind:'slot',k:k,el:canvas.querySelector(`.slot[data-key="${k}"]`)};
  }
  const slot=el.closest('.slot[data-key]');
  if(slot)return {kind:'slot',k:slot.dataset.key,el:slot};
  if(el.closest('#bench-zone'))return isBench(_drag.src)?null:{kind:'bench',el:$('bench-zone')};
  if(el.closest('#trash-zone'))return {kind:'trash',el:$('trash-zone')};
  return null;
}

function touchReset(){
  if(_touch.pending)clearTimeout(_touch.pending.timer);
  _touch.pending=null;
  _touch.scroll=0;
  if(_touch.scrollT){clearInterval(_touch.scrollT);_touch.scrollT=null;}
  if(_touch.ghost)_touch.ghost.remove();
  _touch.ghost=null;
  if(_touch.overEl)_touch.overEl.classList.remove('drag-over');
  _touch.overEl=null;
  if(_touch.active){
    document.querySelectorAll('.dragging').forEach(s=>s.classList.remove('dragging'));
    _drag=null;
    _touch.active=false;
  }
}

document.addEventListener('touchmove',e=>{
  const p=_touch.pending;
  if(!p)return;
  const t=e.touches[0];
  if(!_touch.active){
    if(Math.abs(t.clientX-p.x)+Math.abs(t.clientY-p.y)>8)touchReset();
    return;
  }
  e.preventDefault();
  touchMoveGhost(t.clientX,t.clientY);
  touchAutoScroll(t.clientY);
  if(_touch.overEl)_touch.overEl.classList.remove('drag-over');
  _touch.overEl=null;
  const tgt=touchTarget(t.clientX,t.clientY);
  if(tgt&&tgt.el&&!(tgt.kind==='slot'&&tgt.k===_drag.src)){
    tgt.el.classList.add('drag-over');
    _touch.overEl=tgt.el;
  }
},{passive:false});

document.addEventListener('touchend',e=>{
  if(!_touch.pending)return;
  if(!_touch.active){touchReset();return;}
  e.preventDefault();
  const t=e.changedTouches[0];
  const tgt=touchTarget(t.clientX,t.clientY);
  if(tgt){
    if(tgt.kind==='slot'){if(tgt.k!==_drag.src)dropOnSlot(_drag.src,tgt.k);}
    else if(tgt.kind==='bench')dropOnBench(_drag.src);
    else dropOnTrash(_drag.src);
  }
  touchReset();
},{passive:false});

document.addEventListener('touchcancel',touchReset);

function applySelectedVisual(){
  document.querySelectorAll('.slot[data-key]').forEach(el=>{
    el.classList.toggle('selected',_selected.has(el.dataset.key));
  });
}
function clearSelection(){
  if(!_selected.size)return;
  _selected.clear();
  applySelectedVisual();
}
function toggleSelect(k){
  if(_selected.has(k))_selected.delete(k);
  else _selected.add(k);
  applySelectedVisual();
}

function computeMultiOffsets(leadKey){
  const [lr,lc]=leadKey.split(',').map(Number);
  const offsets=[];
  for(const k of _selected){
    if(k===leadKey)continue;
    const [r,c]=k.split(',').map(Number);
    offsets.push({key:k,dr:r-lr,dc:c-lc});
  }
  return {leadKey,offsets};
}

function isValidSlot(k){
  const [a,b]=k.split(',').map(Number);
  return a>=0&&b>=0&&a<cur().rows&&b<(2*cur().cols-1);
}

function dropMultiOnSlot(multi,dstK){
  const [dr,dc]=dstK.split(',').map(Number);
  const moves=[{from:multi.leadKey,to:dstK}];
  for(const o of multi.offsets){
    moves.push({from:o.key,to:key(dr+o.dr,dc+o.dc)});
  }
  const sources=new Set(moves.map(m=>m.from));
  const targets=new Set();
  for(const m of moves){
    if(!isValidSlot(m.to)){toast('Move blocked — out of bounds');return;}
    if(targets.has(m.to)){toast('Move blocked — collision');return;}
    targets.add(m.to);
    const existing=getPilot(m.to);
    if(existing&&!sources.has(m.to)){toast('Move blocked — collision');return;}
  }
  const pilots=moves.map(m=>({to:m.to,pilot:getPilot(m.from)}));
  for(const m of moves)removePilot(m.from);
  for(const p of pilots)setPilot(p.to,p.pilot);
  _selected=new Set(moves.map(m=>m.to));
  _dragMoved=true;
  _suppressAnim=true;
  render();
}

function attachFreeformSnap(canvas,ff,hsX,sY,cyOffset,hxMax){
  let lastK=null;
  canvas._snap=snapKey;
  function snapKey(cx,cy){
    const rect=canvas.getBoundingClientRect();
    const x=cx-rect.left;
    const y=cy-rect.top;
    let hx=Math.round(x/hsX)-1;
    hx=Math.max(0,Math.min(hxMax-1,hx));
    let r=Math.round((y-cyOffset)/sY);
    r=Math.max(0,Math.min(ff.rows-1,r));
    return key(r,hx);
  }
  function clearHighlight(){
    if(!lastK)return;
    const el=canvas.querySelector(`.slot[data-key="${lastK}"]`);
    if(el)el.classList.remove('drag-over');
    lastK=null;
  }
  canvas.addEventListener('dragover',e=>{
    if(!_drag)return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    const k=snapKey(e.clientX,e.clientY);
    if(_drag.src===k){clearHighlight();return;}
    if(k===lastK)return;
    clearHighlight();
    const el=canvas.querySelector(`.slot[data-key="${k}"]`);
    if(el)el.classList.add('drag-over');
    lastK=k;
  });
  canvas.addEventListener('dragleave',e=>{
    const to=e.relatedTarget;
    if(!to||!canvas.contains(to))clearHighlight();
  });
  canvas.addEventListener('drop',e=>{
    e.preventDefault();
    if(!_drag){clearHighlight();return;}
    const k=snapKey(e.clientX,e.clientY);
    clearHighlight();
    if(_drag.src===k)return;
    dropOnSlot(_drag.src,k);
  });
}

function removePilot(k){
  if(isBench(k))cur().bench.splice(+k.slice(2),1);
  else delete cur().cells[k];
}
function setPilot(k,d){
  if(isBench(k))cur().bench[+k.slice(2)]=d;
  else cur().cells[k]=d;
}

function dropOnSlot(srcK,dstK){
  if(_drag&&_drag.multi){dropMultiOnSlot(_drag.multi,dstK);return;}
  const src=getPilot(srcK),dst=getPilot(dstK);
  if(!src)return;
  if(dst)setPilot(srcK,dst);else removePilot(srcK);
  setPilot(dstK,src);
  _dragMoved=true;
  _suppressAnim=true;
  if(!isBench(dstK))lastEdit=dstK;
  render();
}

function multiKeys(multi){return [multi.leadKey,...multi.offsets.map(o=>o.key)];}

function dropOnBench(srcK){
  if(_drag&&_drag.multi){
    for(const k of multiKeys(_drag.multi)){
      if(isBench(k))continue;
      const p=getPilot(k);
      if(!p)continue;
      removePilot(k);
      cur().bench.push(p);
    }
    _selected.clear();
    _dragMoved=true;
    _suppressAnim=true;
    render();
    return;
  }
  const src=getPilot(srcK);
  if(!src)return;
  if(isBench(srcK)){
    const i=+srcK.slice(2);
    cur().bench.splice(i,1);
    cur().bench.push(src);
  } else {
    delete cur().cells[srcK];
    cur().bench.push(src);
  }
  _dragMoved=true;
  _suppressAnim=true;
  render();
}

function dropOnTrash(srcK){
  if(_drag&&_drag.multi){
    for(const k of multiKeys(_drag.multi))removePilot(k);
    _selected.clear();
    _dragMoved=true;
    _suppressAnim=true;
    render();
    return;
  }
  removePilot(srcK);
  _dragMoved=true;
  _suppressAnim=true;
  render();
}

function makeBenchItem(d,i){
  const k=bkey(i);
  const el=document.createElement('button');
  el.type='button';
  el.className='bench-item';
  el.dataset.key=k;
  el.style.setProperty('--suit',d.color);
  el.setAttribute('aria-label',`Bench pilot ${d.name||'unnamed'}, ${d.color} suit, drag to formation or click to edit`);
  el.innerHTML=`<div class="slot-svg">${ws(d.color,40)}</div><div class="slot-name">${esc(d.name||'(unnamed)')}</div>`;
  el.addEventListener('click',()=>{
    if(_dragMoved){_dragMoved=false;return;}
    openModal(k);
  });
  attachDragSource(el,k);
  return el;
}

function renderBench(){
  const list=$('bench-list');
  list.innerHTML='';
  const bench=cur().bench;
  $('bench-count').textContent=bench.length;
  if(!bench.length){
    const empty=document.createElement('div');
    empty.className='bench-empty';
    empty.textContent='Drop pilots here to rest';
    list.appendChild(empty);
    return;
  }
  bench.forEach((d,i)=>list.appendChild(makeBenchItem(d,i)));
}

function shiftCells(cells,dr,dhx){
  const out={};
  for(const k in cells){
    const [r,hx]=k.split(',').map(Number);
    out[key(r+dr,hx+dhx)]=cells[k];
  }
  return out;
}

// With autofit ON the canvas fits the formation: exactly one empty row above
// and below, and one empty column (two half-steps) left and right of the
// bounding box. Cell keys shift with the refit so the formation stays compact
// and centered; returns the applied shift so callers can remap keys they hold.
// With autofit OFF (the default) the grid is a static 9x9, expanded — never
// shifted or shrunk — only when pilots sit beyond it.
function fitGrid(pt){
  if(!AF){
    let rows=9,cols=9;
    for(const k in pt.cells){
      const [r,hx]=k.split(',').map(Number);
      rows=Math.max(rows,r+1);
      while(2*cols-1<=hx)cols++;
    }
    pt.rows=rows;
    pt.cols=cols;
    return {dr:0,dhx:0};
  }
  const ks=Object.keys(pt.cells);
  if(!ks.length){
    pt.rows=5;
    pt.cols=5;
    return {dr:0,dhx:0};
  }
  let rmin=Infinity,rmax=-Infinity,hmin=Infinity,hmax=-Infinity;
  for(const k of ks){
    const [r,hx]=k.split(',').map(Number);
    if(r<rmin)rmin=r;
    if(r>rmax)rmax=r;
    if(hx<hmin)hmin=hx;
    if(hx>hmax)hmax=hx;
  }
  const dr=1-rmin,dhx=2-hmin;
  if(dr||dhx)pt.cells=shiftCells(pt.cells,dr,dhx);
  pt.rows=rmax-rmin+3;
  let hxMax=hmax-hmin+5;
  if(hxMax%2===0)hxMax++;
  pt.cols=(hxMax+1)/2;
  return {dr,dhx};
}

function renderPoints(){
  const bar=$('points-bar');
  bar.innerHTML='';
  PTS.forEach((p,i)=>{
    const chip=document.createElement('button');
    chip.type='button';
    chip.className='pt-chip'+(i===PI?' on':'');
    chip.innerHTML=`<span class="pt-num">${i+1}</span>${esc(p.name)}`;
    chip.setAttribute('aria-label',`Point ${i+1}: ${p.name}${i===PI?', active':''}`);
    chip.addEventListener('click',()=>switchPoint(i));
    bar.appendChild(chip);
  });
  const acts=document.createElement('div');
  acts.className='pt-acts';
  const mk=(label,title,fn,dis)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='pt-btn';
    b.innerHTML=label;
    b.title=title;
    b.setAttribute('aria-label',title);
    b.disabled=!!dis;
    b.addEventListener('click',fn);
    acts.appendChild(b);
  };
  mk('+ Point','Add point (copy of current)',addPoint);
  mk('&#9998;','Rename point',renamePoint);
  mk('&#9664;','Move point earlier',()=>movePoint(-1),PI===0);
  mk('&#9654;','Move point later',()=>movePoint(1),PI===PTS.length-1);
  mk('&times;','Delete point',delPoint,PTS.length<2);
  bar.appendChild(acts);
}

function render(){
  const fw=$('fw'); fw.innerHTML='';
  const sh=fitGrid(cur());
  if(sh.dr||sh.dhx){
    _selected=new Set([..._selected].map(k=>{
      const [r,hx]=k.split(',').map(Number);
      return key(r+sh.dr,hx+sh.dhx);
    }));
    if(lastEdit&&!isBench(lastEdit)){
      const [r,hx]=lastEdit.split(',').map(Number);
      lastEdit=key(r+sh.dr,hx+sh.dhx);
    }
  }
  const ff=cur();
  const cW=70,cH=80,hsX=cW/2,gY=8,sY=cH+gY;
  const EW=30,EH=30;
  const hxMax=2*ff.cols-1;
  const canW=(hxMax-1)*hsX+cW;
  const canH=ff.rows*sY-gY;
  const wrap=document.createElement('div');
  wrap.className='ff-canvas';
  wrap.style.cssText=`width:${canW}px;height:${canH}px;`;
  let i=0;
  for(let r=0;r<ff.rows;r++){
    for(let hx=0;hx<hxMax;hx++){
      const k=key(r,hx),d=ff.cells[k];
      const cx=hx*hsX+cW/2,cy=r*sY+cH/2;
      const sw=d?cW:EW,sh=d?cH:EH;
      const slot=makeSlot(k,d,i++,{left:Math.round(cx-sw/2)+'px',top:Math.round(cy-sh/2)+'px',width:sw+'px',height:sh+'px',position:'absolute'},!d);
      wrap.appendChild(slot);
    }
  }
  attachFreeformSnap(wrap,ff,hsX,sY,cH/2,hxMax);
  fw.appendChild(wrap);
  fw.classList.toggle('animate',!_suppressAnim);
  _suppressAnim=false;
  renderPoints();
  renderBench();
  applySelectedVisual();
  autosave();
  if(lastEdit){
    const target=fw.querySelector(`.slot[data-key="${lastEdit}"]`);
    if(target){
      target.style.boxShadow=`0 0 0 4px var(--color-accent-soft)`;
      setTimeout(()=>{target.style.boxShadow='';},420);
    }
    lastEdit=null;
  }
}

function renderSwatches(){
  const ctr=$('swatches');
  ctr.innerHTML=PALETTE.map(c=>
    `<button type="button" class="sw" data-c="${c}" style="--sw:${c}" aria-label="Color ${c}"></button>`
  ).join('')+
  `<input type="hidden" id="pcol" value="#1d9e75">`;
  ctr.querySelectorAll('.sw[data-c]').forEach(sw=>{
    sw.addEventListener('click',()=>{
      $('pcol').value=sw.dataset.c;
      prevUpdate();
      markActiveSwatch(sw.dataset.c);
    });
  });
}

function markActiveSwatch(color){
  const lo=color.toLowerCase();
  document.querySelectorAll('.sw[data-c]').forEach(sw=>{
    sw.classList.toggle('on',sw.dataset.c.toLowerCase()===lo);
  });
}

function showModal(id){
  lastFocused=document.activeElement;
  $(id).style.display='flex';
}
function hideModal(id){
  $(id).style.display='none';
  if(id==='modal-pilot')rkey=null;
  if(lastFocused&&typeof lastFocused.focus==='function')lastFocused.focus();
}

function openModal(k){
  ekey=k;
  rkey=null;
  $('mp-title').textContent='Assign pilot';
  const d=getPilot(k)||{};
  $('pname').value=d.name||'';
  $('pcol').value=d.color||'#1d9e75';
  prevUpdate();
  markActiveSwatch($('pcol').value);
  $('mrem').style.display=d.name?'':'none';
  showModal('modal-pilot');
  setTimeout(()=>$('pname').focus(),40);
}

function prevUpdate(){
  const n=$('pname').value.trim();
  const c=$('pcol').value;
  $('ws-prev').innerHTML=ws(c,80);
  const np=$('ws-nameplate');
  np.classList.toggle('empty',!n);
  np.innerHTML=`<span style="border-bottom-color:${n?c:'var(--color-border-tertiary)'}">${esc(n||'Pilot name')}</span>`;
}

function toast(msg){
  const t=$('toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),2200);
}

function toJSON(){
  return JSON.stringify({
    points:PTS.map((p,i)=>({name:p.name||'Point '+(i+1),cells:p.cells,bench:p.bench})),
    cur:PI,
    autofit:AF
  },null,2);
}

function clampDim(n,fallback){
  const v=typeof n==='number'?n:fallback;
  return Math.max(1,Math.min(13,v||3));
}

function normalizeForm(m,fallbackDims,withCols){
  if(!m||typeof m!=='object')m={};
  const cells={};
  if(m.cells&&typeof m.cells==='object'){
    for(const k in m.cells){
      const v=m.cells[k];
      const mm=/^(\d{1,2}),(\d{1,3})$/.exec(k);
      if(!mm||+mm[1]>60||+mm[2]>120)continue;
      if(!v||typeof v.name!=='string'||typeof v.color!=='string')continue;
      cells[k]=v;
    }
  }
  const out={
    rows:clampDim(m.rows,fallbackDims&&fallbackDims.rows),
    cells,
    bench:Array.isArray(m.bench)?m.bench.filter(p=>p&&typeof p.name==='string'&&typeof p.color==='string'):[]
  };
  if(withCols)out.cols=clampDim(m.cols,fallbackDims&&fallbackDims.cols);
  return out;
}

function parsePoint(d,defName){
  if(!d||typeof d!=='object')throw new Error('Invalid format');
  const name=(typeof d.name==='string'&&d.name.trim())?d.name.trim().slice(0,24):defName;
  if(typeof d.mode==='string'){
    const p=migratePoint(d,name);
    fitGrid(p);
    return p;
  }
  if(typeof d.cells!=='object')throw new Error('Invalid format');
  const p=normalizeForm(d,{rows:5,cols:5},true);
  p.name=name;
  fitGrid(p);
  return p;
}

// Migrate the retired multi-mode formats onto the freeform half-step grid.
// The point's saved active mode wins when it has pilots placed: regular
// (r,c) maps to (r,2c); a diamond row r with cnt slots is centered as
// hx=(w-1)-(cnt-1)+2c. Every pilot from the other modes' cells and benches
// lands on the bench (deduped), so nobody is lost in the migration.
function migratePoint(d,name){
  const mode=['regular','diamond','freeform'].includes(d.mode)?d.mode:'regular';
  const topDims={rows:d.rows,cols:d.cols};
  let reg,dia,ff;
  if(d.regular||d.diamond||d.freeform){
    reg=normalizeForm(d.regular,topDims,true);
    dia=normalizeForm(d.diamond,topDims,false);
    ff=d.freeform?normalizeForm(d.freeform,{rows:5,cols:5},true):{rows:5,cols:5,cells:{},bench:[]};
  } else if(typeof d.cells==='object'){
    const legacy=normalizeForm(d,topDims,true);
    reg={rows:legacy.rows,cols:legacy.cols,cells:{},bench:[]};
    dia={rows:legacy.rows,cells:{},bench:[]};
    ff={rows:5,cols:5,cells:{},bench:[]};
    if(mode==='regular')reg=legacy;
    else if(mode==='diamond')dia={rows:legacy.rows,cells:legacy.cells,bench:legacy.bench};
    else ff={rows:legacy.rows,cols:legacy.cols,cells:legacy.cells,bench:legacy.bench};
  } else throw new Error('Invalid format');
  const p={name,rows:5,cols:5,cells:{},bench:[]};
  if(mode==='regular'&&Object.keys(reg.cells).length){
    for(const k in reg.cells){
      const [r,c]=k.split(',').map(Number);
      p.cells[key(r,2*c)]=reg.cells[k];
    }
  } else if(mode==='diamond'&&Object.keys(dia.cells).length){
    const w=dia.rows;
    for(const k in dia.cells){
      const [r,c]=k.split(',').map(Number);
      const cnt=w-Math.abs(r-w+1);
      p.cells[key(r,(w-1)-(cnt-1)+2*c)]=dia.cells[k];
    }
  } else {
    p.cells=ff.cells;
  }
  for(const src of [ff,reg,dia]){
    for(const k in src.cells){
      const q=src.cells[k];
      if(!pilotInPoint(q.name,p))p.bench.push({name:q.name,color:q.color});
    }
    for(const q of src.bench)if(!pilotInPoint(q.name,p))p.bench.push({name:q.name,color:q.color});
  }
  return p;
}

function fromJSON(str){
  const d=JSON.parse(str);
  AF=!!d.autofit;
  $('af-chk').checked=AF;
  if(Array.isArray(d.points)){
    if(!d.points.length)throw new Error('Invalid format');
    PTS=d.points.map((pd,i)=>parsePoint(pd,'Point '+(i+1)));
    PI=Math.max(0,Math.min(PTS.length-1,typeof d.cur==='number'?d.cur|0:0));
  } else {
    PTS=[parsePoint(d,'Point 1')];
    PI=0;
  }
  S=PTS[PI];
  clearSelection();
  render();
}

renderSwatches();

$('pname').addEventListener('input',prevUpdate);
$('msav').addEventListener('click',()=>{
  const n=$('pname').value.trim(),c=$('pcol').value;
  const rk=rkey;
  if(rk){
    if(!n){toast('Pilot name required');return;}
    if(rosterHas(n)&&(rk.add||n.toLowerCase()!==rk.old.toLowerCase().trim())){
      toast(`"${n}" is already in the roster`);
      return;
    }
    if(rk.add)for(const pt of PTS)pt.bench.push({name:n,color:c});
    else rosterApply(rk.old,{name:n,color:c});
    hideModal('modal-pilot');
    renderRosterList();
    showModal('modal-roster');
    _suppressAnim=true;
    render();
    return;
  }
  const old=getPilot(ekey);
  if(n){
    // pilot identity is global: a rename/recolor from any slot or bench
    // entry rewrites every occurrence of that pilot across all points
    if(old&&n.toLowerCase()!==old.name.toLowerCase().trim()&&rosterHas(n)){
      toast(`"${n}" is already in the roster`);
      return;
    }
    rosterApply(old?old.name:n,{name:n,color:c});
    setPilot(ekey,{name:n,color:c});
    if(!isBench(ekey))lastEdit=ekey;
    if(!old&&!isBench(ekey)){
      for(const pt of PTS){
        if(pt===S)continue;
        if(!pilotInPoint(n,pt))pt.bench.push({name:n,color:c});
      }
    }
  } else removePilot(ekey);
  hideModal('modal-pilot');
  _suppressAnim=true;
  render();
});
$('mcan').addEventListener('click',()=>{
  const rk=rkey;
  hideModal('modal-pilot');
  if(rk)showModal('modal-roster');
});
$('mrem').addEventListener('click',()=>{
  const rk=rkey;
  if(rk){
    rosterRemove(rk.old);
    hideModal('modal-pilot');
    renderRosterList();
    showModal('modal-roster');
    _suppressAnim=true;
    render();
    return;
  }
  removePilot(ekey);
  hideModal('modal-pilot');
  _suppressAnim=true;
  render();
});
$('pname').addEventListener('keydown',e=>{
  if(e.key==='Enter')$('msav').click();
});

$('af-chk').addEventListener('change',e=>{
  AF=e.target.checked;
  _suppressAnim=true;
  render();
});

$('clr').addEventListener('click',()=>{cur().cells={};cur().bench=[];clearSelection();render();});

['bench-zone','trash-zone'].forEach(id=>{
  const z=$(id),onTrash=id==='trash-zone';
  z.addEventListener('dragover',e=>{
    if(!_drag)return;
    if(!onTrash&&isBench(_drag.src))return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
  });
  z.addEventListener('dragenter',()=>{
    if(!_drag)return;
    if(!onTrash&&isBench(_drag.src))return;
    z.classList.add('drag-over');
  });
  z.addEventListener('dragleave',e=>{
    if(e.target===z)z.classList.remove('drag-over');
  });
  z.addEventListener('drop',e=>{
    e.preventDefault();
    z.classList.remove('drag-over');
    if(!_drag)return;
    if(onTrash)dropOnTrash(_drag.src);
    else if(!isBench(_drag.src))dropOnBench(_drag.src);
  });
});

$('btn-export').addEventListener('click',()=>{
  $('export-area').value=toJSON();
  showModal('modal-export');
  setTimeout(()=>$('export-area').select(),40);
});
$('export-close').addEventListener('click',()=>hideModal('modal-export'));
$('export-copy').addEventListener('click',()=>{
  $('export-area').select();
  try{
    navigator.clipboard.writeText($('export-area').value).then(()=>toast('Copied to clipboard'));
  } catch(e){
    document.execCommand('copy');
    toast('Copied to clipboard');
  }
});

$('btn-import').addEventListener('click',()=>{
  $('import-area').value='';
  $('import-err').textContent='';
  showModal('modal-import');
  setTimeout(()=>$('import-area').focus(),40);
});
$('import-cancel').addEventListener('click',()=>hideModal('modal-import'));
$('import-load').addEventListener('click',()=>{
  $('import-err').textContent='';
  try{
    fromJSON($('import-area').value.trim());
    hideModal('modal-import');
    toast('Formation loaded');
  } catch(e){
    $('import-err').textContent='Invalid JSON — please paste a valid exported formation.';
  }
});
$('import-sample').addEventListener('click',async()=>{
  $('import-err').textContent='';
  try{
    const res=await fetch('sample-formation.json',{cache:'no-store'});
    if(!res.ok)throw new Error('http '+res.status);
    fromJSON(await res.text());
    hideModal('modal-import');
    toast('Sample formation loaded');
  } catch(e){
    $('import-err').textContent='Could not fetch sample-formation.json — serve the directory (e.g. python3 -m http.server) instead of opening via file://';
  }
});

const SAVES_KEY='wfp:saves';
const AUTOSAVE_KEY='wfp:autosave';
function getSaves(){
  try{return JSON.parse(localStorage.getItem(SAVES_KEY)||'{}');}
  catch(e){return {};}
}
function setSaves(o){
  try{localStorage.setItem(SAVES_KEY,JSON.stringify(o));return true;}
  catch(e){return false;}
}
function autosave(){
  try{localStorage.setItem(AUTOSAVE_KEY,toJSON());}
  catch(e){}
}
function loadAutosave(){
  const s=localStorage.getItem(AUTOSAVE_KEY);
  if(!s)return false;
  try{fromJSON(s);return true;}
  catch(e){return false;}
}

function renderSavesList(){
  const list=$('saves-list');
  const saves=getSaves();
  const names=Object.keys(saves).sort((a,b)=>a.localeCompare(b));
  list.innerHTML='';
  if(!names.length){
    const e=document.createElement('div');
    e.className='saves-empty';
    e.textContent='Nothing saved yet.';
    list.appendChild(e);
    return;
  }
  for(const n of names){
    const row=document.createElement('div');
    row.className='save-item';
    row.innerHTML=`<span class="save-name-text">${esc(n)}</span>
      <div class="save-actions">
        <button class="bprimary" data-act="load">Load</button>
        <button class="bdanger" data-act="del">Delete</button>
      </div>`;
    row.querySelector('[data-act="load"]').addEventListener('click',()=>{
      const s=getSaves();
      if(!s[n])return;
      try{
        fromJSON(s[n]);
        hideModal('modal-saves');
        toast(`Loaded "${n}"`);
      }catch(e){toast('Failed to load');}
    });
    row.querySelector('[data-act="del"]').addEventListener('click',()=>{
      const s=getSaves();
      delete s[n];
      setSaves(s);
      renderSavesList();
    });
    list.appendChild(row);
  }
}

// Roster — the union of distinct pilots (case-insensitive name) across all
// points' cells and benches. There is no separate roster store; everything is
// derived from the plan, and any pilot edit (from the roster or a slot)
// rewrites every matching occurrence so name/color never diverge.
function rosterList(){
  const map=new Map();
  const add=(p,loc)=>{
    const lo=p.name.toLowerCase().trim();
    if(!lo)return;
    let e=map.get(lo);
    if(!e){e={name:p.name,color:p.color,locs:[]};map.set(lo,e);}
    e.locs.push(loc);
  };
  PTS.forEach((pt,pi)=>{
    const pre=PTS.length>1?`P${pi+1} `:'';
    for(const k in pt.cells){
      const [r,c]=k.split(',').map(Number);
      add(pt.cells[k],pre+coordLabel(r,c));
    }
    for(const p of pt.bench)add(p,pre+'bench');
  });
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

function rosterApply(old,d){
  const lo=old.toLowerCase().trim();
  for(const pt of PTS){
    for(const k in pt.cells)
      if(pt.cells[k].name.toLowerCase().trim()===lo)pt.cells[k]={name:d.name,color:d.color};
    pt.bench.forEach((p,i)=>{
      if(p.name.toLowerCase().trim()===lo)pt.bench[i]={name:d.name,color:d.color};
    });
  }
}

function rosterRemove(old){
  const lo=old.toLowerCase().trim();
  for(const pt of PTS){
    for(const k in pt.cells)
      if(pt.cells[k].name.toLowerCase().trim()===lo)delete pt.cells[k];
    pt.bench=pt.bench.filter(p=>p.name.toLowerCase().trim()!==lo);
  }
}

function rosterHas(name){
  return PTS.some(pt=>pilotInPoint(name,pt));
}

function renderRosterList(){
  const list=$('roster-list');
  list.innerHTML='';
  const ros=rosterList();
  if(!ros.length){
    const e=document.createElement('div');
    e.className='saves-empty';
    e.textContent='No pilots yet — click a slot or add one here.';
    list.appendChild(e);
    return;
  }
  for(const p of ros){
    const row=document.createElement('div');
    row.className='save-item roster-item';
    row.innerHTML=`<span class="roster-ws" aria-hidden="true">${ws(p.color,26)}</span>
      <span class="roster-info">
        <span class="save-name-text">${esc(p.name)}</span>
        <span class="roster-locs">${p.locs.map(esc).join(' · ')}</span>
      </span>
      <div class="save-actions">
        <button class="bprimary" data-act="edit">Edit</button>
        <button class="bdanger" data-act="del">Remove</button>
      </div>`;
    row.querySelector('[data-act="edit"]').addEventListener('click',()=>{
      openRosterPilot({old:p.name},p.name,p.color);
    });
    row.querySelector('[data-act="del"]').addEventListener('click',()=>{
      rosterRemove(p.name);
      renderRosterList();
      _suppressAnim=true;
      render();
      toast(`Removed "${p.name}" from all points`);
    });
    list.appendChild(row);
  }
}

function openRosterPilot(rk,name,color){
  hideModal('modal-roster');
  rkey=rk;
  $('mp-title').textContent=rk.add?'Add pilot to roster':'Edit pilot in all points';
  $('pname').value=name||'';
  $('pcol').value=color||'#1d9e75';
  prevUpdate();
  markActiveSwatch($('pcol').value);
  $('mrem').style.display=rk.add?'none':'';
  showModal('modal-pilot');
  setTimeout(()=>$('pname').focus(),40);
}

function b64encode(str){
  const bytes=new TextEncoder().encode(str);
  let bin='';
  for(const b of bytes)bin+=String.fromCharCode(b);
  return btoa(bin).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64decode(s){
  s=s.replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4)s+='=';
  const bin=atob(s);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function shareURL(){
  const u=new URL(location.href);
  u.hash='f='+b64encode(toJSON());
  return u.toString();
}

function applyHashIfAny(){
  const m=location.hash.match(/^#f=(.+)$/);
  if(!m)return false;
  try{
    fromJSON(b64decode(m[1]));
    toast('Loaded shared formation');
    return true;
  }catch(e){
    toast('Invalid share link');
    return false;
  }
}

$('btn-saves').addEventListener('click',()=>{
  $('save-name').value='';
  renderSavesList();
  showModal('modal-saves');
  setTimeout(()=>$('save-name').focus(),40);
});
$('save-add').addEventListener('click',()=>{
  const n=$('save-name').value.trim();
  if(!n)return;
  const s=getSaves();
  s[n]=toJSON();
  if(setSaves(s)){
    $('save-name').value='';
    renderSavesList();
    toast(`Saved "${n}"`);
  } else {
    toast('Save failed — storage unavailable');
  }
});
$('save-name').addEventListener('keydown',e=>{
  if(e.key==='Enter')$('save-add').click();
});
$('saves-close').addEventListener('click',()=>hideModal('modal-saves'));

$('btn-roster').addEventListener('click',()=>{
  renderRosterList();
  showModal('modal-roster');
});
$('roster-add').addEventListener('click',()=>openRosterPilot({add:true}));
$('roster-close').addEventListener('click',()=>hideModal('modal-roster'));

$('btn-share').addEventListener('click',()=>{
  const url=shareURL();
  const done=()=>toast('Share link copied');
  try{
    navigator.clipboard.writeText(url).then(done,()=>{
      prompt('Copy this share link:',url);
    });
  }catch(e){
    prompt('Copy this share link:',url);
  }
});

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  let closedModal=false;
  ['modal-pilot','modal-export','modal-import','modal-saves','modal-roster'].forEach(id=>{
    if($(id).style.display==='flex'){hideModal(id);closedModal=true;}
  });
  if(!closedModal)clearSelection();
});

function setupRubberBand(){
  const fw=$('fw');
  let rb=null;
  fw.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    if(e.target.closest('.slot')||e.target.closest('button'))return;
    rb={startX:e.clientX,startY:e.clientY,el:null,additive:e.shiftKey,baseline:e.shiftKey?new Set(_selected):null};
    e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!rb)return;
    const dx=Math.abs(e.clientX-rb.startX),dy=Math.abs(e.clientY-rb.startY);
    if(!rb.el&&dx+dy<4)return;
    if(!rb.el){
      rb.el=document.createElement('div');
      rb.el.className='rubber-band';
      document.body.appendChild(rb.el);
    }
    const x1=Math.min(rb.startX,e.clientX),y1=Math.min(rb.startY,e.clientY);
    const x2=Math.max(rb.startX,e.clientX),y2=Math.max(rb.startY,e.clientY);
    Object.assign(rb.el.style,{position:'fixed',left:x1+'px',top:y1+'px',width:(x2-x1)+'px',height:(y2-y1)+'px'});
    const next=rb.additive?new Set(rb.baseline):new Set();
    document.querySelectorAll('.slot.filled[data-key]').forEach(slot=>{
      const r=slot.getBoundingClientRect();
      const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
      if(cx>=x1&&cx<=x2&&cy>=y1&&cy<=y2)next.add(slot.dataset.key);
    });
    _selected=next;
    applySelectedVisual();
  });
  document.addEventListener('mouseup',()=>{
    if(!rb)return;
    if(rb.el){rb.el.remove();}else{clearSelection();}
    rb=null;
  });
}
setupRubberBand();

document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click',e=>{
    if(e.target===ov)hideModal(ov.id);
  });
});

if(!applyHashIfAny()&&!loadAutosave())render();
