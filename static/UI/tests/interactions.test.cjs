const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('./helpers/preview.cjs');
const expressionValues={type:'有件事想分享',body:'表达预览',window:'有空再看',mode:'',outgoingMode:'NONE',followUpMode:'IN_APP_AND_MAIL'};
const available=U=>{U.updateNotificationEmail('linan@example.com');U.state.partner.notificationEmail='chenyu@example.com';};

test('expression form uses two independent defaults; NONE keeps sent and received content visible',()=>{
  const env=preview(),{U}=env;env.load('expressions.js');available(U);
  U.expressionForm();assert.equal((env.form.html.match(/value="IN_APP" selected/g)||[]).length,2);
  assert.equal(env.submit(expressionValues),undefined);
  const id=U.state.expressions[0].id;assert.equal(U.state.notifications.filter(n=>n.resourceId===id).length,0);
  U.view.expressions={tab:'sent',status:'all'};
  assert.match(U.pages.expressions(),/表达预览/);
  U.expressionDetail(id);assert.match(env.modal.html,/站内通知\+邮件通知/);
  U.switchAccount('chenyu');U.view.expressions={tab:'received',status:'all'};
  assert.match(U.pages.expressions(),/表达预览/);
  assert.equal(U.myNotificationSetting('EXPRESSION',id).followUpMode,'IN_APP');
});

test('expression submit retains one logical operation after a response is lost',()=>{
  const env=preview(),{U}=env;available(U);U.expressionForm();
  assert.equal(env.submit(expressionValues),undefined);const id=U.state.expressions[0].id;
  const length=U.state.expressions.length;U.state.previewMail.enabled=false;
  assert.equal(env.submit(expressionValues),undefined);assert.equal(U.state.expressions.length,length);
  assert.equal(U.state.expressions[0].id,id);
});

test('expression reply and sender supplement follow recipient setting and preserve status semantics',()=>{
  const env=preview(),{U}=env;available(U);U.expressionForm();env.submit(expressionValues);
  const id=U.state.expressions[0].id;U.switchAccount('chenyu');
  U.actions['expression-quick-reply']({id,value:'现在方便'});
  assert.match(env.form.html,/现在方便/);assert.doesNotMatch(env.form.html,/name="followUpMode"/);
  assert.equal(env.submit({body:'现在方便'}),undefined);
  assert.equal(U.find('expressions',id).status,'RESPONDED');
  assert.equal(U.state.mailDeliveries.filter(d=>d.recipient==='linan').length,1);
  U.putNotificationSetting('EXPRESSION',id,'NONE',null);U.switchAccount('linan');
  U.actions['expression-reply']({id});assert.equal(env.submit({body:'再补一句'}),undefined);
  assert.equal(U.find('expressions',id).replies.length,2);
  assert.equal(U.state.notifications.filter(n=>n.resourceId===id&&n.recipient==='chenyu').length,0);
});

test('missing reply mail preserves body, explicit temporary override never rewrites recipient preference',()=>{
  const env=preview(),{U}=env;available(U);U.expressionForm();env.submit(expressionValues);
  const id=U.state.expressions[0].id;U.switchAccount('chenyu');U.state.partner.notificationEmail=null;
  U.actions['expression-reply']({id});
  assert.match(env.submit({body:'不能丢失的回应'}),/明确选择/);
  assert.equal(U.find('expressions',id).replies.length,0);
  assert.ok(env.form.node.dataset.notificationOverrideToken);
  assert.equal(env.submit({body:'不能丢失的回应',notificationOverrideMode:'NONE'}),undefined);
  assert.equal(U.find('expressions',id).replies[0].body,'不能丢失的回应');
  U.switchAccount('linan');assert.equal(U.myNotificationSetting('EXPRESSION',id).followUpMode,'IN_APP_AND_MAIL');
});

test('sender supplement leaves OPEN; withdrawal invalidates settings and all old business mail',()=>{
  const env=preview(),{U}=env;available(U);U.expressionForm();env.submit({...expressionValues,outgoingMode:'IN_APP_AND_MAIL'});
  const id=U.state.expressions[0].id;U.actions['expression-reply']({id});env.submit({body:'发送者补充'});
  assert.equal(U.find('expressions',id).status,'OPEN');
  U.actions['expression-withdraw']({id});env.confirm();
  const x=U.find('expressions',id);assert.equal(x.status,'WITHDRAWN');assert.equal(x.body,'');assert.equal(x.replies.length,0);
  assert.equal(U.myNotificationSetting('EXPRESSION',id),null);
  assert.ok(U.state.notifications.filter(n=>n.resourceId===id).every(n=>n.invalidatedAt));
  assert.equal(U.state.mailDeliveries[0].status,'CANCELLED');
});

test('stale expression or connection blocks a reply or new send without partial writes',()=>{
  const env=preview(),{U}=env;U.expressionReplyForm('x1');const x=U.find('expressions','x1');x.version+=1;
  assert.match(env.submit({body:'保留草稿'}),/已变化/);assert.equal(x.replies.length,0);
  U.expressionForm();U.state.connectionId='replacement-connection';
  const length=U.state.expressions.length;
  assert.match(env.submit({...expressionValues,followUpMode:'IN_APP'}),/连接已变化/);
  assert.equal(U.state.expressions.length,length);
});

test('whole-card share saves independent modes; comments follow author and never rewrite original',()=>{
  const env=preview(),{U}=env;available(U);
  U.actions['memory-share']({id:'m1'});
  assert.match(env.form.html,/私人提醒不会分享/);assert.match(env.form.html,/不赶时间的早餐/);
  assert.equal(env.submit({outgoingMode:'NONE',followUpMode:'IN_APP_AND_MAIL'}),undefined);
  assert.equal(U.find('memories','m1').shared,true);
  assert.equal(U.state.notifications.filter(n=>n.resourceId==='m1').length,0);
  U.switchAccount('chenyu');const body=U.find('memories','m1').body;
  U.actions['memory-comment']({id:'m1'});assert.equal(env.submit({body:'我的补充'}),undefined);
  assert.equal(U.find('memories','m1').body,body);
  assert.equal(U.state.mailDeliveries.filter(d=>d.recipient==='linan').length,1);
  assert.equal(U.myNotificationSetting('MEMORY_CARD','m1').followUpMode,'IN_APP');
});

test('shared memory edits notify reader setting; private reminder and archive changes stay private',()=>{
  const env=preview(),{U}=env;available(U);
  U.switchAccount('chenyu');U.putNotificationSetting('MEMORY_CARD','m2','IN_APP_AND_MAIL',null);U.switchAccount('linan');
  const m=U.find('memories','m2');const values={title:m.title,body:m.body,category:m.category,source:m.source,tags:m.tags.join(','),sourceDate:m.sourceDate,nextAction:m.nextAction,deliveryMode:'NONE',reminder:''};
  U.memoryForm('m2');env.submit(values);
  assert.equal(U.state.notifications.filter(n=>n.resourceId==='m2'&&n.sourceType==='BUSINESS').length,0);
  U.memoryForm('m2');env.submit({...values,body:'作者更新整张卡片'});
  assert.equal(U.state.mailDeliveries.filter(d=>d.recipient==='chenyu').length,1);
  const count=U.state.notifications.length;U.actions['memory-archive']({id:'m2'});U.actions['memory-restore']({id:'m2'});
  assert.equal(U.state.notifications.length,count);
  U.memoryDetail('m2');assert.match(env.modal.html,/调整我的接收方式/);assert.match(env.modal.html,/写下我的下一步/);
});

test('unshare removes episode preferences and old business mail, keeps author private plan, reshare starts fresh',()=>{
  const env=preview(),{U}=env;available(U);
  U.saveReminder('MEMORY_CARD','m1',{reminder:'2026-09-29T08:00',deliveryMode:'IN_APP_AND_MAIL'});
  U.actions['memory-share']({id:'m1'});env.submit({outgoingMode:'IN_APP_AND_MAIL',followUpMode:'NONE'});
  U.switchAccount('chenyu');U.putNotificationSetting('MEMORY_CARD','m1','NONE',null);U.switchAccount('linan');
  U.actions['memory-unshare']({id:'m1'});env.confirm();
  assert.equal(U.getReminder('MEMORY_CARD','m1').status,'PENDING');
  assert.equal(U.myNotificationSetting('MEMORY_CARD','m1'),null);
  assert.equal(U.state.mailDeliveries[0].status,'CANCELLED');
  const notice=U.state.notifications.find(n=>n.resourceId==='m1'&&n.sourceType==='BUSINESS');assert.ok(notice.invalidatedAt);
  U.actions['memory-share']({id:'m1'});env.submit({outgoingMode:'NONE',followUpMode:'IN_APP'});
  assert.equal(U.myNotificationSetting('MEMORY_CARD','m1').followUpMode,'IN_APP');
  U.switchAccount('chenyu');assert.equal(U.myNotificationSetting('MEMORY_CARD','m1').followUpMode,'IN_APP');
  assert.equal(U.notificationVisible(notice),false);
});

test('archived shared memory stays accessible to reader and every comment remains in detail',()=>{
  const env=preview(),{U}=env;env.load('memories.js');
  U.actions['memory-archive']({id:'m2'});U.switchAccount('chenyu');
  const m=U.find('memories','m2');m.comments=Array.from({length:23},(_,i)=>({author:'me',body:'补充 '+i,at:new Date().toISOString()}));
  U.memoryDetail('m2');assert.match(env.modal.html,/补充 22/);
  U.view.memories={tab:'partner',category:'all',tag:'',search:'',limit:9};
  assert.match(U.pages.memories(),/忙的时候，先发一条消息/);
});

const invitationValues={title:'邀约测试',allDay:false,start:'2026-10-01T10:00',end:'2026-10-01T11:00',location:'',note:'',outgoingMode:'NONE',followUpMode:'IN_APP_AND_MAIL'};
test('CREATE invitation starts fresh from expression; accept copies current modes and stays idempotent after cancellation',()=>{
  const env=preview(),{U}=env;available(U);U.putNotificationSetting('EXPRESSION','x2','NONE',null);
  U.inviteForm({expressionId:'x2'});assert.equal((env.form.html.match(/value="IN_APP" selected/g)||[]).length,2);
  env.submit(invitationValues);const id=U.state.invitations[0].id;
  assert.equal(U.state.notifications.filter(n=>n.resourceId===id).length,0);
  U.putNotificationSetting('CALENDAR_INVITATION',id,'NONE',U.myNotificationSetting('CALENDAR_INVITATION',id).version);
  U.switchAccount('chenyu');U.putNotificationSetting('CALENDAR_INVITATION',id,'IN_APP_AND_MAIL',null);
  U.actions['invite-accept']({id});assert.equal(env.submit({}),null);
  const eventId=U.find('invitations',id).eventId;
  assert.equal(U.myNotificationSetting('CALENDAR_EVENT',eventId).followUpMode,'IN_APP_AND_MAIL');
  U.switchAccount('linan');assert.equal(U.myNotificationSetting('CALENDAR_EVENT',eventId).followUpMode,'NONE');
  U.actions['event-cancel']({id:eventId});env.submit({reason:'取消示例'});U.switchAccount('chenyu');
  const n=U.state.notifications.length;assert.equal(U.acceptInvite(id),null);
  assert.equal(U.find('events',eventId).status,'CANCELLED');assert.equal(U.state.notifications.length,n);
  assert.equal(U.state.events.filter(e=>e.invitationId===id).length,1);
});

test('counter reverses roles, copies settings by username and sends one replacement notification',()=>{
  const env=preview(),{U}=env;available(U);U.inviteForm();env.submit(invitationValues);
  const original=U.state.invitations[0].id;U.switchAccount('chenyu');U.putNotificationSetting('CALENDAR_INVITATION',original,'NONE',null);
  U.inviteForm({previousId:original});assert.doesNotMatch(env.form.html,/name="followUpMode"/);
  assert.equal(env.submit({...invitationValues,start:'2026-10-02T10:00',end:'2026-10-02T11:00'}),undefined);
  const replacement=U.state.invitations[0];assert.equal(replacement.previousId,original);assert.equal(replacement.sender,'me');
  assert.equal(U.find('invitations',original).status,'SUPERSEDED');
  assert.equal(U.myNotificationSetting('CALENDAR_INVITATION',replacement.id).followUpMode,'NONE');
  assert.equal(U.state.notifications.filter(n=>n.resourceId===replacement.id&&n.sourceType==='BUSINESS').length,1);
  U.switchAccount('linan');assert.equal(U.myNotificationSetting('CALENDAR_INVITATION',replacement.id).followUpMode,'IN_APP_AND_MAIL');
  assert.equal(U.state.mailDeliveries.filter(d=>d.recipient==='linan').length,1);
});

test('CHANGE initializes from event but acceptance preserves newer event settings and sends checks independently',()=>{
  const env=preview(),{U}=env;available(U);const e=U.find('events','e2');e.start=U.fromLocal('2026-10-03T08:00');e.end=U.fromLocal('2026-10-03T09:00');
  U.putNotificationSetting('CALENDAR_EVENT',e.id,'IN_APP_AND_MAIL',null);U.saveReminder('CALENDAR_EVENT',e.id,{reminder:'2026-10-02T08:00',deliveryMode:'IN_APP_AND_MAIL'});
  U.switchAccount('chenyu');U.putNotificationSetting('CALENDAR_EVENT',e.id,'NONE',null);U.saveReminder('CALENDAR_EVENT',e.id,{reminder:'2026-10-02T09:00',deliveryMode:'IN_APP'});U.switchAccount('linan');
  U.inviteForm({eventId:e.id});assert.match(env.form.html,/value="NONE" selected/);assert.match(env.form.html,/value="IN_APP_AND_MAIL" selected/);
  const version=e.version;env.submit({...invitationValues,start:'2026-10-04T08:00',end:'2026-10-04T09:00'});const id=U.state.invitations[0].id;
  assert.equal(e.version,version);assert.equal(e.start,U.fromLocal('2026-10-03T08:00'));
  U.putNotificationSetting('CALENDAR_EVENT',e.id,'NONE',U.myNotificationSetting('CALENDAR_EVENT',e.id).version);
  U.switchAccount('chenyu');U.putNotificationSetting('CALENDAR_EVENT',e.id,'IN_APP',U.myNotificationSetting('CALENDAR_EVENT',e.id).version);
  const reminders=JSON.stringify(U.state.reminders.filter(r=>r.resourceId===e.id));U.actions['invite-accept']({id});assert.equal(env.submit({}),null);
  assert.equal(e.version,version+1);assert.equal(U.myNotificationSetting('CALENDAR_EVENT',e.id).followUpMode,'IN_APP');
  assert.equal(JSON.stringify(U.state.reminders.filter(r=>r.resourceId===e.id)),reminders);
  assert.equal(U.state.notifications.filter(n=>n.resourceId===id&&n.sourceType==='BUSINESS').length,1);
  assert.equal(U.state.notifications.filter(n=>n.resourceId===e.id&&n.sourceType==='REMINDER_CHECK').length,2);
  U.switchAccount('linan');assert.equal(U.myNotificationSetting('CALENDAR_EVENT',e.id).followUpMode,'NONE');
});

test('event cancellation preserves business mail, clears reminder mail and pending change',()=>{
  const env=preview(),{U}=env;available(U);const e=U.find('events','e2');e.start=U.fromLocal('2026-10-03T08:00');
  U.switchAccount('chenyu');U.putNotificationSetting('CALENDAR_EVENT',e.id,'IN_APP_AND_MAIL',null);U.switchAccount('linan');
  U.saveReminder('CALENDAR_EVENT',e.id,{reminder:'2026-09-27T08:00',deliveryMode:'IN_APP_AND_MAIL'});U.refreshReminders();
  U.inviteForm({eventId:e.id});env.submit(invitationValues);const proposal=U.state.invitations[0];
  U.actions['event-cancel']({id:e.id});assert.equal(env.submit({reason:'双方可读取的取消说明'}),undefined);
  assert.equal(proposal.status,'WITHDRAWN');assert.equal(e.pendingChange,null);
  assert.equal(U.state.mailDeliveries.find(d=>d.sourceType==='REMINDER_DUE').status,'CANCELLED');
  assert.equal(U.state.mailDeliveries.filter(d=>d.sourceType==='BUSINESS').at(-1).status,'QUEUED');
  U.switchAccount('chenyu');U.eventDetail(e.id);assert.match(env.modal.html,/双方可读取的取消说明/);assert.match(env.modal.html,/保留历史设置/);
});

test('conflicts are clipped and merged without ownership, FREE, private title or real IDs',()=>{
  const {U}=preview();const i=U.find('invitations','i1');i.start='2026-10-01T02:00:00Z';i.end='2026-10-01T04:00:00Z';
  U.state.events.push(...[
    {id:'secret-a',kind:'PERSONAL',owner:'partner',title:'PRIVATE',note:'SECRET',status:'CONFIRMED',availability:'BUSY',start:'2026-10-01T01:00:00Z',end:'2026-10-01T03:00:00Z'},
    {id:'secret-b',kind:'PERSONAL',owner:'me',status:'CONFIRMED',availability:'NEGOTIABLE',start:'2026-10-01T02:30:00Z',end:'2026-10-01T05:00:00Z'},
    {id:'free',kind:'PERSONAL',owner:'partner',status:'CONFIRMED',availability:'FREE',start:'2026-10-01T01:00:00Z',end:'2026-10-01T06:00:00Z'}]);
  const conflicts=JSON.parse(JSON.stringify(U.conflicts(i)));
  assert.deepEqual(conflicts,[{start:new Date(i.start).toISOString(),end:new Date(i.end).toISOString()}]);assert.doesNotMatch(JSON.stringify(conflicts),/secret|PRIVATE|owner|availability/);
});

test('new conflicts and expired confirmation require explicit reconfirmation; no partial accept',()=>{
  const env=preview(),{U}=env;const i=U.find('invitations','i1');i.start='2026-10-01T02:00:00Z';i.end='2026-10-01T04:00:00Z';
  U.actions['invite-accept']({id:i.id});
  U.state.events.push({id:'late',kind:'PERSONAL',owner:'partner',status:'CONFIRMED',availability:'BUSY',start:i.start,end:i.end});
  assert.match(env.submit({confirmConflicts:true}),/最新的重叠时段/);assert.equal(i.status,'PENDING');
  env.advance(120001);assert.match(env.submit({confirmConflicts:true}),/最新的重叠时段/);assert.equal(i.status,'PENDING');
  assert.equal(env.submit({confirmConflicts:true}),null);assert.equal(i.status,'ACCEPTED');
});

test('acceptance and counter guard expiry; automatic expiry emits no notice',()=>{
  const env=preview(),{U}=env;const i=U.find('invitations','i1');U.actions['invite-accept']({id:i.id});
  const n=U.state.notifications.length;env.advance(864000000);
  assert.match(env.submit({}),/过期|变化/);assert.equal(i.status,'EXPIRED');assert.equal(U.state.notifications.length,n);
  assert.match(U.putNotificationSetting('CALENDAR_INVITATION',i.id,'NONE',null),/已结束/);
});

test('commitment share and all shared state actions offer one mode, NONE still updates content',()=>{
  const env=preview(),{U}=env;available(U);
  U.actions['commitment-share']({id:'c1'});assert.match(env.form.html,/name="notificationMode"/);assert.doesNotMatch(env.form.html,/followUpMode/);
  env.submit({notificationMode:'NONE'});const c=U.find('commitments','c1');assert.equal(c.shared,true);
  U.actions['commitment-complete']({id:c.id});assert.doesNotMatch(env.form.html,/followUpMode/);
  env.submit({result:'完成记录',notificationMode:'NONE'});assert.equal(c.status,'DONE');
  U.actions['commitment-reopen']({id:c.id});env.submit({notificationMode:'NONE'});assert.equal(c.status,'OPEN');assert.equal(c.result,'');
  U.actions['commitment-cancel']({id:c.id});env.submit({notificationMode:'NONE'});assert.equal(c.status,'CANCELLED');
  assert.equal(U.state.notifications.filter(n=>n.resourceId===c.id&&n.sourceType==='BUSINESS').length,0);
  assert.equal(U.myNotificationSetting('COMMITMENT',c.id),null);
});

test('shared completion preserves its business mail while cancelling private reminders, unavailable mail blocks status',()=>{
  const env=preview(),{U}=env;available(U);
  U.saveReminder('COMMITMENT','c2',{reminder:'2026-09-27T08:00',deliveryMode:'IN_APP_AND_MAIL'});U.refreshReminders();
  U.actions['commitment-complete']({id:'c2'});U.state.partner.notificationEmail=null;
  assert.match(env.submit({result:'完整完成记录',notificationMode:'IN_APP_AND_MAIL'}),/明确改选/);assert.equal(U.find('commitments','c2').status,'OPEN');
  U.state.partner.notificationEmail='chenyu@example.com';assert.equal(env.submit({result:'完整完成记录',notificationMode:'IN_APP_AND_MAIL'}),undefined);
  assert.equal(U.find('commitments','c2').status,'DONE');
  assert.equal(U.state.mailDeliveries.find(d=>d.sourceType==='REMINDER_DUE').status,'CANCELLED');
  assert.equal(U.state.mailDeliveries.find(d=>d.sourceType==='BUSINESS').status,'QUEUED');
});

test('only shared deadline edits use chosen business notification; private actions have no recipient',()=>{
  const env=preview(),{U}=env;available(U);const c=U.find('commitments','c2');
  const values={title:c.title,body:'只改说明',due:c.due,dueTime:'',nextAction:c.nextAction,reminder:'',deliveryMode:'NONE',notificationMode:'IN_APP_AND_MAIL'};
  U.commitmentForm(c.id);env.submit(values);assert.equal(U.state.notifications.filter(n=>n.resourceId===c.id).length,0);
  U.commitmentForm(c.id);env.submit({...values,due:'2026-10-04'});assert.equal(U.state.mailDeliveries.filter(d=>d.sourceType==='BUSINESS').length,1);
  U.commitmentForm('c1');assert.doesNotMatch(env.form.html,/name="notificationMode"|followUpMode/);
});

test('three source detail entries create own commitments with correct canonical type and navigation',()=>{
  for(const [action,sourceId,type,target] of [['commitment-from-expression','x1','EXPRESSION','expression-view'],['commitment-from-memory','m1','MEMORY_CARD','memory-view'],['commitment-from-event','e2','CALENDAR_EVENT','event-view']]){
    const env=preview(),{U}=env;U.actions[action]({id:sourceId});
    assert.equal(env.submit({title:'我的下一步',body:'',due:'',dueTime:'',nextAction:'',reminder:'',deliveryMode:'NONE'}),undefined);
    const c=U.state.commitments[0];assert.equal(c.owner,'me');assert.equal(c.sourceType,type);assert.equal(c.sourceId,sourceId);
    U.commitmentDetail(c.id);assert.match(env.modal.html,new RegExp('data-action="'+target+'"'));
  }
});

test('withdrawn or inaccessible sources cannot create and sharing commitment grants no source access',()=>{
  const env=preview(),{U}=env;U.commitmentForm(null,{sourceType:'EXPRESSION',sourceId:'x3'});assert.match(env.toast.message,/不可访问/);
  U.actions['commitment-from-memory']({id:'m1'});U.find('memories','m1').deleted=true;
  const length=U.state.commitments.length;assert.match(env.submit({title:'旧来源',body:'',due:'',dueTime:'',reminder:'',deliveryMode:'NONE'}),/来源已不可访问/);assert.equal(U.state.commitments.length,length);
  U.find('memories','m1').deleted=false;U.actions['commitment-from-memory']({id:'m1'});env.submit({title:'私密来源',body:'',due:'',dueTime:'',reminder:'',deliveryMode:'NONE'});
  const c=U.state.commitments[0];U.actions['commitment-share']({id:c.id});env.submit({notificationMode:'NONE'});U.switchAccount('chenyu');
  U.commitmentDetail(c.id);assert.match(env.modal.html,/来源不可用/);assert.doesNotMatch(env.modal.html,/data-action="memory-view"/);
});

test('unsharing commitment permanently invalidates old notices across a new sharing episode',()=>{
  const env=preview(),{U}=env;available(U);U.actions['commitment-share']({id:'c1'});env.submit({notificationMode:'IN_APP_AND_MAIL'});
  const n=U.state.notifications.find(n=>n.resourceId==='c1');U.actions['commitment-unshare']({id:'c1'});
  assert.ok(n.invalidatedAt);assert.equal(U.state.mailDeliveries[0].status,'CANCELLED');
  U.actions['commitment-share']({id:'c1'});env.submit({notificationMode:'NONE'});U.switchAccount('chenyu');assert.equal(U.notificationVisible(n),false);
});
