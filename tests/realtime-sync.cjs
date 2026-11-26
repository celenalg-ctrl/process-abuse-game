const fs=require('node:fs');
const sources=Object.fromEntries(['game-realtime.js','shared-state.js','trainer-editor.js'].map(p=>[p,fs.readFileSync(p,'utf8')]));
(async()=>{

async function run(sources){
  const assert=(condition,message)=>{if(!condition)throw new Error(message)};
  const clone=x=>JSON.parse(JSON.stringify(x));
  let clock=1800000000000,id=0,revision=0,contentRevision=0;
  const timers=new Map(),clients=[],calls={state:0,content:0,mutations:0};
  const teams=['A','B','C'].map(id=>({id,name:'Team '+id}));
  let game={id:1,opened_stage:0,active_team_count:3,final_published:false};
  let scores=[],submissions=[],roundTimers=[];
  const baseContent={title:'Fixture',subtitle:'Mock data only',teams,stages:Array.from({length:8},(_,id)=>({id,title:'Round '+id,task:id===0?{items:Array.from({length:5},(_,i)=>({id:'q'+i,prompt:'Question '+i})),options:['yes','no']}:{}}))};
  const FakeDate=class extends Date {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}};
  const addTimer=(fn,ms=0,repeat=false)=>{timers.set(++id,{fn,due:clock+Number(ms||0),ms:Number(ms||0),repeat});return id};
  const clearTimer=n=>timers.delete(n);
  async function advance(ms){
    const end=clock+ms;let steps=0;
    while(true){
      let next=[...timers.entries()].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
      if(!next)break;if(++steps>12000)throw Error('timer loop');
      const [n,t]=next;clock=t.due;
      if(t.repeat) t.due=clock+t.ms;else timers.delete(n);
      await t.fn();await Promise.resolve();
    }
    clock=end;
  }
  function broadcast(content=false){
    revision++;if(content)contentRevision++;
    for(const c of clients)for(const ws of c.sockets)if(ws.readyState===1&&ws.join){
      ws.message({topic:ws.join.topic,event:'postgres_changes',payload:{data:{schema:'public',table:'game_sync_signal',type:'UPDATE',record:{id:1,revision:'r'+revision,content_revision:'c'+contentRevision}}}});
    }
  }
  function getState(c){
    return {role:c.state.role,teamId:c.state.teamId,game:clone(game),scores:clone(scores.filter(s=>c.state.role==='trainer'||s.published)),submissions:clone(submissions.filter(s=>c.state.role==='trainer'||s.team_id===c.state.teamId)),timers:clone(roundTimers),server_now:new FakeDate().toISOString()};
  }
  function server(c,url,body){
    const action=body.action;
    if(action==='get_content'){calls.content++;c.count.content++;return {content:clone(baseContent),updated_at:'content-'+contentRevision}}
    if(action==='get_state'){calls.state++;c.count.state++;return getState(c)}
    calls.mutations++;
    if(action==='submit'){
      if(submissions.some(s=>s.team_id===c.state.teamId&&s.stage_id===body.stageId))throw Error('duplicate submission');
      submissions.push({team_id:c.state.teamId,stage_id:body.stageId,answer:body.answer,submitted_at:new FakeDate().toISOString(),late_by_seconds:0,elapsed_seconds:1});
    }else if(action==='open_stage'){
      game.opened_stage=body.stageId;
      roundTimers.push({stage_id:body.stageId,duration_seconds:body.durationSeconds,started_at:new FakeDate().toISOString(),deadline_at:new FakeDate(clock+body.durationSeconds*1000).toISOString(),speaking_order:['A','B','C']});
    }else if(action==='set_score'){
      for(const s of scores.filter(s=>s.stage_id===body.stageId))s.published=false;
      scores=scores.filter(s=>s.stage_id!==body.stageId||s.team_id!==body.teamId);
      scores.push({team_id:body.teamId,stage_id:body.stageId,score:body.score,raw_score:body.score,time_penalty:0,published:false});
    }else if(action==='publish_round'){for(const s of scores.filter(s=>s.stage_id===body.stageId))s.published=true;
    }else if(action==='unpublish_round'){for(const s of scores.filter(s=>s.stage_id===body.stageId))s.published=false;
    }else if(action==='extend_timer'){const t=roundTimers.find(t=>t.stage_id===body.stageId);t.duration_seconds+=body.addSeconds;t.deadline_at=new FakeDate(Date.parse(t.deadline_at)+body.addSeconds*1000).toISOString();
    }else if(action==='publish_final'){game.final_published=true;
    }else if(action==='reset_game'){game.opened_stage=0;game.final_published=false;scores=[];submissions=[];roundTimers=[];
    }else{throw Error('unexpected action '+action)}
    broadcast();
    return {ok:true,raw_score:body.score,time_penalty:0,score:body.score};
  }
  function makeClient(role,teamId){
    const state={role,teamId,openedStage:0,viewedStage:0,answers:{},scores:{A:0,B:0,C:0},submitted:{},activeTeamCount:3};
    const D=clone(baseContent),storage=new Map(),listeners={},windowListeners={},sockets=[],alerts=[],count={state:0,content:0,renders:0};
    const inputs=new Map([['answerText',{value:'fixture answer'}],['next-stage-duration-minutes',{value:'15'}],['active-team-count',{value:'3'}]]);
    const c={state,D,sockets,alerts,count};
    const el=n=>inputs.get(n)||null;
    const w={GAME_DATA:D,addEventListener:(name,fn)=>{(windowListeners[name]??=[]).push(fn)}};
    const doc={visibilityState:'visible',getElementById:el,querySelector:s=>s.startsWith('input[name=')||s.startsWith('input[name="')?{value:'yes'}:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn)},body:{insertAdjacentHTML:()=>{}},activeElement:null};
    const navigator={onLine:true};
    const sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
    const render=()=>{count.renders++};
    const fetch=async(url,opts)=>{const body=JSON.parse(opts.body);try{const j=server(c,url,body);return {ok:true,json:async()=>j}}catch(e){return {ok:false,json:async()=>({error:e.message})}}};
    class AbortController{constructor(){this.signal={}}abort(){}}
    class MockWS{
      constructor(){this.readyState=0;this.sent=[];sockets.push(this);addTimer(()=>{if(this.readyState===0){this.readyState=1;this.onopen?.()}},1)}
      send(raw){const m=JSON.parse(raw);this.sent.push(m);
        if(m.event==='phx_join'){this.join=m;addTimer(()=>this.message({topic:m.topic,event:'phx_reply',ref:m.ref,payload:{status:'ok',response:{postgres_changes:[{table:'game_sync_signal'}]}}}),1)}
        if(m.event==='heartbeat')addTimer(()=>this.message({topic:'phoenix',event:'phx_reply',ref:m.ref}),1);
      }
      close(){this.readyState=3;this.onclose?.()}
      message(m){if(this.readyState===1)this.onmessage?.({data:JSON.stringify(m)})}
    }
    const bindings={window:w,document:doc,navigator,state,D,sessionStorage,fetch,AbortController,WebSocket:MockWS,setTimeout:addTimer,clearTimeout:clearTimer,setInterval:(fn,ms)=>ms===25000?addTimer(fn,ms,true):null,clearInterval:clearTimer,Date:FakeDate,save:()=>{},render,el,escapeHtml:x=>String(x??''),stageById:n=>D.stages.find(s=>s.id===n),alert:x=>alerts.push(x),confirm:()=>true,console:{warn:(...x)=>alerts.push(x.join(' '))}};
    for(const path of ['game-realtime.js','shared-state.js','trainer-editor.js']){
      new Function(...Object.keys(bindings),sources[path])(...Object.values(bindings));
    }
    Object.assign(c,{w,doc,navigator,inputs,listeners,windowListeners});
    clients.push(c);return c;
  }
  const trainer=makeClient('trainer',null),participants=teams.map(t=>makeClient('team',t.id));
  for(const c of clients){c.w.storeGameAccessCode('FIXTURE-'+(c.state.teamId||'TRAINER'));await c.w.GAME_SHARED.refresh(true)}
  await advance(1200);
  assert(clients.every(c=>c.sockets.some(s=>s.readyState===1&&s.join)),'all clients subscribed');
  const idleBefore=calls.state;const contentBefore=calls.content;
  await advance(120000);
  assert(calls.state===idleBefore,'idle clients made state polling calls');
  assert(calls.content===contentBefore,'idle clients reloaded content');
  for(const c of participants)await c.w.submitCalibration(0);
  await advance(500);
  assert(trainer.w.GAME_SHARED.remote.submissions.length===3,'calibration did not propagate');
  for(let stage=1;stage<=7;stage++){
    await trainer.w.openNext();
    await advance(500);
    for(const c of clients){assert(c.state.openedStage===stage,'stage '+stage+' missing for '+c.state.role);c.state.viewedStage=stage;}
    assert(clients.every(c=>c.w.GAME_SHARED.timerRow(stage)?.deadline_at===roundTimers.at(-1).deadline_at),'timer mismatch');
    if(stage===2){await trainer.w.extendCurrentTimer(5);await advance(500);assert(clients.every(c=>c.w.GAME_SHARED.timerRow(stage)?.duration_seconds===1200),'timer extension mismatch')}
    for(const c of participants)await c.w.submitText(stage);
    await advance(500);
    assert(trainer.w.GAME_SHARED.remote.submissions.filter(s=>s.stage_id===stage).length===3,'missing trainer submissions');
    for(const c of participants)assert(c.w.GAME_SHARED.remote.submissions.every(s=>s.team_id===c.state.teamId),'cross-team data exposed in fixture');
    for(const c of participants){trainer.inputs.set('score-'+c.state.teamId,{value:'15',closest:()=>null});await trainer.w.setScore(c.state.teamId)}
    await advance(500);
    assert(participants.every(c=>c.w.GAME_SHARED.roundScore(c.state.teamId,stage,true)===null),'unpublished score visible');
    await trainer.w.publishCurrentRound();await advance(500);
    assert(participants.every(c=>c.w.GAME_SHARED.roundScore(c.state.teamId,stage,true)===15),'score publication not synchronized');
  }
  for(const c of participants)await c.w.submitPostFinalCheck();
  await advance(500);
  assert(trainer.w.GAME_SHARED.remote.submissions.filter(s=>s.stage_id===8).length===3,'post-final reflection not propagated');
  await trainer.w.publishSharedFinal();await advance(500);
  assert(clients.every(c=>c.w.GAME_SHARED.isFinalPublished()),'final publication not synchronized');
  assert(participants.every(c=>c.w.GAME_SHARED.totalScore(c.state.teamId,true)===105),'incorrect total');
  const c=participants[0];c.doc.visibilityState='hidden';for(const fn of c.listeners.visibilitychange??[])fn();
  const hiddenBefore=c.count.state;
  broadcast();await advance(500);
  assert(c.count.state===hiddenBefore,'hidden client fetched state');
  c.doc.visibilityState='visible';for(const fn of c.listeners.visibilitychange??[])fn();await advance(1200);
  assert(c.count.state>hiddenBefore&&c.w.GAME_SHARED.isFinalPublished(),'resumed client failed to reconcile');
  const oldSocket=c.sockets.at(-1);oldSocket.close();
  const lostBefore=c.count.state;await advance(25000);
  assert(c.count.state>lostBefore&&c.sockets.length>=2,'fallback/reconnection failed');
  baseContent.title='Updated fixture';broadcast(true);await advance(1000);
  assert(clients.every(x=>x.D.title==='Updated fixture'),'content edit not synchronized');
  assert(clients.every(x=>x.alerts.length===0),'unexpected alerts: '+clients.flatMap(x=>x.alerts).join('; '));
  await trainer.w.resetSharedGame();await advance(600);
  assert(clients.every(x=>x.state.openedStage===0&&!x.w.GAME_SHARED.isFinalPublished()),'mock reset did not propagate');
  for(const x of clients)x.w.clearGameAccessCode();
  return {clients:4,rounds:7,calibration:true,reflection:true,idleStateRequests:0,idleContentRequests:0,readRequests:calls.state,contentRequests:calls.content,mutations:calls.mutations,allTests:'PASS'};
}
return run(sources);

})().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
