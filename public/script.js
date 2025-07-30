
/* ================================================================
   SmartStudent – Universal Front‑End Script
   ================================================================ */
const API =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://smartstudent-backend.onrender.com';

/*  ────────────────────────────────────────────────────────────── */
/*  GLOBAL HELPERS                                                */
/*  ────────────────────────────────────────────────────────────── */
const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
function openModal(id){ $(id).classList.remove('hidden'); }
function closeModal(id){ $(id).classList.add   ('hidden'); }
function sanitize(str=''){ return String(str).replace(/[<>"']/g,''); }
function toast(msg,type='ok'){
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  if(type==='err') t.style.background='#f44336';
  document.body.appendChild(t); setTimeout(()=>t.remove(),3500);
}
async function api(url,opts={}){ return fetch(`${API}${url}`,{credentials:'include',...opts}); }


/*  ────────────────────────────────────────────────────────────── */
/*  SERVICE‑WORKER + PUSH                                         */
/*  ────────────────────────────────────────────────────────────── */
(async ()=>{
  if(!('serviceWorker' in navigator)) return;

  const reg = await navigator.serviceWorker.register('/service-worker.js');
  console.log('[SW] ready', reg);

  /* push subscription (VAPID public key served by backend) */
  if('PushManager' in window){
    try{
      const { vapid } = await api('/api/push/key').then(r=>r.json());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:Uint8Array.from(atob(vapid), c=>c.charCodeAt(0))
      });
      await api('/api/push/subscribe',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(sub)
      });
    }catch(e){ console.warn('[Push] permission denied or error',e); }
  }

  /* receive SW messages (eg. REFRESH broadcast) */
  navigator.serviceWorker.addEventListener('message', ({data})=>{
    if(data?.type==='REFRESH'){ refreshAllWidgets(); }
  });
})();


/*  ────────────────────────────────────────────────────────────── */
/*  DASHBOARD FUNCTIONS                                           */
/*  ────────────────────────────────────────────────────────────── */
async function addAssignment(){
  const title   = sanitize($('#taskTitle')?.value);
  const subject = sanitize($('#taskSubject')?.value);
  const date    = $('#taskDueDate')?.value;
  const time    = $('#taskDueTime')?.value;
  if(!title||!subject||!date) return toast('Fill all fields','err');

  const dueISO = time ? `${date}T${time}:00` : `${date}T23:59:00`;

  /* optimistic UI & offline‑queue */
  const body = JSON.stringify({ title, subject, due_datetime: dueISO });
  try{
    const r = await api('/api/assignments',{method:'POST',headers:{'Content-Type':'application/json'},body});
    if(!r.ok) throw new Error('Server returned '+r.status);
    toast('Assignment saved!');
    closeModal('taskModal');
    loadAssignments();           // refresh list
  }catch(e){
    /* offline – let SW retry */
    navigator.serviceWorker.ready.then(reg=>
      reg.active.postMessage({
        type:'QUEUE_REQUEST',
        payload:{ url:'/api/assignments', init:{ method:'POST', headers:{'Content-Type':'application/json'}, body } }
      })
    );
    toast('Saved locally – will sync when online');
  }

  /* schedule local reminder 2 h before due */
  scheduleLocalReminder(title, dueISO);
}

function scheduleLocalReminder(title,dueISO){
  const due = new Date(dueISO).getTime();
  const t   = due - 2*60*60*1000;         // 2 h earlier
  const delay = t - Date.now();
  if(delay <= 0) return;

  if('serviceWorker' in navigator){
    navigator.serviceWorker.ready.then(reg=>{
      reg.active.postMessage({
        type   :'REMINDER',
        title  :title,
        body   :`“${title}” is due in 2 hours`,
        delayMs: delay
      });
    });
  }
}


/*  ────────────────────────────────────────────────────────────── */
/*  LOADERS (Assignments / Budget / Goals / Rewards)              */
/*  ────────────────────────────────────────────────────────────── */
async function loadAssignments(){
  const list = $('#assignmentList'); if(!list) return;
  list.textContent='Loading…';

  const data = await api('/api/assignments').then(r=>r.json());
  list.innerHTML='';
  data.forEach(t=>{
    const li=document.createElement('li');
    li.textContent=`${t.title} – ${t.subject} (due ${new Date(t.due_datetime).toLocaleString()})`;
    list.appendChild(li);
  });
}

async function loadBudget(){
  const list = $('#budgetList'); if(!list) return;
  const data = await api('/api/expenses').then(r=>r.json());
  list.innerHTML='';
  data.forEach(e=>{
    const li=document.createElement('li');
    li.textContent=`${e.title} – GH₵${e.amount} [${e.type}]`;
    list.appendChild(li);
  });
  checkBudgetStatus(data);
}

function checkBudgetStatus(expenses){
  /* simple goal check – can be replaced with backend metric */
  const spent = expenses.filter(e=>e.type==='expense')
                        .reduce((s,e)=>s+e.amount,0);
  const goals = expenses.filter(e=>e.type==='goal')
                        .reduce((s,e)=>s+e.amount,0);

  if(goals && spent <= goals)
    toast('🎉 You are within this week’s budget!');
}

async function loadGoals(){
  const holder = $('#savedGoal'); if(!holder) return;
  const data = await api('/api/goals').then(r=>r.json());
  holder.textContent = data.length ? data[0].text : 'No goal set';
}

async function loadRewards(){
  const ul = $('#rewardList'); if(!ul) return;
  const data=await api('/api/rewards').then(r=>r.json());
  ul.innerHTML='';
  data.forEach(r=>{
    const li=document.createElement('li');
    li.textContent=`🏅 ${r.description}`;
    ul.appendChild(li);
  });
}

/*  ────────────────────────────────────────────────────────────── */
/*  FINANCIAL PAGE – Weekly Quote rotation                        */
/*  ────────────────────────────────────────────────────────────── */
function initFinancialPage(){
  const quotes = [
    { q:'“A budget is telling your money where to go instead of wondering where it went.”', a:'– Dave Ramsey' },
    { q:'“Beware of little expenses; a small leak will sink a great ship.”',             a:'– Ben Franklin' },
    { q:'“Do not save what is left after spending, but spend what is left after saving.”',a:'– Warren Buffett' },
    { q:'“Money looks better in the bank than on your feet.”',                            a:'– Sophia Amoruso' },
    { q:'“The quickest way to double your money is to fold it over and put it back in your pocket.”', a:'– Will Rogers'}
  ];

  const idx = Math.floor(Date.now() / (7*24*60*60*1000)) % quotes.length; // weekly
  $('#weeklyQuote') .textContent = quotes[idx].q;
  $('#weeklyAuthor').textContent = quotes[idx].a;
}

/*  ────────────────────────────────────────────────────────────── */
/*  REWARDS PAGE – Badge & streak logic                           */
/*  ────────────────────────────────────────────────────────────── */
async function initRewardsPage(){
  const user = await api('/api/userinfo').then(r=>r.json());
  const week = await api('/api/metrics/week').then(r=>r.json()); // { goalMet, budgetMet, assignmentsMet }

  const ul = $('#badgeList');
  if(week.goalMet   ) ul.innerHTML += '<li>🏅 Goal Crusher</li>';
  if(week.budgetMet ) ul.innerHTML += '<li>💰 Budget Boss</li>';
  if(week.assignMet ) ul.innerHTML += '<li>📘 Assignment Ace</li>';

  if(week.goalMet && week.budgetMet && week.assignMet){
    $('#weeklyMessage').innerHTML =
      `<strong>🎉 Great job ${user.firstname}!</strong><br>You nailed all weekly targets.`;
  }
}

/*  ────────────────────────────────────────────────────────────── */
/*  TEACHER PAGE                                                 */
/*  ────────────────────────────────────────────────────────────── */
async function loadTeacherDash(){
  if(!location.pathname.endsWith('teachers.html')) return;

  /* students */
  const studs = await api('/api/teacher/students/class').then(r=>r.json());
  const ul=$('#classStudentList'); ul.innerHTML='';
  studs.forEach(s=>{
    const li=document.createElement('li');
    li.innerHTML=`<strong>${s.firstname} ${s.lastname}</strong>
      <button onclick="openAssign('${s.email}','${s.firstname} ${s.lastname}')">Assign</button>`;
    ul.appendChild(li);
  });

  /* overdue check */
  const overdue = await api('/api/teacher/overdue').then(r=>r.json());
  overdue.forEach(o=> toast(`⏰ ${o.student_email} overdue: ${o.title}`,'err'));

  /* live feedback polling → show toast */
  pollNewFeedback();
}

async function pollNewFeedback(lastId=0){
  const fb = await api(`/api/teacher/feedback?since=${lastId}`).then(r=>r.json());
  fb.forEach(f=>{
    toast(`💬 New feedback from ${f.student_email}`);
    lastId = Math.max(lastId, f.id);
  });
  setTimeout(()=>pollNewFeedback(lastId), 15000);   // 15 s
}

/*  ────────────────────────────────────────────────────────────── */
/*  OFF‑CANVAS NAV / YEAR FOOTER                                  */
/*  ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{
  $('#menuToggle')?.addEventListener('click',()=>$('#navMenu').classList.toggle('show'));
  $('#year')?.textContent = new Date().getFullYear();

  /* route‑specific init */
  if(location.pathname.endsWith('dashboard.html'))   refreshAllWidgets();
  if(location.pathname.endsWith('financial.html'))   initFinancialPage();
  if(location.pathname.endsWith('rewards.html'))     initRewardsPage();
  if(location.pathname.endsWith('teachers.html'))    loadTeacherDash();
});

/* Helper to refresh multiple lists at once */
function refreshAllWidgets(){
  loadAssignments(); loadBudget(); loadGoals(); loadRewards();
}

/*  ────────────────────────────────────────────────────────────── */
/*  TIMEZONE -> backend                                           */
/*  ────────────────────────────────────────────────────────────── */
try{
  api('/api/timezone',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ timezone:Intl.DateTimeFormat().resolvedOptions().timeZone })
  });
}catch{ /* ignore */ }

/*  ────────────────────────────────────────────────────────────── */
/*  EXPORT globals some pages still call directly                 */
/*  ────────────────────────────────────────────────────────────── */
window.addTask      = addAssignment;
window.addExpense   = addExpense;
window.saveGoal     = addGoal;
window.submitFeedback = async ()=>{
  const txt = $('#feedbackText').value.trim();
  if(!txt) return toast('Write something first','err');
  const fd  = new FormData();
  fd.append('message',txt);
  if($('#feedbackFile').files[0]) fd.append('file',$('#feedbackFile').files[0]);

  await api('/api/feedback',{method:'POST',body:fd});
  $('#feedbackText').value=''; $('#feedbackFile').value=null;
  closeModal('feedbackModal'); toast('Feedback sent!');
};


