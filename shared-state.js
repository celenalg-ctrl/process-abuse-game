(function(){
  const API='https://cgyyagoxbgzneuqxcbqr.supabase.co/functions/v1/game-api-v2';
  const remote={game:null,scores:[],submissions:[]};
  let refreshing=false;
  let lastOpened=null;

  function code(){
    if(typeof state==='undefined' || !state.role) return null;
    if(state.role==='trainer') return D.trainerCode;
    const t=D.teams.find(x=>x.id===state.teamId);
    return t?.code||null;
  }

  async function call(action,payload={}){
    const c=code();
    if(!c) throw new Error('Немає коду доступу');
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code:c,...payload})});
    const j=await r.json().catch(()=>({error:'Некоректна відповідь сервера'}));
    if(!r.ok || j.error) throw new Error(j.error||'Помилка сервера');
    return j;
  }

  function roundScore(teamId,stageId){
    const row=remote.scores.find(x=>x.team_id===teamId && Number(x.stage_id)===Number(stageId) && x.published!==false);
    return row?Number(row.score)||0:null;
  }

  function totalScore(teamId){
    return remote.scores.filter(x=>x.team_id===teamId && x.published!==false).reduce((s,x)=>s+(Number(x.score)||0),0);
  }

  function applyRemote(data){
    remote.game=data.game||remote.game;
    remote.scores=Array.isArray(data.scores)?data.scores:[];
    remote.submissions=Array.isArray(data.submissions)?data.submissions:[];

    if(remote.game && typeof state!=='undefined'){
      const opened=Number(remote.game.opened_stage||0);
      state.openedStage=opened;
      if(state.viewedStage>opened) state.viewedStage=opened;
    }

    if(typeof state!=='undefined'){
      D.teams.forEach(t=>{ state.scores[t.id]=totalScore(t.id); });
      remote.submissions.forEach(s=>{
        const k=`${s.team_id}-${s.stage_id}`;
        state.answers[k]=s.answer;
        state.submitted[k]=true;
      });
      save();
    }
  }

  function patchScoreInputs(){
    if(typeof state==='undefined' || state.role!=='trainer') return;
    D.teams.forEach(t=>{
      const input=document.getElementById(`score-${t.id}`);
      if(!input) return;
      input.value=roundScore(t.id,state.viewedStage)??0;
      input.title='Бал за поточний раунд';
    });
  }

  function removeOldScoreCard(){
    const old=document.getElementById('shared-scoreboard-card');
    if(old) old.remove();
  }

  function injectSharedScores(){
    if(typeof state==='undefined' || !state.role) return;
    removeOldScoreCard();
    const aside=document.querySelector('.layout aside.stack');
    if(!aside) return;

    const stageId=state.viewedStage;
    const rows=D.teams.map(t=>({team:t,round:roundScore(t.id,stageId),total:totalScore(t.id)}));
    const anyRound=rows.some(x=>x.round!==null);
    const finalPublished=!!remote.game?.final_published;

    let html='';
    if(anyRound){
      html+=`<div class="card" id="shared-scoreboard-card"><div class="section-kicker">Проміжний рахунок</div><h3>Оцінка за цей раунд</h3><div style="display:grid;gap:8px;margin-top:12px">${rows.map(x=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#faf7f1"><strong>${escapeHtml(x.team.name)}</strong><span style="font-weight:900;color:var(--burgundy)">${x.round===null?'—':x.round}</span></div>`).join('')}</div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><div class="section-kicker">Загалом</div>${rows.map(x=>`<div style="display:flex;justify-content:space-between;margin-top:7px"><span>${escapeHtml(x.team.name)}</span><strong>${x.total}</strong></div>`).join('')}</div></div>`;
    }

    if(finalPublished){
      const sorted=[...rows].sort((a,b)=>b.total-a.total);
      html+=`<div class="card" id="shared-final-card" style="text-align:center;background:linear-gradient(180deg,#17324d,#244f70);color:#fff"><div class="section-kicker" style="color:#e6c89a">Фінал</div><h3 style="color:#fff">Підсумковий рахунок</h3><div style="display:grid;gap:8px;margin-top:14px">${sorted.map((x,i)=>`<div style="display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;background:#fff;color:#17324d"><strong>${i+1}</strong><span style="text-align:left;font-weight:800">${escapeHtml(x.team.name)}</span><strong style="font-size:22px;color:#7b2f3d">${x.total}</strong></div>`).join('')}</div>${state.role==='team'?'<button class="btn burgundy" style="margin-top:14px" onclick="window.showSharedFinalBoard()">Показати табло</button>':''}</div>`;
    }

    if(html) aside.insertAdjacentHTML('beforeend',html);
  }

  function injectTrainerLabels(){
    if(typeof state==='undefined' || state.role!=='trainer') return;
    document.querySelectorAll('.team-row').forEach(row=>{
      const inp=row.querySelector('input[id^="score-"]');
      if(!inp) return;
      const parent=inp.parentElement;
      if(parent && !parent.querySelector('.round-score-label')){
        parent.insertAdjacentHTML('afterbegin','<div class="round-score-label small muted" style="margin-bottom:5px">Бал за раунд</div>');
      }
    });
  }

  window.showSharedFinalBoard=function(){
    const rows=D.teams.map(t=>({team:t,total:totalScore(t.id)})).sort((a,b)=>b.total-a.total);
    const old=document.getElementById('shared-final-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend',`<div id="shared-final-overlay" style="position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#17324d,#244f70);display:flex;align-items:center;justify-content:center;padding:32px"><button onclick="document.getElementById('shared-final-overlay').remove()" style="position:absolute;top:20px;right:24px;width:48px;height:48px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:white;font-size:28px;cursor:pointer">×</button><div style="width:min(1100px,94vw);text-align:center;color:#fff"><div style="font-size:46px;font-weight:900">ПІДСУМКОВИЙ РАХУНОК</div><div style="font-size:21px;color:#d8e5ee;margin:8px 0 32px">Зловживання процесуальними правами</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">${rows.map((x,i)=>`<div style="background:#fff;color:#17324d;border-radius:22px;padding:28px 20px;${i===0?'border:4px solid #d6a744;':''}"><div style="font-size:18px;font-weight:900;color:#7b2f3d">${i+1} місце</div><div style="font-size:23px;font-weight:800;margin-top:12px">${escapeHtml(x.team.name)}</div><div style="font-size:72px;line-height:1;font-weight:900;color:#7b2f3d;margin:18px 0 4px">${x.total}</div><div style="color:#6e7780">балів</div></div>`).join('')}</div></div></div>`);
  };

  async function refresh(forceRender=false){
    if(refreshing || typeof state==='undefined' || !state.role) return;
    refreshing=true;
    try{
      const before=state.openedStage;
      const data=await call('get_state');
      applyRemote(data);
      if(forceRender || before!==state.openedStage){ render(); }
      setTimeout(()=>{patchScoreInputs();injectTrainerLabels();injectSharedScores();},0);
    }catch(e){ console.warn('Shared game sync:',e.message); }
    finally{refreshing=false;}
  }

  const localSubmitChoice=window.submitChoice;
  window.submitChoice=async function(id){
    const v=document.querySelector('input[name=choice]:checked')?.value;
    if(!v) return alert('Оберіть варіант');
    try{ await call('submit',{stageId:id,answer:v}); await refresh(true); }
    catch(e){ alert('Не вдалося зберегти відповідь: '+e.message); }
  };

  const localSubmitText=window.submitText;
  window.submitText=async function(id){
    const v=el('answerText')?.value.trim();
    if(!v) return alert('Введіть відповідь команди');
    try{ await call('submit',{stageId:id,answer:v}); await refresh(true); }
    catch(e){ alert('Не вдалося зберегти відповідь: '+e.message); }
  };

  window.setScore=async function(id){
    const input=el(`score-${id}`);
    const score=Number(input?.value);
    if(!Number.isFinite(score)||score<0||score>100) return alert('Введіть бал від 0 до 100');
    try{ await call('set_score',{teamId:id,stageId:state.viewedStage,score}); await refresh(true); }
    catch(e){ alert('Не вдалося зберегти бал: '+e.message); }
  };

  window.openNext=async function(){
    if(state.openedStage>=D.stages.length-1) return;
    const next=state.openedStage+1;
    try{ await call('open_stage',{stageId:next}); state.viewedStage=next; await refresh(true); }
    catch(e){ alert('Не вдалося відкрити наступний етап: '+e.message); }
  };

  window.publishSharedFinal=async function(){
    try{ await call('publish_final'); await refresh(true); window.showSharedFinalBoard(); }
    catch(e){ alert('Не вдалося опублікувати фінальний рахунок: '+e.message); }
  };

  window.GAME_SHARED={remote,call,refresh,roundScore,totalScore,isFinalPublished:()=>!!remote.game?.final_published};

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>refresh(true),300));
  setInterval(()=>refresh(false),2500);
  setInterval(()=>{patchScoreInputs();injectTrainerLabels();injectSharedScores();},1200);
})();