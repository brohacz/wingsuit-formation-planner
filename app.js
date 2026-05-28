const S={rows:3,cols:3,mode:'regular',cells:{},bench:[]};
const PALETTE=['#1a1d22','#94a3b8','#f8f9fa','#d93025','#e8590c','#fcc419','#82c91e','#1d9e75','#0ca678','#15aabf','#1971c2','#4263eb','#7950f2','#d6336c'];
let ekey=null,lastEdit=null,lastFocused=null,_suppressAnim=false,_drag=null,_dragMoved=false;
function bkey(i){return 'b:'+i;}
function isBench(k){return typeof k==='string'&&k.startsWith('b:');}
function getPilot(k){return isBench(k)?S.bench[+k.slice(2)]:S.cells[k];}
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

function coordLabel(r,c){
  return S.mode==='diamond'?`R${r+1}·P${c+1}`:`R${r+1}·C${c+1}`;
}

function makeSlot(k,d,i,extra){
  const [r,c]=k.split(',').map(Number);
  const el=document.createElement('button');
  el.type='button';
  el.className='slot'+(d?' filled':'');
  el.dataset.key=k;
  el.style.setProperty('--i',i);
  if(d) el.style.setProperty('--suit',d.color);
  el.setAttribute('aria-label',d
    ?`Slot ${coordLabel(r,c)}, ${d.name||'unnamed'}, ${d.color} suit, click to edit`
    :`Slot ${coordLabel(r,c)}, empty, click to assign pilot`);
  if(extra) Object.assign(el.style,extra);
  const inner=d
    ? `<div class="slot-svg">${ws(d.color,52)}</div><div class="slot-name">${esc(d.name||'(unnamed)')}</div>`
    : `<div class="slot-cross"></div>`;
  el.innerHTML=inner;
  el.addEventListener('click',()=>{
    if(_dragMoved){_dragMoved=false;return;}
    openModal(k);
  });
  if(d) attachDragSource(el,k);
  attachSlotDropTarget(el,k);
  return el;
}

function attachDragSource(el,k){
  el.draggable=true;
  el.addEventListener('dragstart',e=>{
    _drag={src:k};
    _dragMoved=false;
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',k);
    el.classList.add('dragging');
  });
  el.addEventListener('dragend',()=>{
    el.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(s=>s.classList.remove('drag-over'));
    _drag=null;
  });
}

function attachSlotDropTarget(el,k){
  el.addEventListener('dragover',e=>{
    if(!_drag||_drag.src===k)return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
  });
  el.addEventListener('dragenter',()=>{
    if(!_drag||_drag.src===k)return;
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave',e=>{
    if(e.target===el)el.classList.remove('drag-over');
  });
  el.addEventListener('drop',e=>{
    e.preventDefault();
    el.classList.remove('drag-over');
    if(!_drag||_drag.src===k)return;
    dropOnSlot(_drag.src,k);
  });
}

function removePilot(k){
  if(isBench(k))S.bench.splice(+k.slice(2),1);
  else delete S.cells[k];
}
function setPilot(k,d){
  if(isBench(k))S.bench[+k.slice(2)]=d;
  else S.cells[k]=d;
}

function dropOnSlot(srcK,dstK){
  const src=getPilot(srcK),dst=getPilot(dstK);
  if(!src)return;
  if(dst)setPilot(srcK,dst);else removePilot(srcK);
  setPilot(dstK,src);
  _dragMoved=true;
  _suppressAnim=true;
  if(!isBench(dstK))lastEdit=dstK;
  render();
}

function dropOnBench(srcK){
  const src=getPilot(srcK);
  if(!src)return;
  if(isBench(srcK)){
    const i=+srcK.slice(2);
    S.bench.splice(i,1);
    S.bench.push(src);
  } else {
    delete S.cells[srcK];
    S.bench.push(src);
  }
  _dragMoved=true;
  _suppressAnim=true;
  render();
}

function dropOnTrash(srcK){
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
  el.innerHTML=`<div class="slot-svg">${ws(d.color,42)}</div><div class="slot-name">${esc(d.name||'(unnamed)')}</div>`;
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
  $('bench-count').textContent=S.bench.length;
  if(!S.bench.length){
    const empty=document.createElement('div');
    empty.className='bench-empty';
    empty.textContent='Drop pilots here to rest';
    list.appendChild(empty);
    return;
  }
  S.bench.forEach((d,i)=>list.appendChild(makeBenchItem(d,i)));
}

function rowCount(widest,r){
  return widest-Math.abs(r-widest+1);
}

function pilotCount(){return Object.keys(S.cells).length;}
function totalSlots(){
  if(S.mode==='diamond'){
    const w=S.rows,n=2*w-1;
    let t=0;for(let r=0;r<n;r++)t+=rowCount(w,r);
    return t;
  }
  return S.rows*S.cols;
}

function updateReadout(){
  const filled=pilotCount(),total=totalSlots();
  let layout;
  if(S.mode==='diamond'){
    const w=S.rows,n=2*w-1;
    layout=`<span class="tag">Diamond</span> <span>widest <strong>${w}</strong></span> <span class="dot">·</span> <span><strong>${n}</strong> rows</span>`;
  } else {
    layout=`<span class="tag">Grid</span> <span><strong>${S.rows}</strong> × <strong>${S.cols}</strong></span>`;
  }
  $('readout').innerHTML=`
    <span>Formation</span>
    <span class="dot">·</span>
    ${layout}
    <span class="dot">·</span>
    <span><strong>${filled}</strong>/<strong>${total}</strong> assigned</span>
  `;
}

function render(){
  const fw=$('fw'); fw.innerHTML='';
  const isDia=S.mode==='diamond';
  $('cols-ctrl').style.display=isDia?'none':'flex';
  $('cols-sep').style.display=isDia?'none':'block';
  $('rows-label').textContent=isDia?'Widest':'Rows';
  updateReadout();
  let i=0;
  if(isDia){
    const widest=S.rows,nrows=2*widest-1;
    const cW=114,cH=130,gX=8,gY=8,sX=cW+gX,sY=cH+gY;
    const canW=widest*sX,canH=nrows*sY;
    const wrap=document.createElement('div');
    wrap.style.cssText=`position:relative;width:${canW}px;height:${canH}px;`;
    const axisV=document.createElement('div');
    axisV.className='dia-axis dia-axis-v';
    axisV.style.cssText=`left:${canW/2}px;top:0;height:${canH}px;`;
    wrap.appendChild(axisV);
    const axisH=document.createElement('div');
    axisH.className='dia-axis dia-axis-h';
    axisH.style.cssText=`top:${(widest-1)*sY+cH/2}px;left:0;width:${canW}px;`;
    wrap.appendChild(axisH);
    const mark=document.createElement('div');
    mark.className='dia-mark';
    mark.textContent='widest row';
    mark.style.cssText=`top:${(widest-1)*sY+cH/2-14}px;right:6px;`;
    wrap.appendChild(mark);
    for(let r=0;r<nrows;r++){
      const cnt=rowCount(widest,r);
      const rW=cnt*sX-gX,sx=(canW-rW)/2,y=r*sY;
      for(let c=0;c<cnt;c++){
        const k=key(r,c),d=S.cells[k],x=sx+c*sX;
        const slot=makeSlot(k,d,i++,{left:Math.round(x)+'px',top:Math.round(y)+'px',width:cW+'px',height:cH+'px',position:'absolute'});
        wrap.appendChild(slot);
      }
    }
    fw.appendChild(wrap);
  } else {
    const grid=document.createElement('div');
    grid.className='rgrid';
    grid.style.cssText=`grid-template-columns:repeat(${S.cols},114px);grid-auto-rows:130px;width:${S.cols*114}px;gap:0;`;
    for(let r=0;r<S.rows;r++)
      for(let c=0;c<S.cols;c++){
        const k=key(r,c),d=S.cells[k];
        const slot=makeSlot(k,d,i++,{width:'114px',height:'130px'});
        grid.appendChild(slot);
      }
    fw.appendChild(grid);
  }
  fw.classList.toggle('animate',!_suppressAnim);
  _suppressAnim=false;
  renderBench();
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
  if(lastFocused&&typeof lastFocused.focus==='function')lastFocused.focus();
}

function openModal(k){
  ekey=k;
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
  return JSON.stringify({rows:S.rows,cols:S.cols,mode:S.mode,cells:S.cells,bench:S.bench},null,2);
}

function fromJSON(str){
  const d=JSON.parse(str);
  if(typeof d.rows!=='number'||typeof d.mode!=='string'||typeof d.cells!=='object')throw new Error('Invalid format');
  S.rows=Math.max(1,Math.min(12,d.rows));
  S.cols=Math.max(1,Math.min(12,d.cols||3));
  S.mode=d.mode==='diamond'?'diamond':'regular';
  S.cells=d.cells||{};
  S.bench=Array.isArray(d.bench)?d.bench.filter(p=>p&&typeof p.name==='string'&&typeof p.color==='string'):[];
  $('rows').value=S.rows;
  $('cols').value=S.cols;
  document.querySelectorAll('.seg-btn').forEach(b=>{
    const on=b.dataset.mode===S.mode;
    b.classList.toggle('on',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  render();
}

renderSwatches();

$('pname').addEventListener('input',prevUpdate);
$('msav').addEventListener('click',()=>{
  const n=$('pname').value.trim(),c=$('pcol').value;
  if(n){setPilot(ekey,{name:n,color:c});if(!isBench(ekey))lastEdit=ekey;}
  else removePilot(ekey);
  hideModal('modal-pilot');
  _suppressAnim=true;
  render();
});
$('mcan').addEventListener('click',()=>hideModal('modal-pilot'));
$('mrem').addEventListener('click',()=>{
  removePilot(ekey);
  hideModal('modal-pilot');
  _suppressAnim=true;
  render();
});
$('pname').addEventListener('keydown',e=>{
  if(e.key==='Enter')$('msav').click();
});

$('rows').addEventListener('change',e=>{
  S.rows=Math.max(1,Math.min(12,+e.target.value||1));
  e.target.value=S.rows;
  render();
});
$('cols').addEventListener('change',e=>{
  S.cols=Math.max(1,Math.min(12,+e.target.value||1));
  e.target.value=S.cols;
  render();
});
document.querySelectorAll('.seg-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    if(S.mode===b.dataset.mode)return;
    S.mode=b.dataset.mode;
    document.querySelectorAll('.seg-btn').forEach(x=>{
      const on=x===b;
      x.classList.toggle('on',on);
      x.setAttribute('aria-selected',on?'true':'false');
    });
    render();
  });
});
$('clr').addEventListener('click',()=>{S.cells={};S.bench=[];render();});

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

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  ['modal-pilot','modal-export','modal-import'].forEach(id=>{
    if($(id).style.display==='flex')hideModal(id);
  });
});

document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click',e=>{
    if(e.target===ov)hideModal(ov.id);
  });
});

render();
