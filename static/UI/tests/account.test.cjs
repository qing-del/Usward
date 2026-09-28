const test=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('./helpers/preview.cjs');

test('four avatar styles persist, and INITIAL follows the current nickname',()=>{
  let env=preview();
  for(const [style,glyph] of [['INITIAL','宁'],['FLOWER','✿'],['SUN','☼'],['SPROUT','芽']]){
    env.U.actions['profile-edit']();
    assert.equal(env.submit({name:'林宁',avatarStyle:style}),undefined);
    assert.equal(env.U.state.user.avatarStyle,style);
    assert.match(env.U.avatar(),new RegExp(`>${glyph}<`));
    env=preview(env.saved());
    assert.equal(env.U.state.user.avatarStyle,style);
    assert.match(env.U.avatar(),new RegExp(`>${glyph}<`));
  }
  env.U.switchAccount('chenyu');
  assert.equal(env.U.state.user.avatarStyle,'INITIAL');
  assert.match(env.U.avatar(),/>屿</);
  assert.match(env.U.avatar('partner'),/>芽</);
  env=preview(env.saved());
  assert.equal(env.U.state.partner.avatarStyle,'SPROUT');
});

test('legacy glyphs migrate to canonical avatarStyle without storing an image',()=>{
  const original=preview();
  original.U.state.user.avatar='✿';
  delete original.U.state.user.avatarStyle;
  const env=preview(original.saved());
  assert.equal(env.U.state.user.avatarStyle,'FLOWER');
  assert.equal(Object.hasOwn(env.U.state.user,'avatar'),false);
  assert.match(env.U.avatar(),/>✿</);
});

test('invitation shows plaintext only when generated, then only metadata survives reload',async()=>{
  let env=preview();env.U.replaceState({...env.U.state,connected:false,connectionId:null});
  await env.U.actions['connection-generate']();
  const code=env.modal.html.match(/id="connection-code" value="([^"]+)"/)[1];
  assert.match(code,/^US-[A-Z2-9]{8}-[A-Z2-9]{8}$/);
  let saved=env.saved();
  assert.ok(!saved.includes(code));
  assert.ok(!saved.includes('"code":'));
  assert.equal(env.U.state.connectionInvites[0].status,'PENDING');
  assert.equal(env.U.state.connectionInvites[0].codeHash.length,64);
  env=preview(saved);
  await env.U.actions['connection-generate']();
  assert.match(env.modal.html,/邀请编号/);
  assert.doesNotMatch(env.modal.html,/id="connection-code"/);
  await env.U.actions['connection-regenerate']();
  const replacement=env.modal.html.match(/id="connection-code" value="([^"]+)"/)[1];
  assert.notEqual(replacement,code);
  assert.equal(env.U.state.connectionInvites[0].status,'REVOKED');
  assert.equal(env.U.state.connectionInvites[1].status,'PENDING');
  env.U.actions['connection-revoke']();
  assert.equal(env.U.state.connectionInvites[1].status,'REVOKED');
});

test('invite preview rejects self, revoked, expired and consumed tokens before connecting',async()=>{
  const env=preview();env.U.replaceState({...env.U.state,connected:false,connectionId:null});
  await env.U.actions['connection-generate']();
  const code=env.modal.html.match(/id="connection-code" value="([^"]+)"/)[1];
  env.U.actions['connection-receive']();
  assert.match(await env.submit({code}),/不能接受自己/);
  env.U.switchAccount('chenyu');
  env.U.actions['connection-receive']();
  assert.equal(await env.submit({code}),false);
  assert.match(env.modal.html,/林安/);
  env.U.actions['connection-accept']();
  assert.equal(env.U.connected(),true);
  assert.equal(env.U.state.connectionInvites[0].status,'CONSUMED');
  env.U.actions['connection-end-confirm']();env.confirm();
  env.U.actions['connection-receive']();
  assert.match(await env.submit({code}),/已经使用/);
  await env.U.actions['connection-generate']();
  const later=env.modal.html.match(/id="connection-code" value="([^"]+)"/)[1];
  env.U.switchAccount('linan');
  env.advance(25*60*60*1000);
  env.U.actions['connection-receive']();
  assert.match(await env.submit({code:later}),/已过期/);
});

test('unlink cancels old shared work, keeps author plans and removes drafts for the old connection',()=>{
  const env=preview(),U=env.U,oldConnection=U.state.connectionId;
  U.state.user.notificationEmail='linan@example.com';U.state.partner.notificationEmail='chenyu@example.com';
  U.saveReminder('MEMORY_CARD','m2',{reminder:'2026-09-29T08:00',deliveryMode:'IN_APP'});
  const authorReminder=U.getReminder('MEMORY_CARD','m2');
  U.switchAccount('chenyu');
  U.saveReminder('MEMORY_CARD','m2',{reminder:'2026-09-29T09:00',deliveryMode:'IN_APP_AND_MAIL'});
  const readerReminder=U.getReminder('MEMORY_CARD','m2');
  U.saveReminder('CALENDAR_EVENT','e2',{reminder:'2026-09-29T10:00',deliveryMode:'IN_APP_AND_MAIL'});
  const eventReminder=U.getReminder('CALENDAR_EVENT','e2');
  const notice=U.queueNotification({type:'MEMORY_CARD',id:'m2',message:'分享更新',recipient:'chenyu',mode:'IN_APP_AND_MAIL'});
  const mail=U.state.mailDeliveries.find(d=>d.notificationId===notice.id);
  U.putNotificationSetting('MEMORY_CARD','m2','IN_APP',null);
  U.state.notificationOperations.push({actor:'chenyu',key:'old',action:'memory-comment',result:{type:'MEMORY_CARD',id:'m2'}});
  U.state.drafts[`expression-new@${oldConnection}`]={body:'旧连接草稿'};
  U.state.drafts['expression-new']={body:'旧版草稿'};
  U.state.drafts['memory-new']={body:'私人草稿'};
  U.state.draftsByUser={linan:{[`invitation-new@${oldConnection}`]:{title:'旧邀约'},'memory-new':{body:'私人草稿'}}};
  U.actions['connection-end-confirm']();env.confirm();
  assert.equal(authorReminder.status,'PENDING');
  assert.equal(readerReminder.status,'CANCELLED');
  assert.equal(eventReminder.status,'CANCELLED');
  assert.equal(mail.status,'CANCELLED');
  assert.ok(notice.invalidatedAt);
  assert.equal(U.state.notificationSettings.some(s=>s.resourceId==='m2'),false);
  assert.equal(U.state.notificationOperations.some(o=>o.key==='old'),false);
  assert.equal(U.state.drafts['memory-new'].body,'私人草稿');
  assert.equal(U.state.drafts[`expression-new@${oldConnection}`],undefined);
  assert.equal(U.state.drafts['expression-new'],undefined);
  assert.equal(U.state.draftsByUser.linan[`invitation-new@${oldConnection}`],undefined);
  assert.equal(U.state.draftsByUser.linan['memory-new'].body,'私人草稿');
  assert.equal(U.state.user.shareAvailability,false);
  assert.equal(U.state.partner.shareAvailability,false);
  U.state.connected=true;U.state.connectionId='new-connection';U.refreshReminders();
  assert.equal(U.shared(U.find('expressions','x1')),false);
  assert.equal(U.shared(U.find('events','e2')),false);
  assert.equal(U.sharedDraftKey('expression-new'),'expression-new@new-connection');
  assert.equal(U.notificationVisible(notice),false);
});
