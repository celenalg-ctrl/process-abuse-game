(function(){
  const API='https://cgyyagoxbgzneuqxcbqr.supabase.co/functions/v1/game-content-api';
  const ORIGINAL=JSON.parse(JSON.stringify(window.GAME_DATA||{}));
  let draft=null;
  let lastRemoteStamp=null;
  let loading=false;

  function accessCode(){
    if(typeof state==='undefined'||!state.role) return null;
    if(state.role==='trainer') return D.trainerCode;
    return D.teams.find(t=>t.id===state.teamId)?.code||null;
  }

  async function call(action,payload={}){
    const code=accessCode();
    if(!code) throw new Error('Немає коду доступу');
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code,...payload})});
    const j=await r.json().catch(()=>({error:'Некоректна відповідь сервера'}));
    if(!r.ok||j.error) throw new Error(j.error||'Помилка сервера');
    return j;
  }

  function applyContent(content){
    if(!content||typeof content!=='object') return;
    Object.keys(D).forEach(k=>delete D[k]);
    Object.assign(D,JSON.parse(JSON.stringify(content)));
  }

  async function syncContent(force=false){
    if(loading||typeof state==='undefined'||!state.role) return;
    loading=true;
    try{
      const data=await call('get_content');
      if(data.content){
        const stamp=data.updated_at||JSON.stringify(data.content).length;
        if(force||stamp!==lastRemoteStamp){
          lastRemoteStamp=stamp;
          applyContent(data.content);
          if(typeof render==='function'&&!document.getElementById('trainer-editor-modal')) render();
        }
      }else if(state.role==='trainer'){
        await call('save_content',{content:ORIGINAL});
        lastRemoteStamp=Date.now();
      }
    }catch(e){ console.warn('Content editor sync:',e.message); }
    finally{ loading=false; }
  }

  function esc(v=''){return String(v).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
  function clone(v){return JSON.parse(JSON.stringify(v))}

  function field(label,value,path,textarea=false){
    return `<label class="editor-field"><span>${esc(label)}</span>${textarea?`<textarea data-editor-path="${esc(path)}">${esc(value||'')}</textarea>`:`<input data-editor-path="${esc(path)}" value="${esc(value||'')}">`}</label>`;
  }

  function stageHtml(s,i){
    const docs=(s.docs||[]).map((d,j)=>`<div class="editor-subcard"><div class="editor-subhead"><strong>Документ ${j+1}</strong><button type="button" class="btn secondary small-btn" data-remove-doc="${i}:${j}">Видалити</button></div>${field('Назва документа',d.title,`stages.${i}.docs.${j}.title`)}${field('Мета / короткий опис',d.meta,`stages.${i}.docs.${j}.meta`)}${field('Текст документа',d.body,`stages.${i}.docs.${j}.body`,true)}</div>`).join('');
    const asym=['A','B','C'].map(team=>{
      const a=s.asymmetric?.[team]||{title:'',body:''};
      return `<div class="editor-subcard"><strong>Додатковий факт, команда ${team}</strong>${field('Заголовок',a.title,`stages.${i}.asymmetric.${team}.title`)}${field('Текст',a.body,`stages.${i}.asymmetric.${team}.body`,true)}</div>`;
    }).join('');
    const options=(s.task?.options||[]).join('\n');
    return `<details class="editor-stage" ${i===0?'open':''}><summary><strong>${esc(s.kind)}. ${esc(s.title)}</strong><span>${esc(s.time||'')}</span></summary><div class="editor-stage-body">${field('Назва етапу',s.kind,`stages.${i}.kind`)}${field('Час',s.time,`stages.${i}.time`)}${field('Заголовок',s.title,`stages.${i}.title`)}${field('Міні-лекція',s.lecture||'',`stages.${i}.lecture`)}${field('Вступ / фабула етапу',s.intro,`stages.${i}.intro`,true)}<div class="editor-section-title">Завдання</div>${field('Назва завдання',s.task?.title||'',`stages.${i}.task.title`)}${field('Формулювання завдання',s.task?.prompt||'',`stages.${i}.task.prompt`,true)}${s.task?.type==='choice'?field('Варіанти відповіді, кожен з нового рядка',options,`stages.${i}.task.options_text`,true):''}<div class="editor-section-title">Документи</div>${docs}<button type="button" class="btn secondary" data-add-doc="${i}">Додати документ</button><div class="editor-section-title">Додаткові факти для команд</div>${asym}</div></details>`;
  }

  function modalHtml(){
    return `<div class="overlay" id="trainer-editor-modal"><div class="modal editor-modal"><div class="modal-bar"></div><div class="modal-content"><div class="modal-head"><div><div class="section-kicker">Редактор тренера</div><h2>Зміст суддівської симуляції</h2><p class="muted">Зміни зберігаються у Supabase і стають доступними всім командам без нового deploy.</p></div><button class="btn secondary" onclick="closeTrainerEditor()">Закрити</button></div><div class="editor-actions"><button class="btn burgundy" onclick="saveTrainerEditor()">Зберегти зміни</button><button class="btn secondary" onclick="resetTrainerEditorContent()">Повернути версію з коду</button></div><div class="editor-general"><h3>Загальні дані справи</h3>${field('Назва гри',draft.title,'title')}${field('Підзаголовок',draft.subtitle,'subtitle')}${field('Номер справи',draft.caseNo,'caseNo')}${field('Сторони',draft.parties,'parties')}${field('Предмет спору',draft.subject,'subject',true)}</div><div class="editor-stages"><h3>Етапи, фабули, завдання та документи</h3>${(draft.stages||[]).map(stageHtml).join('')}</div><div class="editor-actions bottom"><button class="btn burgundy" onclick="saveTrainerEditor()">Зберегти зміни</button></div></div></div></div>`;
  }

  function setPath(obj,path,value){
    const parts=path.split('.');
    let cur=obj;
    for(let i=0;i<parts.length-1;i++){
      const p=parts[i];
      const next=parts[i+1];
      if(cur[p]==null) cur[p]=/^\d+$/.test(next)?[]:{};
      cur=cur[p];
    }
    const last=parts[parts.length-1];
    if(last==='options_text'){
      cur.options=String(value).split('\n').map(x=>x.trim()).filter(Boolean);
    }else cur[last]=value;
  }

  window.openTrainerEditor=()=>{
    if(state.role!=='trainer') return;
    draft=clone(D);
    document.body.insertAdjacentHTML('beforeend',modalHtml());
    const modal=document.getElementById('trainer-editor-modal');
    modal.addEventListener('input',e=>{
      const p=e.target?.dataset?.editorPath;
      if(p) setPath(draft,p,e.target.value);
    });
    modal.addEventListener('click',e=>{
      const add=e.target?.dataset?.addDoc;
      if(add!==undefined){
        const i=Number(add);
        draft.stages[i].docs=draft.stages[i].docs||[];
        draft.stages[i].docs.push({id:`custom-${Date.now()}`,icon:'▤',title:'Новий документ',meta:'',tags:[],body:''});
        rerenderEditor();
        return;
      }
      const rem=e.target?.dataset?.removeDoc;
      if(rem){
        const [i,j]=rem.split(':').map(Number);
        draft.stages[i].docs.splice(j,1);
        rerenderEditor();
      }
    });
  };

  function rerenderEditor(){
    document.getElementById('trainer-editor-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend',modalHtml());
    const modal=document.getElementById('trainer-editor-modal');
    modal.addEventListener('input',e=>{const p=e.target?.dataset?.editorPath;if(p)setPath(draft,p,e.target.value)});
    modal.addEventListener('click',e=>{
      const add=e.target?.dataset?.addDoc;
      if(add!==undefined){const i=Number(add);draft.stages[i].docs=draft.stages[i].docs||[];draft.stages[i].docs.push({id:`custom-${Date.now()}`,icon:'▤',title:'Новий документ',meta:'',tags:[],body:''});rerenderEditor();return}
      const rem=e.target?.dataset?.removeDoc;if(rem){const [i,j]=rem.split(':').map(Number);draft.stages[i].docs.splice(j,1);rerenderEditor()}
    });
  }

  window.closeTrainerEditor=()=>document.getElementById('trainer-editor-modal')?.remove();

  window.saveTrainerEditor=async()=>{
    try{
      await call('save_content',{content:draft});
      applyContent(draft);
      document.getElementById('trainer-editor-modal')?.remove();
      if(typeof render==='function') render();
      alert('Зміни збережено. Команди отримають оновлений зміст автоматично.');
    }catch(e){alert('Не вдалося зберегти зміни: '+e.message)}
  };

  window.resetTrainerEditorContent=async()=>{
    if(!confirm('Повернути зміст до версії, яка зараз записана у файлі data.js?')) return;
    try{
      await call('reset_content');
      await call('save_content',{content:ORIGINAL});
      applyContent(ORIGINAL);
      draft=clone(ORIGINAL);
      rerenderEditor();
      alert('Зміст повернуто до базової версії.');
    }catch(e){alert('Не вдалося відновити зміст: '+e.message)}
  };

  function injectButton(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const actions=document.querySelector('.top-actions');
    if(!actions||document.getElementById('trainer-editor-btn')) return;
    const btn=document.createElement('button');
    btn.id='trainer-editor-btn';
    btn.className='btn secondary small-btn';
    btn.textContent='Редактор змісту';
    btn.onclick=openTrainerEditor;
    actions.insertBefore(btn,actions.lastElementChild);
  }

  function injectStyles(){
    if(document.getElementById('trainer-editor-style')) return;
    const s=document.createElement('style');
    s.id='trainer-editor-style';
    s.textContent=`.editor-modal{width:min(1180px,96vw);max-height:92vh;overflow:auto}.editor-actions{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 18px}.editor-actions.bottom{justify-content:flex-end;margin-top:22px}.editor-general,.editor-stage{border:1px solid var(--line);border-radius:16px;background:#fff}.editor-general{padding:18px;margin-bottom:18px}.editor-stage{margin:12px 0;overflow:hidden}.editor-stage>summary{display:flex;justify-content:space-between;gap:14px;cursor:pointer;padding:16px 18px;background:#f7f1e8;color:#17324d}.editor-stage-body{padding:18px}.editor-field{display:block;margin:12px 0}.editor-field>span{display:block;font-weight:800;color:#17324d;margin-bottom:6px}.editor-field input,.editor-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;background:#fff}.editor-field textarea{min-height:105px;resize:vertical}.editor-section-title{margin:22px 0 8px;font-weight:900;color:var(--burgundy);text-transform:uppercase;letter-spacing:.04em}.editor-subcard{padding:14px;border:1px solid var(--line);border-radius:12px;background:#faf7f1;margin:10px 0}.editor-subhead{display:flex;justify-content:space-between;gap:10px;align-items:center}`;
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    injectStyles();
    setTimeout(()=>syncContent(true),350);
    setInterval(injectButton,800);
    setInterval(()=>syncContent(false),5000);
  });
})();