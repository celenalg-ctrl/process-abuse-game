(function(){
  // Public, read-only invalidation channel. No game content, credentials, or scores are transmitted.
  const KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNneXlhZ294Ymd6bmV1cXhjYnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NTUzNzMsImV4cCI6MjEwNjEzMTM3M30.5l2lrCmgItumNfvi3A10MEl7NnlbVEuOVvBA4SY90rs";
  const URL='wss://cgyyagoxbgzneuqxcbqr.supabase.co/realtime/v1/websocket?apikey='+encodeURIComponent(KEY)+'&vsn=1.0.0';
  const TOPIC='realtime:game_sync_signal';
  window.createGameRealtime=function({onSignal,onReady,onStatus}){
    let socket=null,joined=false,seq=0,joinRef=null,heartbeatRef=null,heartbeatTimer=null,joinTimer=null;
    let retryAfter=0,failures=0;
    function status(value){if(joined!==value){joined=value;onStatus?.(value);}}
    function clear(){clearInterval(heartbeatTimer);clearTimeout(joinTimer);heartbeatTimer=null;joinTimer=null;heartbeatRef=null;}
    function send(ws,topic,event,payload,ref,join_ref=null){
      if(ws.readyState!==1)return false;
      ws.send(JSON.stringify({topic,event,payload,ref,join_ref}));
      return true;
    }
    function stop(retry=false){
      const old=socket;socket=null;clear();status(false);
      if(retry){failures=Math.min(failures+1,6);retryAfter=Date.now()+Math.min(60000,1000*2**failures);}
      else{retryAfter=0;failures=0;}
      if(old){try{old.close();}catch(_){}}
    }
    function connect(){
      if(socket||Date.now()<retryAfter||typeof WebSocket!=='function')return;
      let ws;
      try{ws=new WebSocket(URL);}catch(_){stop(true);return;}
      socket=ws;
      joinRef=String(++seq);
      joinTimer=setTimeout(()=>{if(socket===ws&&!joined)stop(true);},12000);
      ws.onopen=()=>{
        if(socket!==ws)return;
        send(ws,TOPIC,'phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:'UPDATE',schema:'public',table:'game_sync_signal',filter:'id=eq.1'}],private:false},access_token:KEY},joinRef,joinRef);
        heartbeatTimer=setInterval(()=>{
          if(socket!==ws)return;
          if(heartbeatRef!==null){stop(true);return;}
          heartbeatRef=String(++seq);
          if(!send(ws,'phoenix','heartbeat',{},heartbeatRef))stop(true);
        },25000);
      };
      ws.onmessage=event=>{
        if(socket!==ws)return;
        let m;try{m=JSON.parse(event.data);}catch(_){return;}
        if(m.event==='phx_reply'&&m.topic==='phoenix'&&m.ref===heartbeatRef){heartbeatRef=null;return;}
        if(m.topic!==TOPIC)return;
        if(m.event==='phx_reply'&&m.ref===joinRef){
          const subscriptions=m.payload?.response?.postgres_changes;
          if(m.payload?.status!=='ok'||!Array.isArray(subscriptions)||!subscriptions.some(s=>s.table==='game_sync_signal')){stop(true);return;}
          clearTimeout(joinTimer);failures=0;retryAfter=0;status(true);onReady?.();return;
        }
        if(m.event==='phx_error'||m.event==='phx_close'||(m.event==='system'&&m.payload?.status==='error')){stop(true);return;}
        if(m.event==='postgres_changes'){
          const d=m.payload?.data;
          if(d?.schema==='public'&&d.table==='game_sync_signal'&&d.type==='UPDATE'&&d.record){
            onSignal?.({revision:d.record.revision,contentRevision:d.record.content_revision});
          }
        }
      };
      ws.onerror=()=>{if(socket===ws)stop(true);};
      ws.onclose=()=>{if(socket===ws)stop(true);};
    }
    return {connect,stop,isReady:()=>joined};
  };
})();
