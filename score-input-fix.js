(function(){
  let activeScoreInput=null;

  document.addEventListener('focusin',function(e){
    const input=e.target;
    if(!(input instanceof HTMLInputElement)) return;
    if(!/^score-[ABC]$/.test(input.id)) return;

    activeScoreInput=input;
    input.dataset.scoreId=input.id;
    input.removeAttribute('id');
  });

  document.addEventListener('focusout',function(e){
    const input=e.target;
    if(!(input instanceof HTMLInputElement)) return;
    const originalId=input.dataset.scoreId;
    if(!originalId) return;

    input.id=originalId;
    delete input.dataset.scoreId;
    activeScoreInput=null;
  });

  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter') return;
    const input=e.target;
    if(!(input instanceof HTMLInputElement)) return;
    const originalId=input.dataset.scoreId;
    if(!originalId) return;

    const teamId=originalId.replace('score-','');
    input.id=originalId;
    delete input.dataset.scoreId;
    activeScoreInput=null;
    if(typeof window.setScore==='function') window.setScore(teamId);
  });
})();
