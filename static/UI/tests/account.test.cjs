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
