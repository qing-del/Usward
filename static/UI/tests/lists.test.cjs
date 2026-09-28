const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('./helpers/preview.cjs');

test('dashboard computes full group totals, five/ten item caps and latest updated memory',()=>{
  const env=preview(),{U}=env;env.load('expressions.js');
  const day=U.currentDay(),todayStart=U.startOfDay(day);
  for(let k=0;k<12;k++){
    U.state.events.push({id:'bulk-event-'+k,kind:'PERSONAL',owner:'me',status:'CONFIRMED',start:new Date(Date.parse(todayStart)+k*60000).toISOString(),end:new Date(Date.parse(todayStart)+(k+1)*60000).toISOString()});
    U.state.expressions.push({id:'bulk-expression-'+k,sender:'partner',status:'OPEN',type:'表达'+k,body:'',createdAt:new Date(Date.parse(todayStart)+k*60000).toISOString(),connectionId:U.state.connectionId,replies:[]});
    U.state.invitations.push({id:'bulk-invite-'+k,sender:'partner',status:'PENDING',purpose:'CREATE',title:'邀约'+k,start:new Date(Date.parse(todayStart)+86400000+k*60000).toISOString(),end:new Date(Date.parse(todayStart)+86400000+(k+1)*60000).toISOString(),connectionId:U.state.connectionId,createdAt:new Date(Date.parse(todayStart)+k*60000).toISOString()});
    U.state.commitments.push({id:'bulk-commitment-'+k,owner:'me',title:'今天承诺'+k,status:'OPEN',dueKind:'DATE',dueDate:day,dueTimezone:U.state.user.timezone,due:day,shared:false});
    U.state.reminders.push({id:'bulk-reminder-'+k,resourceType:'COMMITMENT',resourceId:'bulk-commitment-'+k,recipient:U.state.user.username,scheduledAt:new Date(Date.parse(todayStart)+3600000+k*60000).toISOString(),deliveryMode:'IN_APP',revision:1,status:'PENDING'});
  }
  U.state.memories.push({id:'featured-new',owner:'me',title:'最新自己卡片',body:'',category:'自我反思',tags:[],archived:false,deleted:false,updatedAt:'2026-12-01T00:00:00Z'});
  const d=U.dashboard();assert.equal(d.groups.events.items.length,10);assert.ok(d.groups.events.total>10);
  for(const name of ['expressions','invitations','reminders','commitments']){assert.equal(d.groups[name].items.length,5);assert.ok(d.groups[name].total>5);assert.equal(d.groups[name].hasMore,true);}
  assert.equal(d.featuredMemory.id,'featured-new');assert.equal(d.unreadCount,U.unread());
  const html=U.pages.today();assert.match(html,/最新自己卡片/);assert.match(html,/查看全部表达/);assert.match(html,/查看全部邀约/);
  assert.doesNotMatch(html,/选好下周一起看的电影/);
});

test('NONE does not suppress dashboard interaction content and an exact deadline is overdue on home',()=>{
  const env=preview(),{U}=env;const x=U.find('expressions','x1');
  U.putNotificationSetting('EXPRESSION',x.id,'NONE',null);
  const c=U.find('commitments','c1');c.dueKind='INSTANT';c.dueAt='2026-09-27T11:00:00Z';c.dueDate=null;c.dueTimezone=null;
  assert.ok(U.dashboard().groups.expressions.items.some(item=>item.id===x.id));
  assert.ok(U.dashboard().groups.commitments.items.some(item=>item.id===c.id));
  assert.match(U.pages.today(),/已过约定时间/);
});

test('expression and commitment lists paginate after full-scope filters and reset page on filter changes',()=>{
  const env=preview(),{U}=env;env.load('expressions.js');
  for(let k=0;k<29;k++)U.state.expressions.push({id:'page-x'+k,sender:'partner',status:k<21?'OPEN':'RESPONDED',type:'第'+k+'条',body:'',createdAt:new Date(Date.parse('2026-09-27T12:00:00Z')+k*60000).toISOString(),connectionId:U.state.connectionId,replies:[]});
  U.view.expressions={tab:'received',status:'OPEN',page:1};let html=U.pages.expressions();assert.match(html,/第 1 \/ 2 页/);
  assert.match(html,/第20条/);assert.doesNotMatch(html,/第0条/);
  U.actions['list-page']({list:'expressions',value:'2'});html=U.pages.expressions();assert.match(html,/第 2 \/ 2 页/);assert.match(html,/第0条/);
  U.actions['expression-tab']({value:'sent'});assert.equal(U.view.expressions.page,1);
  for(let k=0;k<27;k++)U.state.commitments.push({id:'page-c'+k,owner:'me',title:'批量承诺'+k,status:k<21?'OPEN':'DONE',dueKind:'NONE',due:'',shared:false});
  U.view.commitments={tab:'OPEN',partnerStatus:'ALL',sort:'DEADLINE_ASC',page:1};html=U.pages.commitments();assert.match(html,/第 1 \/ 2 页/);
  U.actions['list-page']({list:'commitments',value:'2'});html=U.pages.commitments();assert.match(html,/第 2 \/ 2 页/);
  U.actions['commitment-tab']({value:'DONE'});assert.equal(U.view.commitments.page,1);
});

test('available memory tags count the entire authorised filtered scope before tag selection',()=>{
  const env=preview(),{U}=env;env.load('memories.js');
  for(let k=0;k<22;k++)U.state.memories.push({id:'tag-'+k,owner:'me',title:'查找事项 '+k,body:'',category:'其他',source:'INTERPRETATION',tags:['多张标签'],shared:false,archived:false,updatedAt:new Date(Date.parse('2026-09-27T12:00:00Z')+k*60000).toISOString()});
  U.view.memories={tab:'mine',category:'其他',tag:'多张标签',search:'查找事项',limit:9};let html=U.pages.memories();
  assert.match(html,/多张标签 · 22/);assert.match(html,/22<\/span> 张小小的记忆/);assert.match(html,/再翻 9 张记忆/);
  U.actions['memory-load-more']();html=U.pages.memories();assert.match(html,/再翻 4 张记忆/);
  U.view.memories.category='喜好兴趣';html=U.pages.memories();assert.doesNotMatch(html,/多张标签 · 22/);
});

test('invitation list uses full direction, status, purpose filters and paginates without waiting for a scanner',()=>{
  const env=preview(),{U}=env;
  for(let k=0;k<25;k++)U.state.invitations.push({id:'list-i'+k,sender:'partner',status:'PENDING',purpose:k<23?'CREATE':'CHANGE',title:'第'+k+'份邀约',start:'2026-10-02T08:00:00Z',end:'2026-10-02T09:00:00Z',createdAt:new Date(Date.parse('2026-09-27T12:00:00Z')+k*60000).toISOString(),connectionId:U.state.connectionId});
  U.view.invitations={direction:'RECEIVED',status:'PENDING',purpose:'CREATE',page:1};U.actions['invitations-list']();assert.match(env.modal.html,/第 1 \/ 2 页/);
  U.actions['list-page']({list:'invitations',value:'2'});assert.match(env.modal.html,/第 2 \/ 2 页/);
  U.actions['invitations-list']({purpose:'CHANGE'});assert.match(env.modal.html,/共 2 条/);
  env.advance(864000000);U.actions['invitations-list']({status:'EXPIRED',purpose:'ALL'});assert.match(env.modal.html,/已过期/);
});

test('notification unread count spans pages; read boundary excludes later arrivals and inaccessible notices',()=>{
  const env=preview(),{U}=env;
  for(let k=0;k<26;k++)U.state.notifications.push({id:'list-n'+k,kind:'memory',resourceType:'MEMORY_CARD',resourceId:'m2',sourceType:'BUSINESS',recipient:U.state.user.username,connectionId:U.state.connectionId,message:'可见通知 '+k,read:false,at:new Date(Date.parse('2026-09-27T12:00:00Z')+k*60000).toISOString()});
  const initial=U.unread();U.actions.notifications();assert.match(env.modal.html,new RegExp(initial+' 条未读'));assert.match(env.modal.html,/第 1 \/ 2 页/);
  U.actions['list-page']({list:'notifications',value:'2'});assert.match(env.modal.html,/第 2 \/ 2 页/);
  const late={id:'late-n',kind:'memory',resourceType:'MEMORY_CARD',resourceId:'m2',sourceType:'BUSINESS',recipient:U.state.user.username,connectionId:U.state.connectionId,message:'后来到的通知',read:false,at:new Date().toISOString()};U.state.notifications.push(late);
  U.state.mailDeliveries.push({id:'mail-pair',notificationId:'list-n0',sourceType:'BUSINESS',status:'QUEUED',recipient:'linan',recipientEmail:'linan@example.com'});
  const result=U.readAllNotifications(U.view.notifications.boundary);assert.equal(result.ok,true);assert.equal(result.updatedCount,initial);assert.equal(result.unreadCount,1);
  assert.equal(late.read,false);assert.equal(U.state.mailDeliveries.at(-1).status,'QUEUED');
  U.actions.notifications({refresh:true});assert.match(env.modal.html,/1 条未读/);
  U.state.memories.find(m=>m.id==='m2').shared=false;assert.equal(U.unread(),0);
  const invalid=U.readAllNotifications(U.view.notifications.boundary);assert.equal(invalid.updatedCount,0);
});

test('notification read boundary is actor bound, expires and preserves first read timestamp',()=>{
  const env=preview(),{U}=env;const first=U.state.notifications.find(U.notificationVisible);
  assert.equal(U.readNotification(first.id),true);const at=first.readAt;env.advance(1000);U.readNotification(first.id);assert.equal(first.readAt,at);
  const token=U.makeReadBoundary();U.switchAccount('chenyu');assert.equal(U.readAllNotifications(token).ok,false);
  U.switchAccount('linan');env.advance(120001);assert.equal(U.readAllNotifications(token).ok,false);
});

test('private reminder list filters the full authorised scope and paginates after filtering',()=>{
  const env=preview(),{U}=env;
  for(let k=0;k<25;k++)U.state.reminders.push({id:'list-r'+k,resourceType:'MEMORY_CARD',resourceId:'m1',recipient:U.state.user.username,scheduledAt:new Date(Date.parse('2026-10-01T00:00:00Z')+k*60000).toISOString(),deliveryMode:'IN_APP',revision:1,status:'PENDING'});
  U.state.reminders.push({id:'cancelled-r',resourceType:'CALENDAR_EVENT',resourceId:'e1',recipient:U.state.user.username,scheduledAt:'2026-10-02T00:00:00Z',deliveryMode:'IN_APP',revision:2,status:'CANCELLED'});
  U.state.reminders.push({id:'hidden-r',resourceType:'MEMORY_CARD',resourceId:'m1',recipient:U.state.partner.username,scheduledAt:'2026-10-02T00:00:00Z',deliveryMode:'IN_APP',revision:1,status:'PENDING'});
  U.refreshReminders();const filtered=U.reminderQuery({resourceType:'MEMORY_CARD',status:'PENDING'});
  assert.equal(filtered.length,25);
  assert.equal(filtered[0].id,'list-r0');
  U.view.reminders={resourceType:'MEMORY_CARD',status:'PENDING',page:1};U.actions['reminders-list']();
  assert.match(env.modal.html,/共 25 条 · 第 1 \/ 2 页/);
  assert.equal((env.modal.html.match(/class="reminder-list-item"/g)||[]).length,20);
  U.actions['list-page']({list:'reminders',value:'2'});
  assert.match(env.modal.html,/第 2 \/ 2 页/);
  assert.equal((env.modal.html.match(/class="reminder-list-item"/g)||[]).length,5);
  U.view.reminders.resourceType='CALENDAR_EVENT';U.view.reminders.status='CANCELLED';U.view.reminders.page=1;U.actions['reminders-list']();
  assert.match(env.modal.html,/共 1 条/);
  assert.match(env.modal.html,/已取消/);
});
