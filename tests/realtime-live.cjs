// Read-only production connectivity check. No game mutations or private credentials.
const fs=require('node:fs');
const source=fs.readFileSync('game-realtime.js','utf8');
const window={};
new Function('window',source)(window);
let realtime;
(async()=>{
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Realtime subscription not acknowledged in 20 seconds')),20000);
      realtime=window.createGameRealtime({onReady:()=>{clearTimeout(timeout);resolve()},onSignal:()=>{},onStatus:()=>{}});
      realtime.connect();
    });
    if(!realtime.isReady())throw new Error('Realtime channel not ready');
    // The legacy anon JWT is deliberately a public browser key, not a service-role credential.
    const m=source.match(/const KEY=("[^"]+");/);
    if(!m)throw new Error('Public key configuration not found');
    const key=JSON.parse(m[1]);
    const root='https://cgyyagoxbgzneuqxcbqr.supabase.co/rest/v1/';
    const headers={apikey:key,Authorization:'Bearer '+key};
    const signal=await fetch(root+'game_sync_signal?select=id,revision,content_revision&id=eq.1',{headers,signal:AbortSignal.timeout(8000)});
    const rows=await signal.json();
    if(!signal.ok||!Array.isArray(rows)||rows.length!==1||rows[0].id!==1||!rows[0].revision||!rows[0].content_revision)throw new Error('Public signal is unavailable');
    const privateRead=await fetch(root+'submissions?select=team_id&limit=1',{headers,signal:AbortSignal.timeout(8000)});
    if(privateRead.ok){const data=await privateRead.json();if(!Array.isArray(data)||data.length!==0)throw new Error('Private submissions exposed');}
    else if(![401,403].includes(privateRead.status))throw new Error('Unexpected access-check response: '+privateRead.status);
    console.log('PASS: actual Realtime subscription, read-only signal, and no anonymous submission access.');
  }finally{realtime?.stop()}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
