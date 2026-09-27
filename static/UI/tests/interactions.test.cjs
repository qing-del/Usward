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
