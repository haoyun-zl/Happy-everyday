'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const MOODS=[{name:'低落',face:'😔',score:1},{name:'有点烦',face:'😣',score:2},{name:'平静',face:'😌',score:3},{name:'还不错',face:'🙂',score:4},{name:'开心',face:'😊',score:5}];
const TAGS=['学业','工作','人际关系','亲密关系','家庭','身体状态','睡眠','独处时光','生活小事','其他'];
const KEY='xinqing.entries.v1';let entries=[],mood=null,selected=new Set(),pendingDelete=null;let breathInterval,moveInterval,audioCtx,audioStop,toneNodes=[],gain;
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3600)}
function valid(e){return e&&typeof e.id==='string'&&typeof e.date==='string'&&Number.isFinite(Date.parse(e.date))&&Number.isInteger(e.mood)&&e.mood>=0&&e.mood<5&&Number.isInteger(e.intensity)&&e.intensity>=1&&e.intensity<=10&&typeof e.note==='string'&&e.note.length<=3000&&Array.isArray(e.tags)&&e.tags.every(t=>TAGS.includes(t))}
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(saved)||!saved.every(valid))throw Error();entries=saved}catch{toast('未能读取记录，请检查浏览器存储权限；原始数据未被覆盖。');window.storageCorrupt=true}
function persist(next){try{if(window.storageCorrupt)throw Error();localStorage.setItem(KEY,JSON.stringify(next));entries=next;render();return true}catch{toast('保存失败：请检查浏览器存储空间或权限。');return false}}
function localDate(d=new Date()){return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function dayKey(d){return localDate(new Date(d)).slice(0,10)}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function sorted(){return [...entries].sort((a,b)=>new Date(b.date)-new Date(a.date))}
$('#today').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());$('#entryDate').value=localDate();$('#entryDate').max=localDate();
$('#moods').innerHTML=MOODS.map((m,i)=>`<button type="button" class="mood" data-mood="${i}" aria-pressed="false"><span class="face" aria-hidden="true">${m.face}</span>${m.name}</button>`).join('');
$('#triggers').innerHTML=TAGS.map(t=>`<button type="button" class="tag" aria-pressed="false">${t}</button>`).join('');
$$('[data-mood]').forEach(b=>b.onclick=()=>{mood=Number(b.dataset.mood);$$('[data-mood]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))})});
$$('.tag').forEach(b=>b.onclick=()=>{selected.has(b.textContent)?selected.delete(b.textContent):selected.add(b.textContent);b.classList.toggle('selected');b.setAttribute('aria-pressed',String(selected.has(b.textContent)))});
$('#intensity').oninput=e=>$('#intensityLabel').textContent=`${e.target.value} / 10`;$('#note').oninput=e=>$('#count').textContent=`${e.target.value.length} / 3000`;
$('#entryDate').onfocus=()=>$('#entryDate').max=localDate();
$('#diary').onsubmit=e=>{e.preventDefault();if(mood===null){toast('先选一个最接近此刻的心情吧。');$('[data-mood]').focus();return}const date=new Date($('#entryDate').value);if(!Number.isFinite(+date)||date>new Date()){toast('请选择有效且不晚于现在的时间。');return}const entry={id:crypto.randomUUID(),date:date.toISOString(),mood,intensity:Number($('#intensity').value),tags:[...selected],note:$('#note').value.trim()};if(persist([...entries,entry])){toast('心情已保存。谢谢你认真照顾自己。');$('#note').value='';$('#count').textContent='0 / 3000';$('#entryDate').value=localDate()}};
function show(view){if(!['journal','history','insights','care'].includes(view))view='journal';if(view!=='journal'&&document.body.classList.contains('focus-mode')){document.body.classList.remove('focus-mode');const toggle=document.querySelector('#focusToggle');toggle.setAttribute('aria-pressed','false');toggle.textContent='进入专注书写'}$$('.view').forEach(v=>v.hidden=v.id!==view);$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view!=='care'){stopBreath();stopSound();stopMove()}location.hash=view;render();window.scrollTo({top:0,behavior:'instant'})}
$$('nav button').forEach(b=>b.onclick=()=>show(b.dataset.view));window.addEventListener('hashchange',()=>show(location.hash.slice(1)));$('.brand').onclick=()=>show('journal');$('#quickBreathe').onclick=()=>{show('care');startBreath()};
$('#historyFilter').insertAdjacentHTML('beforeend',MOODS.map((m,i)=>`<option value="${i}">${m.name}</option>`).join(''));$('#historyFilter').onchange=renderHistory;$('#period').onchange=renderInsights;
function render(){const days=new Set(entries.map(e=>dayKey(e.date))).size;$('#daysCount').textContent=days;$('#entriesCount').textContent=entries.length;$('#lastEntry').textContent=entries.length?`最近记录：${new Date(sorted()[0].date).toLocaleDateString('zh-CN')} · 每一次记录都算数。`:'从第一篇日记开始认识自己。';renderHistory();renderInsights();renderCare()}
function empty(title,text){return `<div class="empty"><strong>${title}</strong><p>${text}</p></div>`}
function renderHistory(){let list=sorted().filter(e=>$('#historyFilter').value==='all'||e.mood===Number($('#historyFilter').value));$('#historyList').innerHTML=list.length?list.map(e=>`<article class="card history-entry"><div class="entry-top"><div><div class="entry-mood">${MOODS[e.mood].face} ${MOODS[e.mood].name}</div><span class="muted">${new Date(e.date).toLocaleString('zh-CN',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} · 强度 ${e.intensity}/10</span></div><button class="delete" data-delete="${escape(e.id)}" aria-label="删除这条${MOODS[e.mood].name}记录">删除</button></div><p class="entry-note">${escape(e.note||'这次没有写文字，心情也被好好记录了。')}</p><div class="entry-meta">${e.tags.map(t=>`<span class="entry-tag">${t}</span>`).join('')}</div></article>`).join(''):empty('这里，等着你的心情故事',entries.length?'这个筛选下还没有记录，试试选择全部心情。':'写下第一篇日记后，就能在这里回看。');$$('[data-delete]').forEach(b=>b.onclick=()=>{pendingDelete=b.dataset.delete;$('#deleteDialog').showModal()})}
$('#cancelDelete').onclick=()=>$('#deleteDialog').close();$('#confirmDelete').onclick=()=>{if(persist(entries.filter(e=>e.id!==pendingDelete))){$('#deleteDialog').close();toast('记录已删除。')}};
function renderInsights(){const n=Number($('#period').value),start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-n+1);const data=entries.filter(e=>new Date(e.date)>=start&&new Date(e.date)<=new Date());const days={};data.forEach(e=>(days[dayKey(e.date)]??=[]).push(MOODS[e.mood].score));const keys=Object.keys(days).sort();if(!keys.length){$('#chart').innerHTML=empty('还没有这一时段的记录','保存心情后，趋势会在这里慢慢连成线。')}else{const points=keys.map(k=>({day:k,value:days[k].reduce((a,b)=>a+b,0)/days[k].length}));const x=i=>points.length===1?280:48+i*472/(points.length-1),y=v=>205-(v-1)*40;$('#chart').innerHTML=`<svg class="chart" viewBox="0 0 560 255" role="img" aria-label="${escape(points.map(p=>p.day+'，平均心情分数'+p.value.toFixed(1)).join('；'))}">${[1,2,3,4,5].map(v=>`<line x1="45" x2="530" y1="${y(v)}" y2="${y(v)}" stroke="#e8eef2"/><text x="18" y="${y(v)+4}">${v}</text>`).join('')}<polyline points="${points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' ')}" fill="none" stroke="#5895c2" stroke-width="3" stroke-linejoin="round"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="5" fill="#fff" stroke="#5895c2" stroke-width="3"><title>${p.day}：${p.value.toFixed(1)}</title></circle>${(i===0||i===points.length-1||i%Math.ceil(points.length/5)===0)?`<text text-anchor="middle" x="${x(i)}" y="235">${p.day.slice(5).replace('-','/')}</text>`:''}`).join('')}</svg><p class="muted">共 ${data.length} 条记录 / ${keys.length} 个有记录的日子；无记录日期略过。</p>`}const counts=TAGS.map(t=>({tag:t,total:data.filter(e=>e.tags.includes(t)).length,low:data.filter(e=>e.tags.includes(t)&&e.mood<=1).length})).filter(t=>t.total).sort((a,b)=>b.total-a.total);$('#triggerChart').innerHTML=counts.length?counts.map(t=>`<div class="bar-row"><div class="bar-label"><span>${t.tag}</span><span>${t.total} 次</span></div><div class="bar-track"><div class="bar-fill" style="width:${t.total/data.length*100}%"></div></div></div>`).join(''):empty('还没有触发因素','记录心情时选几个标签，便于回看。');const low=counts.filter(t=>t.low).sort((a,b)=>b.low-a.low)[0];$('#analysis').textContent=!data.length?'从一条真实的记录开始，不必急着寻找规律。':`这段时间你记录了 ${data.length} 次心情，分布在 ${keys.length} 天。${counts.length?`「${counts[0].tag}」出现最多，共 ${counts[0].total} 次。`:'还没有选择触发因素，可以在下一次记录时添加。'}${low?`在「${low.tag}」的 ${low.total} 条记录中，有 ${low.low} 条是低落或有点烦。可以留意当时发生的具体事情，以及你真正需要的支持。`:'也可以回看心情舒展的日子，记住那些让你舒服的小事。'}${data.length<3?'目前记录较少，暂不推断稳定规律。':''}`}
function renderCare(){const latest=sorted()[0];let title='从一分钟的暂停开始',text='尝试一次自然呼吸，听一点柔和的声音，或起身舒展。选择你愿意做的就好。';if(latest){if(latest.mood<=1){title='今天可能不太轻松，先减少一点负担';text='可以先试一分钟呼吸，接着听低音量音景；如果愿意，再到安全的地方慢走几分钟。'}else if(latest.mood>=3){title='把这份轻盈，留得更久一点';text='记下一件让你开心的小事，或用五分钟散步感受身体，让愉快有一个具体的落点。'}else{title='让平静，有一个小小的延续';text='选一段舒缓音景，闭目片刻或轻柔舒展，留意当下身体的感觉。'}if(latest.tags.includes('睡眠'))text+=' 你提到了睡眠，今晚可以给自己留一段远离屏幕的放松时间。';else if(latest.tags.includes('工作')||latest.tags.includes('学业'))text+=' 你提到了工作或学业，可以先暂时离开任务与屏幕。'}$('#recommendTitle').textContent=title;$('#recommendText').textContent=text}
function stopBreath(){clearInterval(breathInterval);breathInterval=null;$('#breathOrb').classList.remove('inhale');$('#breathText').textContent='准备好了';$('#breathTimer').textContent='60 秒 · 给注意力一个落点';$('#breathe').textContent='开始呼吸练习'}
function startBreath(){stopBreath();let elapsed=0;const tick=()=>{const phase=elapsed%10;$('#breathText').textContent=phase<4?'轻轻吸气':'缓慢呼气';$('#breathOrb').classList.toggle('inhale',phase<4);$('#breathTimer').textContent=`剩余 ${60-elapsed} 秒 · 吸气 4 秒 / 呼气 6 秒`};tick();$('#breathe').textContent='结束练习';breathInterval=setInterval(()=>{elapsed++;if(elapsed>=60){stopBreath();toast('练习完成。回到自己的自然呼吸。')}else tick()},1000)}$('#breathe').onclick=()=>breathInterval?stopBreath():startBreath();
function stopSound(){clearTimeout(audioStop);toneNodes.forEach(n=>{try{n.stop()}catch{}});toneNodes=[];if(audioCtx){audioCtx.close();audioCtx=null}$('#sound').textContent='播放音景'}
async function startSound(){
try{
audioCtx=new (window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();
gain=audioCtx.createGain();gain.gain.value=Number($('#volume').value)/100*.12;gain.connect(audioCtx.destination);
const startNode=node=>{node.start();toneNodes.push(node);return node};
const noise=(color='white',seconds=4)=>{const buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*seconds,audioCtx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){const white=Math.random()*2-1;if(color==='brown'){last=(last+.02*white)/1.02;data[i]=last*3.2}else data[i]=white}const source=audioCtx.createBufferSource();source.buffer=buffer;source.loop=true;return source};
const filteredNoise=(color,type,freq,level=.6,q=.7)=>{const source=noise(color),filter=audioCtx.createBiquadFilter(),local=audioCtx.createGain();filter.type=type;filter.frequency.value=freq;filter.Q.value=q;local.gain.value=level;source.connect(filter);filter.connect(local);local.connect(gain);startNode(source);return local};
const modulate=(param,rate,depth)=>{const lfo=audioCtx.createOscillator(),amount=audioCtx.createGain();lfo.frequency.value=rate;amount.gain.value=depth;lfo.connect(amount);amount.connect(param);startNode(lfo)};
const tone=(frequency,level=.2,type='sine',detune=0)=>{const osc=audioCtx.createOscillator(),local=audioCtx.createGain();osc.type=type;osc.frequency.value=frequency;osc.detune.value=detune;local.gain.value=level;osc.connect(local);local.connect(gain);startNode(osc);return local};
switch($('#soundType').value){
case 'rain':filteredNoise('white','lowpass',1150,.64);filteredNoise('white','highpass',4200,.06);break;
case 'ocean':{const waves=filteredNoise('brown','lowpass',720,.62);waves.gain.value=.47;modulate(waves.gain,.09,.28);break}
case 'forest':{const breeze=filteredNoise('brown','bandpass',820,.48,.5);breeze.gain.value=.42;modulate(breeze.gain,.055,.18);tone(523.25,.018,'sine',-7);tone(659.25,.012,'sine',9);break}
case 'fire':filteredNoise('brown','lowpass',520,.5);filteredNoise('white','highpass',3600,.085);break;
case 'stream':{const water=filteredNoise('white','bandpass',1450,.48,.65);modulate(water.gain,.17,.12);filteredNoise('white','lowpass',3400,.16);break}
case 'bowl':tone(196,.46);tone(392,.17,'sine',4);tone(588,.07,'sine',-5);tone(784,.035,'sine',7);break;
default:[130.81,164.81,196,261.63].forEach((f,i)=>tone(f,[.24,.2,.18,.12][i]));
}
$('#sound').textContent='暂停音景';audioStop=setTimeout(stopSound,600000)
}catch{stopSound();toast('此浏览器暂不支持音频播放，请换用新版浏览器。')}}
$('#sound').onclick=()=>audioCtx?stopSound():startSound();$('#volume').oninput=e=>{if(gain&&audioCtx)gain.gain.setTargetAtTime(Number(e.target.value)/100*.12,audioCtx.currentTime,.1)};$('#soundType').onchange=()=>{if(audioCtx){stopSound();startSound()}};
function stopMove(){clearInterval(moveInterval);moveInterval=null;$('#move').textContent='开始 5 分钟活动';$('#moveStatus').textContent='按舒适程度完成，不追求强度；疼痛时停止。'}$('#move').onclick=()=>{if(moveInterval){stopMove();return}let remaining=300;function tick(){$('#move').textContent=`结束活动 · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;$('#moveStatus').textContent=remaining>240?'现在：轻轻活动肩部，放松肩颈。':remaining>60?'现在：在安全平坦的地方慢走。':'现在：在舒适范围内伸展身体。'}tick();moveInterval=setInterval(()=>{remaining--;if(remaining<=0){stopMove();toast('活动完成，感受一下现在的身体吧。')}else tick()},1000)};
$('#export').onclick=()=>{if(!entries.length){toast('还没有日记可以导出。');return}const blob=new Blob([JSON.stringify({app:'xinqing',version:1,entries},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`心晴日记备份-${dayKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error();const data=JSON.parse(await file.text());if(data.app!=='xinqing'||data.version!==1||!Array.isArray(data.entries)||!data.entries.every(valid))throw Error();const ids=new Set(entries.map(e=>e.id)),newEntries=data.entries.filter(e=>{if(ids.has(e.id))return false;ids.add(e.id);return true});if(persist([...entries,...newEntries]))toast(`已导入 ${newEntries.length} 条新记录，重复记录已跳过。`)}catch{toast('文件格式不正确或超过 10MB，请选择心晴导出的 JSON 备份。')}finally{e.target.value=''}};
window.addEventListener('pagehide',()=>{stopSound();stopBreath();stopMove()});show(location.hash.slice(1)||'journal');

// Writing mode changes only the presentation. Diary storage and records are unchanged.
const focusToggle=document.querySelector('#focusToggle');
focusToggle.addEventListener('click',()=>{const active=document.body.classList.toggle('focus-mode');focusToggle.setAttribute('aria-pressed',String(active));focusToggle.textContent=active?'退出专注书写':'进入专注书写';if(active)document.querySelector('#note').focus()});

// Optional cloud-sync layer. Local journaling remains available when the
// service is not configured or the network is temporarily unavailable.
window.xinqingApp={
  getEntries:()=>entries.map(entry=>({...entry})),
  replaceEntries:next=>{
    localStorage.setItem(KEY,JSON.stringify(next));
    entries=next;
    render();
  },
  isValidEntry:valid,
  notify:toast
};
const localPersist=persist;
persist=function(next){
  const previous=entries.map(entry=>entry.id);
  const saved=localPersist(next);
  if(saved) window.dispatchEvent(new CustomEvent('xinqing:local-change',{detail:{previous,next}}));
  return saved;
};
const cloudConfig=document.createElement('script');
cloudConfig.src='config.js';
cloudConfig.onload=()=>{
  const cloudClient=document.createElement('script');
  cloudClient.src='cloud-sync.js';
  document.body.appendChild(cloudClient);
};
document.body.appendChild(cloudConfig);
