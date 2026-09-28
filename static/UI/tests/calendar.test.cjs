const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('./helpers/preview.cjs');

test('calendar keeps half-open day boundaries and only returns authorised personal/shared items',()=>{
  const env=preview(),{U}=env;env.load('calendar.js');const day=U.currentDay(),start=U.startOfDay(day),next=U.startOfDay(U.addDay(day,1));
  U.state.events.push({id:'at-end',owner:'me',kind:'PERSONAL',status:'CONFIRMED',title:'次日开始',start:next,end:new Date(Date.parse(next)+3600000).toISOString()});
  U.state.events.push({id:'partner-secret',owner:'partner',kind:'PERSONAL',status:'CONFIRMED',title:'私密标题',start,end:next,availability:'BUSY'});
  const items=U.calendarQuery({from:day,to:U.addDay(day,1)});
  assert.ok(items.some(e=>e.id==='e1'));assert.ok(items.some(e=>e.id==='e2'));
  assert.ok(!items.some(e=>e.id==='at-end'));assert.ok(!items.some(e=>e.id==='partner-secret'));
  assert.ok(U.calendarQuery({from:U.addDay(day,1),to:U.addDay(day,2)}).some(e=>e.id==='at-end'));
});

test('seven-day, 42-cell and 93-day calendar views render their full ranges',()=>{
  const env=preview(),{U}=env;env.load('calendar.js');const day=U.currentDay();
  U.view.calendar={mode:'agenda',scope:'all',day,includeCancelled:false,rangeStart:day,rangeEndExclusive:U.addDay(day,7)};
  assert.equal((U.pages.calendar().match(/class="agenda-day"/g)||[]).length,7);
  U.view.calendar.mode='month';assert.equal((U.pages.calendar().match(/class="month-cell /g)||[]).length,42);
  U.actions['calendar-range']();assert.match(env.submit({from:day,last:U.addDay(day,93)}),/1 到 93 天/);
  assert.equal(env.submit({from:day,last:U.addDay(day,92)}),undefined);
  assert.equal((U.pages.calendar().match(/class="agenda-day"/g)||[]).length,93);
  assert.throws(()=>U.calendarQuery({from:day,to:U.addDay(day,94)}),/93/);
});

test('cancelled shared events can be queried and opened without reviving their reminders',()=>{
  const env=preview(),{U}=env;env.load('calendar.js');const e=U.find('events','e2'),day=U.currentDay();
  e.status='CANCELLED';e.cancelReason='共同取消说明';
  assert.ok(!U.calendarQuery({from:day,to:U.addDay(day,1)}).some(item=>item.id===e.id));
  assert.ok(U.calendarQuery({from:day,to:U.addDay(day,1),includeCancelled:true}).some(item=>item.id===e.id));
  U.view.calendar={mode:'agenda',scope:'all',day,includeCancelled:false,rangeStart:day,rangeEndExclusive:U.addDay(day,7)};
  U.actions['calendar-cancelled']();assert.match(U.pages.calendar(),/共同取消说明|已取消/);
  U.eventDetail(e.id);assert.match(env.modal.html,/共同取消说明/);
});

test('busy blocks are clipped and merge only where all contributors explicitly share the same title',()=>{
  const env=preview(),{U}=env;env.load('calendar.js');const day='2026-09-28',t=time=>U.fromLocal(day+'T'+time);
  U.state.partner.shareAvailability=true;U.state.availability=[];
  U.state.events.push(
    {id:'secret-private-a',kind:'PERSONAL',owner:'partner',status:'CONFIRMED',availability:'BUSY',shareTitle:true,title:'可见标题',note:'秘密A',start:t('10:00'),end:t('12:00')},
    {id:'secret-private-b',kind:'PERSONAL',owner:'partner',status:'CONFIRMED',availability:'BUSY',shareTitle:false,title:'不可见标题',note:'秘密B',start:t('11:00'),end:t('13:00')},
    {id:'secret-private-c',kind:'PERSONAL',owner:'partner',status:'CONFIRMED',availability:'BUSY',shareTitle:true,title:'可见标题',note:'秘密C',start:t('13:00'),end:t('14:00')}
  );
  const blocks=U.availabilityBlocks(day);
  assert.ok(blocks.some(b=>b.title==='可见标题'));
  assert.ok(blocks.some(b=>b.title===null&&b.start===t('11:00')&&b.end===t('13:00')));
  assert.ok(blocks.every(b=>!JSON.stringify(b).includes('secret-private')&&!JSON.stringify(b).includes('秘密')));
  U.state.partner.shareAvailability=false;assert.equal(U.availabilityBlocks(day).length,0);
  const invite=U.find('invitations','i1');invite.start=t('11:00');invite.end=t('12:00');
  assert.ok(U.conflicts(invite).length>0);
});

test('overlapping week events remain separately visible in adjacent lanes',()=>{
  const env=preview(),{U}=env;env.load('calendar.js');const day=U.addDay(U.currentDay(),1),at=time=>U.fromLocal(day+'T'+time);
  U.state.events.push(
    {id:'overlap-a',kind:'PERSONAL',owner:'me',status:'CONFIRMED',title:'先开始的安排',start:at('10:00'),end:at('11:30')},
    {id:'overlap-b',kind:'PERSONAL',owner:'me',status:'CONFIRMED',title:'中途开始的安排',start:at('10:30'),end:at('11:00')}
  );
  U.view.calendar={mode:'week',scope:'all',day,includeCancelled:false};
  const html=U.pages.calendar();
  assert.match(html,/left:0%;width:50%[^>]*>.*?data-id="overlap-a"/s);
  assert.match(html,/left:50%;width:50%[^>]*>.*?data-id="overlap-b"/s);
});
