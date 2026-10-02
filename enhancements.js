// Interface and response visibility enhancements
state.submittedAt=state.submittedAt||{};

D.stages[0].title='Зловживання чи ні?';
D.stages[0].intro='П’ять коротких ситуацій для фіксації стартової суддівської інтуїції. Це не тест на правильну відповідь: важливо побачити, де проходить межа між активною реалізацією процесуального права, спірною поведінкою та можливим зловживанням.';
D.stages[0].abuse=['Клопотання','Затягування','Відвід','Докази','Забезпечення позову'];
D.stages[0].task={
  type:'calibration',
  title:'Калібрування: 5 ситуацій',
  options:['Ні','Спірно','Має ознаки зловживання'],
  items:[
    {id:'c1',prompt:'Після відмови у клопотанні сторона подає його повторно. Предмет той самий, але додано нову фактичну обставину, яка виникла вже після попередньої ухвали.'},
    {id:'c2',prompt:'Представник просить відкласти засідання через зайнятість в іншому суді, хоча у справі є ще один належно уповноважений адвокат цієї ж сторони.'},
    {id:'c3',prompt:'За день до закінчення підготовчого провадження сторона подає 700 сторінок технічних документів і пояснює, що лише після останнього відзиву опонента стало зрозуміло їх процесуальне значення.'},
    {id:'c4',prompt:'Після відмови у першій заяві про відвід сторона подає другу. Нова заява частково повторює попередню, але посилається на висловлювання судді, зроблене вже після вирішення першого відводу.'},
    {id:'c5',prompt:'Після відмови у забезпеченні позову позивач подає нову заяву з тією самою вимогою, але посилається на корпоративну дію відповідача, вчинену вже після першої відмови.'}
  ]
};

const originalRender=render;
function applyBranding(){document.querySelectorAll('.nsju-logo,.footer-brand img').forEach(img=>{img.src='nsju-emblem.png';img.onerror=null;});}
render=function(){originalRender();applyBranding();};

function markSubmittedEnhanced(k){
  state.submitted[k]=true;
  state.submittedAt[k]=new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
  save();render();
}

window.submitCalibration=id=>{
  const s=stageById(Number(id));
  const out={};
  for(const item of s.task.items){
    const v=document.querySelector(`input[name="${item.id}"]:checked`)?.value;
    if(!v)return alert('Дайте відповідь на всі 5 ситуацій');
    out[item.id]=v;
  }
  const k=`${state.teamId}-${id}`;
  state.answers[k]=out;
  markSubmittedEnhanced(k);
};
window.submitChoice=id=>{const v=document.querySelector('input[name=choice]:checked')?.value;if(!v)return alert('Оберіть варіант');const k=`${state.teamId}-${id}`;state.answers[k]=v;markSubmittedEnhanced(k)};
window.submitText=id=>{const v=el('answerText').value.trim();if(!v)return alert('Введіть відповідь команди');const k=`${state.teamId}-${id}`;state.answers[k]=v;markSubmittedEnhanced(k)};

taskForm=function(s){
  const k=`${state.teamId}-${s.id}`;
  const existing=state.answers[k]||'';
  const done=!!state.submitted[k];
  if(s.task.type==='calibration'){
    const answers=(existing&&typeof existing==='object')?existing:{};
    const items=s.task.items.map((item,idx)=>`<div class="calibration-item"><div class="calibration-number">${idx+1}</div><div class="calibration-content"><p>${escapeHtml(item.prompt)}</p><div class="options calibration-options">${s.task.options.map(o=>`<label class="option"><input type="radio" name="${item.id}" value="${escapeHtml(o)}" ${answers[item.id]===o?'checked':''} ${done?'disabled':''}><span>${escapeHtml(o)}</span></label>`).join('')}</div></div></div>`).join('');
    return `<div class="task-box"><div class="section-kicker">Стартове калібрування</div><h3>${escapeHtml(s.task.title)}</h3><p class="muted">Оберіть один варіант для кожної ситуації.</p>${items}<button class="btn burgundy" ${done?'disabled':''} onclick="submitCalibration(${s.id})">${done?'Відповіді подано':'Подати 5 відповідей'}</button>${done?`<p class="status ok">Відповіді зафіксовано${state.submittedAt[k]?` · ${escapeHtml(state.submittedAt[k])}`:''}.</p>`:''}</div>`;
  }
  if(s.task.type==='choice')return `<div class="task-box"><div class="section-kicker">Завдання команди</div><h3>${s.task.title}</h3><p>${s.task.prompt}</p><div class="options">${s.task.options.map(o=>`<label class="option"><input type="radio" name="choice" value="${escapeHtml(o)}" ${existing===o?'checked':''} ${done?'disabled':''}><span>${escapeHtml(o)}</span></label>`).join('')}</div><button class="btn burgundy" ${done?'disabled':''} onclick="submitChoice(${s.id})">${done?'Відповідь подано':'Подати відповідь'}</button>${done?'<p class="status ok">Відповідь зафіксовано.</p>':''}</div>`;
  return `<div class="task-box"><div class="section-kicker">Завдання команди</div><h3>${s.task.title}</h3><p>${s.task.prompt}</p><div class="field"><textarea id="answerText" ${done?'disabled':''} placeholder="Введіть узгоджену позицію команди...">${escapeHtml(existing)}</textarea></div><button class="btn burgundy" ${done?'disabled':''} onclick="submitText(${s.id})">${done?'Відповідь подано':'Подати відповідь'}</button>${done?'<p class="status ok">Відповідь зафіксовано.</p>':''}</div>`;
};

function trainerAnswerHtml(s,ans){
  if(!ans)return '<span class="muted">Відповідь ще не подано</span>';
  if(s.task.type==='calibration'&&typeof ans==='object')return `<div class="calibration-results">${s.task.items.map((item,idx)=>`<div class="calibration-result-row"><span class="qnum">${idx+1}</span><div><div class="small muted">${escapeHtml(item.prompt)}</div><strong>${escapeHtml(ans[item.id]||'Без відповіді')}</strong></div></div>`).join('')}</div>`;
  return `<div class="trainer-answer-text">${escapeHtml(String(ans))}</div>`;
}

trainerView=function(){
  const s=viewed();
  const total=D.teams.length;
  const submitted=D.teams.filter(t=>state.submitted[`${t.id}-${s.id}`]).length;
  const cards=D.teams.map(t=>{
    const k=`${t.id}-${s.id}`,ans=state.answers[k],done=!!state.submitted[k],at=state.submittedAt[k];
    return `<article class="response-card ${done?'submitted':'waiting'}"><div class="response-head"><div><span class="team-badge">${t.id}</span><strong>${escapeHtml(t.name)}</strong></div><div class="response-status"><span class="status ${done?'ok':'warn'}">${done?'Подано':'Не подано'}</span>${at?`<span class="submitted-at">${escapeHtml(at)}</span>`:''}</div></div><div class="response-body">${trainerAnswerHtml(s,ans)}</div><div class="response-score"><label>Бали</label><input id="score-${t.id}" type="number" min="0" max="100" value="${state.scores[t.id]||0}"><button class="btn secondary small-btn" onclick="setScore('${t.id}')">Зберегти</button></div></article>`;
  }).join('');
  return `<div class="shell">${topbar()}<main class="container">${hero(s)}${stageNav()}<div class="trainer-grid"><div class="metric"><span class="muted small">Переглядається</span><b>${escapeHtml(s.kind)}</b><span class="small">${escapeHtml(s.title)}</span></div><div class="metric"><span class="muted small">Подали відповідь</span><b>${submitted}/${total}</b><span class="small">команд на цьому етапі</span></div><div class="metric"><span class="muted small">Наступний етап</span><b>${state.openedStage<D.stages.length-1?D.stages[state.openedStage+1].kind:'Фініш'}</b><button class="btn burgundy small-btn" style="margin-top:8px" ${state.openedStage>=D.stages.length-1?'disabled':''} onclick="openNext()">Відкрити</button></div></div><div style="height:20px"></div><div class="layout"><div class="stack"><div class="card"><div class="card-title"><div><div class="section-kicker">Відповіді команд</div><h2>${escapeHtml(s.kind)}: повний перегляд</h2></div><span class="meta-chip">${submitted}/${total} подано</span></div><div class="responses-grid">${cards}</div></div><div class="card" style="border:2px solid #7b2f3d"><div class="section-kicker">Додаткові обставини команд</div><h2 style="margin-bottom:8px">Що додатково отримала кожна команда</h2><p class="small muted" style="margin-bottom:14px">Блок доступний лише тренеру і стосується етапу, який зараз переглядається.</p><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">${D.teams.map(t=>{const a=s.asymmetric?.[t.id];return `<div class="notice ${a?'burgundy':''}" style="margin:0"><strong>${escapeHtml(t.name)}</strong>${a?`<br><b>${escapeHtml(a.title||'Додаткова обставина')}</b><br>${escapeHtml(a.body||'')}`:'<br>Додаткових обставин на цьому етапі немає.'}</div>`}).join('')}</div></div><div class="card"><div class="section-kicker">Матеріали</div><h2 style="margin-bottom:14px">Поточний пакет</h2><div class="docs">${(s.docs||[]).map(docCard).join('')||'<p class="muted">Документів немає.</p>'}</div></div></div><aside class="stack">${caseSide(s,null)}<div class="card"><div class="section-kicker">Керування</div><h3 style="margin-bottom:10px">Статус відповідей</h3><p class="small muted">Натисніть будь-який відкритий раунд або «Калібрування» у верхній шкалі. Для кожної команди видно статус і повну відповідь.</p><button class="btn secondary" onclick="resetDemo()">Скинути локальні дані</button></div></aside></div></main>${siteFooter()}</div>`;
};

window.addEventListener('storage',()=>{try{const fresh=JSON.parse(localStorage.getItem(key)||'{}');Object.assign(state,defaults,fresh);state.submittedAt=state.submittedAt||{};render();}catch(e){}});
render();