(function(){
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function isTrainerFinal(){
    return typeof state!=='undefined' && state.role==='trainer' && window.GAME_DATA && window.GAME_DATA.stages && state.viewedStage===window.GAME_DATA.stages[window.GAME_DATA.stages.length-1].id;
  }

  function totals(){
    const teams=window.GAME_SHARED?.activeTeams?.()||window.GAME_DATA.teams;
    return teams.map(t=>({id:t.id,name:t.name,score:window.GAME_SHARED?window.GAME_SHARED.totalScore(t.id):Number((state.scores||{})[t.id]||0)}));
  }

  function ensureFinalUI(){
    if(!isTrainerFinal()) return;
    const main=document.querySelector('main.container');
    if(!main) return;
    const published=!!window.GAME_SHARED?.isFinalPublished?.();
    const rows=totals();
    const old=document.getElementById('final-score-controls');
    if(old) old.remove();
    main.insertAdjacentHTML('beforeend',`<section id="final-score-controls" class="card final-score-controls"><div class="section-kicker">Завершення гри</div><h2>Фінальний рахунок</h2><p class="muted">Після внесення оцінок за фінальний раунд опублікуйте рахунок. Після публікації його автоматично побачать усі команди.</p><div class="final-live-scores">${rows.map(t=>`<div data-team="${esc(t.id)}"><strong>${esc(t.name)}</strong><span>${t.score}</span></div>`).join('')}</div><div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap"><button class="btn burgundy final-show-btn" onclick="showSharedFinalBoard()">Показати табло</button><button class="btn ${published?'secondary':'burgundy'} final-show-btn" onclick="publishSharedFinal()">${published?'Опубліковано для команд':'Опублікувати для команд'}</button></div>${published?'<p class="status ok" style="margin-top:14px">Фінальний рахунок уже доступний усім командам.</p>':''}</section>`);
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureFinalUI,500));
  setInterval(ensureFinalUI,1800);
})();
