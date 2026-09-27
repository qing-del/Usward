// Deterministic local-state regression tests. No browser, API or SMTP access.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function preview(saved) {
  let now = Date.parse('2026-09-27T12:00:00Z');
  class Clock extends Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  const storage = new Map(saved ? [['usward-preview-v1', saved]] : []);
  const timeForm = {
    elements: Object.fromEntries(['allDay','start','end','startDate','lastDate'].map(name => [name,{checked:false,addEventListener(){}}])),
    querySelector: () => ({hidden:false})
  };
  const context = vm.createContext({
    Date:Clock, Intl, console,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    document:{body:{dataset:{page:'today'}},hidden:false,addEventListener(){},querySelector:selector=>selector==='#dialog-form'?timeForm:null},
    location:{hash:'',replace(){}},setInterval(){},setTimeout(){},addEventListener(){}
  });
  context.window = context;
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),context,{filename:file});
  load('app.js');load('reminders.js');load('today.js');load('me.js');load('commitments.js');
  const U = context.U;
  const env = {U,load,advance:ms=>{now+=ms;},saved:()=>{U.save();return storage.get('usward-preview-v1');}};
  U.close = () => {};
  U.toast = (message,error) => {env.toast={message,error};};
  U.modal = (title,html) => {env.modal={title,html};};
  U.render = () => {env.renders=(env.renders||0)+1;U.refreshReminders();};
  U.confirm = (title,copy,label,confirm) => {env.confirm=confirm;};
  U.form = (title,html,submit,options) => {env.form={title,html,submit,options};return timeForm;};
  env.submit = values => {
    const result=env.form.submit(values,timeForm);
    if(typeof result!=='string' && result!==false){U.save();U.render();}
    return result;
  };
  return env;
}
const past = '2026-09-27T19:00';
const future = '2026-09-28T10:00';
function arm(U,type,id,time=past,mode='IN_APP_AND_MAIL') {
  if(mode==='IN_APP_AND_MAIL' && !U.state.user.notificationEmail)assert.equal(U.updateNotificationEmail(U.state.user.username+'@example.com'),null);
  assert.equal(U.saveReminder(type,id,{reminder:time,deliveryMode:mode}),null);
  return U.getReminder(type,id);
}
const notices = (U,r) => U.state.notifications.filter(n=>n.reminderId===r.id);
const deliveries = (U,r) => U.state.mailDeliveries.filter(d=>d.reminderId===r.id);

test('legacy plans stay IN_APP and existing fired plans are not re-armed',()=>{
  const env=preview(),U=env.U;
  assert.equal(U.state.user.notificationEmail,null);
  assert.equal(U.mailCapability().available,false);
  assert.equal(U.getReminder('MEMORY_CARD','m4').deliveryMode,'IN_APP');
  U.refreshReminders();U.refreshReminders();
  assert.equal(U.state.mailDeliveries.length,0);
  const stored=JSON.parse(env.saved());delete stored.reminderSchema;stored.reminders=[];
  const card=stored.memories.find(m=>m.id==='m4');card.reminder=past;card.firedReminder=past;
  const restored=preview(JSON.stringify(stored)).U;
  assert.equal(restored.getReminder('MEMORY_CARD','m4').status,'FIRED');
});

test('missing email or deployment capability rejects mail without fallback',()=>{
  const {U}=preview();
  const values={reminder:future,deliveryMode:'IN_APP_AND_MAIL'};
  assert.match(U.saveReminder('MEMORY_CARD','m1',values),/收件邮箱/);
  assert.equal(U.getReminder('MEMORY_CARD','m1'),null);
  U.updateNotificationEmail('linan@example.com');U.state.previewMail.enabled=false;
  assert.match(U.saveReminder('MEMORY_CARD','m1',values),/尚未启用/);
  U.state.previewMail.enabled=true;U.state.previewMail.configured=false;
  assert.match(U.saveReminder('MEMORY_CARD','m1',values),/配置不完整/);
  assert.equal(U.getReminder('MEMORY_CARD','m1'),null);
  assert.equal(U.saveReminder('MEMORY_CARD','m1',{reminder:future,deliveryMode:'IN_APP'}),null);
  assert.match(U.validateReminderValues({reminder:'not-a-date'}),/有效/);
  assert.match(U.validateReminderValues({reminder:future,deliveryMode:'MAIL'}),/请选择/);
});

test('email accepts one valid address or an explicit clear',()=>{
  const {U}=preview();
  for(const email of ['invalid','a@example.com,b@example.com','a@example.com; b@example.com'])assert.match(U.updateNotificationEmail(email),/单个有效/);
  assert.equal(U.state.user.notificationEmail,null);
  assert.equal(U.updateNotificationEmail(' linan@example.com '),null);
  assert.equal(U.mailCapability().available,true);
  assert.equal(U.updateNotificationEmail(''),null);
  assert.equal(U.state.user.notificationEmail,null);
});

test('IN_APP defaults to one station notification across scans and reload',()=>{
  const env=preview(),U=env.U;
  assert.equal(U.saveReminder('MEMORY_CARD','m1',{reminder:past}),null);
  const r=U.getReminder('MEMORY_CARD','m1');U.refreshReminders();U.refreshReminders();
  assert.equal(r.deliveryMode,'IN_APP');assert.equal(r.status,'FIRED');
  assert.equal(notices(U,r).length,1);assert.equal(deliveries(U,r).length,0);
  const restored=preview(env.saved()).U;restored.refreshReminders();
  assert.equal(notices(restored,r).length,1);
});

test('combined reminder has one mail task; read and SMTP acceptance are independent',()=>{
  const env=preview(),U=env.U,r=arm(U,'MEMORY_CARD','m1');
  U.refreshReminders();U.refreshReminders();
  const n=notices(U,r)[0],d=deliveries(U,r)[0];
  assert.equal(notices(U,r).length,1);assert.equal(deliveries(U,r).length,1);
  assert.equal(d.status,'QUEUED');n.read=true;
  U.advanceMailPreview();assert.equal(d.status,'PROCESSING');
  U.advanceMailPreview();assert.equal(d.status,'SENT');assert.equal(n.read,true);
  U.actions['mail-delivery-view']({id:n.id});
  assert.match(env.modal.html,/不代表已经到达收件箱或已读/);
  assert.match(env.modal.html,/请登录 Usward 查看/);
  assert.ok(!env.modal.html.includes(U.find('memories','m1').title));
  assert.ok(!env.modal.html.includes(U.find('memories','m1').body));
  assert.ok(!n.message.includes(U.find('memories','m1').title));
  assert.ok(!JSON.stringify(d).includes(U.find('memories','m1').body));
  const restored=preview(env.saved()).U;restored.advanceMailPreview();
  assert.equal(deliveries(restored,r).length,1);assert.equal(deliveries(restored,r)[0].status,'SENT');
});

test('changing only deliveryMode increments revision and cancels the old task',()=>{
  const {U}=preview(),r=arm(U,'MEMORY_CARD','m1');U.refreshReminders();
  const n=notices(U,r)[0],d=deliveries(U,r)[0];U.advanceMailPreview();
  assert.equal(d.status,'PROCESSING');
  arm(U,'MEMORY_CARD','m1',past,'IN_APP');
  assert.equal(r.revision,2);assert.equal(d.status,'CANCELLED');assert.equal(U.notificationVisible(n),true);
  U.refreshReminders();assert.equal(notices(U,r).length,2);assert.equal(deliveries(U,r).length,1);
});

test('FIRED cancellation is idempotent; rearming the same instant is a new revision',()=>{
  const {U}=preview(),r=arm(U,'MEMORY_CARD','m1');U.refreshReminders();
  const old=deliveries(U,r)[0],n=notices(U,r)[0];
  assert.equal(U.saveReminder('MEMORY_CARD','m1',{reminder:''}),null);
  assert.equal(r.status,'CANCELLED');assert.equal(r.revision,2);assert.equal(old.status,'CANCELLED');
  U.cancelReminder(r);assert.equal(r.revision,2);assert.equal(U.notificationVisible(n),true);
  arm(U,'MEMORY_CARD','m1');U.refreshReminders();U.refreshReminders();
  assert.equal(r.revision,3);assert.equal(notices(U,r).length,2);assert.equal(deliveries(U,r).length,2);
});

test('changing mailbox cancels queued mail but future plans use the new address',()=>{
  const {U}=preview(),pending=arm(U,'MEMORY_CARD','m2',future),fired=arm(U,'MEMORY_CARD','m1');
  U.refreshReminders();U.advanceMailPreview();const old=deliveries(U,fired)[0];
  const original=[pending.scheduledAt,pending.deliveryMode,pending.revision];
  U.updateNotificationEmail('new@example.com');assert.equal(old.status,'CANCELLED');
  assert.deepEqual([pending.scheduledAt,pending.deliveryMode,pending.revision],original);
  assert.equal(old.recipientEmail,'linan@example.com');
  pending.scheduledAt=U.fromLocal(past);U.refreshReminders();
  assert.equal(deliveries(U,pending)[0].recipientEmail,'new@example.com');
  assert.equal(deliveries(U,fired).length,1);
});

test('capability lost at firing preserves station notification and FAILED is terminal',()=>{
  for(const [cause,code] of [['email','RECIPIENT_EMAIL_MISSING'],['enabled','MAIL_DISABLED'],['configured','MAIL_CONFIG_INCOMPLETE']]){
    const {U}=preview(),r=arm(U,'MEMORY_CARD','m1',future);
    if(cause==='email')U.updateNotificationEmail('');else U.state.previewMail[cause]=false;
    r.scheduledAt=U.fromLocal(past);U.refreshReminders();
    const n=notices(U,r)[0],d=deliveries(U,r)[0];
    assert.equal(d.status,'FAILED');assert.equal(d.failureCode,code);assert.equal(U.notificationVisible(n),true);
    U.state.previewMail.enabled=true;U.state.previewMail.configured=true;U.updateNotificationEmail('linan@example.com');
    U.advanceMailPreview();assert.equal(d.status,'FAILED');assert.equal(notices(U,r).length,1);
  }
});

test('permanent failure leaves station reminder intact and cannot auto-resend',()=>{
  const {U}=preview(),r=arm(U,'MEMORY_CARD','m1');U.state.previewMail.result='FAILED';
  U.advanceMailPreview();U.advanceMailPreview();const d=deliveries(U,r)[0];
  assert.equal(d.status,'FAILED');assert.equal(U.notificationVisible(notices(U,r)[0]),true);
  U.state.previewMail.result='SENT';U.advanceMailPreview();assert.equal(d.status,'FAILED');
});

test('temporary failure retries only mail with backoff and stops after five attempts',()=>{
  const env=preview(),U=env.U,r=arm(U,'MEMORY_CARD','m1');U.state.previewMail.result='QUEUED';
  for(let attempt=1;attempt<=5;attempt++){
    U.advanceMailPreview();U.advanceMailPreview();const d=deliveries(U,r)[0];
    assert.equal(d.attemptCount,attempt);assert.equal(notices(U,r).length,1);assert.equal(deliveries(U,r).length,1);
    if(attempt<5){assert.equal(d.status,'QUEUED');U.advanceMailPreview();assert.equal(d.status,'QUEUED');env.advance([1,5,15,60][attempt-1]*60000);}
    else {assert.equal(d.status,'FAILED');assert.equal(d.failureCode,'SMTP_RETRY_EXHAUSTED');}
  }
  U.state.previewMail.result='SENT';U.advanceMailPreview();assert.equal(deliveries(U,r)[0].status,'FAILED');
});

test('successful retry does not create another station notification',()=>{
  const env=preview(),U=env.U,r=arm(U,'MEMORY_CARD','m1');U.state.previewMail.result='QUEUED';
  U.advanceMailPreview();U.advanceMailPreview();env.advance(60000);U.state.previewMail.result='SENT';
  U.advanceMailPreview();U.advanceMailPreview();
  assert.equal(deliveries(U,r)[0].status,'SENT');assert.equal(notices(U,r).length,1);
});

test('account switch hides the other email, reminder settings and mail status',()=>{
  const env=preview(),U=env.U,own=arm(U,'MEMORY_CARD','m2');U.refreshReminders();
  const n=notices(U,own)[0];U.switchAccount('chenyu');U.prepareReminders();
  assert.equal(U.state.user.notificationEmail,null);
  assert.equal(U.getReminder('MEMORY_CARD','m2'),null);
  assert.equal(U.mailDelivery(n),null);assert.equal(U.notificationVisible(n),false);
  const fields=U.reminderFields('MEMORY_CARD','m2');
  assert.match(fields,/IN_APP" selected/);assert.ok(!fields.includes('linan@example.com'));
  const other=arm(U,'MEMORY_CARD','m2',future,'IN_APP');
  U.switchAccount('linan');U.prepareReminders();
  assert.equal(U.getReminder('MEMORY_CARD','m2').id,own.id);
  assert.equal(other.recipient,'chenyu');assert.equal(U.state.user.notificationEmail,'linan@example.com');
});

test('unsharing cancels the reader mail and invalidates old notices permanently',()=>{
  const env=preview(),U=env.U,author=arm(U,'MEMORY_CARD','m2',future);
  U.switchAccount('chenyu');const reader=arm(U,'MEMORY_CARD','m2');U.refreshReminders();
  const oldNotice=notices(U,reader)[0],oldMail=deliveries(U,reader)[0];
  U.switchAccount('linan');U.actions['memory-unshare']({id:'m2'});env.confirm();
  assert.equal(author.status,'PENDING');assert.equal(reader.status,'CANCELLED');
  assert.equal(oldMail.status,'CANCELLED');assert.ok(oldNotice.invalidatedAt);
  const card=U.find('memories','m2');card.shared=true;card.connectionId=U.state.connectionId;U.refreshReminders();
  U.switchAccount('chenyu');U.refreshReminders();
  assert.equal(U.notificationVisible(oldNotice),false);assert.equal(reader.status,'CANCELLED');
  assert.equal(U.pendingReminders().some(r=>r.id===reader.id),false);
});

test('shared event settings are independent and reschedule prompts each pending recipient',()=>{
  const env=preview(),U=env.U,e=U.find('events','e2');
  e.start=U.fromLocal('2026-09-29T18:00');e.end=U.fromLocal('2026-09-29T19:00');
  const a=arm(U,'CALENDAR_EVENT','e2',future);
  U.switchAccount('chenyu');const b=arm(U,'CALENDAR_EVENT','e2','2026-09-28T11:00','IN_APP');
  const before=JSON.stringify([a,b]);
  const i={id:'change-test',purpose:'CHANGE',sender:'partner',status:'PENDING',connectionId:U.state.connectionId,targetEventId:e.id,baseVersion:e.version,title:e.title,start:U.fromLocal('2026-09-30T18:00'),end:U.fromLocal('2026-09-30T19:00')};
  U.state.invitations.push(i);e.pendingChange=i.id;U.acceptInvite(i.id);
  assert.equal(JSON.stringify([a,b]),before);
  const checks=U.state.notifications.filter(n=>n.message.includes('请检查自己的提醒'));
  assert.equal(checks.length,2);assert.deepEqual(Array.from(checks,n=>n.recipient).sort(),['chenyu','linan']);
  assert.equal(U.state.mailDeliveries.length,0);
});

test('reschedule also prompts when only the proposer has a pending plan',()=>{
  const {U}=preview(),e=U.find('events','e2');e.start=U.fromLocal('2026-09-29T18:00');
  arm(U,'CALENDAR_EVENT','e2',future,'IN_APP');U.switchAccount('chenyu');
  const i={id:'change-only-proposer',purpose:'CHANGE',sender:'partner',status:'PENDING',connectionId:U.state.connectionId,targetEventId:e.id,baseVersion:e.version,title:e.title,start:U.fromLocal('2026-09-30T18:00'),end:U.fromLocal('2026-09-30T19:00')};
  U.state.invitations.push(i);e.pendingChange=i.id;U.acceptInvite(i.id);
  const checks=U.state.notifications.filter(n=>n.message.includes('请检查自己的提醒'));
  assert.equal(checks.length,1);assert.equal(checks[0].recipient,'linan');
});

test('shared event cancellation clears both queues and keeps a readable event notice',()=>{
  const env=preview(),U=env.U,a=arm(U,'CALENDAR_EVENT','e2');U.refreshReminders();
  U.switchAccount('chenyu');const b=arm(U,'CALENDAR_EVENT','e2');U.refreshReminders();
  U.actions['event-cancel']({id:'e2'});env.submit({reason:'预览取消说明'});
  assert.equal(a.status,'CANCELLED');assert.equal(b.status,'CANCELLED');
  assert.equal(deliveries(U,a)[0].status,'CANCELLED');assert.equal(deliveries(U,b)[0].status,'CANCELLED');
  U.switchAccount('linan');U.refreshReminders();
  const n=U.state.notifications.find(n=>n.message==='对方取消了一次共同安排');
  assert.equal(n.kind,'event');assert.equal(n.resourceId,'e2');assert.equal(U.notificationVisible(n),true);
  U.eventDetail('e2');assert.match(env.modal.html,/预览取消说明/);
  assert.ok(!env.modal.html.includes('data-action="event-reminder"'));
});

test('completing or cancelling own commitment clears FIRED mail; reopen stays cancelled',()=>{
  for(const action of ['commitment-complete','commitment-cancel']){
    const env=preview(),U=env.U,r=arm(U,'COMMITMENT','c1');U.refreshReminders();
    U.actions[action]({id:'c1'});
    if(action==='commitment-complete')env.submit({result:'完成预览'});else env.confirm();
    assert.equal(r.status,'CANCELLED');assert.equal(deliveries(U,r)[0].status,'CANCELLED');
    assert.equal(U.notificationVisible(notices(U,r)[0]),true);
    U.actions['commitment-reopen']({id:'c1'});assert.equal(r.status,'CANCELLED');
    assert.equal(U.pendingReminders('COMMITMENT').length,0);
  }
});

test('deleting any remindable resource cancels its queue and invalidates the notice',()=>{
  for(const [type,id,action] of [['MEMORY_CARD','m1','memory-delete'],['CALENDAR_EVENT','e1','event-delete'],['COMMITMENT','c1','commitment-delete']]){
    const env=preview(),U=env.U,r=arm(U,type,id);U.refreshReminders();
    U.actions[action]({id});env.confirm();
    assert.equal(r.status,'CANCELLED');assert.equal(deliveries(U,r)[0].status,'CANCELLED');
    assert.ok(notices(U,r)[0].invalidatedAt);assert.equal(U.notificationVisible(notices(U,r)[0]),false);
  }
});

test('unlink cleans shared reminders but preserves the author private plans',()=>{
  const env=preview(),U=env.U,own=arm(U,'MEMORY_CARD','m2',future),event=arm(U,'CALENDAR_EVENT','e2');U.refreshReminders();
  U.switchAccount('chenyu');const reader=arm(U,'MEMORY_CARD','m2');U.refreshReminders();
  const old=notices(U,reader)[0];
  U.actions['connection-end-confirm']();env.confirm();
  assert.equal(own.status,'PENDING');assert.equal(reader.status,'CANCELLED');assert.equal(event.status,'CANCELLED');
  assert.equal(deliveries(U,reader)[0].status,'CANCELLED');assert.equal(deliveries(U,event)[0].status,'CANCELLED');
  assert.equal(U.notificationVisible(old),false);
  U.state.connected=true;U.state.connectionId='new-connection';U.refreshReminders();
  assert.equal(reader.status,'CANCELLED');assert.equal(U.notificationVisible(old),false);
});

test('partner commitments cannot have a reminder and closed commitments cannot be re-armed',()=>{
  const {U}=preview();U.updateNotificationEmail('linan@example.com');
  assert.match(U.saveReminder('COMMITMENT','c4',{reminder:future,deliveryMode:'IN_APP_AND_MAIL'}),/不可设置/);
  assert.match(U.saveReminder('COMMITMENT','c3',{reminder:future,deliveryMode:'IN_APP'}),/不可设置/);
  assert.equal(U.getReminder('COMMITMENT','c4'),null);assert.equal(U.getReminder('COMMITMENT','c3'),null);
});

test('resource forms save canonical reminders and validate before mutating content',()=>{
  const env=preview(),U=env.U;
  U.memoryForm();const before=U.state.memories.length;
  const memory={title:'Form memory',body:'Preview text',category:'其他',source:'OBSERVED',tags:'',sourceDate:'',nextAction:'',reminder:future,deliveryMode:'IN_APP_AND_MAIL'};
  assert.match(env.submit(memory),/收件邮箱/);assert.equal(U.state.memories.length,before);
  U.updateNotificationEmail('linan@example.com');env.submit(memory);
  assert.equal(U.getReminder('MEMORY_CARD',U.state.memories[0].id).deliveryMode,'IN_APP_AND_MAIL');
  U.eventForm();env.submit({title:'Form event',start:'2026-09-28T12:00',end:'2026-09-28T13:00',allDay:false,reminder:future,deliveryMode:'IN_APP_AND_MAIL'});
  assert.equal(U.getReminder('CALENDAR_EVENT',U.state.events.at(-1).id).deliveryMode,'IN_APP_AND_MAIL');
  U.commitmentForm();env.submit({title:'Form commitment',body:'',due:'2026-09-28',dueTime:'',nextAction:'',reminder:'',deliveryMode:'IN_APP'});
  assert.equal(U.getReminder('COMMITMENT',U.state.commitments[0].id),null);
  U.commitmentForm('c3');assert.ok(!env.form.html.includes('name="deliveryMode"'));
});

test('home includes partner cards, both event kinds and own commitments, ordered by time',()=>{
  const {U}=preview();
  arm(U,'MEMORY_CARD','m6','2026-09-28T09:00','IN_APP');
  arm(U,'CALENDAR_EVENT','e1','2026-09-28T10:00');
  arm(U,'CALENDAR_EVENT','e2','2026-09-28T11:00','IN_APP');
  arm(U,'COMMITMENT','c1','2026-09-28T12:00');U.refreshReminders();
  const pending=U.pendingReminders();assert.deepEqual(Array.from(pending,r=>r.resourceId),['m6','e1','e2','c1']);
  const html=U.pages.today();
  assert.ok(html.indexOf('周末想做的小事')<html.indexOf('日历安排 · 9月28日 10:00'));
  assert.match(html,/查看全部 · 4 条/);assert.match(html,/站内提醒 \+ Mail 提醒/);
  U.cancelResourceReminders('CALENDAR_EVENT','e1');assert.equal(U.pendingReminders().length,3);
});

test('worker refreshes the unread display when it fires a station-only reminder',()=>{
  const env=preview(),U=env.U;U.refreshReminders();arm(U,'MEMORY_CARD','m1',past,'IN_APP');
  U.advanceMailPreview();assert.equal(env.renders,1);
});
