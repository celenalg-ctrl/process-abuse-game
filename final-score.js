(function(){
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function isTrainerFinal(){
    return typeof state!=='undefined' && state.role==='trainer' && window.GAME_DATA && window.GAME_DATA.stages && state.viewedStage===window.GAME_DATA.stages[window.GAME_DATA.stages.length-1].id;
  }
  function scoreRows(){
    return window.GAME_DATA.teams.map(t=>({id:t.id,name:t.name,score:Number((state.scores||{})[t.id]||0)})).sort((a,b)=>b.score-a.score);
  }
  function renderBoard(){
    const board=document.getElementById('final-score-board');
    if(!board) return;
    const rows=scoreRows();
    board.innerHTML=`<div class="final-board-title">ПІДСУМКОВИЙ РАХУНОК</div><div class="final-board-subtitle">Зловживання процесуальними правами</div><div class="final-board-grid">${rows.map((x,i)=>`<div class="final-board-card place-${i+1}"><div class="final-place">${i+1}</div><div class="final-team">${esc(x.name)}</div><div class="final-points">${x.score}</div><div class="final-points-label">балів</div></div>`).join('')}</div>`;
  }
  window.showFinalScoreboard=function(){
    renderBoard();
    const overlay=document.getElementById('final-score-overlay');
    if(overlay) overlay.classList.add('open');
  };
  window.hideFinalScoreboard=function(){
    const overlay=document.getElementById('final-score-overlay');
    if(overlay) overlay.classList.remove('open');
  };
  function inject(){
    if(!isTrainerFinal()) return;
    const main=document.querySelector('main.container');
    if(!main) return;
    if(!document.getElementById('final-score-controls')){
      main.insertAdjacentHTML('beforeend',`<section id="final-score-controls" class="card final-score-controls"><div class="section-kicker">Завершення гри</div><h2>Фінальний рахунок</h2><p class="muted">Після внесення фінальних балів відкрийте підсумкове табло для всіх учасників.</p><div class="final-live-scores">${window.GAME_DATA.teams.map(t=>`<div><strong>${esc(t.name)}</strong><span>${Number((state.scores||{})[t.id]||0)}</span></div>`).join('')}</div><button class="btn burgundy final-show-btn" onclick="showFinalScoreboard()">Показати підсумковий рахунок</button></section>`);
    } else {
      document.querySelectorAll('#final-score-controls .final-live-scores div').forEach((node,i)=>{const t=window.GAME_DATA.teams[i]; const span=node.querySelector('span'); if(span) span.textContent=Number((state.scores||{})[t.id]||0);});
    }
    if(!document.getElementById('final-score-overlay')){
      document.body.insertAdjacentHTML('beforeend',`<div id="final-score-overlay" class="final-score-overlay"><button class="final-close" onclick="hideFinalScoreboard()">×</button><div id="final-score-board" class="final-score-board"></div></div>`);
    }
  }
  document.addEventListener('DOMContentLoaded',inject);
  new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(inject,800);
})();
