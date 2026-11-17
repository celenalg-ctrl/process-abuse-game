(function(){
  const API='https://cgyyagoxbgzneuqxcbqr.supabase.co/functions/v1/game-api-v2';
  const remote={game:null,scores:[],submissions:[],timers:[]};
  let refreshing=false;
  let serverOffsetMs=0;

  const ACCESS_KEY='processAbuseAccessCode';

  function code(){
    return sessionStorage.getItem(ACCESS_KEY)||null;
  }

  window.validateGameAccess=async function(inputCode){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_state',code:String(inputCode||'').trim()})});
    const j=await r.json().catch(()=>({error:'Некоректна відповідь сервера'}));
    if(!r.ok||j.error) throw new Error(j.error||'Помилка сервера');
    return j;
  };

  window.storeGameAccessCode=function(inputCode){
    sessionStorage.setItem(ACCESS_KEY,String(inputCode||'').trim());
  };

  window.clearGameAccessCode=function(){
    sessionStorage.removeItem(ACCESS_KEY);
  };

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

  function activeTeams(){
    const count=Math.max(2,Math.min(D.teams.length,Number(remote.game?.active_team_count||state?.activeTeamCount||D.teams.length)));
    return D.teams.slice(0,count);
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
    const ids=new Set(activeTeams().map(t=>t.id));
    const rows=remote.scores.filter(x=>Number(x.stage_id)===Number(stageId)&&ids.has(x.team_id));
    return rows.length===activeTeams().length&&rows.every(x=>x.published===true);
  }

  function applyRemote(data){
    remote.game=data.game||remote.game;
    remote.scores=Array.isArray(data.scores)?data.scores:[];
    remote.submissions=Array.isArray(data.submissions)?data.submissions:[];
    remote.timers=Array.isArray(data.timers)?data.timers:[];
    if(data.server_now){const t=Date.parse(data.server_now);if(Number.isFinite(t)) serverOffsetMs=t-Date.now();}

    if(remote.game&&typeof state!=='undefined'){
      const opened=Number(remote.game.opened_stage||0);
      state.activeTeamCount=Number(remote.game.active_team_count||D.teams.length);
      state.openedStage=opened;
      if(state.viewedStage>opened) state.viewedStage=opened;
    }

    if(typeof state!=='undefined'){
      state.answers={};
      state.submitted={};
      activeTeams().forEach(t=>{
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

  function timerRow(stageId){
    return remote.timers.find(x=>Number(x.stage_id)===Number(stageId))||null;
  }

  function submissionRow(teamId,stageId){
    return remote.submissions.find(x=>x.team_id===teamId&&Number(x.stage_id)===Number(stageId))||null;
  }

  function serverNowMs(){
    return Date.now()+serverOffsetMs;
  }

  function formatClockSeconds(totalSeconds){
    const sec=Math.max(0,Math.floor(Math.abs(totalSeconds)));
    const m=Math.floor(sec/60);
    const s=sec%60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function timerState(stageId){
    const timer=timerRow(stageId);
    if(!timer) return null;
    const deadline=Date.parse(timer.deadline_at);
    const started=Date.parse(timer.started_at);
    if(!Number.isFinite(deadline)||!Number.isFinite(started)) return null;
    const delta=Math.ceil((deadline-serverNowMs())/1000);
    return {timer,deadline,started,delta,expired:delta<0};
  }

  function submissionTiming(teamId,stageId){
    const submission=submissionRow(teamId,stageId);
    const timer=timerRow(stageId);
    if(!submission||!timer) return null;
    const submitted=Date.parse(submission.submitted_at);
    const started=Date.parse(timer.started_at);
    const deadline=Date.parse(timer.deadline_at);
    if(!Number.isFinite(submitted)||!Number.isFinite(started)||!Number.isFinite(deadline)) return null;
    const elapsed=Math.max(0,Math.round((submitted-started)/1000));
    const late=Math.max(0,Math.round((submitted-deadline)/1000));
    return {elapsed,late,onTime:late===0,submittedAt:submission.submitted_at};
  }

  function injectTeamTimer(){
    if(typeof state==='undefined'||state.role!=='team'||Number(state.viewedStage)===0) return;
    const task=document.querySelector('.task-box');
    if(!task) return;
    const ts=timerState(state.viewedStage);
    const timing=submissionTiming(state.teamId,state.viewedStage);
    let box=document.getElementById('round-timer-box');
    if(!ts){
      if(box) box.remove();
      return;
    }
    if(!box){
      box=document.createElement('div');
      box.id='round-timer-box';
      box.style.cssText='margin:0 0 16px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:#faf7f1;display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap';
      task.insertBefore(box,task.firstChild);
    }
    const total=Math.round(Number(ts.timer.duration_seconds||0)/60);
    if(timing){
      const status=timing.onTime
        ? `<strong style="color:#28704b">Подано в межах часу</strong>`
        : `<strong style="color:var(--burgundy)">Перевищення +${formatClockSeconds(timing.late)}</strong>`;
      box.innerHTML=`<div><div class="section-kicker">Час раунду</div><div style="font-weight:900;font-size:20px">${formatClockSeconds(timing.elapsed)}</div><div class="small muted">від старту до надсилання · ліміт ${total} хв</div></div><div style="text-align:right">${status}</div>`;
      return;
    }
    const value=ts.expired?`+${formatClockSeconds(-ts.delta)}`:formatClockSeconds(ts.delta);
    const label=ts.expired?'Час завершено':'Залишилось';
    const accent=ts.expired?'var(--burgundy)':(ts.delta<=120?'#9a5b13':'#17324d');
    box.innerHTML=`<div><div class="section-kicker">${label}</div><div style="font-size:30px;font-weight:900;color:${accent};font-variant-numeric:tabular-nums">${value}</div></div><div class="small muted" style="max-width:250px">${ts.expired?'Відповідь усе ще можна надіслати. Перевищення часу буде зафіксовано.':`Ліміт раунду: ${total} хв. Таймер спільний для всіх команд.`}</div>`;
  }

  function injectTrainerSubmissionTiming(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    activeTeams().forEach(t=>{
      const input=document.getElementById(`score-${t.id}`);
      const card=input?.closest('.response-card,.team-row');
      if(!card) return;
      let line=card.querySelector('.submission-timing');
      if(!line){
        line=document.createElement('div');
        line.className='submission-timing small';
        line.style.cssText='margin-top:8px;font-weight:800';
        const status=card.querySelector('.response-status')||card.children?.[0];
        if(status) status.appendChild(line); else card.appendChild(line);
      }
      const timing=submissionTiming(t.id,state.viewedStage);
      const ts=timerState(state.viewedStage);
      if(timing){
        line.style.color=timing.onTime?'#28704b':'var(--burgundy)';
        line.textContent=timing.onTime
          ? `Подано за ${formatClockSeconds(timing.elapsed)} · у межах часу`
          : `Подано за ${formatClockSeconds(timing.elapsed)} · +${formatClockSeconds(timing.late)} понад ліміт`;
      }else if(ts&&ts.expired){
        line.style.color='var(--burgundy)';
        line.textContent=`Не подано · час перевищено на +${formatClockSeconds(-ts.delta)}`;
      }else if(ts){
        line.style.color='#6b7280';
        line.textContent=`Не подано · залишилось ${formatClockSeconds(ts.delta)}`;
      }else{
        line.textContent='';
      }
    });
  }

  function injectTrainerTimerControls(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const grid=document.querySelector('.trainer-grid');
    if(!grid) return;

    const next=Number(state.openedStage)+1;
    const nextMetric=grid.querySelector('.metric:nth-child(3)');
    if(nextMetric&&next<=D.stages.length-1&&!nextMetric.querySelector('#next-stage-duration-minutes')){
      const wrap=document.createElement('div');
      wrap.style.cssText='margin-top:9px;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
      wrap.innerHTML='<label class="small muted" for="next-stage-duration-minutes">Час:</label><input id="next-stage-duration-minutes" type="number" min="1" max="120" value="15" style="width:66px;padding:6px 8px;border:1px solid var(--line);border-radius:8px"><span class="small muted">хв</span>';
      const btn=nextMetric.querySelector('button');
      if(btn) nextMetric.insertBefore(wrap,btn);
      else nextMetric.appendChild(wrap);
    }

    let card=document.getElementById('trainer-live-timer');
    const ts=timerState(state.openedStage);
    if(Number(state.openedStage)===0||!ts){
      if(card) card.remove();
      return;
    }
    if(!card){
      card=document.createElement('section');
      card.id='trainer-live-timer';
      card.className='card';
      card.style.cssText='margin-top:20px;border:2px solid #17324d';
      grid.insertAdjacentElement('afterend',card);
    }
    const value=ts.expired?`+${formatClockSeconds(-ts.delta)}`:formatClockSeconds(ts.delta);
    card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap"><div><div class="section-kicker">Таймер поточного раунду</div><h3 style="margin:4px 0">${escapeHtml(stageById(state.openedStage).kind)} · <span style="font-variant-numeric:tabular-nums;color:${ts.expired?'var(--burgundy)':'#17324d'}">${value}</span></h3><div class="small muted">${ts.expired?'Час вичерпано, відповіді приймаються з фіксацією перевищення.':`Встановлено ${Math.round(Number(ts.timer.duration_seconds)/60)} хв.`}</div></div><button class="btn secondary" onclick="extendCurrentTimer(5)">+5 хвилин</button></div>`;
  }

  function patchScoreInputs(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    activeTeams().forEach(t=>{
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
      const sorted=activeTeams().map(t=>({team:t,total:totalScore(t.id,true)})).sort((a,b)=>b.total-a.total);
      return `<div class="card" id="shared-scoreboard-card"><div class="section-kicker">Підсумок</div><h3>Фінальний рахунок</h3><div style="display:grid;gap:8px;margin-top:12px">${sorted.map((x,i)=>`<div style="display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:#faf7f1"><strong style="color:var(--burgundy)">${i+1}</strong><span style="font-weight:800">${escapeHtml(x.team.name)}</span><strong style="font-size:20px;color:var(--burgundy)">${x.total}</strong></div>`).join('')}</div></div>`;
    }

    if(!published) return '';

    const rows=activeTeams().map(t=>({team:t,round:roundScore(t.id,stageId,true),total:totalScore(t.id,true)}));
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
    const rows=activeTeams().map(t=>({team:t,score:roundScore(t.id,stageId,false)}));
    const allScored=rows.every(x=>x.score!==null);
    const published=isRoundPublished(stageId);
    const totals=activeTeams().map(t=>({team:t,total:totalScore(t.id,false)}));
    const html=`<section class="card" id="trainer-round-publish-card" style="margin-top:20px"><div class="section-kicker">Оцінювання раунду</div><h2>${escapeHtml(stageById(stageId).kind)}: результати команд</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0">${rows.map(x=>`<div style="padding:12px;border:1px solid var(--line);border-radius:12px;background:#faf7f1"><strong>${escapeHtml(x.team.name)}</strong><div style="font-size:28px;font-weight:900;color:var(--burgundy);margin-top:6px">${x.score===null?'—':x.score}</div></div>`).join('')}</div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn burgundy" ${allScored?'':'disabled'} onclick="publishCurrentRound()">${published?'Опубліковано для команд':'Опублікувати результат раунду'}</button>${published?'<button class="btn secondary" onclick="unpublishCurrentRound()">Зняти з публікації</button>':''}<span class="small muted">${allScored?'Усі команди оцінені.':'Спочатку виставте бали всім командам.'}</span></div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><div class="section-kicker">Поточна сума тренера</div>${totals.map(x=>`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>${escapeHtml(x.team.name)}</span><strong>${x.total}</strong></div>`).join('')}</div>${stageId===D.stages[D.stages.length-1].id?`<div style="margin-top:18px"><button class="btn burgundy" ${published?'':'disabled'} onclick="publishSharedFinal()">Опублікувати фінальний рахунок</button></div>`:''}</section>`;
    if(old){if(old.outerHTML!==html) old.outerHTML=html;} else main.insertAdjacentHTML('beforeend',html);
  }

  function injectResetControl(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const main=document.querySelector('main.container');
    if(!main||document.getElementById('trainer-reset-game')) return;
    const selected=activeTeams().length;
    const target=main.querySelector('.trainer-grid');
    const html=`<section class="card" id="trainer-reset-game" style="margin-top:20px"><div class="section-kicker">Нова гра</div><h3>Почати нову симуляцію</h3><p class="small muted">Перед початком оберіть кількість команд. На табло, в оцінюванні та підсумках відображатимуться лише активні команди.</p><div class="field" style="max-width:260px"><label for="active-team-count">Кількість команд</label><select id="active-team-count" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff"><option value="2" ${selected===2?'selected':''}>2 команди</option><option value="3" ${selected===3?'selected':''}>3 команди</option><option value="4" ${selected===4?'selected':''}>4 команди</option></select></div><button class="btn secondary" onclick="resetSharedGame()">Почати нову гру</button></section>`;
    if(target) target.insertAdjacentHTML('afterend',html); else main.insertAdjacentHTML('afterbegin',html);
  }

  function updateUi(){
    patchScoreInputs();
    injectTrainerLabels();
    hideOldTeamScoreCard();
    injectParticipantSummary();
    injectTrainerRoundControls();
    injectTrainerTimerControls();
    injectTrainerSubmissionTiming();
    injectTeamTimer();
    injectResetControl();
  }

  async function refresh(forceRender=false){
    if(refreshing||typeof state==='undefined'||!state.role) return;
    refreshing=true;
    try{
      const before=state.openedStage;
      const data=await call('get_state');
      applyRemote(data);
      if(before!==state.openedStage && typeof window.syncGameContent==='function'){
        await window.syncGameContent(true);
      }
      if(forceRender||before!==state.openedStage) render();
      setTimeout(updateUi,0);
    }catch(e){
      if(state?.role==='team'&&String(e.message).includes('не бере участі')){
        alert(e.message);
        state.role=null; state.teamId=null; save(); render();
      }else console.warn('Shared game sync:',e.message);
    }
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
    const minutes=Number(document.getElementById('next-stage-duration-minutes')?.value||15);
    if(!Number.isFinite(minutes)||minutes<1||minutes>120) return alert('Встановіть час раунду від 1 до 120 хвилин');
    try{await call('open_stage',{stageId:next,durationSeconds:Math.round(minutes*60)});state.viewedStage=next;await refresh(true);}catch(e){alert('Не вдалося відкрити наступний етап: '+e.message);}
  };

  window.extendCurrentTimer=async function(minutes=5){
    if(Number(state.openedStage)===0) return;
    try{await call('extend_timer',{stageId:state.openedStage,addSeconds:Math.round(Number(minutes)*60)});await refresh(false);updateUi();}catch(e){alert('Не вдалося додати час: '+e.message);}
  };

  window.publishSharedFinal=async function(){
    try{await call('publish_final');await refresh(false);updateUi();}catch(e){alert('Не вдалося опублікувати фінальний рахунок: '+e.message);}
  };

  window.resetSharedGame=async function(){
    if(!confirm('Почати нову гру? Усі поточні бали, відповіді команд і опубліковані результати будуть обнулені.')) return;
    try{
      const teamCount=Number(document.getElementById('active-team-count')?.value||activeTeams().length);
      await call('reset_game',{teamCount});
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

  window.GAME_SHARED={remote,call,refresh,roundScore,totalScore,isRoundPublished,activeTeams,timerRow,timerState,submissionTiming,isFinalPublished:()=>!!remote.game?.final_published};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>refresh(true),300));
  setInterval(()=>refresh(false),2500);
  setInterval(updateUi,1200);
})();