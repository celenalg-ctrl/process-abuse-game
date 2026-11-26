(function(){
  const API='https://cgyyagoxbgzneuqxcbqr.supabase.co/functions/v1/game-api-v2';
  const remote={game:null,scores:[],submissions:[],timers:[]};
  let refreshing=false;
  let serverOffsetMs=0;
  let audioCtx=null;
  let audioUnlocked=false;
  let audioStage=null;
  let lastTickSecond=null;
  let previousTimerDelta=null;
  let syncFailures=0;

  const ACCESS_KEY='processAbuseAccessCode';
  const FINAL_CELEBRATION_KEY='processAbuseFinalCelebrationShown';

  function code(){
    return sessionStorage.getItem(ACCESS_KEY)||null;
  }

  async function fetchApi(body,timeoutMs=12000){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      return await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    }catch(e){
      if(e?.name==='AbortError') throw new Error('Сервер не відповів вчасно. Спробуйте ще раз.');
      throw e;
    }finally{
      clearTimeout(timeout);
    }
  }

  window.validateGameAccess=async function(inputCode){
    const r=await fetchApi({action:'get_state',code:String(inputCode||'').trim().toUpperCase().replace(/[\s–—]+/g,'-')});
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
    const r=await fetchApi({action,code:c,...payload});
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

  function rawRoundScore(teamId,stageId){
    const row=scoreRow(teamId,stageId);
    if(!row) return null;
    const raw=Number(row.raw_score);
    return Number.isFinite(raw)?raw:Number(row.score)||0;
  }

  function roundTimePenalty(teamId,stageId){
    const row=scoreRow(teamId,stageId);
    if(!row) return 0;
    return Math.max(0,Number(row.time_penalty)||0);
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

  function finalRanking(){
    const published=!!remote.game?.final_published;
    return activeTeams()
      .map(t=>({team:t,total:totalScore(t.id,published)}))
      .sort((a,b)=>b.total-a.total||String(a.team.id).localeCompare(String(b.team.id)));
  }

  function closeFinalCelebration(){
    document.getElementById('final-celebration')?.remove();
  }

  function launchFinalCelebration(force=false){
    if(typeof state==='undefined'||!state.role) return;
    if(!force && sessionStorage.getItem(FINAL_CELEBRATION_KEY)==='1') return;

    const ranked=finalRanking();
    if(!ranked.length) return;
    if(!force) sessionStorage.setItem(FINAL_CELEBRATION_KEY,'1');

    closeFinalCelebration();

    const first=ranked[0]||null;
    const second=ranked[1]||null;
    const third=ranked[2]||null;
    const rest=ranked.slice(3);

    const podiumItem=(x,place,cls)=>{
      if(!x) return `<div class="final-podium-slot empty"></div>`;
      const medal=place===1?'🥇':place===2?'🥈':'🥉';
      return `<div class="final-podium-slot ${cls}">
        <div class="final-medal">${medal}</div>
        <div class="final-team-name">${escapeHtml(x.team.name)}</div>
        <div class="final-team-score">${x.total}</div>
        <div class="final-score-label">балів</div>
        <div class="final-podium-block"><strong>${place}</strong><span>місце</span></div>
      </div>`;
    };

    const confetti=Array.from({length:72},(_,i)=>{
      const left=(i*37)%100;
      const delay=((i*13)%24)/10;
      const dur=3.2+((i*7)%20)/10;
      const drift=((i%9)-4)*18;
      return `<i class="final-confetti c${i%6}" style="left:${left}%;--delay:${delay}s;--dur:${dur}s;--drift:${drift}px"></i>`;
    }).join('');

    const restHtml=rest.length?`<div class="final-rest">${rest.map((x,i)=>`<div><span>${i+4} місце</span><strong>${escapeHtml(x.team.name)}</strong><b>${x.total}</b></div>`).join('')}</div>`:'';

    const html=`<div id="final-celebration" class="final-celebration" role="dialog" aria-modal="true" aria-label="Фінальний рахунок">
      <div class="final-firework fw1"></div><div class="final-firework fw2"></div><div class="final-firework fw3"></div>
      <div class="final-confetti-layer">${confetti}</div>
      <button class="final-celebration-close" onclick="closeFinalCelebration()" aria-label="Закрити">×</button>
      <div class="final-celebration-inner">
        <div class="final-celebration-kicker">ФІНАЛ</div>
        <h1>Вітаємо команди!</h1>
        <p>Підсумковий рахунок гри</p>
        <div class="final-podium">
          ${podiumItem(second,2,'second')}
          ${podiumItem(first,1,'first')}
          ${podiumItem(third,3,'third')}
        </div>
        ${restHtml}
        <button class="btn final-celebration-button" onclick="closeFinalCelebration()">Переглянути результати</button>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend',html);
  }

  window.closeFinalCelebration=closeFinalCelebration;
  window.showSharedFinalBoard=()=>launchFinalCelebration(true);

  function applyRemote(data){
    const wasFinalPublished=!!remote.game?.final_published;
    remote.game=data.game||remote.game;
    const isFinalPublishedNow=!!remote.game?.final_published;
    if(!isFinalPublishedNow) sessionStorage.removeItem(FINAL_CELEBRATION_KEY);
    if(!wasFinalPublished && isFinalPublishedNow){
      setTimeout(()=>launchFinalCelebration(false),120);
    }
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
    const rawDelta=Math.ceil((deadline-serverNowMs())/1000);
    const delta=Math.max(-300,rawDelta);
    return {timer,deadline,started,delta,rawDelta,expired:rawDelta<0,overtimeStopped:rawDelta<=-300};
  }

  function submissionTiming(teamId,stageId){
    const submission=submissionRow(teamId,stageId);
    if(!submission) return null;
    const storedElapsed=Number(submission.elapsed_seconds);
    const storedLate=Number(submission.late_by_seconds);
    if(Number.isFinite(storedElapsed)&&storedElapsed>=0&&Number.isFinite(storedLate)&&storedLate>=0){
      const late=Math.min(300,storedLate);
      const timer=timerRow(stageId);
      const baseDuration=timer?Math.max(0,Math.round((Date.parse(timer.deadline_at)-Date.parse(timer.started_at))/1000)):null;
      const elapsed=Number.isFinite(baseDuration)?Math.min(storedElapsed,baseDuration+300):storedElapsed;
      return {elapsed,late,onTime:late===0,submittedAt:submission.submitted_at};
    }
    const timer=timerRow(stageId);
    if(!timer) return null;
    const submitted=Date.parse(submission.submitted_at);
    const started=Date.parse(timer.started_at);
    const deadline=Date.parse(submission.timer_deadline_at||timer.deadline_at);
    if(!Number.isFinite(submitted)||!Number.isFinite(started)||!Number.isFinite(deadline)) return null;
    const baseDuration=Math.max(0,Math.round((deadline-started)/1000));
    const elapsed=Math.min(Math.max(0,Math.round((submitted-started)/1000)),baseDuration+300);
    const late=Math.min(300,Math.max(0,Math.round((submitted-deadline)/1000)));
    return {elapsed,late,onTime:late===0,submittedAt:submission.submitted_at};
  }

  function unlockTimerAudio(){
    if(audioUnlocked) return;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx) return;
      audioCtx=audioCtx||new Ctx();
      if(audioCtx.state==='suspended') audioCtx.resume();
      audioUnlocked=true;
    }catch(e){}
  }

  function playTone(freq,duration=0.08,volume=0.05,type='square'){
    if(!audioUnlocked||!audioCtx) return;
    try{
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      osc.type=type;
      osc.frequency.setValueAtTime(freq,audioCtx.currentTime);
      gain.gain.setValueAtTime(volume,audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime+duration);
    }catch(e){}
  }

  function playTick(){
    // Виразний, але короткий "тик" для останніх 10 секунд.
    playTone(1250,0.07,0.075,'square');
  }

  function playTimeUpSignal(){
    // Однорідний нижчий сигнал завершення: 5 однакових ударів + довгий фінал.
    const freq=620;
    playTone(freq,0.15,0.15,'square');
    setTimeout(()=>playTone(freq,0.15,0.15,'square'),250);
    setTimeout(()=>playTone(freq,0.15,0.15,'square'),500);
    setTimeout(()=>playTone(freq,0.15,0.15,'square'),750);
    setTimeout(()=>playTone(freq,0.15,0.15,'square'),1000);
    setTimeout(()=>playTone(freq,1.10,0.20,'square'),1250);
  }

  function timerAudioPulse(){
    if(typeof state==='undefined'||state.role!=='team'||Number(state.viewedStage)===0) return;
    if(submissionRow(state.teamId,state.viewedStage)) return;
    const ts=timerState(state.viewedStage);
    if(!ts) return;
    if(audioStage!==state.viewedStage){
      audioStage=state.viewedStage;
      lastTickSecond=null;
      previousTimerDelta=ts.delta;
      return;
    }
    const remaining=Math.max(0,ts.delta);
    if(remaining>=1&&remaining<=10&&lastTickSecond!==remaining){
      playTick();
      lastTickSecond=remaining;
    }
    if(previousTimerDelta!==null&&previousTimerDelta>0&&ts.delta<=0){
      playTimeUpSignal();
    }
    previousTimerDelta=ts.delta;
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
      const penalty=Math.min(4,Math.floor(Math.max(0,timing.late)/60));
      const status=timing.onTime
        ? `<strong style="color:#28704b">Подано в межах часу</strong>`
        : `<strong style="color:var(--burgundy)">Перевищення +${formatClockSeconds(timing.late)} · штраф -${penalty}</strong>`;
      box.innerHTML=`<div><div class="section-kicker">Час раунду</div><div style="font-weight:900;font-size:20px">${formatClockSeconds(timing.elapsed)}</div><div class="small muted">від старту до надсилання · ліміт ${total} хв</div></div><div style="text-align:right">${status}</div>`;
      return;
    }
    const overtimeSeconds=ts.expired?Math.min(300,Math.max(0,-ts.delta)):0;
    const overtimeStopped=!!ts.overtimeStopped;
    const value=ts.expired?`+${formatClockSeconds(overtimeSeconds)}`:formatClockSeconds(ts.delta);
    const label=overtimeStopped?'Облік часу зупинено':(ts.expired?'Час завершено':'Залишилось');
    const accent=ts.expired?'var(--burgundy)':(ts.delta<=120?'#9a5b13':'#17324d');
    const note=overtimeStopped
      ? 'Минуло 5 хвилин понад ліміт. Подання відповіді закрито.'
      : (ts.expired?'Відповідь ще можна подати до +05:00. Штраф: -1 бал за кожну повну хвилину прострочення.':`Ліміт раунду: ${total} хв. Таймер спільний для всіх команд.`);
    box.innerHTML=`<div><div class="section-kicker">${label}</div><div style="font-size:30px;font-weight:900;color:${accent};font-variant-numeric:tabular-nums">${value}</div></div><div class="small muted" style="max-width:280px">${note}</div>`;
    const submitButton=task.querySelector('button.btn.burgundy');
    if(submitButton&&!submissionRow(state.teamId,state.viewedStage)){
      submitButton.disabled=overtimeStopped;
      if(overtimeStopped) submitButton.textContent='Час подання завершено';
    }
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
        const row=scoreRow(t.id,state.viewedStage);
        const penalty=Math.min(4,Math.floor(Math.max(0,timing.late)/60));
        line.style.color=timing.onTime?'#28704b':'var(--burgundy)';
        const scoreText=row&&row.raw_score!==null&&row.raw_score!==undefined
          ? ` · за зміст ${Number(row.raw_score)||0} · до рахунку ${Number(row.score)||0}`
          : '';
        line.textContent=timing.onTime
          ? `Подано за ${formatClockSeconds(timing.elapsed)} · у межах часу · штраф 0${scoreText}`
          : `Подано за ${formatClockSeconds(timing.elapsed)} · +${formatClockSeconds(timing.late)} · автоматичний штраф -${penalty}${scoreText}`;
      }else if(ts&&ts.expired){
        line.style.color='var(--burgundy)';
        const late=Math.min(300,Math.max(0,-ts.delta));
        line.textContent=ts.overtimeStopped
          ? 'Не подано · +05:00 · подання закрито · автоматично 0 балів'
          : `Не подано · час перевищено на +${formatClockSeconds(late)}`;
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
    const overtimeSeconds=ts.expired?Math.min(300,Math.max(0,-ts.delta)):0;
    const overtimeStopped=!!ts.overtimeStopped;
    const value=ts.expired?`+${formatClockSeconds(overtimeSeconds)}`:formatClockSeconds(ts.delta);
    const timerNote=overtimeStopped
      ? 'Минуло 5 хвилин понад ліміт. Подання відповіді автоматично закрито.'
      : (ts.expired?'Час вичерпано. До +05:00 відповідь ще приймається зі штрафом -1 бал за кожну повну хвилину прострочення.':`Встановлено ${Math.round(Number(ts.timer.duration_seconds)/60)} хв.`);
    card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap"><div><div class="section-kicker">Таймер поточного раунду</div><h3 style="margin:4px 0">${escapeHtml(stageById(state.openedStage).kind)} · <span style="font-variant-numeric:tabular-nums;color:${ts.expired?'var(--burgundy)':'#17324d'}">${value}</span></h3><div class="small muted">${timerNote}</div></div><button class="btn secondary" onclick="extendCurrentTimer(5)">+5 хвилин</button></div>`;
  }

  function patchScoreInputs(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const stageId=Number(state.viewedStage);
    const ts=timerState(stageId);
    activeTeams().forEach(t=>{
      const input=document.getElementById(`score-${t.id}`);
      if(!input||document.activeElement===input) return;
      const value=rawRoundScore(t.id,stageId);
      const noSubmission=!submissionRow(t.id,stageId);
      const autoZero=stageId>0&&!!ts?.overtimeStopped&&noSubmission&&value===null;
      const desired=autoZero?'0':String(value===null?'':value);
      if(input.value!==desired) input.value=desired;
      input.disabled=autoZero;
      input.title=autoZero
        ? 'Відповідь не подано до +05:00. За раунд автоматично 0 балів.'
        : 'Бал за зміст від 0 до 15';
      const row=input.closest('.team-row');
      if(row){
        let auto=row.querySelector('.auto-zero-note');
        if(autoZero){
          if(!auto){
            auto=document.createElement('div');
            auto.className='auto-zero-note small';
            auto.style.cssText='grid-column:1/-1;margin-top:-3px;color:var(--burgundy);font-weight:900;text-align:right';
            row.appendChild(auto);
          }
          auto.textContent='Відповідь не подано до +05:00 · автоматично 0 балів';
        }else if(auto){
          auto.remove();
        }
      }
    });
  }

  function injectTrainerLabels(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    document.querySelectorAll('.team-row').forEach(row=>{
      const inp=row.querySelector('input[id^="score-"]');
      if(!inp) return;
      const parent=inp.parentElement;
      if(parent&&!parent.querySelector('.round-score-label')){
        parent.insertAdjacentHTML('afterbegin','<div class="round-score-label small muted" style="margin-bottom:5px">Бал за зміст (0-15)</div>');
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
    const ts=timerState(stageId);
    const rows=activeTeams().map(t=>{
      const score=roundScore(t.id,stageId,false);
      const noSubmission=!submissionRow(t.id,stageId);
      const autoZero=stageId>0&&!!ts?.overtimeStopped&&noSubmission&&score===null;
      return {team:t,score,autoZero};
    });
    const allReady=rows.every(x=>x.score!==null||x.autoZero);
    const published=isRoundPublished(stageId);
    const totals=activeTeams().map(t=>({team:t,total:totalScore(t.id,false)}));
    const html=`<section class="card" id="trainer-round-publish-card" style="margin-top:20px"><div class="section-kicker">Оцінювання раунду</div><h2>${escapeHtml(stageById(stageId).kind)}: результати команд</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0">${rows.map(x=>`<div style="padding:12px;border:1px solid var(--line);border-radius:12px;background:#faf7f1"><strong>${escapeHtml(x.team.name)}</strong><div style="font-size:28px;font-weight:900;color:var(--burgundy);margin-top:6px">${x.score===null?(x.autoZero?'0':'—'):x.score}</div>${x.autoZero?'<div class="small" style="margin-top:4px;color:var(--burgundy);font-weight:800">автоматично, відповідь не подано</div>':''}</div>`).join('')}</div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn burgundy" ${allReady?'':'disabled'} onclick="publishCurrentRound()">${published?'Опубліковано для команд':'Опублікувати результат раунду'}</button>${published?'<button class="btn secondary" onclick="unpublishCurrentRound()">Зняти з публікації</button>':''}<span class="small muted">${allReady?'Усі команди готові до публікації. Для неподачі після +05:00 система зафіксує 0 автоматично.':'Виставте бали командам, які подали відповіді.'}</span></div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><div class="section-kicker">Поточна сума тренера</div>${totals.map(x=>`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>${escapeHtml(x.team.name)}</span><strong>${x.total}</strong></div>`).join('')}</div>${stageId===D.stages[D.stages.length-1].id?`<div style="margin-top:18px"><button class="btn burgundy" ${published?'':'disabled'} onclick="publishSharedFinal()">Опублікувати фінальний рахунок</button></div>`:''}</section>`;
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

  function injectTrainerCalibrationResults(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const main=document.querySelector('main.container');
    if(!main) return;
    const old=document.getElementById('trainer-calibration-results');
    if(Number(state.viewedStage)!==0){
      if(old) old.remove();
      return;
    }

    const stage=stageById(0);
    const items=stage?.task?.items||[];
    const options=stage?.task?.options||[];
    const teams=activeTeams();
    const parsed={};
    teams.forEach(t=>{
      const row=submissionRow(t.id,0);
      if(!row){parsed[t.id]=null;return;}
      try{parsed[t.id]=JSON.parse(row.answer||'{}');}
      catch(e){parsed[t.id]={_raw:row.answer};}
    });

    const submittedCount=teams.filter(t=>parsed[t.id]).length;
    const cells=items.map((item,idx)=>{
      const teamCells=teams.map(t=>{
        const v=parsed[t.id]?.[item.id];
        const color=v==='Має ознаки зловживання'?'var(--burgundy)':(v==='Спірно'?'#9a5b13':'#28704b');
        return `<td style="padding:10px 8px;border-top:1px solid var(--line);vertical-align:top"><strong style="color:${v?color:'#9ca3af'}">${v?escapeHtml(v):'Ще не подано'}</strong></td>`;
      }).join('');
      return `<tr><td style="padding:10px 10px;border-top:1px solid var(--line);vertical-align:top;min-width:280px"><div class="section-kicker">Ситуація ${idx+1}</div><div style="font-weight:700;line-height:1.4">${escapeHtml(item.prompt||'')}</div></td>${teamCells}</tr>`;
    }).join('');

    const summary=options.map(opt=>{
      const counts=items.map(item=>teams.filter(t=>parsed[t.id]?.[item.id]===opt).length);
      const total=counts.reduce((a,b)=>a+b,0);
      return `<span class="meta-chip" style="margin-right:6px">${escapeHtml(opt)}: <strong>${total}</strong></span>`;
    }).join('');

    const html=`<section class="card" id="trainer-calibration-results" style="margin:20px 0;border:2px solid #17324d">
      <div class="section-kicker">Результати калібрування</div>
      <h2 style="margin-bottom:6px">Стартова оцінка команд</h2>
      <p class="small muted" style="margin-bottom:12px">Подали калібрування: <strong>${submittedCount}/${teams.length}</strong>. У таблиці видно позицію кожної команди по всіх 5 ситуаціях.</p>
      <div style="margin-bottom:12px">${summary}</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:760px">
          <thead><tr><th style="text-align:left;padding:9px 10px;background:#f4f1eb">Ситуація</th>${teams.map(t=>`<th style="text-align:left;padding:9px 8px;background:#f4f1eb">${escapeHtml(t.name)}</th>`).join('')}</tr></thead>
          <tbody>${cells}</tbody>
        </table>
      </div>
    </section>`;

    if(old) old.outerHTML=html;
    else {
      const grid=document.querySelector('.trainer-grid');
      if(grid) grid.insertAdjacentHTML('afterend',html);
      else main.insertAdjacentHTML('afterbegin',html);
    }
  }

  function parseCalibrationAnswer(row){
    if(!row?.answer) return null;
    try{
      const v=JSON.parse(row.answer);
      return v&&typeof v==='object'?v:null;
    }catch(e){return null;}
  }

  function comparisonRowsHtml(start,end,items){
    return items.map((item,idx)=>{
      const before=start?.[item.id]||'Немає відповіді';
      const after=end?.[item.id]||'Немає відповіді';
      const changed=!!end&&before!==after;
      return `<tr>
        <td style="padding:10px;border-top:1px solid var(--line);vertical-align:top"><div class="section-kicker">Ситуація ${idx+1}</div><div style="font-weight:700;line-height:1.4">${escapeHtml(item.prompt||'')}</div></td>
        <td style="padding:10px;border-top:1px solid var(--line);vertical-align:top">${escapeHtml(before)}</td>
        <td style="padding:10px;border-top:1px solid var(--line);vertical-align:top">${escapeHtml(after)}</td>
        <td style="padding:10px;border-top:1px solid var(--line);vertical-align:top"><strong style="color:${changed?'var(--burgundy)':'#28704b'}">${end?(changed?'Змінилася':'Без змін'):'Очікується'}</strong></td>
      </tr>`;
    }).join('');
  }

  function injectTeamPostFinalCheck(){
    if(typeof state==='undefined'||state.role!=='team') return;
    const old=document.getElementById('post-final-check');
    if(Number(state.viewedStage)!==7){
      if(old) old.remove();
      return;
    }
    const finalDone=!!submissionRow(state.teamId,7);
    if(!finalDone){
      if(old) old.remove();
      return;
    }

    const calibrationStage=stageById(0);
    const items=calibrationStage?.task?.items||[];
    const options=calibrationStage?.task?.options||[];
    const start=parseCalibrationAnswer(submissionRow(state.teamId,0))||{};
    const end=parseCalibrationAnswer(submissionRow(state.teamId,8));
    const changedCount=end?items.filter(item=>(start?.[item.id]||'')!==(end?.[item.id]||'')).length:0;

    let body='';
    if(!end){
      const questions=items.map((item,idx)=>`<div style="padding:14px 0;border-bottom:1px solid var(--line)">
        <div class="section-kicker">Ситуація ${idx+1}</div>
        <p style="font-weight:700;line-height:1.45;margin:5px 0 10px">${escapeHtml(item.prompt||'')}</p>
        <div class="small muted" style="margin-bottom:8px">Ваша стартова відповідь: <strong>${escapeHtml(start?.[item.id]||'Немає відповіді')}</strong></div>
        <div class="options">${options.map(o=>`<label class="option"><input type="radio" name="post-${item.id}" value="${escapeHtml(o)}"><span>${escapeHtml(o)}</span></label>`).join('')}</div>
      </div>`).join('');
      body=`<p class="muted">Після проходження всієї справи оцініть ті самі 5 ситуацій ще раз. Це не впливає на бали, а показує, чи змінилася позиція команди.</p>${questions}<button class="btn burgundy" style="margin-top:16px" onclick="submitPostFinalCheck()">Подати повторну оцінку</button>`;
    }else{
      body=`<div class="notice burgundy" style="margin-bottom:14px"><strong>Позиція змінилася у ${changedCount} із ${items.length} ситуацій.</strong></div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:820px">
        <thead><tr><th style="text-align:left;padding:10px;background:#f4f1eb">Ситуація</th><th style="text-align:left;padding:10px;background:#f4f1eb">На старті</th><th style="text-align:left;padding:10px;background:#f4f1eb">Після фіналу</th><th style="text-align:left;padding:10px;background:#f4f1eb">Зміна</th></tr></thead>
        <tbody>${comparisonRowsHtml(start,end,items)}</tbody>
      </table></div>`;
    }

    const html=`<section class="card" id="post-final-check" style="margin-top:20px;border:2px solid #7b2f3d">
      <div class="section-kicker">Рефлексія після фіналу</div>
      <h2 style="margin-bottom:6px">Чи змінилася ваша оцінка?</h2>
      ${body}
    </section>`;

    const main=document.querySelector('main.container');
    if(!main) return;

    // Поки повторну оцінку ще не подано, не перемальовуємо форму під час
    // фонового refresh(), щоб вибрані radio-кнопки не скидалися.
    if(old && !end) return;

    if(old) old.outerHTML=html;
    else main.insertAdjacentHTML('beforeend',html);
  }

  function injectTrainerPostFinalComparison(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    const old=document.getElementById('trainer-post-final-comparison');
    if(Number(state.viewedStage)!==7){
      if(old) old.remove();
      return;
    }
    const calibrationStage=stageById(0);
    const items=calibrationStage?.task?.items||[];
    const teams=activeTeams();
    const submitted=teams.filter(t=>submissionRow(t.id,8)).length;

    const teamBlocks=teams.map(t=>{
      const start=parseCalibrationAnswer(submissionRow(t.id,0))||{};
      const end=parseCalibrationAnswer(submissionRow(t.id,8));
      const changed=end?items.filter(item=>(start?.[item.id]||'')!==(end?.[item.id]||'')).length:0;
      return `<div style="margin-top:16px;border:1px solid var(--line);border-radius:14px;overflow:hidden">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;background:#faf7f1">
          <strong>${escapeHtml(t.name)}</strong>
          <span class="status ${end?'ok':'warn'}">${end?`Зміни: ${changed}/${items.length}`:'Повторну оцінку ще не подано'}</span>
        </div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:820px">
          <thead><tr><th style="text-align:left;padding:9px 10px">Ситуація</th><th style="text-align:left;padding:9px 10px">На старті</th><th style="text-align:left;padding:9px 10px">Після фіналу</th><th style="text-align:left;padding:9px 10px">Зміна</th></tr></thead>
          <tbody>${comparisonRowsHtml(start,end,items)}</tbody>
        </table></div>
      </div>`;
    }).join('');

    const html=`<section class="card" id="trainer-post-final-comparison" style="margin:20px 0;border:2px solid #17324d">
      <div class="section-kicker">Постфінальна рефлексія</div>
      <h2 style="margin-bottom:6px">Як змінилася оцінка команд</h2>
      <p class="small muted">Повторну оцінку подали: <strong>${submitted}/${teams.length}</strong>. Порівняння не впливає на рахунок гри.</p>
      ${teamBlocks}
    </section>`;

    const main=document.querySelector('main.container');
    if(!main) return;
    if(old) old.outerHTML=html;
    else {
      const controls=document.getElementById('final-score-controls');
      if(controls) controls.insertAdjacentHTML('beforebegin',html);
      else main.insertAdjacentHTML('beforeend',html);
    }
  }

  window.submitPostFinalCheck=async function(){
    const calibrationStage=stageById(0);
    const items=calibrationStage?.task?.items||[];
    const answers={};
    for(const item of items){
      const v=document.querySelector(`input[name="post-${item.id}"]:checked`)?.value;
      if(!v) return alert('Оцініть усі 5 ситуацій перед поданням');
      answers[item.id]=v;
    }
    try{
      await call('submit',{stageId:8,answer:JSON.stringify(answers)});
      await refresh(true);
    }catch(e){
      alert('Не вдалося зберегти повторну оцінку: '+e.message);
    }
  };

  function injectSpeakingOrder(){
    if(typeof state==='undefined'||!state.role) return;
    const stageId=Number(state.viewedStage);
    const order=timerRow(stageId)?.speaking_order;
    const old=document.getElementById('round-speaking-order');
    const nav=document.querySelector('.stage-shell');
    if(!nav||!Array.isArray(order)||!order.length){old?.remove();return;}
    const signature=JSON.stringify([stageId,state.teamId,order]);
    if(old?.dataset.signature===signature) return;
    old?.remove();
    const card=document.createElement('section');
    card.id='round-speaking-order';
    card.dataset.signature=signature;
    card.className='card';
    card.style.cssText='margin-bottom:20px;border-left:4px solid var(--gold);padding:16px 20px';
    const own=order.indexOf(state.teamId);
    card.innerHTML='<div class="section-kicker">Жеребкування раунду</div><h3>Черговість виступів</h3>'+
      (own>=0?'<p style="font-weight:800;color:var(--burgundy);margin:10px 0">Ваш номер виступу: '+(own+1)+'</p>':'')+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'+order.map((id,i)=>{
        const name=D.teams.find(t=>t.id===id)?.name||id;
        const mine=state.role==='team'&&id===state.teamId;
        return '<div style="display:flex;align-items:center;gap:9px;padding:9px 13px;border:1px solid '+(mine?'var(--burgundy)':'var(--line)')+';border-radius:12px;background:'+(mine?'#f4e8eb':'#faf7f1')+'"><strong style="font-size:22px;color:var(--burgundy)">'+(i+1)+'</strong><span style="font-weight:700">'+escapeHtml(name)+'</span></div>';
      }).join('')+'</div>';
    nav.insertAdjacentElement('afterend',card);
  }

  function updateUi(){
    injectSpeakingOrder();
    patchScoreInputs();
    injectTrainerLabels();
    injectTrainerCalibrationResults();
    injectTeamPostFinalCheck();
    injectTrainerPostFinalComparison();
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
      syncFailures=0;
      setTimeout(updateUi,0);
    }catch(e){
      syncFailures=Math.min(syncFailures+1,6);
      if(state?.role==='team'&&String(e.message).includes('не бере участі')){
        alert(e.message);
        state.role=null; state.teamId=null; save(); render();
      }else console.warn('Shared game sync:',e.message);
    }
    finally{refreshing=false;}
  }

  window.submitCalibration=async function(id){
    const stage=stageById(Number(id));
    const items=stage?.task?.items||[];
    const answers={};
    for(const item of items){
      const v=document.querySelector(`input[name="cal-${item.id}"]:checked, input[name="${item.id}"]:checked`)?.value;
      if(!v) return alert('Оцініть усі 5 ситуацій перед поданням');
      answers[item.id]=v;
    }
    try{
      await call('submit',{stageId:id,answer:JSON.stringify(answers)});
      await refresh(true);
    }catch(e){
      alert('Не вдалося зберегти калібрування: '+e.message);
    }
  };

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
    if(!Number.isFinite(score)||score<0||score>15) return alert('Введіть бал за зміст від 0 до 15');
    try{
      const result=await call('set_score',{teamId:id,stageId:state.viewedStage,score});
      await refresh(false);
      updateUi();
      const row=input?.closest('.team-row');
      if(row){
        let calc=row.querySelector('.score-calculation');
        if(!calc){
          calc=document.createElement('div');
          calc.className='score-calculation small';
          calc.style.cssText='grid-column:1/-1;margin-top:-4px;color:#6e7780;text-align:right';
          row.appendChild(calc);
        }
        calc.textContent=`За зміст: ${result.raw_score} · штраф за час: -${result.time_penalty} · до рахунку: ${result.score}`;
      }
    }catch(e){alert('Не вдалося зберегти бал: '+e.message);}
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
    try{
      const was=!!remote.game?.final_published;
      await call('publish_final');
      await refresh(false);
      updateUi();
      if(!was && remote.game?.final_published && !document.getElementById('final-celebration')) launchFinalCelebration(false);
    }catch(e){alert('Не вдалося опублікувати фінальний рахунок: '+e.message);}
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

  function nextPollDelay(){
    const trainer=typeof state!=='undefined'&&state.role==='trainer';
    const base=remote.game?.final_published?30000:(trainer?5000:7000);
    const jitter=Math.floor(Math.random()*(trainer?1000:2000));
    const backoff=Math.min(10000,syncFailures*2200);
    return base+jitter+backoff;
  }

  async function pollLoop(){
    if(document.visibilityState==='hidden'){
      setTimeout(pollLoop,12000);
      return;
    }
    await refresh(false);
    setTimeout(pollLoop,nextPollDelay());
  }

  window.GAME_SHARED={remote,call,refresh,roundScore,rawRoundScore,roundTimePenalty,totalScore,isRoundPublished,activeTeams,timerRow,timerState,submissionTiming,isFinalPublished:()=>!!remote.game?.final_published};
  document.addEventListener('pointerdown',unlockTimerAudio,{passive:true});
  document.addEventListener('keydown',unlockTimerAudio);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') refresh(false);});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{await refresh(true);setTimeout(pollLoop,nextPollDelay());},300));
  setInterval(updateUi,1000);
  setInterval(timerAudioPulse,200);
})();