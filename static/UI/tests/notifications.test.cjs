const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('./helpers/preview.cjs');
function available(U){U.updateNotificationEmail('linan@example.com');U.state.partner.notificationEmail='chenyu@example.com';}
function create(U,plan,key=U.operationKey()){
  return U.runNotifiedOperation({key,action:'EXPRESSION_CREATE',resourceType:'EXPRESSION',notificationPlan:plan,payload:{body:'Private preview text',...plan},message:'收到一条新的表达'},()=>{
    const x={id:U.uid('x'),sender:'me',type:'有件事想分享',body:'Private preview text',status:'OPEN',version:1,replies:[],connectionId:U.state.connectionId,createdAt:new Date().toISOString()};U.state.expressions.unshift(x);return {type:'EXPRESSION',id:x.id};
  });
}
test('all nine outgoing/follow-up combinations save content and notify independently',()=>{
  for(const outgoingMode of ['NONE','IN_APP','IN_APP_AND_MAIL'])for(const followUpMode of ['NONE','IN_APP','IN_APP_AND_MAIL']){
    const {U}=preview();available(U);const result=create(U,{outgoingMode,followUpMode});assert.equal(result.ok,true);
    const n=U.state.notifications.filter(n=>n.resourceId===result.result.id);
    assert.equal(n.length,outgoingMode==='NONE'?0:1);
    assert.equal(U.state.mailDeliveries.length,outgoingMode==='IN_APP_AND_MAIL'?1:0);
    assert.equal(U.myNotificationSetting('EXPRESSION',result.result.id).followUpMode,followUpMode);
    U.switchAccount('chenyu');assert.equal(U.myNotificationSetting('EXPRESSION',result.result.id).followUpMode,'IN_APP');
    const reply=U.runNotifiedOperation({key:U.operationKey(),resourceType:'EXPRESSION',id:result.result.id,action:'EXPRESSION_REPLY',followUp:true,payload:{body:'Response'},message:'对方回应了你的表达'},()=>{const x=U.find('expressions',result.result.id);x.replies.push({author:'me',body:'Response'});x.status='RESPONDED';return {type:'EXPRESSION',id:x.id};});
    assert.equal(reply.ok,true);
    assert.equal(U.state.notifications.filter(n=>n.resourceId===result.result.id&&n.recipient==='linan').length,followUpMode==='NONE'?0:1);
    assert.equal(U.state.mailDeliveries.filter(d=>d.recipient==='linan').length,followUpMode==='IN_APP_AND_MAIL'?1:0);
  }
});
test('each unavailable explicit direction blocks content, preferences and delivery',()=>{
  for(const direction of ['SELF','OTHER']){
    const {U}=preview();available(U);if(direction==='SELF')U.state.user.notificationEmail=null;else U.state.partner.notificationEmail=null;
    const before=[U.state.expressions.length,U.state.notifications.length,U.state.mailDeliveries.length,U.state.notificationSettings.length];
    const result=create(U,{outgoingMode:'IN_APP_AND_MAIL',followUpMode:'IN_APP_AND_MAIL'});
    assert.equal(result.ok,false);assert.equal(result.error.code,'MAIL_NOT_AVAILABLE');assert.ok(result.error.unavailableDirections.includes(direction));
    assert.deepEqual([U.state.expressions.length,U.state.notifications.length,U.state.mailDeliveries.length,U.state.notificationSettings.length],before);
    assert.equal(U.state.notificationOperations.length,0);
  }
});
test('outgoing capability reveals only booleans and current action mode',()=>{
  const {U}=preview();available(U);
  const caps=U.notificationCapabilities('MEMORY_CARD','m2');
  assert.deepEqual(Object.keys(caps).sort(),['effectiveOutgoingMode','otherMailAvailable','selfMailAvailable']);
  assert.ok(!JSON.stringify(caps).includes('@'));assert.ok(!U.notificationPlanFields().includes('chenyu@example.com'));
  const html=U.notificationPlanFields();assert.match(html,/本次通知对方/);assert.match(html,/对方回应后通知我/);
  assert.equal((html.match(/value="IN_APP" selected/g)||[]).length,2);
});
test('default follow-up read creates no row and own update never changes partner preference',()=>{
  const {U}=preview();available(U);const own=U.myNotificationSetting('MEMORY_CARD','m2');
  assert.equal(own.version,null);assert.equal(U.state.notificationSettings.length,0);
  assert.equal(U.putNotificationSetting('MEMORY_CARD','m2','NONE',null),null);
  assert.equal(U.find('memories','m2').version,1);
  assert.match(U.putNotificationSetting('MEMORY_CARD','m2','IN_APP',null),/已变化/);
  U.switchAccount('chenyu');assert.equal(U.myNotificationSetting('MEMORY_CARD','m2').followUpMode,'IN_APP');
  assert.equal(U.myNotificationSetting('MEMORY_CARD','m2').version,null);
});
test('same logical submit including NONE is replayed without repeating business or notifications',()=>{
  for(const outgoingMode of ['NONE','IN_APP_AND_MAIL']){
    const {U}=preview();available(U);const key=U.operationKey(),plan={outgoingMode,followUpMode:'IN_APP'};
    const first=create(U,plan,key);const before=[U.state.expressions.length,U.state.notifications.length,U.state.mailDeliveries.length];
    U.state.previewMail.enabled=false;const second=create(U,plan,key);
    assert.equal(second.ok,true);assert.equal(second.replayed,true);assert.equal(second.result.id,first.result.id);
    assert.deepEqual([U.state.expressions.length,U.state.notifications.length,U.state.mailDeliveries.length],before);
    assert.ok(!JSON.stringify(U.state.notificationOperations).includes('Private preview text'));
    assert.ok(!JSON.stringify(U.state.notificationOperations).includes('@example.com'));
    const different=create(U,{outgoingMode:'IN_APP',followUpMode:'IN_APP'},key);assert.equal(different.error.code,'IDEMPOTENCY_KEY_REUSED');
  }
});
test('response-lost replay after reload preserves later settings',()=>{
  const env=preview(),U=env.U;available(U);const key=U.operationKey(),plan={outgoingMode:'IN_APP_AND_MAIL',followUpMode:'IN_APP'};
  const first=create(U,plan,key);U.putNotificationSetting('EXPRESSION',first.result.id,'NONE',1);
  const restored=preview(env.saved()).U;restored.state.previewMail.enabled=false;
  const result=create(restored,plan,key);assert.equal(result.replayed,true);
  assert.equal(restored.myNotificationSetting('EXPRESSION',first.result.id).followUpMode,'NONE');
  assert.equal(restored.state.mailDeliveries.length,1);
});
test('follow-up mail unavailable requires explicit temporary override without rewriting receiver',()=>{
  const {U}=preview();available(U);U.putNotificationSetting('EXPRESSION','x1','IN_APP_AND_MAIL',null);U.switchAccount('chenyu');
  U.state.partner.notificationEmail=null;const key=U.operationKey();let mutations=0;
  const request={key,resourceType:'EXPRESSION',id:'x1',action:'EXPRESSION_REPLY',followUp:true,payload:{body:'Preview reply'},message:'对方回应了你的表达'};
  const mutate=()=>{mutations++;U.find('expressions','x1').status='RESPONDED';return {type:'EXPRESSION',id:'x1'};};
  const blocked=U.runNotifiedOperation(request,mutate);assert.equal(blocked.error.code,'MAIL_NOT_AVAILABLE');assert.equal(mutations,0);
  assert.ok(blocked.error.overrideToken);U.state.partner.notificationEmail='linan@example.com';
  const explicit=U.runNotifiedOperation({...request,override:{mode:'NONE',token:blocked.error.overrideToken}},mutate);
  assert.equal(explicit.ok,true);assert.equal(mutations,1);assert.equal(U.state.mailDeliveries.length,0);
  U.switchAccount('linan');assert.equal(U.myNotificationSetting('EXPRESSION','x1').followUpMode,'IN_APP_AND_MAIL');
});
test('override expires or receiver setting changes; old choice cannot submit',()=>{
  for(const change of ['expiry','setting']){
    const env=preview(),U=env.U;available(U);U.putNotificationSetting('EXPRESSION','x1','IN_APP_AND_MAIL',null);U.switchAccount('chenyu');U.state.partner.notificationEmail=null;
    const request={key:U.operationKey(),resourceType:'EXPRESSION',id:'x1',action:'EXPRESSION_REPLY',followUp:true,payload:{body:'Preview'},message:'对方回应了你的表达'};
    const blocked=U.runNotifiedOperation(request,()=>assert.fail('not submitted'));
    if(change==='expiry')env.advance(120001);else {U.switchAccount('linan');U.putNotificationSetting('EXPRESSION','x1','NONE',1);U.switchAccount('chenyu');}
    const retry=U.runNotifiedOperation({...request,override:{mode:'IN_APP',token:blocked.error.overrideToken}},()=>assert.fail('old override cannot submit'));
    assert.equal(retry.error.code,'NOTIFICATION_CONTEXT_CHANGED');assert.ok(retry.error.overrideToken);
  }
});
test('business mail without reminder reference processes and follows terminal policy',()=>{
  const {U}=preview();available(U);const result=create(U,{outgoingMode:'IN_APP_AND_MAIL',followUpMode:'IN_APP'});
  const d=U.state.mailDeliveries[0];assert.equal(d.sourceType,'BUSINESS');assert.equal(d.reminderId,null);
  U.refreshReminders();assert.equal(d.status,'QUEUED');U.advanceMailPreview();U.advanceMailPreview();assert.equal(d.status,'SENT');
  U.switchAccount('chenyu');const n=U.state.notifications.find(n=>n.resourceId===result.result.id);assert.equal(U.mailDelivery(n).id,d.id);
});
test('changing follow-up preference does not cancel already queued business mail',()=>{
  const {U}=preview();available(U);const result=create(U,{outgoingMode:'IN_APP_AND_MAIL',followUpMode:'IN_APP'});const d=U.state.mailDeliveries[0];
  U.switchAccount('chenyu');assert.equal(U.putNotificationSetting('EXPRESSION',result.result.id,'NONE',null),null);
  U.refreshReminders();assert.equal(d.status,'QUEUED');U.advanceMailPreview();U.advanceMailPreview();assert.equal(d.status,'SENT');
});
test('business cancellation mail survives event closure while reminder mail is cancelled',()=>{
  const {U}=preview();available(U);U.saveReminder('CALENDAR_EVENT','e2',{reminder:'2026-09-27T19:00',deliveryMode:'IN_APP_AND_MAIL'});U.refreshReminders();
  const reminderMail=U.state.mailDeliveries[0];U.putNotificationSetting('CALENDAR_EVENT','e2','IN_APP_AND_MAIL',null);U.switchAccount('chenyu');
  const result=U.runNotifiedOperation({key:U.operationKey(),resourceType:'CALENDAR_EVENT',id:'e2',action:'EVENT_CANCEL',followUp:true,payload:{reason:'Preview reason'},message:'对方取消了一次共同安排'},()=>{U.cancelResourceReminders('CALENDAR_EVENT','e2');U.find('events','e2').status='CANCELLED';return {type:'CALENDAR_EVENT',id:'e2'};});
  assert.equal(result.ok,true);assert.equal(reminderMail.status,'CANCELLED');const business=U.state.mailDeliveries.find(d=>d.sourceType==='BUSINESS');
  U.advanceMailPreview();U.advanceMailPreview();assert.equal(business.status,'SENT');
});
test('REMINDER_CHECK follows each private mode and does not consume scheduled plan',()=>{
  const {U}=preview();available(U);U.saveReminder('CALENDAR_EVENT','e2',{reminder:'2026-09-28T10:00',deliveryMode:'IN_APP_AND_MAIL'});
  const r=U.getReminder('CALENDAR_EVENT','e2'),before=JSON.stringify(r);U.state.invitations.push({id:'accepted-change',status:'ACCEPTED',connectionId:U.state.connectionId});
  U.state.previewMail.enabled=false;U.reminderCheckNotifications('e2','accepted-change');U.reminderCheckNotifications('e2','accepted-change');
  assert.equal(JSON.stringify(r),before);const d=U.state.mailDeliveries.find(d=>d.sourceType==='REMINDER_CHECK');assert.equal(d.status,'FAILED');assert.equal(d.failureCode,'MAIL_DISABLED');
  assert.equal(U.state.notifications.filter(n=>n.sourceType==='REMINDER_CHECK').length,1);
});
test('NONE private reminder creates no row, cancels an old plan and requires explicit re-enable time',()=>{
  const {U}=preview();assert.equal(U.saveReminder('MEMORY_CARD','m1',{deliveryMode:'NONE',reminder:''}),null);assert.equal(U.getReminder('MEMORY_CARD','m1'),null);
  assert.match(U.validateReminderValues({deliveryMode:'IN_APP',reminder:''}),/填写/);
  U.saveReminder('MEMORY_CARD','m1',{deliveryMode:'IN_APP',reminder:'2026-09-28T10:00'});const r=U.getReminder('MEMORY_CARD','m1');
  U.saveReminder('MEMORY_CARD','m1',{deliveryMode:'NONE',reminder:'2026-09-28T10:00'});assert.equal(r.status,'CANCELLED');assert.equal(r.deliveryMode,'IN_APP');
  assert.match(U.reminderFields('MEMORY_CARD','m1'),/NONE" selected/);
});
test('local transaction rolls back content, settings, notifications and receipt together',()=>{
  const {U}=preview();available(U);const before=JSON.stringify(U.state);
  const result=U.runNotifiedOperation({key:U.operationKey(),resourceType:'EXPRESSION',action:'EXPRESSION_CREATE',notificationPlan:{outgoingMode:'IN_APP',followUpMode:'NONE'},payload:{body:'Preview'},message:'收到一条新的表达'},()=>{U.find('expressions','x1').body='changed';throw new Error('test rollback');});
  assert.equal(result.error.code,'OPERATION_FAILED');assert.equal(JSON.stringify(U.state),before);
});
