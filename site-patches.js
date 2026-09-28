(function(){
  const LOGO='nsju-emblem.png';
  function fixLogo(){
    document.querySelectorAll('img').forEach(img=>{
      const src=(img.getAttribute('src')||'').toLowerCase();
      const alt=(img.getAttribute('alt')||'').toLowerCase();
      if(src.includes('nsju-emblem') || alt.includes('національної школи суддів')){
        if(img.getAttribute('src')!==LOGO) img.setAttribute('src',LOGO);
        img.style.display='block';
        img.style.objectFit='contain';
        img.style.visibility='visible';
        img.style.opacity='1';
      }
    });
  }
  function addFinalScoreboard(){
    if(!window.GAME_DATA || !window.GAME_DATA.stages) return;
    const finalStage=window.GAME_DATA.stages[window.GAME_DATA.stages.length-1];
    const isFinal=typeof state!=='undefined' && state.viewedStage===finalStage.id;
    const completed=typeof state!=='undefined' && window.GAME_DATA.teams.every(t=>state.submitted && state.submitted[`${t.id}-${finalStage.id}`]);
    if(!isFinal || !completed || document.getElementById('final-scoreboard')) return;
    const main=document.querySelector('main.container');
    if(!main) return;
    const scores=window.GAME_DATA.teams.map(t=>({name:t.name,score:(state.scores&&state.scores[t.id])||0}));
    const html=`<section id="final-scoreboard" class="card final-scoreboard"><div class="section-kicker">Підсумки тренінгу</div><h2>Підсумковий рахунок команд</h2><div class="final-score-grid">${scores.map(x=>`<div class="final-score-card"><strong>${x.name}</strong><span>${x.score}</span><small>балів</small></div>`).join('')}</div></section>`;
    main.insertAdjacentHTML('beforeend',html);
  }
  function run(){fixLogo();addFinalScoreboard();}
  document.addEventListener('DOMContentLoaded',run);
  const obs=new MutationObserver(()=>run());
  obs.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(run,1500);
})();
