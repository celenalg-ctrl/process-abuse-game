(function(){
  const API='https://cgyyagoxbgzneuqxcbqr.supabase.co/functions/v1/game-api-v2';
  const remote={game:null,scores:[],submissions:[]};
  let refreshing=false;

  function code(){
    if(typeof state==='undefined'||!state.role) return null;
    if(state.role==='trainer') return D.trainerCode;
    return D.teams.find(x=>x.id===state.teamId)?.code||null;
  }

  async function call(action,payload={}){
    const c=code();
    if(!c) throw new Error('Немає коду доступу');
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code:c,...payload})});
    const j=await r.json().catch(()=>({error:'Некоректна відповідь сервера'}));
    if(!r.ok||j.error) throw new Error(j.error||'Помилка сервера');
    return j;
  }

  function openedStage(){
    return Number(remote.game?.opened_stage ?? state?.openedStage ?? 0);
  }

  function scoreRow(teamId,stageId){
    return remote.scores.find(x=>x.team_id===teamId&&Number(x.stage_id)===Number(stageId))||null;
  }

  function roundScore(teamId,stageId,publishedOnly=false){
    const row=scoreRow(teamId,stageId);
    if(!row||(publishedOnly&&!row.published)) return null;
    return Number(row.score)||0;
  }

  function totalScore(teamId,publishedOnly=false){
    const maxStage=openedStage();
    return remote.scores
      .filter(x=>x.team_id===teamId)
      .filter(x=>Number(x.stage_id)<=maxStage)
      .filter(x=>!publishedOnly||x.published===true)
      .reduce((sum,x)=>sum+(Number(x.score)||0),0);
  }

  function isRoundPublished(stageId){
    if(Number(stageId)>openedStage()) return false;
    const rows=remote.scores.filter(x=>Number(x.stage_id)===Number(stageId));
    return rows.length===D.teams.length&&rows.every(x=>x.published===true);
  }

  function applyRemote(data){
    remote.game=data.game||remote.game;
    remote.scores=Array.isArray(data.scores)?data.scores:[];
    remote.submissions=Array.isArray(data.submissions)?data.submissions:[];

    if(remote.game&&typeof state!=='undefined'){
      const opened=Number(remote.game.opened_stage||0);
      state.openedStage=opened;
      if(state.viewedStage>opened) state.viewedStage=opened;
    }

    if(typeof state!=='undefined'){
      state.answers={};
      state.submitted={};
      D.teams.forEach(t=>{
        state.scores[t.id]=state.role==='trainer'?totalScore(t.id,false):totalScore(t.id,true);
      });
      remote.submissions.forEach(s=>{
        const k=`${s.team_id}-${s.stage_id}`;
        state.answers[k]=s.answer;
        state.submitted[k]=true;
      });
      save();
    }
  }

  function patchScoreInputs(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    D.teams.forEach(t=>{
      const input=document.getElementById(`score-${t.id}`);
      if(!input||document.activeElement===input) return;
      const value=roundScore(t.id,state.viewedStage,false);
      const desired=String(value===null?0:value);
      if(input.value!==desired) input.value=desired;
      input.title='Бал за поточний раунд';
    });
  }

  function injectTrainerLabels(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    document.querySelectorAll('.team-row').forEach(row=>{
      const inp=row.querySelector('input[id^="score-"]');
      if(!inp) return;
      const parent=inp.parentElement;
      if(parent&&!parent.querySelector('.round-score-label')){
        parent.insertAdjacentHTML('afterbegin','<div class="round-score-label small muted" style="margin-bottom:5px">Бал за цей раунд</div>');
      }
    });
  }

  function unlockTeamAnswerForm(){
    if(typeof state==='undefined'||state.role!=='team') return;
    const task=document.querySelector('.task-box');
    if(!task) return;
    task.querySelectorAll('textarea,input[type="radio"],button').forEach(node=>node.disabled=false);
    const submitBtn=task.querySelector('button.btn.burgundy');
    const key=`${state.teamId}-${state.viewedStage}`;
    if(submitBtn&&state.submitted[key]) submitBtn.textContent='Оновити відповідь';
    const status=task.querySelector('.status.ok');
    if(status) status.textContent='Відповідь збережено. Її можна відредагувати та подати повторно.';
  }

  function hideOldTeamScoreCard(){
    if(typeof state==='undefined'||state.role!=='team') return;
    document.querySelectorAll('.layout aside.stack .card').forEach(card=>{
      const kicker=card.querySelector('.section-kicker')?.textContent?.trim();
      const h3=card.querySelector('h3')?.textContent?.trim();
      if(kicker==='Результат'&&h3==='Бали команди') card.style.display='none';
    });
  }

  function participantSummaryHtml(){
    const stageId=state.viewedStage;
    const published=isRoundPublished(stageId);
    const finalPublished=!!remote.game?.final_published;

    if(finalPublished){
      const sorted=D.teams.map(t=>({team:t,total:totalScore(t.id,true)})).sort((a,b)=>b.total-a.total);
      return `<div class="card" id="shared-scoreboard-card"><div class="section-kicker">Підсумок</div><h3>Фінальний рахунок</h3><div style="display:grid;gap:8px;margin-top:12px">${sorted.map((x,i)=>`<div style="display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:#faf7f1"><strong style="color:var(--burgundy)">${i+1}</strong><span style="font-weight:800">${escapeHtml(x.team.name)}</span><strong style="font-size:20px;color:var(--burgundy)">${x.total}</strong></div>`).join('')}</div></div>`;
    }

    if(!published) return '';

    const rows=D.teams.map(t=>({team:t,round:roundScore(t.id,stageId,true),total:totalScore(t.id,true)}));
    return `<div class="card" id="shared-scoreboard-card"><div class="section-kicker">Проміжний рахунок</div><h3>Результат цього раунду</h3><div style="display:grid;gap:8px;margin-top:12px">${rows.map(x=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#faf7f1"><strong>${escapeHtml(x.team.name)}</strong><span style="font-weight:900;color:var(--burgundy)">${x.round}</span></div>`).join('')}</div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><div class="section-kicker">Загалом після опублікованих раундів</div>${rows.map(x=>`<div style="display:flex;justify-content:space-between;margin-top:7px"><span>${escapeHtml(x.team.name)}</span><strong>${x.total}</strong></div>`).join('')}</div></div>`;
  }

  function injectParticipantSummary(){
    if(typeof state==='undefined'||state.role!=='team') return;
    const aside=document.querySelector('.layout aside.stack');
    if(!aside) return;
    const html=participantSummaryHtml();
    const old=document.getElementById('shared-scoreboard-card');
    if(!html){if(old) old.remove();return;}
    const signature=JSON.stringify({stage:state.viewedStage,opened:openedStage(),scores:remote.scores,final:remote.game?.final_published});
    if(old&&old.dataset.signature===signature) return;
    if(old) old.remove();
    aside.insertAdjacentHTML('beforeend',html);
    const fresh=document.getElementById('shared-scoreboard-card');
    if(fresh) fresh.dataset.signature=signature;
  }

  function injectTrainerRoundControls(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const main=document.querySelector('main.container');
    if(!main) return;
    const old=document.getElementById('trainer-round-publish-card');
    const stageId=state.viewedStage;
    const rows=D.teams.map(t=>({team:t,score:roundScore(t.id,stageId,false)}));
    const allScored=rows.every(x=>x.score!==null);
    const published=isRoundPublished(stageId);
    const totals=D.teams.map(t=>({team:t,total:totalScore(t.id,false)}));
    const html=`<section class="card" id="trainer-round-publish-card" style="margin-top:20px"><div class="section-kicker">Оцінювання раунду</div><h2>${escapeHtml(stageById(stageId).kind)}: результати команд</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0">${rows.map(x=>`<div style="padding:12px;border:1px solid var(--line);border-radius:12px;background:#faf7f1"><strong>${escapeHtml(x.team.name)}</strong><div style="font-size:28px;font-weight:900;color:var(--burgundy);margin-top:6px">${x.score===null?'—':x.score}</div></div>`).join('')}</div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn burgundy" ${allScored?'':'disabled'} onclick="publishCurrentRound()">${published?'Опубліковано для команд':'Опублікувати результат раунду'}</button>${published?'<button class="btn secondary" onclick="unpublishCurrentRound()">Зняти з публікації</button>':''}<span class="small muted">${allScored?'Усі команди оцінені.':'Спочатку виставте бали всім командам.'}</span></div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><div class="section-kicker">Поточна сума тренера</div>${totals.map(x=>`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>${escapeHtml(x.team.name)}</span><strong>${x.total}</strong></div>`).join('')}</div>${stageId===D.stages[D.stages.length-1].id?`<div style="margin-top:18px"><button class="btn burgundy" ${published?'':'disabled'} onclick="publishSharedFinal()">Опублікувати фінальний рахунок</button></div>`:''}</section>`;
    if(old){if(old.outerHTML!==html) old.outerHTML=html;} else main.insertAdjacentHTML('beforeend',html);
  }

  function injectResetControl(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const main=document.querySelector('main.container');
    if(!main||document.getElementById('trainer-reset-game')) return;
    main.insertAdjacentHTML('beforeend',`<section class="card" id="trainer-reset-game" style="margin-top:20px"><div class="section-kicker">Нова гра</div><h3>Обнулити результати</h3><p class="small muted">Починає новий цикл гри: усі бали, опубліковані результати та відповіді команд очищаються, відкритим залишається лише калібрування.</p><button class="btn secondary" onclick="resetSharedGame()">Почати нову гру</button></section>`);
  }

  function updateUi(){
    patchScoreInputs();
    injectTrainerLabels();
    unlockTeamAnswerForm();
    hideOldTeamScoreCard();
    injectParticipantSummary();
    injectTrainerRoundControls();
    injectResetControl();
  }

  async function refresh(forceRender=false){
    if(refreshing||typeof state==='undefined'||!state.role) return;
    refreshing=true;
    try{
      const before=state.openedStage;
      const data=await call('get_state');
      applyRemote(data);
      if(forceRender||before!==state.openedStage) render();
      setTimeout(updateUi,0);
    }catch(e){console.warn('Shared game sync:',e.message);}
    finally{refreshing=false;}
  }

  window.submitChoice=async function(id){
    const v=document.querySelector('input[name=choice]:checked')?.value;
    if(!v) return alert('Оберіть варіант');
    try{await call('submit',{stageId:id,answer:v});await refresh(true);}catch(e){alert('Не вдалося зберегти відповідь: '+e.message);}
  };

  window.submitText=async function(id){
    const v=el('answerText')?.value.trim();
    if(!v) return alert('Введіть відповідь команди');
    try{await call('submit',{stageId:id,answer:v});await refresh(true);}catch(e){alert('Не вдалося зберегти відповідь: '+e.message);}
  };

  window.setScore=async function(id){
    const input=el(`score-${id}`);
    const score=Number(input?.value);
    if(!Number.isFinite(score)||score<0||score>100) return alert('Введіть бал від 0 до 100');
    try{await call('set_score',{teamId:id,stageId:state.viewedStage,score});await refresh(false);updateUi();}catch(e){alert('Не вдалося зберегти бал: '+e.message);}
  };

  window.publishCurrentRound=async function(){
    try{await call('publish_round',{stageId:state.viewedStage});await refresh(false);updateUi();}catch(e){alert('Не вдалося опублікувати результат раунду: '+e.message);}
  };

  window.unpublishCurrentRound=async function(){
    try{await call('unpublish_round',{stageId:state.viewedStage});await refresh(false);updateUi();}catch(e){alert('Не вдалося зняти результат з публікації: '+e.message);}
  };

  window.openNext=async function(){
    if(state.openedStage>=D.stages.length-1) return;
    const next=state.openedStage+1;
    try{await call('open_stage',{stageId:next});state.viewedStage=next;await refresh(true);}catch(e){alert('Не вдалося відкрити наступний етап: '+e.message);}
  };

  window.publishSharedFinal=async function(){
    try{await call('publish_final');await refresh(false);updateUi();}catch(e){alert('Не вдалося опублікувати фінальний рахунок: '+e.message);}
  };

  window.resetSharedGame=async function(){
    if(!confirm('Почати нову гру? Усі поточні бали, відповіді команд і опубліковані результати будуть обнулені.')) return;
    try{
      await call('reset_game');
      state.openedStage=0;
      state.viewedStage=0;
      state.answers={};
      state.submitted={};
      state.scores=Object.fromEntries(D.teams.map(t=>[t.id,0]));
      state.finalScoreboardVisible=false;
      save();
      await refresh(true);
    }catch(e){alert('Не вдалося почати нову гру: '+e.message);}
  };

  window.GAME_SHARED={remote,call,refresh,roundScore,totalScore,isRoundPublished,isFinalPublished:()=>!!remote.game?.final_published};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>refresh(true),300));
  setInterval(()=>refresh(false),2500);
  setInterval(updateUi,1200);
})();