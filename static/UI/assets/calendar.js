(() => {
  const {esc,icon}=U;
  const availabilityLabels={BUSY:'正在忙',NEGOTIABLE:'可以商量',FREE:'有空'};
  const dayEvents=day=>U.state.events.filter(e=>U.eventVisible(e)&&U.occursOn(e,day)).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  function mergedAvailability(day) {
    if(!U.connected()||!U.state.partner.shareAvailability)return [];
    const personal=U.state.events.filter(e=>e.kind==='PERSONAL'&&e.owner==='partner'&&!e.deleted&&e.status==='CONFIRMED').map(e=>({id:e.id,start:e.start,end:e.end,status:e.availability,title:e.shareTitle?e.title:''}));
    const items=[...U.state.availability.filter(a=>(a.owner||'partner')==='partner'),...personal].filter(a=>U.day(a.start)<=day&&U.day(a.end)>=day);
    const points=[...new Set(items.flatMap(a=>[Date.parse(a.start),Date.parse(a.end)]))].sort((a,b)=>a-b);
    const priority={BUSY:3,NEGOTIABLE:2,FREE:1};const merged=[];
    points.slice(0,-1).forEach((p,n)=>{const end=points[n+1];const overlap=items.filter(a=>Date.parse(a.start)<end&&Date.parse(a.end)>p).sort((a,b)=>priority[b.status]-priority[a.status]);const status=overlap[0]?.status;if(!status)return;const titles=[...new Set(overlap.map(a=>a.title).filter(Boolean))];const title=titles.length?titles.join(' / '):availabilityLabels[status];const last=merged.at(-1);if(last&&last.status===status&&last.title===title&&Date.parse(last.end)===p)last.end=new Date(end).toISOString();else merged.push({id:`availability-${n}`,start:new Date(p).toISOString(),end:new Date(end).toISOString(),status,title,kind:'AVAILABILITY'});});
    return merged;
  }
  const items=day=>{
    const scope=U.view.calendar.scope;
    if(scope==='partner')return mergedAvailability(day);
    return dayEvents(day).filter(e=>scope==='all'||(scope==='me'?e.kind==='PERSONAL':e.kind==='SHARED'));
  };
  function eventChip(e,compact=false) {
    const availability=e.kind==='AVAILABILITY';const kind=availability?'availability':e.kind==='SHARED'?'shared':'personal';
    return `<button class="calendar-event ${kind} ${e.status==='CANCELLED'?'cancelled':''} ${compact?'compact':''}" data-action="${availability?'availability-view':'event-view'}" data-id="${e.id}" ${availability?`data-start="${e.start}" data-end="${e.end}" data-value="${e.status}"`:''}><span class="event-time">${e.allDay?'全天':U.time(e.start)+'–'+U.time(e.end)}</span><strong>${esc(e.title)}</strong>${!compact?`<span class="event-caption">${availability?'仅展示对方主动分享的内容':e.status==='CANCELLED'?'已取消':e.offline?'由我记录，线下确认':e.kind==='SHARED'?'双方已确认':'我的个人安排'}</span>`:''}</button>`;
  }
  function agenda(view) {
    return `<div class="agenda-list">${Array.from({length:7},(_,n)=>U.addDay(view.day,n)).map(day=>{const list=items(day);return `<section class="agenda-day"><div class="agenda-date"><strong>${U.date(day,{day:'numeric'})}</strong><span>${U.date(day,{weekday:'short'})}</span>${day===U.currentDay()?'<small>今天</small>':''}</div><div class="agenda-events">${list.length?list.map(e=>eventChip(e)).join(''):`<p class="unmarked">${view.scope==='partner'?'未标注 · 不能推断为有空':'没有安排 · 给日常留一点余地'}</p>`}</div></section>`;}).join('')}</div>`;
  }
  function month(view) {
    const first=view.day.slice(0,7)+'-01';const weekday=new Date(first+'T12:00:00Z').getUTCDay();const start=U.addDay(first,-((weekday+6)%7));
    return `<div class="month-calendar"><div class="month-weekdays">${['一','二','三','四','五','六','日'].map(d=>`<span>周${d}</span>`).join('')}</div><div class="month-grid">${Array.from({length:42},(_,n)=>U.addDay(start,n)).map(day=>{const list=items(day);return `<div class="month-cell ${day.slice(0,7)!==view.day.slice(0,7)?'other-month':''} ${day===U.currentDay()?'is-today':''}"><button class="day-number" data-action="calendar-day" data-value="${day}" aria-label="查看${U.date(day)}的安排">${Number(day.slice(-2))}</button><div class="month-events">${list.slice(0,2).map(e=>eventChip(e,true)).join('')}${list.length>2?`<button class="text-link more-events" data-action="calendar-day" data-value="${day}">还有 ${list.length-2} 项</button>`:''}</div></div>`;}).join('')}</div></div>`;
  }
  function week(view) {
    const weekday=new Date(view.day+'T12:00:00Z').getUTCDay();const monday=U.addDay(view.day,-((weekday+6)%7));
    const days=Array.from({length:7},(_,n)=>U.addDay(monday,n));
    const outside=(e,day)=>e.allDay||U.day(e.start)!==day||U.day(e.end)!==day||U.time(e.start)<'08:00'||U.time(e.end)>'23:00';
    const dayItems=day=>items(day).filter(e=>e.status!=='CANCELLED');
    const extra=days.some(day=>dayItems(day).some(e=>outside(e,day)));
    return `<div class="week-calendar"><div class="week-header"><span class="week-time-label">时间</span>${days.map(day=>`<button class="week-day-heading ${day===U.currentDay()?'is-today':''}" data-action="calendar-day" data-value="${day}"><span>${U.date(day,{weekday:'short'})}</span><strong>${Number(day.slice(-2))}</strong></button>`).join('')}</div>${extra?`<div class="week-extra-row"><span class="week-time-label">全天 /<br>其他时间</span>${days.map(day=>`<div class="week-extra-cell">${dayItems(day).filter(e=>outside(e,day)).map(e=>eventChip(e,true)).join('')}</div>`).join('')}</div>`:''}<div class="week-body"><div class="week-times">${Array.from({length:8},(_,n)=>`<span style="top:${n*64}px">${String(8+n*2).padStart(2,'0')}:00</span>`).join('')}</div>${days.map(day=>`<div class="week-column">${dayItems(day).filter(e=>!outside(e,day)).map(e=>{const start=Number(U.time(e.start).slice(0,2))+Number(U.time(e.start).slice(-2))/60;const end=Number(U.time(e.end).slice(0,2))+Number(U.time(e.end).slice(-2))/60;return `<div class="week-event-position" style="top:${(start-8)*32}px;height:${Math.max(37,(end-start)*32)}px">${eventChip(e,true)}</div>`;}).join('')}</div>`).join('')}</div></div>`;
  }
  U.pages.calendar=()=>{
    const s=U.state;
    if(!U.view.calendar)U.view.calendar={mode:matchMedia('(max-width:600px)').matches?'agenda':'week',scope:'all',day:U.currentDay()};
    const v=U.view.calendar;const pending=s.invitations.filter(i=>U.shared(i)&&i.status==='PENDING');
    return `${U.heading('MAKE ROOM FOR US','为时间，留一点余地。','自己的安排好好记，共同的时间慢慢商量。',`<button class="btn primary" data-action="event-new">${icon('plus',16)}个人安排</button>`)}
      <div class="calendar-layout"><section><div class="calendar-toolbar"><div class="flex gap-8"><h2>${U.date(v.day,{year:'numeric',month:'long'})}</h2><button class="icon-button" data-action="calendar-prev" aria-label="上一个${v.mode==='month'?'月':'周'}">${icon('left',17)}</button><button class="icon-button" data-action="calendar-next" aria-label="下一个${v.mode==='month'?'月':'周'}">${icon('chevron',17)}</button><button class="text-link" data-action="calendar-today">今天</button></div><div class="tabs" aria-label="日历显示方式">${[['agenda','日程'],['week','周'],['month','月']].map(([mode,label])=>`<button class="tab ${v.mode===mode?'active':''}" data-action="calendar-mode" data-value="${mode}" aria-pressed="${v.mode===mode}">${label}</button>`).join('')}</div></div>
      <div class="calendar-scopes filter-chips">${[['all','全部安排'],['me','我的安排'],['shared','共同安排'],['partner','对方忙闲']].filter(([key])=>U.connected()||key==='all'||key==='me').map(([key,label])=>`<button class="filter-chip ${v.scope===key?'active':''}" data-action="calendar-scope" data-value="${key}" aria-pressed="${v.scope===key}">${label}</button>`).join('')}</div>
      ${v.scope==='partner'?`<div class="inline-note mt-16">${icon('lock',16)}${s.partner.shareAvailability?`只展示 ${esc(s.partner.name)} 主动共享的时间与状态；标题需逐条主动分享，个人备注不展示。未标注不代表有空。`:'对方尚未开启忙闲共享，不能从空白日历推断对方有空。'}</div>`:''}
      <div class="card calendar-board mt-16">${v.mode==='agenda'?agenda(v):v.mode==='month'?month(v):week(v)}</div><div class="calendar-legend"><span><i class="dot" style="color:#9cae89"></i> 我的安排</span>${U.connected()?'<span><i class="dot" style="color:#cd987d"></i> 共同安排</span><span><i class="dot" style="color:#a89bb4"></i> 对方忙闲</span>':''}<span class="spacer"></span><small>${esc(s.user.timezone)}</small></div></section>
      <aside class="calendar-aside stack"><section class="card peach"><div class="section-header"><div class="section-title">${icon('calendar',17)}<h2>留一点时间给我们</h2></div></div><p class="quiet-note">先发出一个提议，让对方决定什么时候方便。</p><button class="btn secondary mt-16" data-action="invite-new">${icon('plus',15)}${U.connected()?'发起邀约':'连接后发起邀约'}</button></section>
      <section><div class="section-header"><div class="section-title">${icon('chat',17)}<h2>商量中的安排</h2><span class="count">${pending.length}</span></div></div>${pending.length?pending.map(i=>`<article class="card invitation-card"><div class="flex between"><small class="muted">${esc(U.person(i.sender))} ${i.sender==='me'?'发出的提议':'的邀约'}</small>${U.badge(i.purpose==='CHANGE'?'修改提案':'待确认','peach')}</div><h3 class="mt-16">${esc(i.title)}</h3><p class="quiet-note mt-8">${U.formatRange(i)}</p><button class="text-link mt-16" data-action="invite-view" data-id="${i.id}">${i.sender==='partner'?'看看这份邀约':'查看提议'} ${icon('arrow',13)}</button></article>`).join(''):U.empty('还没有待处理的邀约','接受后的邀约会成为共同安排。')}</section>
      <section class="card soft"><div class="section-title">${icon('lock',17)}<h2>我的忙闲共享</h2></div><p class="quiet-note mt-16">${s.user.shareAvailability?'已开启。对方只能看到时间与状态，标题需逐条额外选择分享。':'默认关闭。你的个人时间块不会出现在对方的忙闲视图中。'}</p><a class="text-link mt-16" href="me.html">管理可见性 ${icon('arrow',13)}</a></section>
      <div class="inline-note">${icon('leaf',16)}不用把每一天填满。先有一个提议，再一起确认。</div></aside></div>`;
  };
  U.actions['calendar-mode']=({value})=>{U.view.calendar.mode=value;U.render();};
  U.actions['calendar-scope']=({value})=>{U.view.calendar.scope=value;U.render();};
  U.actions['calendar-day']=({value})=>{U.view.calendar.day=value;U.view.calendar.mode='agenda';U.render();};
  U.actions['calendar-today']=()=>{U.view.calendar.day=U.currentDay();U.render();};
  function move(direction){const v=U.view.calendar;if(v.mode==='month'){const d=new Date(v.day.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+direction);v.day=d.toISOString().slice(0,10);}else v.day=U.addDay(v.day,direction*7);U.render();}
  U.actions['calendar-prev']=()=>move(-1);U.actions['calendar-next']=()=>move(1);
  U.actions['availability-view']=({start,end,value})=>U.modal(availabilityLabels[value],`<div class="detail-meta">${U.badge('对方忙闲','purple','lock')}</div><p class="modal-copy">${U.date(start)} ${U.time(start)}–${U.time(end)}</p><div class="inline-note mt-16">${icon('lock',16)}仅展示时间与状态，个人标题和备注保持私密。没有记录的时段为未标注。</div>`,{eyebrow:'SHARED AVAILABILITY'});
})();
