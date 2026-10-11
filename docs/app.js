const $ = id => document.getElementById(id);
const RAW = new URLSearchParams(location.search).get('assets')==='local'?'_specimens/':'https://raw.githubusercontent.com/iebb/unicode-glyphs/main/';
const REPO = 'https://github.com/iebb/unicode-glyphs/blob/main/';
const PAGE_SIZE = 48;
const FEATURED = [0x41,0x61,0x3B1,0x416,0x5D0,0x627,0x915,0xB95,0xE01,0x3042,0xAC00,0x4E00,0x11111,0x143A3,0x1D11E,0x1F600,0x20000,0x31350,0x3D028,0x3401,0x210B,0x20AC,0x10300,0xFDD0];
const cache = new Map();
const blobCache = new Map();
let catalog, searchIndex, searchPromise;
let result = [], currentPage = 0, currentBlock = null, renderGeneration = 0, detailGeneration = 0;
let lastQuery = '', updatingHash = false;
const cpText = cp => `U+${cp.toString(16).toUpperCase().padStart(4,'0')}`;
const num = value => value.toLocaleString('en-US');
const el = (tag, cls, text) => {const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
async function json(path) {
  if (!cache.has(path)) cache.set(path, fetch(`data/${path}`).then(r=>{if(!r.ok)throw new Error(`Cannot load ${path}`);return r.json();}).catch(e=>{cache.delete(path);throw e;}));
  return cache.get(path);
}
async function record(cp) {
  const key=cp.toString(16).toUpperCase().padStart(6,'0').slice(0,4);
  try {return (await json(`shards/${key}.json`))[cp.toString(16).toUpperCase()];}
  catch {return null;}
}
async function specimenURL(path) {
  if (!blobCache.has(path)) {
    const p=(async()=>{
      const response=await fetch(RAW+path);
      if(!response.ok)throw new Error('Specimen unavailable');
      const bytes=await response.arrayBuffer();
      // Some hosts decompress SVGZ via Content-Encoding; raw GitHub returns gzip bytes.
      const header=new Uint8Array(bytes,0,Math.min(bytes.byteLength,2));
      const stream=new Blob([bytes]).stream();
      const svg=await new Response(header[0]===31&&header[1]===139?stream.pipeThrough(new DecompressionStream('gzip')):stream).blob();
      return URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    })().catch(e=>{blobCache.delete(path);throw e;});
    blobCache.set(path,p);
    // Bound decoded memory without interfering with images already in the DOM.
    if(blobCache.size>400){const [key,pending]=blobCache.entries().next().value;blobCache.delete(key);pending.then(url=>setTimeout(()=>URL.revokeObjectURL(url),120000)).catch(()=>{});}
  }
  return blobCache.get(path);
}
function image(path, cls, alt) {
  const img=el('img',cls);img.alt=alt;img.width=120;img.height=120;
  specimenURL(path).then(url=>{img.src=url;}).catch(()=>{img.classList.add('image-error');img.alt='Image unavailable — open the SVGZ file';});
  return img;
}
function setHash(values) {
  updatingHash=true;
  const hash=new URLSearchParams(values).toString();
  history.replaceState(null,'',`${location.pathname}${location.search}${hash?'#'+hash:''}`);
  updatingHash=false;
}
function drawBlocks() {
  const filter=$('block-filter').value.toLowerCase();const plane=$('plane-select').value;
  $('block-list').replaceChildren();
  for(const block of catalog.blocks){
    if(filter&&!block.name.toLowerCase().includes(filter))continue;
    if(plane!==''&&!(block.first>>16<=Number(plane)&&block.last>>16>=Number(plane)))continue;
    const button=el('button',block.id===currentBlock?'active':'');
    button.append(el('span','',block.name),el('small','',num(block.count)));
    button.addEventListener('click',()=>chooseBlock(block.id));$('block-list').append(button);
  }
}
async function chooseBlock(id, page=0) {
  currentBlock=id;currentPage=page;$('search').value='';lastQuery='';
  const block=catalog.blocks.find(b=>b.id===id);
  if(!block)return overview();
  $('collection-title').textContent=block.name;
  $('collection-range').textContent=`${cpText(block.first)}–${cpText(block.last)}`;
  result=await json(`blocks/${id}.json`);drawBlocks();await render();
  setHash({block:id,...(page?{page}:{}),...($('draft-only').checked?{draft:'1'}:{})});
}
async function overview() {
  currentBlock=null;currentPage=0;$('search').value='';lastQuery='';
  $('collection-title').textContent='Selected specimens';$('collection-range').textContent='CROSSING SCRIPTS & SYSTEMS';
  result=FEATURED;drawBlocks();await render();setHash($('draft-only').checked?{draft:'1'}:{});
}
async function allNames() {
  if(!searchPromise)searchPromise=json('search.json').then(data=>{searchIndex=data;return data;});
  return searchPromise;
}
async function search(query, page=0) {
  query=query.trim();lastQuery=query;currentPage=page;currentBlock=null;drawBlocks();
  if(!query)return overview();
  $('collection-title').textContent=`Results for “${query}”`;$('collection-range').textContent='SEARCH THE FULL REPERTOIRE';
  $('result-count').textContent='Searching…';
  let match=query.match(/^(?:U\+|0x)([0-9a-f]{1,6})$/i);
  if(!match&&/^[0-9a-f]{4,6}$/i.test(query))match=[query,query];
  if(match){const cp=parseInt(match[1],16);result=cp<=0x10FFFF&&await record(cp)?[cp]:[];}
  else if(Array.from(query).length===1){const cp=query.codePointAt(0);result=await record(cp)?[cp]:[];}
  else{
    const terms=query.toUpperCase().split(/\s+/);
    const entries=await allNames();if(lastQuery!==query)return;
    const plane=$('plane-select').value;
    result=entries.filter(([cp,name,block])=>(plane===''||cp>>16===Number(plane))&&terms.every(t=>(name+' '+block).toUpperCase().includes(t))).map(r=>r[0]);
  }
  await render();setHash({q:query,...(page?{page}:{}),...($('draft-only').checked?{draft:'1'}:{})});
}
async function render() {
  const generation=++renderGeneration;let filtered=result;
  if($('draft-only').checked){const entries=await allNames();const drafts=new Set(entries.filter(r=>r[3]).map(r=>r[0]));filtered=result.filter(cp=>drafts.has(cp));
    if(!currentBlock&&!lastQuery)filtered=entries.filter(r=>r[3]).map(r=>r[0]);}
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));currentPage=Math.max(0,Math.min(currentPage,pages-1));
  const slice=filtered.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
  const records=await Promise.all(slice.map(record));if(generation!==renderGeneration)return;
  $('glyph-grid').replaceChildren();
  for(const row of records.filter(Boolean)){
    const button=el('button',`glyph-card${row.d?' draft':''}`);button.title=`${cpText(row.c)} — ${row.n}`;
    const line=el('span','code-line');line.append(el('span','',cpText(row.c)));
    if(row.d)line.append(el('span','draft-badge','Draft'));
    else if(row.v.length>1)line.append(el('span','variant-count',`${row.v.length} forms`));
    button.append(line,image(row.v[0][0],'glyph-image',`${row.n} reference glyph`),el('span','glyph-name',row.n));
    button.addEventListener('click',()=>openDetail(row.c));$('glyph-grid').append(button);
  }
  if(!records.some(Boolean))$('glyph-grid').append(el('p','empty-state',$('draft-only').checked&&!catalog.draft?'No public draft is available. Monthly CI will check again.':'No reference specimens found. Try a codepoint or character name.'));
  $('result-count').textContent=`${num(filtered.length)} codepoints${currentBlock||lastQuery?'':' selected across the repertoire'}`;
  $('page-status').textContent=`${currentPage+1} / ${pages}`;
  $('previous').disabled=currentPage===0;$('next').disabled=currentPage>=pages-1;
}
async function openDetail(cp, hash=true) {
  const generation=++detailGeneration;const row=await record(cp);if(generation!==detailGeneration)return;
  if(!row){$('result-count').textContent=`No chart specimen for ${cpText(cp)}.`;return;}
  const detail=$('detail');detail.replaceChildren();
  const header=el('div','detail-header');const titles=el('div');
  titles.append(el('p','eyebrow',`${cpText(cp)} / ${row.b}`),el('h2',`detail-title${row.d?' draft':''}`,row.n));
  if(row.d)titles.append(el('span','draft-badge',`Draft ${catalog.draft?.version||''} — subject to change`));
  titles.append(el('p','detail-meta',`${row.t||'Noncharacter convention'} · ${row.v.length} reference ${row.v.length===1?'form':'forms'}`));header.append(titles);detail.append(header);
  const nav=el('div','detail-nav');for(const [label,delta]of[['← Previous codepoint',-1],['Next codepoint →',1]]){
    const button=el('button','',label);button.addEventListener('click',async()=>{const entries=await allNames();const pos=entries.findIndex(r=>r[0]===cp);if(entries[pos+delta])openDetail(entries[pos+delta][0]);});nav.append(button);
  }detail.append(nav);
  const variants=el('div',`variant-grid${row.d?' draft':''}`);detail.append(variants);
  function showVariants(draftForms=false){
    variants.replaceChildren();variants.classList.toggle('draft',row.d||draftForms);
    const channel=row.d||draftForms?catalog.draft:catalog.release;
    for(const variant of (draftForms?row.w:row.v)){
      const [path,identifier,page,fonts,dotted,kind]=variant;
      const card=el('div','variant');card.append(el('strong','',identifier||'Reference form'),image(path,'variant-image',row.n));
      if(row.d||draftForms)card.append(el('span','draft-badge','Draft specimen'));
      card.append(el('p','',`Font: ${fonts.join(', ')}`));
      if(dotted)card.append(el('p','','Dotted-circle chart helper retained'));
      if(kind==='noncharacter-chart-cell')card.append(el('p','','Native black-cell convention; not an assigned character'));
      const pdf=el('a','',`Original PDF · page ${page} ↗`);pdf.href=channel.base_url+`charts/CodeCharts.pdf#page=${page}`;pdf.target='_blank';pdf.rel='noopener';card.append(pdf);
      const file=el('a','','SVGZ file ↗');file.href=REPO+path;file.target='_blank';file.rel='noopener';card.append(el('br'),file);
      card.append(el('p','',path));variants.append(card);
    }
  }
  if(row.w){const label=el('label','draft-toggle');const input=el('input');input.type='checkbox';input.addEventListener('change',()=>showVariants(input.checked));label.append(input,document.createTextNode(`Show draft ${catalog.draft.version} forms`));detail.insertBefore(label,variants);}
  showVariants();
  const warning=el('p','detail-warning','Reference only. The source font licenses are highly restrictive. Viewing these specimens does not grant permission to extract, reuse, modify, or redistribute the font designs. ');const link=el('a','','Source terms →');link.href='reference-only.html';warning.append(link);detail.append(warning);
  if(!$('specimen-dialog').open)$('specimen-dialog').showModal();
  if(hash)setHash({cp:cp.toString(16).toUpperCase()});
}
async function route() {
  if(updatingHash||!catalog)return;const params=new URLSearchParams(location.hash.slice(1));
  $('draft-only').checked=params.get('draft')==='1';const page=Math.max(0,parseInt(params.get('page')||'0',10)||0);
  if(params.has('cp')){await overview();const cp=parseInt(params.get('cp'),16);if(Number.isFinite(cp)&&cp>=0&&cp<=0x10FFFF)await openDetail(cp);return;}
  if(params.has('block'))return chooseBlock(params.get('block'),page);
  if(params.has('q')){$('search').value=params.get('q');return search(params.get('q'),page);}
  return overview();
}
let debounce;
$('search').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>search($('search').value).catch(showError),220);});
$('block-filter').addEventListener('input',drawBlocks);
$('plane-select').addEventListener('change',async()=>{drawBlocks();if(lastQuery)await search(lastQuery);});
$('overview').addEventListener('click',()=>overview().catch(showError));
$('draft-only').addEventListener('change',()=>{currentPage=0;render().catch(showError);const p=new URLSearchParams(location.hash.slice(1));if($('draft-only').checked)p.set('draft','1');else p.delete('draft');setHash(Object.fromEntries(p));});
for(const [id,delta]of[['previous',-1],['next',1]])$(id).addEventListener('click',()=>{currentPage+=delta;render().catch(showError);setHash({...currentBlock!==null?{block:currentBlock}:lastQuery?{q:lastQuery}:{},page:currentPage,...($('draft-only').checked?{draft:'1'}:{})});$('collection-title').scrollIntoView({behavior:'smooth',block:'start'});});
$('close-dialog').addEventListener('click',()=>{$('specimen-dialog').close();setHash(currentBlock!==null?{block:currentBlock}:lastQuery?{q:lastQuery}:{});});
$('specimen-dialog').addEventListener('click',event=>{if(event.target===$('specimen-dialog'))$('close-dialog').click();});
$('specimen-dialog').addEventListener('cancel',()=>setHash(currentBlock!==null?{block:currentBlock}:{}));
window.addEventListener('hashchange',()=>route().catch(showError));
document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){event.preventDefault();$('search').focus();}});
function showError(error){$('glyph-grid').replaceChildren(el('p','empty-state',`${error.message}. Try reloading, or use the static All blocks navigation.`));$('result-count').textContent='Collection could not load.';}
try{
  catalog=await json('catalog.json');$('stat-codepoints').textContent=num(catalog.codepoints);$('stat-glyphs').textContent=num(catalog.svg_files);$('stat-blocks').textContent=num(catalog.blocks.length);
  $('release-version').textContent=`Unicode ${catalog.release.version} · Release`;
  $('draft-status').textContent=catalog.draft?`${catalog.draft.version} draft · ${num(catalog.draft_codepoints)} new characters in red`:'No public draft currently available';
  for(const plane of catalog.planes){const option=el('option','',`Plane ${plane} · U${plane.toString(16).toUpperCase().padStart(2,'0')}`);option.value=plane;$('plane-select').append(option);}
  const hero=await record(0x4E00);if(hero){const glyph=image(hero.v[0][0],'hero-symbol','');glyph.style.cssText='width:150px;height:150px;object-fit:contain';document.querySelector('.hero-symbol').replaceWith(glyph);}
  await route();
}catch(error){showError(error);}
