/* Complete local collections stand in for the paged v1.3 list contracts. */
(() => {
  const {esc,icon}=U;
  const boundaries=new Map();
  U.createdDesc=(a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||String(b.id).localeCompare(String(a.id));
  U.updatedDesc=(a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||String(b.id).localeCompare(String(a.id));
  U.invitationExpiry=i=>Math.min(Date.parse(i.start),i.targetEventId?Date.parse(U.find('events',i.targetEventId)?.start)||Infinity:Infinity);
  U.dashboard=()=>{
    U.expire();const asOf=new Date().toISOString(),day=U.currentDay();
    const group=(items,limit)=>({items:items.slice(0,limit),total:items.length,hasMore:items.length>limit});
    const events=U.state.events.filter(e=>U.eventVisible(e)&&e.status==='CONFIRMED'&&U.occursOn(e,day)).sort((a,b)=>Date.parse(U.eventBounds(a).start)-Date.parse(U.eventBounds(b).start)||String(a.id).localeCompare(String(b.id)));
    const expressions=U.state.expressions.filter(x=>U.expressionVisible(x)&&x.sender==='partner'&&x.status==='OPEN').sort(U.createdDesc);
    const invitations=U.state.invitations.filter(i=>U.shared(i)&&i.sender==='partner'&&i.status==='PENDING'&&U.invitationExpiry(i)>Date.now()).sort((a,b)=>U.invitationExpiry(a)-U.invitationExpiry(b)||String(a.id).localeCompare(String(b.id)));
    const reminders=U.pendingReminders().sort((a,b)=>Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt)||String(a.id).localeCompare(String(b.id)));
    const commitments=U.state.commitments.filter(c=>U.commitmentVisible(c)&&c.owner==='me'&&c.status==='OPEN'&&(U.deadline(c).isOverdue||U.deadline(c).isDueToday)).sort((a,b)=>Number(U.deadline(b).isOverdue)-Number(U.deadline(a).isOverdue)||U.compareDeadline(a,b));
    const featuredMemory=U.state.memories.filter(m=>m.owner==='me'&&U.memoryVisible(m)&&!m.archived).sort(U.updatedDesc)[0]||null;
    return {asOf,timezone:U.state.user.timezone,today:day,groups:{events:group(events,10),expressions:group(expressions,5),invitations:group(invitations,5),reminders:group(reminders,5),commitments:group(commitments,5)},featuredMemory,unreadCount:U.unread()};
  };
  U.pager=(list,total,size=20)=>{
    const v=U.view[list];v.page||=1;v.totalPages=Math.max(1,Math.ceil(total/size));v.page=Math.min(v.page,v.totalPages);
    return `<div class="list-pagination"><span class="quiet-note">共 ${total} 条 · 第 ${v.page} / ${v.totalPages} 页</span><div class="flex gap-8"><button class="btn soft small" data-action="list-page" data-list="${list}" data-value="${v.page-1}" ${v.page===1?'disabled':''}>上一页</button><button class="btn soft small" data-action="list-page" data-list="${list}" data-value="${v.page+1}" ${v.page===v.totalPages?'disabled':''}>下一页</button></div></div>`;
  };
  U.actions['list-page']=({list,value})=>{const v=U.view[list];if(!v)return;v.page=Math.max(1,Math.min(v.totalPages||1,Number(value)||1));if(list==='notifications')U.actions.notifications();else if(list==='invitations')U.actions['invitations-list']();else U.render();};
  U.invitationsData=v=>{
    U.expire();return U.state.invitations.filter(U.shared).filter(i=>(v.direction==='ALL'||i.sender===(v.direction==='RECEIVED'?'partner':'me'))&&(v.status==='ALL'||i.status===v.status)&&(v.purpose==='ALL'||i.purpose===v.purpose)).sort(U.createdDesc);
  };
  U.actions['invitations-list']=({direction,status,purpose}={})=>{
    U.view.invitations||={direction:'ALL',status:'ALL',purpose:'ALL',page:1};const v=U.view.invitations;
    if(direction||status||purpose)Object.assign(v,{...(direction?{direction}:{}),...(status?{status}:{}),...(purpose?{purpose}:{}),page:1});
    const all=U.invitationsData(v),pager=U.pager('invitations',all.length),items=all.slice((v.page-1)*20,v.page*20);
    U.modal('我们的邀约',`<div class="form-grid invitation-list-filters">${U.select('inviteDirection','邀约方向',[['ALL','全部方向'],['RECEIVED','收到的'],['SENT','发出的']],v.direction)}${U.select('inviteStatus','邀约状态',[['ALL','全部状态'],...Object.entries(U.inviteLabels)],v.status)}${U.select('invitePurpose','提议用途',[['ALL','全部用途'],['CREATE','新邀约'],['CHANGE','修改提案']],v.purpose)}</div><div class="invitation-history">${items.length?items.map(i=>`<button class="invitation-history-item" data-action="invite-view" data-id="${i.id}"><span><strong>${esc(i.title)}</strong><small>${U.formatRange(i)} · ${i.sender==='me'?'我发出':'收到的'}${i.purpose==='CHANGE'?' · 修改提案':''}</small></span>${U.badge(U.inviteLabels[i.status],i.status==='PENDING'?'peach':'gray')}${icon('chevron',13)}</button>`).join(''):U.empty('没有符合筛选的提议','可以试试其他方向、状态或用途。')}</div>${pager}`,{eyebrow:'OUR INVITATIONS',wide:true});
    ['inviteDirection','inviteStatus','invitePurpose'].forEach((name,n)=>document.querySelector('[name="'+name+'"]')?.addEventListener('change',event=>{v[['direction','status','purpose'][n]]=event.target.value;v.page=1;U.actions['invitations-list']();}));
  };
  U.makeReadBoundary=()=>{
    const token=U.operationKey();boundaries.set(token,{actor:U.state.user.username,expiresAt:Date.now()+120000,members:U.state.notifications.filter(U.notificationVisible).map(n=>n.id)});return token;
  };
  U.readNotification=id=>{
    const n=U.find('notifications',id);if(!n||!U.notificationVisible(n))return false;
    if(!n.read){n.read=true;n.readAt=new Date().toISOString();}U.save();return true;
  };
  U.readAllNotifications=token=>{
    const boundary=boundaries.get(token);
    if(!boundary||boundary.actor!==U.state.user.username||boundary.expiresAt<=Date.now())return {ok:false,message:'本次通知集合已过期，请刷新列表后重新操作。'};
    let updatedCount=0;boundary.members.forEach(id=>{const n=U.find('notifications',id);if(n&&!n.read&&U.notificationVisible(n)){U.readNotification(id);updatedCount+=1;}});return {ok:true,updatedCount,unreadCount:U.unread()};
  };
  U.actions.notifications=({refresh=false}={})=>{
    U.view.notifications||={page:1,read:'ALL'};const v=U.view.notifications;
    if(refresh||!v.boundary||v.actor!==U.state.user.username){v.boundary=U.makeReadBoundary();v.actor=U.state.user.username;v.page=1;}
    const list=U.state.notifications.filter(U.notificationVisible).filter(n=>v.read==='ALL'||(v.read==='UNREAD'?!n.read:n.read)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||String(b.id).localeCompare(String(a.id)));
    const pager=U.pager('notifications',list.length),items=list.slice((v.page-1)*20,v.page*20);
    U.modal('给你的提醒',`<div class="flex between"><p class="quiet-note">${U.unread()} 条未读 · 邮件投递状态单独展示</p><button class="text-link" data-action="notifications-refresh">刷新列表</button></div><div class="tabs mt-16" aria-label="通知状态">${[['ALL','全部'],['UNREAD','未读'],['READ','已读']].map(([value,label])=>`<button class="tab ${v.read===value?'active':''}" data-action="notifications-filter" data-value="${value}" aria-pressed="${v.read===value}">${label}</button>`).join('')}</div><div class="notification-list mt-16">${items.length?items.map(n=>`<div class="notification-item"><button class="notification-row ${n.read?'':'unread'}" data-action="notification-open" data-id="${n.id}"><span class="icon-box">${icon(n.kind==='expression'?'heart':n.kind==='invitation'?'calendar':'bell',19)}</span><span class="notification-text"><strong>${esc(n.message)}</strong><small>${U.date(n.at)} ${U.time(n.at)}</small></span>${!n.read?'<span class="dot coral"></span>':''}${icon('chevron',15)}</button>${U.mailDeliveryHTML(n)}</div>`).join(''):U.empty('这里暂时安静','互动通知与自己的到时提醒会出现在这里。')}</div>${pager}<button class="btn soft mt-16" data-action="notifications-read">将本次打开时的通知全部标为已读</button><p class="quiet-note mt-8">涵盖打开时的全部页，之后新到的通知保持未读。</p><div class="inline-note mt-16">${icon('info',16)}邮件失败不影响站内通知，标为已读也不会取消邮件。预览仅在网页打开时模拟处理，不发送真实邮件。</div>`,{eyebrow:'JUST FOR YOU'});
  };
  U.actions['notifications-refresh']=()=>U.actions.notifications({refresh:true});
  U.actions['notifications-filter']=({value})=>{U.view.notifications.read=value;U.view.notifications.page=1;U.actions.notifications();};
  U.actions['notifications-read']=()=>{const result=U.readAllNotifications(U.view.notifications?.boundary);if(!result.ok)return U.toast(result.message,true);U.render();U.actions.notifications({refresh:true});U.toast('已标记 '+result.updatedCount+' 条，剩余 '+result.unreadCount+' 条未读');};
  U.actions['notification-open']=({id})=>{if(!U.readNotification(id))return;U.render();const n=U.find('notifications',id),action={expression:'expression-view',invitation:'invite-view',memory:'memory-view',event:'event-view',commitment:'commitment-view'}[n.kind];if(action)U.actions[action]({id:n.resourceId});else U.modal('站内通知',`<p class="modal-copy">${esc(n.message)}</p>`);};
})();
