(function(){
  const scoreDrafts={};
  let busy=false;

  function lockSubmittedAnswers(){
    if(typeof state==='undefined'||state.role!=='team') return;
    const key=`${state.teamId}-${state.viewedStage}`;
    if(!state.submitted?.[key]) return;
    const task=document.querySelector('.task-box');
    if(!task) return;
    task.querySelectorAll('textarea,input[type="radio"]').forEach(node=>node.disabled=true);
    const btn=task.querySelector('button.btn.burgundy');
    if(btn){btn.disabled=true;btn.textContent='Відповідь подано';}
    const status=task.querySelector('.status.ok');
    if(status) status.textContent='Відповідь зафіксовано. Змінити її після подання не можна.';
  }

  function wireScoreInputs(){
    if(typeof state==='undefined'||state.role!=='trainer') return;
    D.teams.forEach(t=>{
      const input=document.getElementById(`score-${t.id}`);
      if(!input) return;
      const draftKey=`${state.viewedStage}-${t.id}`;
      const row=input.closest('.team-row');
      const saveButton=row?.querySelector('button.btn.secondary');
      if(saveButton){
        saveButton.style.display='none';
        if(saveButton.parentElement) saveButton.parentElement.style.display='none';
      }
      input.min='0'; input.max='100'; input.step='1';
      input.placeholder='Бал';
      input.title='Оберіть або введіть бал. Він зберігається автоматично.';

      const remoteScore=window.GAME_SHARED?.roundScore?.(t.id,state.viewedStage,false);
      if(document.activeElement!==input){
        if(Object.prototype.hasOwnProperty.call(scoreDrafts,draftKey)) input.value=scoreDrafts[draftKey];
        else if(remoteScore===null||remoteScore===undefined) input.value='';
        else input.value=String(remoteScore);
      }

      if(input.dataset.autoScoreBound==='1') return;
      input.dataset.autoScoreBound='1';
      input.addEventListener('input',()=>{
        scoreDrafts[`${state.viewedStage}-${t.id}`]=input.value;
      });
      input.addEventListener('change',async()=>{
        const v=input.value.trim();
        if(v==='') return;
        const n=Number(v);
        if(!Number.isFinite(n)||n<0||n>100){alert('Введіть бал від 0 до 100');return;}
        const currentKey=`${state.viewedStage}-${t.id}`;
        scoreDrafts[currentKey]=String(Math.round(n));
        input.value=scoreDrafts[currentKey];
        try{
          if(typeof window.setScore==='function') await window.setScore(t.id);
          setTimeout(()=>{delete scoreDrafts[currentKey];},1800);
        }catch(e){
          console.warn('Auto score save failed',e);
        }
      });
    });
  }

  function apply(){
    if(busy) return;
    busy=true;
    try{lockSubmittedAnswers();wireScoreInputs();}finally{busy=false;}
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,200));
  const observer=new MutationObserver(()=>setTimeout(apply,0));
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  setInterval(apply,500);
})();