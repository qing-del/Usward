const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('./helpers/preview.cjs');

test('New York DST conversions round trip and repeated wall times require a chosen offset',()=>{
  const {U}=preview();U.state.user.timezone='America/New_York';
  for(const [local,utc] of [['2026-03-08T03:30','2026-03-08T07:30:00.000Z'],['2026-11-01T02:30','2026-11-01T07:30:00.000Z']]){
    assert.equal(U.fromLocal(local),utc);assert.equal(U.local(utc),local);
  }
  assert.throws(()=>U.fromLocal('2026-03-08T02:30'),error=>error.code==='NONEXISTENT_TIME');
  assert.throws(()=>U.fromLocal('2026-11-01T01:30'),error=>error.code==='AMBIGUOUS_TIME');
  assert.equal(U.fromLocal('2026-11-01T01:30','America/New_York','-04:00'),'2026-11-01T05:30:00.000Z');
  assert.equal(U.fromLocal('2026-11-01T01:30','America/New_York','-05:00'),'2026-11-01T06:30:00.000Z');
});

test('London gap and overlap, malformed dates and skipped civil dates are handled explicitly',()=>{
  const {U}=preview();assert.throws(()=>U.fromLocal('2026-03-29T01:30','Europe/London'),error=>error.code==='NONEXISTENT_TIME');
  assert.throws(()=>U.fromLocal('2026-10-25T01:30','Europe/London'),error=>error.code==='AMBIGUOUS_TIME');
  assert.equal(U.fromLocal('2026-10-25T01:30','Europe/London','+00:00'),'2026-10-25T01:30:00.000Z');
  assert.throws(()=>U.fromLocal('2026-02-30T08:00'),error=>error.code==='INVALID_TIME');
  assert.throws(()=>U.startOfDay('2011-12-30','Pacific/Apia'),error=>error.code==='SKIPPED_DATE');
  assert.equal(U.startOfDay('2018-11-04','America/Sao_Paulo'),'2018-11-04T03:00:00.000Z');
});

test('all-day event keeps original IANA zone and absolute bounds when title edited in another display zone',()=>{
  const env=preview(),{U}=env;U.eventForm();
  const values={title:'上海全天',allDay:true,startDate:'2026-09-28',lastDate:'2026-09-28',location:'',note:'',availability:'BUSY',offline:false,shareTitle:false,reminder:'',deliveryMode:'NONE'};
  env.submit(values);const e=U.state.events.at(-1);
  assert.equal(e.start,'2026-09-27T16:00:00.000Z');assert.equal(e.end,'2026-09-28T16:00:00.000Z');
  assert.equal(e.endDate,'2026-09-29');U.state.user.timezone='America/New_York';
  U.eventForm(e.id);assert.match(env.form.html,/2026-09-28/);env.submit({...values,title:'只改标题'});
  assert.equal(e.eventTimezone,'Asia/Shanghai');assert.equal(e.start,'2026-09-27T16:00:00.000Z');assert.equal(e.end,'2026-09-28T16:00:00.000Z');
  assert.equal(U.occursOn(e,'2026-09-27'),true);assert.equal(U.occursOn(e,'2026-09-28'),true);assert.equal(U.occursOn(e,'2026-09-29'),false);
});

test('DATE deadline is valid for the saved-zone day; timezone and display changes do not move its boundary',()=>{
  const env=preview(),{U}=env;U.commitmentForm();
  const values={title:'日期承诺',body:'',dueKind:'DATE',due:'2026-09-27',nextAction:'',deliveryMode:'NONE',reminder:''};
  env.submit(values);const c=U.state.commitments[0];assert.equal(c.dueAt,null);assert.equal(c.dueTimezone,'Asia/Shanghai');
  assert.equal(U.deadline(c).deadlineAt,'2026-09-27T16:00:00.000Z');assert.equal(U.overdue(c),false);assert.equal(U.deadline(c).isDueToday,true);
  U.state.user.timezone='America/New_York';U.commitmentForm(c.id);assert.match(env.form.html,/Asia\/Shanghai/);env.submit({...values,body:'更改说明'});
  assert.equal(c.dueTimezone,'Asia/Shanghai');env.advance(4*3600000);assert.equal(U.overdue(c),true);assert.equal(U.deadline(c).isDueToday,false);
});

test('INSTANT and NONE deadlines switch precision and share one overdue calculation',()=>{
  const env=preview(),{U}=env;U.commitmentForm();
  const values={title:'精确截止',body:'',dueKind:'INSTANT',dueAtInput:'2026-09-27T14:00',nextAction:'',deliveryMode:'NONE',reminder:''};
  env.submit(values);const c=U.state.commitments[0];assert.equal(c.dueAt,'2026-09-27T06:00:00.000Z');assert.equal(c.dueDate,null);assert.equal(c.dueTimezone,null);assert.equal(U.overdue(c),true);
  assert.match(U.pages.commitments(),/精确截止/);assert.match(U.pages.commitments(),/已过约定时间/);
  U.commitmentForm(c.id);env.submit({...values,dueKind:'NONE'});assert.equal(c.dueAt,null);assert.equal(c.dueDate,null);assert.equal(U.overdue(c),false);
});

test('reminders and precise deadlines share gap rejection and explicit overlap offset handling',()=>{
  const env=preview(),{U}=env;U.state.user.timezone='America/New_York';
  assert.match(U.validateReminderValues({reminder:'2026-03-08T02:30',deliveryMode:'IN_APP'}),/不存在/);
  assert.match(U.validateReminderValues({reminder:'2026-11-01T01:30',deliveryMode:'IN_APP'}),/偏移/);
  U.saveReminder('MEMORY_CARD','m1',{reminder:'2026-11-01T01:30',reminderOffset:'-05:00',deliveryMode:'IN_APP'});
  assert.equal(U.getReminder('MEMORY_CARD','m1').scheduledAt,'2026-11-01T06:30:00.000Z');
  U.commitmentForm();assert.match(env.submit({title:'保持输入',dueKind:'INSTANT',dueAtInput:'2026-11-01T01:30',deliveryMode:'NONE'}),/偏移/);
  assert.equal(env.submit({title:'保持输入',dueKind:'INSTANT',dueAtInput:'2026-11-01T01:30',dueAtInputOffset:'-04:00',deliveryMode:'NONE'}),undefined);
  assert.equal(U.state.commitments[0].dueAt,'2026-11-01T05:30:00.000Z');
});

test('day queries use half-open boundaries and legacy UTC deadlines keep INSTANT precision',()=>{
  const env=preview(),{U}=env;const e={start:'2026-09-27T15:00:00Z',end:'2026-09-27T16:00:00Z'};
  assert.equal(U.occursOn(e,'2026-09-27'),true);assert.equal(U.occursOn(e,'2026-09-28'),false);
  const c=U.find('commitments','c1');delete c.dueKind;c.due='2026-09-27T14:00:00Z';c.dueAt=null;U.prepareDates();
  assert.equal(c.dueKind,'INSTANT');assert.equal(c.dueAt,'2026-09-27T14:00:00Z');assert.equal(c.dueDate,null);
});

test('offline confirmation preserves first timestamp on edit and renews only when explicitly rechecked',()=>{
  const env=preview(),{U}=env;const values={title:'线下记录',allDay:false,start:'2026-10-01T08:00',end:'2026-10-01T09:00',availability:'BUSY',offline:true,deliveryMode:'NONE'};
  U.eventForm();env.submit(values);const e=U.state.events.at(-1),first=e.offlineConfirmedAt;env.advance(1000);
  U.eventForm(e.id);env.submit({...values,title:'标题更新'});assert.equal(e.offlineConfirmedAt,first);
  U.eventForm(e.id);env.submit({...values,offline:false});assert.equal(e.offlineConfirmedAt,null);
  U.eventForm(e.id);env.submit(values);assert.notEqual(e.offlineConfirmedAt,first);
});
