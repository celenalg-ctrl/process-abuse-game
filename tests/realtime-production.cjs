// Verify the deployed public site and actual Postgres Changes delivery; no game-state mutations.
const fs=require('node:fs');
(async()=>{
  const root='https://process-abuse-game.vercel.app/';
  const res=await fetch(root,{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!res.ok)throw new Error('Production site returned '+res.status);
  const html=await res.text();
  const match=html.match(/src="(game-realtime\.js[^"]*)"/);
  if(!match)throw new Error('Production does not load game-realtime.js');
  const url=new URL(match[1],root);
  const js=await fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!js.ok)throw new Error('Production Realtime asset unavailable');
  const source=await js.text();
  if(source.trim()!==fs.readFileSync('game-realtime.js','utf8').trim())throw new Error('Production asset differs from reviewed source');
  const window={};
  new Function('window',source)(window);
  let client;
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Production signal not received within 90 seconds')),90000);
      client=window.createGameRealtime({
        onReady:()=>console.log('PRODUCTION_REALTIME_READY: waiting for one harmless signal-only update'),
        onStatus:()=>{},
        onSignal:({revision,contentRevision})=>{
          if(typeof revision==='string'&&typeof contentRevision==='string'){clearTimeout(timeout);resolve();}
        }
      });
      client.connect();
    });
    console.log('PASS: production HTML and asset match, live Postgres change received.');
  }finally{client?.stop()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
