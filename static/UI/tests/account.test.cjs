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
