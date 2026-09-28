/* Client-only Usward preview: demo identities, no API or real authentication. */
(() => {
  'use strict';
  const KEY = 'usward-preview-v1';
  const page = document.body.dataset.page || 'today';
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
    heart: '<path d="M20.8 5.6c-2.2-2.3-5.7-2.1-8.8.9-3.1-3-6.6-3.2-8.8-.9-3.1 3.2-.8 7.3 1.5 9.4L12 22l7.3-7c2.3-2.1 4.6-6.2 1.5-9.4Z"/>',
    memory: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M5 7H3m2 5H3m2 5H3m7-9h6m-6 4h6m-6 4h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    link: '<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2m-3 5-2 2a5 5 0 0 1-7-7l2-2"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-3 2 2-7a9 9 0 1 1 18-4Z"/><path d="M7 11h10m-10 4h6"/>',
    leaf: '<path d="M20 3C10 1 3 6 4 13c1 6 8 8 13 3 3-3 3-9 3-13ZM3 21 16 8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    edit: '<path d="m14 4 6 6M4 20l5-1L21 7l-4-4L5 15l-1 5Z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    flag: '<path d="M5 21V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0"/>',
    pin: '<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    archive: '<path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    cup: '<path d="M4 8h12v7a6 6 0 0 1-12 0V8ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3m5-3v3M3 22h15"/>',
    logout: '<path d="M9 3H4v18h5m6-14 5 5-5 5M9 12h11"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 2h4l1 3 3 1 3 1v4l-2 2v3l-3 3h-3l-2 3H7l-1-4-3-2v-4l2-2V6l3-2 2-2Z"/>',
    flower: '<path d="M12 8c-7-8-13 2-5 5-10 5-2 12 4 5 3 10 13 5 9-2 10-3 4-13-3-8-1-10-11-7-5 0Z"/><circle cx="12" cy="13" r="2"/>'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
  const logo = `<svg class="brand-symbol" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M19 19C1 6 6 0 17 4c6 2 5 10 2 15ZM21 19C35 1 41 9 35 18c-3 5-9 4-14 1ZM21 21c19 10 10 19 2 13-4-3-4-8-2-13ZM19 21C6 39-1 29 6 22c4-4 9-4 13-1Z" fill="currentColor"/><circle cx="20" cy="20" r="2.5" fill="#fafaf5"/></svg>`;
  const isoDay = (date = new Date(), zone = 'Asia/Shanghai') => new Intl.DateTimeFormat('en-CA', {timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const addDay = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0,10);
  const seedDay = isoDay();
  const stamp = (day, time) => `${day}T${time}:00+08:00`;
  function seed(connected = true) {
    const day = seedDay;
    return {
      schema:1, demoDay:day, connected, connectionId:connected ? 'connection-demo-1' : null,
      user:{username:'linan',name:'林安',timezone:'Asia/Shanghai',avatarStyle:'INITIAL',shareAvailability:false},partner:{username:'chenyu',name:'陈屿',timezone:'Asia/Shanghai',avatarStyle:'INITIAL',shareAvailability:true},
      memories:[
        {id:'m1',owner:'me',title:'不赶时间的早餐',body:'比起精心安排的约会，更喜欢一起慢慢吃一顿早餐。哪怕只是楼下的豆浆和包子，也会觉得这一天很好。',category:'喜好兴趣',tags:['早餐','小日常'],source:'EXPLICIT',sourceDate:addDay(day,-3),nextAction:'下次周末，留一点时间一起吃早餐。',reminder:'',shared:false,connectionId:null,archived:false,color:'sand',comments:[]},
        {id:'m2',owner:'me',title:'忙的时候，先发一条消息',body:'他说，忙的时候不需要一直聊天，但如果能提前说一句“今天会比较忙”，就不用互相猜测。',category:'相处偏好',tags:['沟通','安心感'],source:'EXPLICIT',sourceDate:addDay(day,-5),nextAction:'忙之前，记得主动告诉他。',reminder:'',shared:true,connectionId:'connection-demo-1',archived:false,color:'sage',comments:[]},
        {id:'m3',owner:'me',title:'最近想去看海',body:'路过旅行书店的时候，他在那本海边小城的书前停了很久。也许可以找个不太忙的周末，提议一起去走走。',category:'近期关注',tags:['旅行','待确认'],source:'INTERPRETATION',sourceDate:addDay(day,-2),nextAction:'先问问他是不是想去，不急着做决定。',reminder:'',shared:false,connectionId:null,archived:false,color:'peach',comments:[]},
        {id:'m4',owner:'me',title:'咖啡少一点冰',body:'冰拿铁喜欢少冰，不加糖。下午太晚喝咖啡会睡不着，可以换成热茶。',category:'喜好兴趣',tags:['咖啡'],source:'EXPLICIT',sourceDate:addDay(day,-9),nextAction:'',reminder:stamp(day,'16:00'),shared:false,connectionId:null,archived:false,color:'lavender',comments:[]},
        {id:'m5',owner:'me',title:'给彼此一点缓冲',body:'意见不一样的时候，我容易急着解释。下次试着先听完，再说自己的想法。不需要立刻得出一个答案。',category:'自我反思',tags:['慢一点'],source:'INTERPRETATION',sourceDate:addDay(day,-1),nextAction:'',reminder:'',shared:false,connectionId:null,archived:false,color:'sage',comments:[]},
        {id:'m6',owner:'partner',title:'周末想做的小事',body:'一起去菜市场，挑两种没做过的蔬菜。然后慢慢做饭，不赶时间。',category:'共同经历',tags:['周末','做饭'],source:'OBSERVED',sourceDate:addDay(day,-4),nextAction:'',reminder:'',shared:true,connectionId:'connection-demo-1',archived:false,color:'sand',comments:[]}
      ],
      expressions:[
        {id:'x1',sender:'partner',type:'想和你待一会儿',body:'这周有一点忙，想找个时间一起散散步。不用做什么，待一会儿就好。',window:'有空再看',mode:'陪我一下',status:'OPEN',createdAt:stamp(day,'09:20'),connectionId:'connection-demo-1',replies:[]},
        {id:'x2',sender:'me',type:'有件事想分享',body:'今天试了那家新开的面包店，肉桂卷很好吃。下次想带你一起去。',window:'有空再看',mode:'暂时只想告诉你',status:'RESPONDED',createdAt:stamp(addDay(day,-1),'16:30'),connectionId:'connection-demo-1',replies:[{author:'partner',body:'好呀，周末一起去。',at:stamp(addDay(day,-1),'17:10')}]},
        {id:'x3',sender:'me',type:'自由留言',body:'',status:'WITHDRAWN',createdAt:stamp(addDay(day,-2),'20:10'),connectionId:'connection-demo-1',replies:[]}
      ],
      events:[
        {id:'e1',owner:'me',kind:'PERSONAL',title:'给自己一点阅读时间',start:stamp(day,'10:00'),end:stamp(day,'11:00'),availability:'BUSY',note:'读完上次没看完的那一章。',shareTitle:false,offline:false,status:'CONFIRMED',reminder:''},
        {id:'e2',kind:'SHARED',title:'一起做晚饭',start:stamp(day,'18:00'),end:stamp(day,'19:30'),location:'家里',note:'试试上次收藏的番茄炖牛腩。',connectionId:'connection-demo-1',status:'CONFIRMED',version:1,reminder:'',pendingChange:null},
        {id:'e3',owner:'me',kind:'PERSONAL',title:'饭后散步',start:stamp(day,'20:00'),end:stamp(day,'20:30'),availability:'NEGOTIABLE',note:'微信里已经约好了。',shareTitle:false,offline:true,status:'CONFIRMED',reminder:''},
        {id:'e4',owner:'me',kind:'PERSONAL',title:'个人安排',start:stamp(addDay(day,1),'15:30'),end:stamp(addDay(day,1),'16:00'),availability:'BUSY',note:'这条备注只给自己看。',shareTitle:false,offline:false,status:'CONFIRMED',reminder:''},
        {id:'e5',owner:'me',kind:'PERSONAL',title:'整理房间',start:stamp(addDay(day,-2),'14:00'),end:stamp(addDay(day,-2),'15:00'),availability:'BUSY',note:'',shareTitle:false,offline:false,status:'CONFIRMED',reminder:''}
      ],
      availability:[{id:'a1',start:stamp(day,'14:00'),end:stamp(day,'16:00'),status:'BUSY'}, {id:'a2',start:stamp(addDay(day,1),'19:00'),end:stamp(addDay(day,1),'21:00'),status:'NEGOTIABLE'}, {id:'a3',start:stamp(addDay(day,2),'10:00'),end:stamp(addDay(day,2),'12:00'),status:'FREE'}],
      invitations:[{id:'i1',sender:'partner',title:'一起去逛植物园',start:stamp(addDay(day,1),'15:00'),end:stamp(addDay(day,1),'16:30'),location:'城南植物园',note:'天气应该不错，想和你走走。',status:'PENDING',purpose:'CREATE',connectionId:'connection-demo-1',createdAt:stamp(day,'09:00')}],
      commitments:[
        {id:'c1',owner:'me',title:'选好下周一起看的电影',body:'找两三部感兴趣的，再一起选。',nextAction:'看看收藏的电影清单。',due:addDay(day,1),status:'OPEN',shared:false,reminder:'',result:'',connectionId:null},
        {id:'c2',owner:'me',title:'把答应的书带给他',body:'上次聊到的那本散文集。',nextAction:'出门前放进包里。',due:day,status:'OPEN',shared:true,reminder:'',result:'',connectionId:'connection-demo-1'},
        {id:'c3',owner:'me',title:'提前告诉他这周的安排',body:'',nextAction:'',due:addDay(day,-2),status:'DONE',shared:false,reminder:'',result:'吃晚饭的时候聊过了。',connectionId:null},
        {id:'c4',owner:'partner',title:'整理上次旅行的路线',body:'周末一起看看还想去哪儿。',nextAction:'',due:addDay(day,3),status:'OPEN',shared:true,reminder:'',result:'',connectionId:'connection-demo-1'}
      ],
      notifications:[{id:'n1',kind:'expression',resourceId:'x1',message:'收到一条新的表达',read:false,at:stamp(day,'09:20')},{id:'n2',kind:'invitation',resourceId:'i1',message:'收到一份新邀约',read:false,at:stamp(day,'09:00')},{id:'n3',kind:'memory',resourceId:'m4',message:'你设置的私人提醒到了',read:true,at:stamp(addDay(day,-1),'16:00')}],
      inviteToken:null,connectionInvites:[],drafts:{},signedIn:true
    };
  }
  let storageAvailable = true;
  let state;
  try {state = JSON.parse(localStorage.getItem(KEY));} catch (_) {storageAvailable = false;}
  if (!state || state.schema !== 1) state = seed();
  state.user.username ||= 'linan';state.partner.username ||= state.user.username==='linan'?'chenyu':'linan';state.partner.timezone ||= 'Asia/Shanghai';
  [state.user,state.partner].forEach(person=>{person.avatarStyle ||= {'✿':'FLOWER','☼':'SUN','芽':'SPROUT'}[person.avatar]||'INITIAL';delete person.avatar;});
  state.availability.forEach(a=>a.owner ||= 'partner');state.notifications.forEach(n=>n.recipient ||= state.user.username);
  state.connectionInvites ||= [];if(state.inviteToken){state.inviteToken.owner ||= state.user.username;if(!state.connectionInvites.some(t=>t.code===state.inviteToken.code))state.connectionInvites.push(state.inviteToken);state.inviteToken=null;}
  function save() {try {localStorage.setItem(KEY, JSON.stringify(state));} catch (_) {storageAvailable = false;}}
  save();
  const U = window.U = {
    page, state, pages:{},actions:{},view:{},esc,icon,logo,addDay,stamp,
    categories:['喜好兴趣','近期关注','相处偏好','明确边界','共同经历','自我反思','其他'],
    sources:{EXPLICIT:'对方明确表达',OBSERVED:'亲历事实 / 自己的经历',INTERPRETATION:'我的理解，待确认'},
    presets:['想和你待一会儿','有件事想分享','想一起做件事','刚才有句话让我不舒服','需要一点自己的时间','自由留言'],
    save, uid:prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    currentDay:() => isoDay(new Date(),state.user.timezone),
    overdue:c => c.status==='OPEN' && (c.dueAt ? Date.parse(c.dueAt)<Date.now() : !!c.due && c.due<U.currentDay()),
    connected:() => state.connected && !!state.connectionId,
    shared:resource => U.connected() && resource.connectionId === state.connectionId,
    memoryVisible:m => !m.deleted && (m.owner === 'me' || (m.shared && U.shared(m))),
    commitmentVisible:c => !c.deleted && (c.owner === 'me' || (c.shared && U.shared(c))),
    eventVisible:e => !e.deleted && (e.kind === 'PERSONAL' ? e.owner === 'me' : U.shared(e)),
    expressionVisible:x => U.shared(x),
    person:who => who === 'me' ? state.user.name : state.partner.name,
    avatar:(who='me',cls='') => {const person=who==='me'?state.user:state.partner,style=person.avatarStyle||'INITIAL';return `<span class="avatar ${who==='partner'?'partner':''} style-${style.toLowerCase()} ${cls}" aria-label="${esc(person.name)}的头像">${esc({FLOWER:'✿',SUN:'☼',SPROUT:'芽'}[style]||person.name.slice(-1))}</span>`;},
    badge:(text,color='gray',symbol='') => `<span class="badge ${color}">${symbol ? icon(symbol,11) : ''}${esc(text)}</span>`,
    empty:(title,copy,action='',label='') => `<div class="empty-state"><div class="icon-box">${icon('leaf',25)}</div><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action ? `<button class="btn soft" data-action="${action}">${icon('plus',15)}${esc(label)}</button>` : ''}</div>`,
    heading:(eyebrow,title,subtitle,button='') => `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div>${button}</div>`,
    date:(value,options={month:'long',day:'numeric'}) => value ? new Intl.DateTimeFormat('zh-CN',{timeZone:value.length===10?'UTC':state.user.timezone,...options}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '未设定',
    time:value => new Intl.DateTimeFormat('zh-CN',{timeZone:state.user.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)),
    day:value => isoDay(new Date(value),state.user.timezone),
    local:value => {
      const parts = new Intl.DateTimeFormat('sv-SE',{timeZone:state.user.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
      return parts.replace(' ','T');
    },
    fromLocal:value => {
      if (!value) return '';
      const assumed = new Date(`${value}:00Z`);
      const parts = new Intl.DateTimeFormat('sv-SE',{timeZone:state.user.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(assumed).replace(' ','T');
      const offset = Date.parse(parts+'Z') - assumed.getTime();
      return new Date(assumed.getTime()-offset).toISOString();
    },
    formatRange:e => e.allDay ? `${U.date(e.startDate)}${e.endDate&&e.endDate!==addDay(e.startDate,1)?'–'+U.date(addDay(e.endDate,-1)):''} · 全天（${esc(e.eventTimezone||state.user.timezone)}）` : `${U.date(e.start)} ${U.time(e.start)}–${U.day(e.start) !== U.day(e.end) ? U.date(e.end)+' ' : ''}${U.time(e.end)}`,
    find:(collection,id) => state[collection].find(item => item.id === id),
    notify:(kind,resourceId,message,recipient=state.user.username) => state.notifications.unshift({id:U.uid('n'),kind,resourceId,message,recipient,connectionId:recipient!==state.user.username?state.connectionId:null,read:false,at:new Date().toISOString()}),
    act:(action,id='',label='查看',cls='text-link') => `<button class="${cls}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${label}</button>`,
    footer:() => `<footer class="page-footer">${icon('leaf',12)}记住小事，也为彼此留一点时间。</footer>`
  };
  U.replaceState = next => {state=next;U.state=state;};
  const nav = [{key:'today',label:'今天',icon:'sun',file:'index.html'},{key:'calendar',label:'日历',icon:'calendar',file:'calendar.html'},{key:'expressions',label:'表达',icon:'heart',file:'expressions.html'},{key:'memories',label:'记忆',icon:'memory',file:'memories.html'},{key:'me',label:'我的',icon:'user',file:'me.html'}];
  U.nav = nav;
  U.occursOn=(e,day)=>e.allDay?e.startDate<=day&&e.endDate>day:Date.parse(e.start)<Date.parse(U.fromLocal(U.addDay(day,1)+'T00:00'))&&Date.parse(e.end)>Date.parse(U.fromLocal(day+'T00:00'));
  U.switchAccount=username=>{
    if(username===state.user.username)return;
    const old=state.user.username;const flip=who=>who==='me'?'partner':who==='partner'?'me':who;
    state.events.filter(e=>e.kind==='SHARED').forEach(e=>{e.privateReminders ||= {};e.privateReminders[old]=e.reminder||'';e.reminder=e.privateReminders[username]||'';e.firedReminders ||= {};e.firedReminders[old]=e.firedReminder||'';e.firedReminder=e.firedReminders[username]||'';});
    state.memories.forEach(m=>{m.owner=flip(m.owner);m.comments.forEach(c=>c.author=flip(c.author));});state.commitments.forEach(c=>c.owner=flip(c.owner));state.events.forEach(e=>{if(e.owner)e.owner=flip(e.owner);});state.expressions.forEach(x=>{x.sender=flip(x.sender);x.replies.forEach(r=>r.author=flip(r.author));});state.invitations.forEach(i=>i.sender=flip(i.sender));state.availability.forEach(a=>a.owner=flip(a.owner));
    if(state.inviteToken&&!state.inviteToken.owner)state.inviteToken.owner=old;
    state.draftsByUser ||= {};state.draftsByUser[old]=state.drafts;state.drafts=state.draftsByUser[username]||{};
    [state.user,state.partner]=[state.partner,state.user];U.view={};save();
  };
  U.unread = () => state.notifications.filter(n => !n.read && U.notificationVisible(n)).length;
  U.notificationVisible = n => {
    if(n.invalidatedAt)return false;
    if(n.recipient && n.recipient!==state.user.username)return false;
    if(n.connectionId && n.connectionId!==state.connectionId)return false;
    if (n.kind === 'expression') {const x=U.find('expressions',n.resourceId);return x && U.expressionVisible(x) && x.status !== 'WITHDRAWN';}
    if (n.kind === 'invitation') {const i=U.find('invitations',n.resourceId);return i && U.shared(i);}
    if (n.kind === 'memory') {const m=U.find('memories',n.resourceId);return m && U.memoryVisible(m) && (!n.connectionId || (m.shared&&U.shared(m)));}
    if (n.kind === 'event') {const e=U.find('events',n.resourceId);return e && U.eventVisible(e);}
    if (n.kind === 'commitment') {const c=U.find('commitments',n.resourceId);return c && U.commitmentVisible(c);}
    return n.kind === 'system';
  };
  U.expire = () => {
    let changed=false;
    state.invitations.forEach(i => {
      if (i.status !== 'PENDING') return;
      const target=i.targetEventId && U.find('events',i.targetEventId);
      const end=Math.min(Date.parse(i.start),target ? Date.parse(target.start) : Infinity);
      if (end <= Date.now()) {i.status='EXPIRED';i.version=(i.version||1)+1;i.updatedAt=new Date().toISOString();if(target?.pendingChange===i.id)target.pendingChange=null;changed=true;}
    });
    if (changed) save();
  };
  U.render = () => {
    U.expire();U.refreshReminders();
    if(page!=='login'&&!state.signedIn){window.location.replace('login.html');return;}
    if(page === 'login') {document.querySelector('#app').innerHTML=U.pages.login ? U.pages.login() : '';return;}
    const active = page === 'commitments' ? 'me' : page;
    const label = page === 'commitments' ? '我的承诺' : nav.find(n=>n.key === active)?.label || '今天';
    const expressionCount = state.expressions.filter(x=>U.expressionVisible(x)&&x.sender==='partner'&&x.status==='OPEN').length;
    const navHTML=bottom => nav.map(n=>`<a class="${bottom?'bottom-item':'nav-item'} ${active===n.key?'active':''}" href="${n.file}" ${active===n.key?'aria-current="page"':''}>${icon(n.icon,bottom?21:19)}<span>${n.label}</span>${n.key==='expressions'&&expressionCount?`<span class="nav-count">${expressionCount}</span>`:''}</a>`).join('');
    document.querySelector('#app').innerHTML = `
      <a class="sr-only skip-link" href="#main-content">跳到主要内容</a>
      <aside class="sidebar"><a href="index.html" class="brand" aria-label="Usward 今天">${logo}<span class="brand-word">Usward</span></a><p class="brand-caption">把心意，放进日常</p><p class="nav-label">OUR EVERYDAY</p><nav class="main-nav" aria-label="主导航">${navHTML(false)}</nav><div class="sidebar-note">${icon('leaf',20)}<p>不必事事完美，<br>愿我们好好记得。</p><button class="text-link" data-action="preview">交互预览 ${icon('arrow',12)}</button></div><div class="sidebar-user">${U.avatar()}<div><strong>${esc(state.user.name)}</strong><span class="muted">我的私人空间</span></div><a href="me.html" class="icon-button" aria-label="账号设置">${icon('settings',16)}</a></div></aside>
      <div class="workspace"><header class="topbar"><div class="breadcrumb"><span class="crumb-root">我的空间</span><span class="crumb-separator">/</span><span class="current">${label}</span></div><div class="topbar-right">${U.connected()?`<a class="connection-pill" href="me.html"><span class="dot green"></span>与 ${esc(state.partner.name)} 连接中</a>`:`<a class="connection-pill" href="me.html">${icon('link',13)}邀请一个重要的人</a>`}<button class="icon-button notification-button" data-action="notifications" aria-label="通知，${U.unread()} 条未读">${icon('bell',20)}${U.unread()?'<span class="unread-dot"></span>':''}</button><a href="me.html" aria-label="我的账号">${U.avatar()}</a></div></header><main class="content" id="main-content" tabindex="-1">${U.pages[page] ? U.pages[page]() : U.empty('这一页正在准备中','你可以先从今天开始。')}${U.footer()}</main></div><nav class="bottom-nav" aria-label="手机主导航">${navHTML(true)}</nav>`;
    if(!document.querySelector('#modal-root')) document.body.insertAdjacentHTML('beforeend','<div id="modal-root"></div><div class="toast-region" role="status" aria-live="polite"></div>');
  };
  U.toast = (message,error=false) => {
    let region=document.querySelector('.toast-region');
    if(!region) {document.body.insertAdjacentHTML('beforeend','<div class="toast-region" role="status" aria-live="polite"></div>');region=document.querySelector('.toast-region');}
    const toast=document.createElement('div');toast.className=`toast ${error?'error':''}`;toast.innerHTML=`${icon(error?'info':'check',16)}<span>${esc(message)}</span>`;region.append(toast);setTimeout(()=>toast.remove(),4200);
  };
  let returnFocus;
  U.close = () => {
    document.querySelector('#modal-root')?.replaceChildren();document.body.style.overflow='';document.querySelector('#app')?.removeAttribute('inert');
    if(returnFocus?.isConnected) returnFocus.focus();
  };
  U.modal = (title,body,{eyebrow='A LITTLE SPACE',wide=false}={}) => {
    if(!document.querySelector('#modal-root'))document.body.insertAdjacentHTML('beforeend','<div id="modal-root"></div>');
    if(!document.querySelector('.modal'))returnFocus=document.activeElement;
    document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h2 id="modal-title">${esc(title)}</h2></div><button class="icon-button" data-action="close" aria-label="关闭对话框">${icon('close',19)}</button></div>${body}</section></div>`;
    document.querySelector('#app').setAttribute('inert','');document.body.style.overflow='hidden';
    const focus=document.querySelector('.modal input:not([type=hidden]),.modal textarea,.modal select')||document.querySelector('.modal');focus.focus();
  };
  U.confirm=(title,copy,label,onConfirm,danger=false) => {
    U.modal(title,`<p class="modal-copy">${esc(copy)}</p><div class="form-actions"><button class="btn secondary" data-action="close">再想一下</button><button class="btn ${danger?'danger':'primary'}" id="confirm-action">${esc(label)}</button></div>`);
    document.querySelector('#confirm-action').addEventListener('click',onConfirm,{once:true});
  };
  U.options=(list,selected) => list.map(item=>`<option value="${esc(typeof item==='string'?item:item[0])}" ${(typeof item==='string'?item:item[0])===selected?'selected':''}>${esc(typeof item==='string'?item:item[1])}</option>`).join('');
  U.field=(name,label,type='text',value='',placeholder='',extra='') => `<div class="field"><label for="f-${esc(name)}">${label}</label>${type==='textarea'?`<textarea id="f-${esc(name)}" name="${esc(name)}" ${extra.includes('maxlength=')?'':'maxlength="5000"'} placeholder="${esc(placeholder)}" ${extra}>${esc(value)}</textarea>`:`<input id="f-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${extra}>`}</div>`;
  U.select=(name,label,list,selected='') => `<div class="field"><label for="f-${esc(name)}">${label}</label><select id="f-${esc(name)}" name="${esc(name)}">${U.options(list,selected)}</select></div>`;
  U.form=(title,fields,onSubmit,{label='保存',draft='',wide=false,extra='',eyebrow='KEEP A LITTLE THING'}={}) => {
    U.modal(title,`<form id="dialog-form" class="form-stack">${fields}<p class="form-message" role="alert"></p><div class="form-actions">${extra}<button type="button" class="btn secondary" data-action="close">取消</button><button class="btn primary" type="submit">${esc(label)}</button></div>${draft?'<p class="draft-note">关闭后会保留草稿，回来可以接着写。</p>':''}</form>`,{wide,eyebrow});
    const form=document.querySelector('#dialog-form');
    form.dataset.operationKey=U.operationKey?U.operationKey():U.uid('operation');form.dataset.draftKey=draft;
    if(draft&&state.drafts[draft])Object.entries(state.drafts[draft]).forEach(([name,value])=>{const el=form.elements.namedItem(name);if(el && !(el instanceof RadioNodeList)){if(el.type==='checkbox')el.checked=!!value;else el.value=value;}});
    if(U.bindReminderFields)U.bindReminderFields(form);
    if(U.bindNotificationFields)U.bindNotificationFields(form);
    if(U.bindDueFields)U.bindDueFields(form);
    if(U.bindWallTimeFields)U.bindWallTimeFields(form);
    const serialize=()=>{const values=Object.fromEntries(new FormData(form).entries());form.querySelectorAll('input[type=checkbox]').forEach(el=>values[el.name]=el.checked);const mode=form.elements.namedItem('deliveryMode');if(mode)values.deliveryMode=mode.value;return values;};
    if(draft)form.addEventListener('input',()=>{state.drafts[draft]=serialize();save();});
    form.addEventListener('submit',event=>{
      event.preventDefault();const values=serialize();const message=form.querySelector('.form-message');message.textContent='';
      Object.keys(values).forEach(key=>{if(typeof values[key]==='string')values[key]=values[key].trim();});
      const result=onSubmit(values,form);
      if(typeof result==='string'){message.textContent=result;message.scrollIntoView({block:'nearest'});return;}
      if(result===false)return;
      if(draft)delete state.drafts[draft];save();U.close();U.render();
    });
    return form;
  };
  U.connectionRequired=()=>{U.modal('先邀请一个重要的人',`<div class="inline-note">${icon('link',19)}表达与邀约需要双方主动连接。连接后，历史卡片和承诺仍只对你自己可见。</div><p class="modal-copy mt-16">现在也可以先记一张卡片，或给自己留一段时间。</p><div class="form-actions"><button class="btn secondary" data-action="memory-new">先记下来</button><a class="btn primary" href="me.html">去邀请连接 ${icon('arrow',15)}</a></div>`);};
  U.actions.close=U.close;
  U.actions.preview=()=>U.modal('交互预览',`<p class="modal-copy">这是一份使用示例数据的 HTML 预览。操作只保存在当前浏览器，没有连接后端，也不会向另一位用户发送真实通知。</p><div class="inline-note mt-16">${icon('info',17)}${storageAvailable?'本地修改会在刷新后保留。':'当前浏览器无法保存数据，修改仅在本次打开期间保留。'} 演示双方操作请使用已有的收到内容。</div><div class="list-row"><div><h3>双人连接状态</h3><p>包含收到的表达、邀约和共享内容。</p></div><button class="btn soft small" data-action="reset-connected">载入示例</button></div><div class="list-row"><div><h3>单人使用状态</h3><p>个人记录、日历和承诺仍可使用。</p></div><button class="btn soft small" data-action="reset-solo">载入示例</button></div><p class="quiet-note mt-16">载入示例会替换当前浏览器的预览修改。</p>`);
  U.reset=connected=>U.confirm('重新载入示例？','这会清除你在这份预览中新增或修改的内容，替换为对应状态的示例数据。','重新载入',()=>{state=seed(connected);if(!connected){state.memories.forEach(m=>{m.shared=false;m.connectionId=null;});state.commitments.forEach(c=>{c.shared=false;c.connectionId=null;});}U.state=state;save();U.close();U.view={};U.render();U.toast(connected?'已载入双人示例':'已载入单人示例');});
  U.actions['reset-connected']=()=>U.reset(true);U.actions['reset-solo']=()=>U.reset(false);

  /* Memory cards: private by default; whole-card sharing requires preview. */
  U.memoryForm = id => {
    const m=id?U.find('memories',id):null;if(id&&(!m||m.owner!=='me'||m.deleted))return;
    U.form(m?'编辑记忆':'记住一件小事',`${U.field('body','想记住的事 <span class="coral">*</span>','textarea',m?.body||'','一句话也可以。记下你希望下次还记得的事。','required')}${U.field('title','标题 <small>可选</small>','text',m?.title||'','给这件小事起个名字','maxlength="100"')}<div class="form-grid">${U.select('category','类别',U.categories,m?.category||'其他')}${U.select('source','这条记录来自',Object.entries(U.sources),m?.source||'INTERPRETATION')}</div><p class="quiet-note">「我的理解，待确认」是个人理解；「对方明确表达」由记录者标记。</p><details class="optional-details" ${m?'open':''}><summary>标签、来源日期与后续行动 · 可选</summary><div class="form-stack">${U.field('tags','标签','text',m?.tags.join('，')||'','用逗号分隔，例如：早餐，周末')}${U.field('sourceDate','来源日期','date',m?.sourceDate||'')}${U.field('nextAction','我的下次行动','text',m?.nextAction||'','下次可以为这件事做什么？','maxlength="100"')}${U.reminderFields('MEMORY_CARD',id||'')}<p class="quiet-note">提醒只有你自己能看见；不填也可以保存。</p></div></details><div class="inline-note">${icon('lock',16)}${m?.shared?'这张卡片已分享，保存后对方会看到更新后的整张卡片。':'保存后默认仅自己可见。分享前会再次展示预览。'}</div>${m?.shared&&U.shared(m)?U.followUpNotificationFields('MEMORY_CARD',id):''}`, (v,form)=>{
      if(!v.body)return '请写下想记住的事。';
      const reminderError=U.validateReminderValues(v);if(reminderError)return reminderError;
      const values={title:v.title,body:v.body,category:v.category,source:v.source,tags:[...new Set((v.tags||'').split(/[，,]/).map(x=>x.trim()).filter(Boolean))].slice(0,10),sourceDate:v.sourceDate,nextAction:v.nextAction};
      const current=id?U.find('memories',id):null;
      const changed=current&&Object.keys(values).some(key=>JSON.stringify(current[key])!==JSON.stringify(values[key]));
      const write=()=>{
        let card=current;
        if(card){Object.assign(card,values);if(changed){card.version+=1;card.updatedAt=new Date().toISOString();}}
        else{const now=new Date().toISOString();card={id:U.uid('m'),owner:'me',...values,version:1,createdAt:now,updatedAt:now,shared:false,connectionId:null,archived:false,color:['sage','peach','sand','lavender'][state.memories.length%4],comments:[]};state.memories.unshift(card);}
        U.saveReminder('MEMORY_CARD',card.id,v);return {type:'MEMORY_CARD',id:card.id};
      };
      if(current?.shared&&U.shared(current)&&changed){
        const error=U.submitNotified(form,v,{action:'memory-edit',resourceType:'MEMORY_CARD',id,followUp:true,message:'对方更新了分享给你的记忆'},write);if(error)return error;
      }else{if(id&&(!current||current.deleted||current.owner!=='me'))return '这张卡片已不可编辑。';write();}
      U.toast(m?'记忆已更新':'这件小事，记住了');
    },{draft:id?`memory-${id}`:'memory-new',label:m?'保存修改':'存进记忆'});
  };
  U.memoryDetail=id=>{
    const m=U.find('memories',id);if(!m||!U.memoryVisible(m))return U.toast('这张卡片已不可访问',true);
    const mine=m.owner==='me';
    U.modal(m.title||'一件值得记住的事',`<div class="detail-meta">${U.badge(m.category,'green')}${U.badge(U.sources[m.source],m.source==='INTERPRETATION'?'peach':'gray')}${U.badge(m.shared&&U.shared(m)?mine?'已分享':'对方分享':'仅自己','gray',m.shared&&U.shared(m)?'link':'lock')}</div><p class="modal-copy">${esc(m.body)}</p>${m.tags.length?`<div class="filter-chips mt-16">${m.tags.map(t=>U.badge('# '+t,'gray')).join('')}</div>`:''}${m.sourceDate?`<p class="detail-label">来源日期</p><p class="modal-copy">${U.date(m.sourceDate)}</p>`:''}${m.nextAction?`<p class="detail-label">${mine?'我的下次行动':'作者的下次行动'}</p><p class="modal-copy">${esc(m.nextAction)}</p>`:''}${U.reminderSummary('MEMORY_CARD',id)}${U.notificationSettingHTML('MEMORY_CARD',id)}${m.shared&&U.shared(m)?`<hr class="divider"><h3>补充 / 更正</h3>${m.comments.length?m.comments.map(c=>`<div class="list-row"><div><small class="muted">${esc(U.person(c.author))}</small><p class="modal-copy">${esc(c.body)}</p></div></div>`).join(''):'<p class="quiet-note mt-8">这份记录可以慢慢补充。原文仍由作者决定如何修订。</p>'}${!mine?`<button class="btn soft small mt-16" data-action="memory-comment" data-id="${m.id}">${icon('edit',14)}补充 / 更正</button>`:''}`:''}<div class="detail-footer">${U.act('memory-reminder',m.id,icon('bell',14)+'我的提醒','btn soft')}${U.act('commitment-from-memory',m.id,'写下我的下一步')}${mine?`${U.act('memory-edit',m.id,icon('edit',14)+'编辑','btn soft')}${U.act(m.shared&&U.shared(m)?'memory-unshare':'memory-share',m.id,m.shared&&U.shared(m)?'撤销分享':'分享给对方','btn secondary')}<span class="spacer"></span>${U.act(m.archived?'memory-restore':'memory-archive',m.id,m.archived?'恢复':'归档')}${U.act('memory-delete',m.id,'删除','text-link danger')}`:`<p class="quiet-note">${esc(state.partner.name)} 的记录 · 你可以补充，不能直接编辑。</p>`}</div>`,{eyebrow:mine?'MY MEMORY':'SHARED WITH YOU'});
  };
  U.actions['memory-new']=()=>U.memoryForm();U.actions['memory-edit']=({id})=>U.memoryForm(id);U.actions['memory-view']=({id})=>U.memoryDetail(id);
  U.actions['memory-reminder']=({id})=>U.reminderForm('MEMORY_CARD',id);
  U.actions['memory-share']=({id})=>{
    const m=U.find('memories',id);if(!m||m.owner!=='me'||m.deleted)return;if(!U.connected())return U.connectionRequired();if(m.shared&&U.shared(m))return U.toast('这张记忆已经分享');
    U.form('分享这张记忆',`<p class="quiet-note">${esc(state.partner.name)} 将看到整张当前卡片：</p><div class="card soft"><h3>${esc(m.title||'一件值得记住的事')}</h3><p class="modal-copy mt-8">${esc(m.body)}</p><div class="detail-meta mt-16">${U.badge(m.category,'green')}${U.badge(U.sources[m.source],'gray')}</div>${m.tags.length?`<p class="quiet-note">标签：${esc(m.tags.join('、'))}</p>`:''}${m.sourceDate?`<p class="quiet-note">来源日期：${U.date(m.sourceDate)}</p>`:''}${m.nextAction?`<p class="modal-copy mt-8">下次行动：${esc(m.nextAction)}</p>`:''}</div><div class="inline-note">${icon('lock',16)}私人提醒不会分享。对方只能阅读与提交补充，你可以随时撤销分享。</div>${U.notificationPlanFields('MEMORY_CARD',id)}`,(v,form)=>{
      const error=U.submitNotified(form,v,{action:'memory-share',resourceType:'MEMORY_CARD',id,notificationPlan:{outgoingMode:v.outgoingMode,followUpMode:v.followUpMode},message:'对方与你分享了一张记忆'},()=>{
        const current=U.find('memories',id);if(current.shared&&U.shared(current))throw new Error('Already shared');
        current.shared=true;current.connectionId=state.connectionId;current.comments=[];current.privateReminders={};current.firedPrivateReminders={};current.version+=1;current.updatedAt=new Date().toISOString();
        return {type:'MEMORY_CARD',id};
      });if(error)return error;U.toast('已向当前连接分享这张记忆');
    },{label:'确认分享',eyebrow:'SHARE A LITTLE MEMORY'});
  };
  U.actions['memory-unshare']=({id})=>{
    const m=U.find('memories',id);if(!m||m.owner!=='me'||!m.shared||!U.shared(m))return;const version=m.version,connectionId=state.connectionId;
    U.confirm('撤销分享？','对方将失去这张卡片的访问权限，依附的补充 / 更正、后续通知设置与未完成邮件也会清理。再次分享不会恢复它们；你的私人提醒仍保留。','撤销分享',()=>{
      const current=U.find('memories',id);if(!current||current.version!==version||state.connectionId!==connectionId)return U.toast('卡片或连接已变化，请重新查看',true);
      U.cancelResourceReminders('MEMORY_CARD',id,r=>r.recipient!==state.user.username);U.clearNotificationSettings('MEMORY_CARD',id);U.invalidateBusinessNotifications('MEMORY_CARD',id);
      current.shared=false;current.connectionId=null;current.comments=[];current.privateReminders={};current.firedPrivateReminders={};current.version+=1;current.updatedAt=new Date().toISOString();save();U.close();U.render();U.toast('已恢复为仅自己可见');
    });
  };
  U.actions['memory-archive']=({id})=>{const m=U.find('memories',id);if(!m||m.owner!=='me')return;m.archived=true;m.version+=1;m.updatedAt=new Date().toISOString();save();U.close();U.render();U.toast('已归档，对方的分享访问不受影响');};
  U.actions['memory-restore']=({id})=>{const m=U.find('memories',id);if(!m||m.owner!=='me')return;m.archived=false;m.version+=1;m.updatedAt=new Date().toISOString();save();U.close();U.render();U.toast('已恢复到记忆列表');};
  U.actions['memory-delete']=({id})=>{const m=U.find('memories',id);if(!m||m.owner!=='me')return;U.confirm('删除这张记忆？','删除后无法在预览中恢复。对方也会失去访问权限，相关提醒与补充将一并移除。','删除记忆',()=>{U.cancelResourceReminders('MEMORY_CARD',id);U.clearNotificationSettings('MEMORY_CARD',id);U.invalidateBusinessNotifications('MEMORY_CARD',id);m.version+=1;m.deleted=true;m.shared=false;m.reminder='';m.comments=[];m.privateReminders={};m.firedPrivateReminders={};save();U.close();U.render();U.toast('记忆已删除');},true);};
  U.actions['memory-comment']=({id})=>{
    const m=U.find('memories',id);if(!m||m.owner==='me'||!U.memoryVisible(m))return;
    U.form('补充 / 更正',`${U.field('body','想补充的话','textarea','','说说你的看法，作者会自行决定是否更新原文。','required maxlength="1000"')}<p class="quiet-note">这不会直接修改 ${esc(state.partner.name)} 的原始记录。</p>${U.followUpNotificationFields('MEMORY_CARD',id)}`,(v,form)=>{
      if(!v.body)return '请填写补充内容。';
      const error=U.submitNotified(form,v,{action:'memory-comment',resourceType:'MEMORY_CARD',id,followUp:true,message:'对方为你的记忆留下补充 / 更正'},()=>{
        const current=U.find('memories',id),now=new Date().toISOString();current.comments.push({id:U.uid('comment'),author:'me',body:v.body,at:now});current.version+=1;current.updatedAt=now;return {type:'MEMORY_CARD',id};
      });if(error)return error;U.toast('补充已保存，原文保持不变');
    },{draft:`comment-${id}`,label:'提交补充'});
  };
  U.actions['commitment-from-memory']=({id})=>U.commitmentForm(null,{sourceType:'memory',sourceId:id});

  /* Expressions have response status, never read receipts or deadlines. */
  U.expressionForm=()=>{
    if(!U.connected())return U.connectionRequired();
    const selected=state.drafts['expression-new']?.type||U.presets[0];
    const form=U.form('把想说的话，轻轻说出来',`<div class="expression-choices">${U.presets.map((p,i)=>`<label class="expression-choice"><input type="radio" name="type" value="${esc(p)}" ${p===selected?'checked':''}><span>${icon(['heart','chat','leaf','info','cup','edit'][i],18)}${esc(p)}</span></label>`).join('')}</div>${U.field('body','想多说一点 <small>前五项可跳过；自由留言必填</small>','textarea','','可以只选一种表达，也可以写几句话。')}<details class="optional-details"><summary>希望何时、怎样回应 · 可选</summary><div class="form-grid">${U.select('window','希望回应时间',['有空再看','今天聊聊','现在方便吗'],'有空再看')}${U.select('mode','希望回应方式',[['','不特别指定'],...['听我说','一起想办法','陪我一下','暂时只想告诉你']],'')}</div></details><div class="inline-note">${icon('leaf',16)}这些只是你的偏好。没有回应倒计时，也不会自动催促。</div>${U.notificationPlanFields('EXPRESSION')}`, (v,form)=>{
      if(v.type==='自由留言'&&!v.body)return '自由留言需要填写正文。';
      if(!U.presets.includes(v.type))return '请选择一种表达。';
      const error=U.submitNotified(form,v,{action:'expression-create',resourceType:'EXPRESSION',notificationPlan:{outgoingMode:v.outgoingMode,followUpMode:v.followUpMode},message:'收到一条新的表达'},()=>{
        const now=new Date().toISOString(),x={id:U.uid('x'),sender:'me',type:v.type,body:v.body,window:v.window,mode:v.mode,status:'OPEN',replies:[],createdAt:now,updatedAt:now,version:1,connectionId:state.connectionId};
        state.expressions.unshift(x);return {type:'EXPRESSION',id:x.id};
      });if(error)return error;U.toast('表达已存入发出列表');
    },{draft:'expression-new',label:'发送给 '+state.partner.name,eyebrow:'A LITTLE EXPRESSION',wide:true});
    // Radios are restored separately because namedItem returns a RadioNodeList.
    if(state.drafts['expression-new']?.type)form.querySelectorAll('[name=type]').forEach(el=>el.checked=el.value===selected);
  };
  U.expressionDetail=id=>{
    const x=U.find('expressions',id);if(!x||!U.expressionVisible(x))return U.toast('这条表达已不可访问',true);
    if(x.status==='WITHDRAWN')return U.modal('这条表达已撤回','<div class="inline-note">原文与回应不再显示。</div>');
    const mine=x.sender==='me';
    U.modal(x.type,`<div class="detail-meta">${U.avatar(x.sender,'small')}<small class="muted">${esc(U.person(x.sender))} · ${U.date(x.createdAt)} ${U.time(x.createdAt)}</small>${U.badge(x.status==='OPEN'?'待回应':'已回应',x.status==='OPEN'?'peach':'green')}</div>${x.body?`<p class="modal-copy">${esc(x.body)}</p>`:''}<div class="detail-meta mt-16">${x.window?U.badge(x.window,'gray','clock'):''}${x.mode?U.badge(x.mode,'purple'):''}</div><p class="quiet-note">回应状态只表示是否回应，不代表事情已经解决。</p>${U.notificationSettingHTML('EXPRESSION',id)}${x.replies.length?`<hr class="divider"><div class="reply-list">${x.replies.map(r=>`<div class="reply-item">${U.avatar(r.author,'small')}<div><small class="muted">${esc(U.person(r.author))} · ${U.date(r.at)} ${U.time(r.at)}</small><p class="modal-copy">${esc(r.body)}</p></div></div>`).join('')}</div>`:''}${!mine?`<hr class="divider"><p class="detail-label">轻轻回应</p><div class="filter-chips">${['看到了，晚点找你','现在方便','想换个时间'].map(label=>`<button class="filter-chip" data-action="expression-quick-reply" data-id="${id}" data-value="${esc(label)}">${esc(label)}</button>`).join('')}</div>`:''}<div class="detail-footer">${U.act('expression-reply',id,mine?'继续补充':'写一句回应','btn soft')}${U.act('invite-from-expression',id,'商量具体时间','btn secondary')}${U.act('commitment-from-expression',id,'写下我的下一步')}<span class="spacer"></span>${mine?U.act('expression-withdraw',id,'撤回','text-link danger'):''}</div>`,{eyebrow:mine?'SENT BY ME':'A MESSAGE FOR YOU',wide:true});
  };
  U.expressionReplyForm=(id,body='')=>{
    const x=U.find('expressions',id);if(!x||!U.shared(x)||x.status==='WITHDRAWN')return;
    const mine=x.sender==='me';
    U.form(mine?'继续补充':'写一句回应',U.field('body',mine?'想补充的话':'你的回应','textarea',body,'一句话也可以。','required maxlength="1000"')+U.followUpNotificationFields('EXPRESSION',id),(v,form)=>{
      if(!v.body)return '请写一句话。';
      const error=U.submitNotified(form,v,{action:'expression-reply',resourceType:'EXPRESSION',id,followUp:true,message:mine?'对方为表达追加了补充':'对方回应了你的表达'},()=>{
        const current=U.find('expressions',id),now=new Date().toISOString();
        current.replies.push({id:U.uid('reply'),author:'me',body:v.body,at:now});
        if(current.sender!=='me')current.status='RESPONDED';current.version+=1;current.updatedAt=now;
        return {type:'EXPRESSION',id};
      });if(error)return error;U.toast(mine?'已追加补充':'回应已保存');
    },{draft:body?'':`reply-${id}`,label:mine?'保存补充':'发送回应',eyebrow:'TAKE YOUR TIME'});
  };
  U.actions['expression-new']=U.expressionForm;U.actions['expression-view']=({id})=>U.expressionDetail(id);
  U.actions['expression-quick-reply']=({id,value})=>{const x=U.find('expressions',id);if(x&&x.sender!=='me')U.expressionReplyForm(id,value);};
  U.actions['expression-reply']=({id})=>U.expressionReplyForm(id);
  U.actions['expression-withdraw']=({id})=>{
    const x=U.find('expressions',id);if(!x||x.sender!=='me'||!U.shared(x)||x.status==='WITHDRAWN')return;
    const version=x.version;
    U.confirm('撤回这条表达？','撤回后保留「已撤回」占位，正文与所有回应不再显示，旧通知与未完成邮件失效。','撤回表达',()=>{
      const current=U.find('expressions',id);if(!current||!U.shared(current)||current.version!==version)return U.toast('表达已变化，请重新查看后撤回',true);
      current.status='WITHDRAWN';current.body='';current.replies=[];current.type='已撤回';current.mode='';current.window='';current.version+=1;current.updatedAt=new Date().toISOString();
      U.clearNotificationSettings('EXPRESSION',id);U.invalidateBusinessNotifications('EXPRESSION',id);
      save();U.close();U.render();U.toast('表达已撤回');
    });
  };
  U.actions['invite-from-expression']=({id})=>U.inviteForm({expressionId:id});
  U.actions['commitment-from-expression']=({id})=>U.commitmentForm(null,{sourceType:'expression',sourceId:id});

  /* Personal events and confirmed shared events remain separate. */
  U.timeFields=(item={})=>{
    const tz=item.eventTimezone||state.user.timezone;
    return `<div class="form-grid">${U.field('start','开始时间','datetime-local',item.start?U.local(item.start,tz):addDay(U.currentDay(),1)+'T18:00','','required data-timezone="'+esc(tz)+'"'+(item.start?' data-utc-offset="'+U.offsetAt(item.start,tz)+'"':''))}${U.field('end','结束时间','datetime-local',item.end?U.local(item.end,tz):addDay(U.currentDay(),1)+'T19:00','','required data-timezone="'+esc(tz)+'"'+(item.end?' data-utc-offset="'+U.offsetAt(item.end,tz)+'"':''))}</div>`;
  };
  U.dateTimeGroup=(item={},offset=1)=>`<label class="checkbox-label"><input type="checkbox" name="allDay" ${item.allDay?'checked':''}>全天安排</label><div id="timed-fields" ${item.allDay?'hidden':''}>${U.timeFields(item)}</div><div id="day-fields" class="form-grid" ${item.allDay?'':'hidden'}>${U.field('startDate','开始日期','date',item.startDate||addDay(U.currentDay(),offset))}${U.field('lastDate','结束日期（包含当天）','date',item.endDate?addDay(item.endDate,-1):item.startDate||addDay(U.currentDay(),offset))}</div>`;
  U.bindTimeForm=form=>{const toggle=()=>{const all=form.elements.allDay.checked;form.querySelector('#timed-fields').hidden=all;form.querySelector('#day-fields').hidden=!all;['start','end'].forEach(n=>form.elements[n].required=!all);['startDate','lastDate'].forEach(n=>form.elements[n].required=all);};form.elements.allDay.addEventListener('change',toggle);toggle();};
  U.eventForm=id=>{
    const e=id?U.find('events',id):null;if(id&&(!e||e.deleted||e.kind!=='PERSONAL'||e.owner!=='me'))return;const version=e?.version;
    U.form(e?'编辑个人安排':'为自己留一段时间',`${U.field('title','安排标题 <span class="coral">*</span>','text',e?.title||'','这段时间想做什么？','required maxlength="100"')}<label class="checkbox-label"><input type="checkbox" name="allDay" ${e?.allDay?'checked':''}>全天安排</label><div id="timed-fields" ${e?.allDay?'hidden':''}>${U.timeFields(e||{})}</div><div id="day-fields" class="form-grid" ${e?.allDay?'':'hidden'}>${U.field('startDate','开始日期','date',e?.startDate||U.currentDay())}${U.field('lastDate','结束日期（包含当天）','date',e?.endDate?addDay(e.endDate,-1):U.currentDay())}</div><div class="form-grid">${U.select('availability','我的时间状态',[['BUSY','正在忙'],['NEGOTIABLE','可以商量'],['FREE','有空']],e?.availability||'BUSY')}${U.field('location','地点 <small>可选</small>','text',e?.location||'','地点','maxlength="100"')}</div>${U.field('note','私人备注 <small>可选</small>','textarea',e?.note||'','备注始终只对你自己可见。')}<label class="checkbox-label"><input type="checkbox" name="offline" ${e?.offline?'checked':''}>由我记录，线下已确认</label>${U.connected()?`<label class="checkbox-label"><input type="checkbox" name="shareTitle" ${e?.shareTitle?'checked':''}>忙闲共享开启时，额外分享这条标题</label>`:''}${U.reminderFields('CALENDAR_EVENT',id||'')}<div class="inline-note">${icon('lock',16)}标题与备注默认私密；忙闲共享开启时，仅展示时间与状态。线下确认记录也属于个人日历，不会变为系统共同确认。</div>`,v=>{
      if(!v.title)return '请填写安排标题。';if(id&&U.find('events',id)?.version!==version)return '个人安排已变化，请重新查看。输入已保留。';
      let times;try{times=U.eventTimeValues(v,e||{});}catch(error){return error.message;}const {start,end}=times;
      if(!start||!end||Date.parse(end)<=Date.parse(start))return '结束时间需要晚于开始时间。';
      const reminderError=U.validateReminderValues(v);if(reminderError)return reminderError;
      const values={title:v.title,...times,availability:v.availability,location:v.location,note:v.note,offline:!!v.offline,offlineConfirmedAt:v.offline?(e?.offlineConfirmedAt||new Date().toISOString()):null,shareTitle:!!v.shareTitle};
      if(e){Object.assign(e,values);e.version+=1;e.updatedAt=new Date().toISOString();}else{const now=new Date().toISOString();state.events.push({id:U.uid('e'),owner:'me',kind:'PERSONAL',...values,status:'CONFIRMED',version:1,createdAt:now,updatedAt:now});}
      U.saveReminder('CALENDAR_EVENT',e?.id||state.events.at(-1).id,v);U.toast(e?'个人安排已更新':'已留好这段时间');
    },{draft:id?`event-${id}`:'event-new',label:e?'保存修改':'保存个人安排',wide:true,eyebrow:'TIME FOR MYSELF'});
    const form=document.querySelector('#dialog-form');const toggle=()=>{const all=form.elements.allDay.checked;form.querySelector('#timed-fields').hidden=all;form.querySelector('#day-fields').hidden=!all;['start','end'].forEach(n=>form.elements[n].required=!all);['startDate','lastDate'].forEach(n=>form.elements[n].required=all);};form.elements.allDay.addEventListener('change',toggle);toggle();
  };
  U.eventDetail=id=>{
    const e=U.find('events',id);if(!e||!U.eventVisible(e))return U.toast('这个安排已不可访问',true);
    const shared=e.kind==='SHARED';const change=e.pendingChange&&U.find('invitations',e.pendingChange);
    U.modal(e.title,`<div class="detail-meta">${U.badge(shared?'共同安排':'个人安排',shared?'green':'gray',shared?'link':'lock')}${e.offline?U.badge('由我记录，线下确认','peach'):''}${e.status==='CANCELLED'?U.badge('已取消','gray'):''}</div><p class="modal-copy">${U.formatRange(e)}</p>${e.location?`<p class="modal-copy mt-8">${icon('pin',15)} ${esc(e.location)}</p>`:''}${e.note?`<p class="detail-label">${shared?'共同说明':'私人备注'}</p><p class="modal-copy">${esc(e.note)}</p>`:''}${U.reminderSummary('CALENDAR_EVENT',id)}${U.notificationSettingHTML('CALENDAR_EVENT',id)}${e.status==='CANCELLED'&&e.cancelReason?`<p class="detail-label">取消说明</p><p class="modal-copy">${esc(e.cancelReason)}</p>`:''}${change&&change.status==='PENDING'?`<div class="inline-note peach mt-16">${icon('clock',16)}有一份待确认的改期提案，原安排保持有效。</div><button class="text-link mt-8" data-action="invite-view" data-id="${change.id}">查看修改提案 ${icon('arrow',14)}</button>`:''}${shared&&e.status!=='CANCELLED'?'<p class="quiet-note mt-16">共同内容的修改需要另一方确认；双方分别设置私人提醒，时间、方式与邮箱互不可见。</p>':''}<div class="detail-footer">${U.act('commitment-from-event',id,'写下我的下一步')}${e.status!=='CANCELLED'?`${U.act('event-reminder',id,icon('bell',14)+'我的提醒','btn soft')}${shared?`${!change&&Date.parse(e.start)>Date.now()?U.act('event-change',id,'提出修改','btn secondary'):''}${U.act('event-cancel',id,'取消共同安排','text-link danger')}`:`${U.act('event-edit',id,'编辑安排','btn secondary')}${U.act('event-delete',id,'删除','text-link danger')}`}`:'<p class="quiet-note">取消已生效，待处理的修改提案也已撤销。</p>'}</div>`,{eyebrow:shared?'TIME TOGETHER':'MY CALENDAR'});
  };
  U.actions['event-new']=()=>U.eventForm();U.actions['event-edit']=({id})=>U.eventForm(id);U.actions['event-view']=({id})=>U.eventDetail(id);
  U.actions['event-reminder']=({id})=>U.reminderForm('CALENDAR_EVENT',id);
  U.actions['event-delete']=({id})=>{const e=U.find('events',id);if(!e||e.kind!=='PERSONAL'||e.owner!=='me')return;U.confirm('删除个人安排？','这条个人安排及其提醒将被移除，尚未完成的邮件任务会取消。','删除安排',()=>{U.cancelResourceReminders('CALENDAR_EVENT',id);e.deleted=true;e.reminder='';save();U.close();U.render();U.toast('个人安排已删除');},true);};
  U.actions['event-change']=({id})=>U.inviteForm({eventId:id});
  U.actions['event-cancel']=({id})=>{
    const e=U.find('events',id);if(!e||e.kind!=='SHARED'||!U.shared(e)||e.status==='CANCELLED')return;
    U.form('取消这次共同安排',`${U.field('reason','取消说明 <small>可选</small>','textarea','','可以留一句话，让对方知道。')}<div class="inline-note peach">${icon('info',16)}确认后立即取消，无需对方批准；待处理的修改提案与双方私人提醒任务会清理。</div>${U.followUpNotificationFields('CALENDAR_EVENT',id)}`,(v,form)=>{
      const error=U.submitNotified(form,v,{action:'event-cancel',resourceType:'CALENDAR_EVENT',id,followUp:true,message:'对方取消了一次共同安排',validate:()=>U.find('events',id).status==='CONFIRMED'?null:'共同安排已经取消，请查看最新记录。'},()=>{
        const current=U.find('events',id);U.cancelResourceReminders('CALENDAR_EVENT',id);current.status='CANCELLED';current.cancelReason=v.reason;current.reminder='';current.privateReminders={};current.version+=1;current.updatedAt=new Date().toISOString();
        if(current.pendingChange){const proposal=U.find('invitations',current.pendingChange);if(proposal){proposal.status='WITHDRAWN';proposal.version+=1;}current.pendingChange=null;}
        return {type:'CALENDAR_EVENT',id};
      });if(error)return error;U.toast('共同安排已取消');
    },{label:'确认取消',eyebrow:'CHANGE OF PLANS'});
  };
  U.actions['commitment-from-event']=({id})=>U.commitmentForm(null,{sourceType:'event',sourceId:id});

  /* Invitations are proposals, not events, until the receiver accepts. */
  U.inviteForm=({expressionId='',eventId='',previousId=''}={})=>{
    if(!U.connected())return U.connectionRequired();U.expire();
    const event=eventId&&U.find('events',eventId),previous=previousId&&U.find('invitations',previousId),base=event||previous||{};
    if(event&&(!U.shared(event)||event.kind!=='SHARED'||event.status!=='CONFIRMED'||event.pendingChange||Date.parse(event.start)<=Date.now()))return U.toast('请先处理已有提案，或选择未来的共同安排',true);
    if(previous&&(!U.shared(previous)||previous.status!=='PENDING'||previous.sender!=='partner'))return U.toast('原提案已不可协商，请重新查看',true);
    const type=event?'CALENDAR_EVENT':'CALENDAR_INVITATION',id=eventId||previousId;
    const notificationFields=previous?U.followUpNotificationFields(type,id):U.notificationPlanFields(type,id,event?{fromType:'CALENDAR_EVENT',fromId:eventId}:{});
    U.form(event?'商量一下新的安排':previous?'提议另一个时间':'留一段一起的时间',`${U.field('title','邀约主题 <span class="coral">*</span>','text',base.title||'','例如：一起散散步','required maxlength="100"')}${U.dateTimeGroup(base)}${U.field('location','地点 <small>可选</small>','text',base.location||'','在哪里见？','maxlength="100"')}${U.field('note','想说的话 <small>可选</small>','textarea',base.note||'','说说你想一起做的事。')}<p class="quiet-note">本提议时区：${esc(base.eventTimezone||state.user.timezone)}。邀约必须有明确的开始和结束时间。</p><div class="inline-note">${icon('calendar',16)}${event?'对方确认修改前，原共同安排仍然有效。':'对方接受后，才会加入双方的共同日历。'} 邀约不会自动形成承诺。</div>${notificationFields}`,(v,form)=>{
      if(!v.title)return '请填写邀约主题。';
      let times;try{times=U.eventTimeValues(v,base);}catch(error){return error.message;}const {start,end}=times;
      const validate=()=>{
        if(!start||!end||Date.parse(start)<=Date.now())return '请选择还未开始的时间。';if(Date.parse(end)<=Date.parse(start))return '结束时间需要晚于开始时间。';
        U.expire();const currentEvent=eventId&&U.find('events',eventId),currentPrevious=previousId&&U.find('invitations',previousId);
        if(currentEvent&&(currentEvent.status!=='CONFIRMED'||currentEvent.pendingChange||Date.parse(currentEvent.start)<=Date.now()))return '原安排已变化或已经开始，请重新查看。';
        if(currentPrevious&&(currentPrevious.status!=='PENDING'||currentPrevious.sender!=='partner'))return '原邀约已发生变化，请重新查看。';
        if(currentPrevious?.targetEventId){const target=U.find('events',currentPrevious.targetEventId);if(!target||target.status!=='CONFIRMED'||target.version!==currentPrevious.baseVersion||target.pendingChange!==previousId||Date.parse(target.start)<=Date.now())return '原共同安排已变化或开始，请重新查看。';}
        const sourceId=expressionId||currentPrevious?.expressionId;if(sourceId){const source=U.find('expressions',sourceId);if(!source||!U.shared(source)||source.status==='WITHDRAWN')return '关联表达已不可访问，请重新发起邀约。';}
        return null;
      };
      const error=U.submitNotified(form,v,{action:previous?'invite-counter':event?'event-proposal':'invite-create',resourceType:type,id:id||undefined,followUp:!!previous,notificationPlan:previous?undefined:{outgoingMode:v.outgoingMode,followUpMode:v.followUpMode},inheritFrom:event?{type:'CALENDAR_EVENT',id:eventId}:undefined,message:previous?'收到一份替代提议':event?'收到一份共同安排修改提案':'收到一份新邀约',validate},()=>{
        const currentEvent=eventId&&U.find('events',eventId),currentPrevious=previousId&&U.find('invitations',previousId),now=new Date().toISOString();
        const invitation={id:U.uid('i'),sender:'me',title:v.title,...times,location:v.location,note:v.note,purpose:event?'CHANGE':currentPrevious?.purpose||'CREATE',targetEventId:eventId||currentPrevious?.targetEventId||null,baseVersion:currentEvent?.version||currentPrevious?.baseVersion||null,expressionId:expressionId||currentPrevious?.expressionId||null,previousId:previousId||null,connectionId:state.connectionId,status:'PENDING',createdAt:now,updatedAt:now,version:1};
        state.invitations.unshift(invitation);
        if(currentPrevious){U.copyNotificationSettings('CALENDAR_INVITATION',previousId,'CALENDAR_INVITATION',invitation.id);currentPrevious.status='SUPERSEDED';currentPrevious.version+=1;currentPrevious.updatedAt=now;}
        const target=invitation.targetEventId&&U.find('events',invitation.targetEventId);if(target)target.pendingChange=invitation.id;
        return {type:'CALENDAR_INVITATION',id:invitation.id};
      });if(error)return error;U.toast(event?'修改提案已发出，原安排保持有效':previous?'新提议已发出，等待对方确认':'邀约已发出，等待对方确认');
    },{draft:eventId?`change-${eventId}`:previousId?`counter-${previousId}`:'invitation-new',label:previous?'发出新提议':'发送邀约',eyebrow:'MAKE ROOM FOR US'});
    U.bindTimeForm(document.querySelector('#dialog-form'));
  };
  U.conflicts=i=>{
    if(!i||!U.shared(i))return [];
    const start=Date.parse(i.start),end=Date.parse(i.end);
    const intervals=state.events.filter(e=>!e.deleted&&e.status==='CONFIRMED'&&e.id!==i.targetEventId&&(e.kind==='SHARED'?U.shared(e):['BUSY','NEGOTIABLE'].includes(e.availability))).map(e=>({start:Math.max(start,Date.parse(e.start)),end:Math.min(end,Date.parse(e.end))})).filter(x=>x.start<x.end).sort((a,b)=>a.start-b.start||a.end-b.end);
    const merged=[];intervals.forEach(x=>{const last=merged.at(-1);if(last&&x.start<=last.end)last.end=Math.max(last.end,x.end);else merged.push({...x});});
    return merged.map(x=>({start:new Date(x.start).toISOString(),end:new Date(x.end).toISOString()}));
  };
  U.inviteLabels={PENDING:'待确认',ACCEPTED:'已接受',DECLINED:'已婉拒',WITHDRAWN:'已撤回',EXPIRED:'已过期',SUPERSEDED:'已提出其他时间'};
  U.inviteDetail=id=>{
    U.expire();const i=U.find('invitations',id);if(!i||!U.shared(i))return U.toast('这份邀约已不可访问',true);
    const incoming=i.sender==='partner',target=i.targetEventId&&U.find('events',i.targetEventId),conflicts=U.conflicts(i);
    U.modal(i.purpose==='CHANGE'?'共同安排修改提案':i.title,`<div class="detail-meta">${U.avatar(i.sender,'small')}<small class="muted">${esc(U.person(i.sender))} 的${i.purpose==='CHANGE'?'修改提案':'邀约'}</small>${U.badge(U.inviteLabels[i.status],i.status==='PENDING'?'peach':'gray')}</div>${target?`<div class="card soft"><p class="quiet-note">原安排 · 在接受修改前保持有效</p><h3 class="mt-8">${esc(target.title)}</h3><p class="quiet-note mt-8">${U.formatRange(target)}</p></div><p class="detail-label">提议改为</p><h3>${esc(i.title)}</h3>`:''}<p class="modal-copy mt-8">${U.formatRange(i)}</p>${i.location?`<p class="modal-copy mt-8">${icon('pin',15)} ${esc(i.location)}</p>`:''}${i.note?`<p class="modal-copy mt-16">${esc(i.note)}</p>`:''}${U.notificationSettingHTML('CALENDAR_INVITATION',id)}${i.status==='PENDING'&&conflicts.length?`<div class="inline-note peach mt-16">${icon('info',16)}时间有重叠：${conflicts.map(e=>U.formatRange(e)).join('、')}。只展示重叠时段；接受前请确认。</div>`:''}${i.previousId?'<p class="quiet-note mt-16">这是一次替代提议，原提案已结束；新的接收者需要再次确认。</p>':''}<div class="detail-footer">${i.status==='PENDING'?incoming?`${U.act('invite-accept',id,i.purpose==='CHANGE'?'接受修改':'接受邀约','btn primary')}${U.act('invite-counter',id,'商量其他时间','btn secondary')}${U.act('invite-decline',id,'婉拒')}`:`${U.act('invite-withdraw',id,'撤回邀约','btn secondary')}<p class="quiet-note">等待对方确认；不自动接受。</p>`:i.eventId?U.act('event-view',i.eventId,'查看共同安排','btn soft'):'<p class="quiet-note">这份提案已经结束。</p>'}</div>`,{eyebrow:'AN INVITATION'});
  };
  const conflictTokens=new Map();
  const conflictContext=(i,conflicts)=>JSON.stringify([state.user.username,i.id,i.version,U.find('events',i.targetEventId)?.version||null,conflicts]);
  const conflictHTML=conflicts=>conflicts.length?`<div class="inline-note peach">${icon('info',16)}以下时段与已有安排重叠：<br>${conflicts.map(x=>U.formatRange(x)).join('<br>')}</div><label class="checkbox-label"><input type="checkbox" name="confirmConflicts">我已查看这些重叠时段，仍然接受</label>`:'<p class="quiet-note">当前没有重叠时段。提交时会再次检查。</p>';
  const grantConflicts=(form,i,conflicts)=>{const token=U.operationKey();conflictTokens.set(token,{context:conflictContext(i,conflicts),expiresAt:Date.now()+120000});form.dataset.conflictToken=token;};
  U.acceptInvite=(id,form=null,values={})=>{
    U.expire();const i=U.find('invitations',id);if(!i||!U.shared(i)||i.sender!=='partner')return '邀约已不可接受，请重新查看。';
    if(i.status==='ACCEPTED'){U.toast('已接受，当前共同安排可在详情查看');return null;}
    const validate=()=>{
      U.expire();const current=U.find('invitations',id);if(current.status!=='PENDING')return '邀约状态已变化或已过期，请重新查看。';
      if(current.purpose==='CHANGE'){const event=U.find('events',current.targetEventId);if(!event||event.status!=='CONFIRMED'||event.version!==current.baseVersion||event.pendingChange!==id)return '原安排已变化，不能接受这份修改。';}
      const conflicts=U.conflicts(current),grant=form&&conflictTokens.get(form.dataset.conflictToken);
      if(conflicts.length&&(!values.confirmConflicts||!grant||grant.expiresAt<=Date.now()||grant.context!==conflictContext(current,conflicts))){
        if(form){grantConflicts(form,current,conflicts);const block=form.querySelector('.conflict-preview');if(block)block.innerHTML=conflictHTML(conflicts);}
        return '请查看最新的重叠时段，明确勾选仍然接受后再提交。';
      }return null;
    };
    const mutate=()=>{
      const current=U.find('invitations',id),now=new Date().toISOString();
      if(current.purpose==='CHANGE'){
        const event=U.find('events',current.targetEventId);Object.assign(event,{title:current.title,start:current.start,end:current.end,allDay:!!current.allDay,startDate:current.startDate||null,endDate:current.endDate||null,eventTimezone:current.eventTimezone||state.user.timezone,location:current.location,note:current.note,version:event.version+1,updatedAt:now,pendingChange:null});current.eventId=event.id;
      }else{
        let event=state.events.find(e=>e.invitationId===id);
        if(!event){event={id:U.uid('e'),kind:'SHARED',title:current.title,start:current.start,end:current.end,allDay:!!current.allDay,startDate:current.startDate||null,endDate:current.endDate||null,eventTimezone:current.eventTimezone||state.user.timezone,location:current.location,note:current.note,status:'CONFIRMED',connectionId:state.connectionId,version:1,createdAt:now,updatedAt:now,pendingChange:null,reminder:'',invitationId:id};state.events.push(event);U.copyNotificationSettings('CALENDAR_INVITATION',id,'CALENDAR_EVENT',event.id);}current.eventId=event.id;
      }
      current.status='ACCEPTED';current.version+=1;current.updatedAt=now;
      if(current.purpose==='CHANGE')U.reminderCheckNotifications(current.eventId,id);
      return {type:'CALENDAR_INVITATION',id,eventId:current.eventId};
    };
    const options={action:'invite-accept',resourceType:'CALENDAR_INVITATION',id,followUp:true,message:'对方接受了你的提议',validate};
    const error=form?U.submitNotified(form,values,options,mutate):(()=>{const result=U.runNotifiedOperation({...options,key:U.operationKey(),expectedVersion:i.version,payload:values},mutate);return result.ok?null:result.error.message;})();
    if(error)return error;U.toast(i.purpose==='CHANGE'?'修改已确认，共同安排已更新':'已接受，加入共同日历');return null;
  };
  U.actions['invite-new']=()=>U.inviteForm();U.actions['invite-view']=({id})=>U.inviteDetail(id);
  U.actions['invite-accept']=({id})=>{
    U.expire();const i=U.find('invitations',id);if(!i||!U.shared(i)||i.sender!=='partner')return;if(i.status==='ACCEPTED')return U.eventDetail(i.eventId);if(i.status!=='PENDING')return U.toast('这份提案已结束',true);
    const conflicts=U.conflicts(i),form=U.form(i.purpose==='CHANGE'?'确认接受这份修改':'确认接受邀约',`<h3>${esc(i.title)}</h3><p class="modal-copy">${U.formatRange(i)}</p><div class="conflict-preview">${conflictHTML(conflicts)}</div>${U.followUpNotificationFields('CALENDAR_INVITATION',id)}`,(values,node)=>U.acceptInvite(id,node,values),{label:i.purpose==='CHANGE'?'接受修改':'接受邀约',eyebrow:'CONFIRM OUR TIME'});
    grantConflicts(form,i,conflicts);
  };
  U.endInvite=(id,status)=>{
    U.expire();const i=U.find('invitations',id);if(!i||!U.shared(i)||i.status!=='PENDING')return U.toast('这份提案已经结束',true);if(status==='WITHDRAWN'?i.sender!=='me':i.sender!=='partner')return;
    U.form(status==='DECLINED'?'婉拒这份提议':'撤回这份邀约',`<h3>${esc(i.title)}</h3><p class="quiet-note">${status==='DECLINED'?'婉拒后原共同安排保持有效。':'撤回后对方不能再接受；已有共同安排保持不变。'}</p>${U.followUpNotificationFields('CALENDAR_INVITATION',id)}`,(v,form)=>{
      const error=U.submitNotified(form,v,{action:status==='DECLINED'?'invite-decline':'invite-withdraw',resourceType:'CALENDAR_INVITATION',id,followUp:true,message:status==='DECLINED'?'对方婉拒了你的提议':'对方撤回了一份提议',validate:()=>{U.expire();return U.find('invitations',id).status==='PENDING'?null:'这份提案已经结束，请重新查看。';}},()=>{
        const current=U.find('invitations',id);if(current.targetEventId){const event=U.find('events',current.targetEventId);if(event?.pendingChange===id)event.pendingChange=null;}current.status=status;current.version+=1;current.updatedAt=new Date().toISOString();return {type:'CALENDAR_INVITATION',id};
      });if(error)return error;U.toast(status==='DECLINED'?'已婉拒，原安排不会改变':'提案已撤回');
    },{label:status==='DECLINED'?'确认婉拒':'撤回邀约',eyebrow:'CHANGE OF PLANS'});
  };
  U.actions['invite-decline']=({id})=>U.endInvite(id,'DECLINED');U.actions['invite-withdraw']=({id})=>U.endInvite(id,'WITHDRAWN');U.actions['invite-counter']=({id})=>U.inviteForm({previousId:id});

  /* Commitments belong to the person who will fulfill them. */
  const sourceTypes={expression:'EXPRESSION',memory:'MEMORY_CARD',event:'CALENDAR_EVENT',EXPRESSION:'EXPRESSION',MEMORY_CARD:'MEMORY_CARD',CALENDAR_EVENT:'CALENDAR_EVENT'};
  const sourceCollections={EXPRESSION:'expressions',MEMORY_CARD:'memories',CALENDAR_EVENT:'events'};
  U.sourceAvailable=(type,id)=>{
    const normalized=sourceTypes[type],collection=sourceCollections[normalized],item=collection&&U.find(collection,id);if(!item)return false;
    return normalized==='EXPRESSION'?U.expressionVisible(item)&&item.status!=='WITHDRAWN':normalized==='MEMORY_CARD'?U.memoryVisible(item):U.eventVisible(item);
  };
  U.commitmentForm=(id=null,source={})=>{
    if(source.sourceId){if(!U.sourceAvailable(source.sourceType,source.sourceId))return U.toast('来源已不存在或不可访问',true);source={sourceType:sourceTypes[source.sourceType],sourceId:source.sourceId};}
    const c=id?U.find('commitments',id):null;if(id&&(!c||c.owner!=='me'||c.deleted))return;
    U.form(c?'编辑我的承诺':'写下我答应的事',`${U.field('title','我的承诺 <span class="coral">*</span>','text',c?.title||'','我愿意为自己写下的下一步','required maxlength="100"')}${U.field('body','说明 <small>可选</small>','textarea',c?.body||'','留一点背景，方便以后记得。')}${U.dueFields(c)}${U.field('nextAction','下一步 <small>可选</small>','text',c?.nextAction||'','先做一件小事','maxlength="100"')}${!c||c.status==='OPEN'?U.reminderFields('COMMITMENT',id||''):'<p class="quiet-note">完成或取消后的承诺不能设置提醒。重新打开后，可自行设置新的计划。</p>'}<p class="quiet-note">截止日期和时间不会自动创建提醒。</p><div class="inline-note">${icon('lock',16)}${c?.shared?'这条承诺已分享。截止时间变更按本次选择通知对方，不需要对方审批。':'默认仅自己可见。承诺只由履行者为自己创建。'} ${source.sourceId?'来源只保留引用，不会自动给任何人创建任务。':''}</div>${c?.shared&&U.shared(c)?U.notificationOnceFields('COMMITMENT',id)+'<p class="quiet-note">本次方式只在截止日期或时间改变时使用；正文编辑与私人提醒调整不会通知对方。</p>':''}`, (v,form)=>{
      if(!v.title)return '请填写承诺标题。';if(v.dueTime&&!v.due)return '填写具体截止时间时，请同时选择日期。';
      const reminderError=U.validateReminderValues(v);if(reminderError)return reminderError;
      let due;try{due=U.commitmentDueValues(v,c||{});}catch(error){return error.message;}
      const values={title:v.title,body:v.body,...due,nextAction:v.nextAction};
      const changedDue=c&&['dueKind','dueDate','dueTimezone','dueAt'].some(key=>(c[key]||null)!==(values[key]||null));
      const error=U.submitNotified(form,v,{action:c?'commitment-edit':'commitment-create',resourceType:'COMMITMENT',id:id||undefined,expectedVersion:c?.version,personal:!c||!c.shared||!U.shared(c)||!changedDue,notificationMode:v.notificationMode||'IN_APP',message:'对方调整了一条已分享承诺的截止时间',validate:()=>{
        if(id){const current=U.find('commitments',id);if(!current||current.deleted||current.owner!=='me')return '承诺已不可编辑。';}
        if(source.sourceId&&!U.sourceAvailable(source.sourceType,source.sourceId))return '来源已不可访问，请重新选择来源。';return null;
      }},()=>{
        let current=id&&U.find('commitments',id);const now=new Date().toISOString();
        if(current){Object.assign(current,values);current.version+=1;current.updatedAt=now;}
        else{current={id:U.uid('c'),owner:'me',...values,status:'OPEN',shared:false,connectionId:null,result:'',version:1,createdAt:now,updatedAt:now,...source};state.commitments.unshift(current);}
        if(current.status==='OPEN')U.saveReminder('COMMITMENT',current.id,v);return {type:'COMMITMENT',id:current.id};
      });if(error)return error;U.toast(c?'承诺已更新':'已写下自己的下一步');
    },{draft:id?`commitment-${id}`:'commitment-new',label:c?'保存修改':'保存承诺',eyebrow:'A PROMISE TO KEEP'});
  };
  U.commitmentDetail=id=>{
    const c=U.find('commitments',id);if(!c||!U.commitmentVisible(c))return U.toast('这条承诺已不可访问',true);const mine=c.owner==='me';
    const readable=c.sourceId&&U.sourceAvailable(c.sourceType,c.sourceId);
    const sourceAction={EXPRESSION:'expression-view',MEMORY_CARD:'memory-view',CALENDAR_EVENT:'event-view'}[sourceTypes[c.sourceType]];
    U.modal(c.title,`<div class="detail-meta">${U.badge({OPEN:'进行中',DONE:'已完成',CANCELLED:'已取消'}[c.status],c.status==='DONE'?'green':'gray')}${U.badge(c.shared&&U.shared(c)?mine?'已分享':'对方分享':'仅自己','gray',c.shared&&U.shared(c)?'link':'lock')}${c.due?U.badge(U.deadlineLabel(c)+(U.overdue(c)?' · 已过约定时间':''),'peach','clock'):''}</div>${c.body?`<p class="modal-copy">${esc(c.body)}</p>`:''}${c.nextAction?`<p class="detail-label">${mine?'我的下一步':'作者的下一步'}</p><p class="modal-copy">${esc(c.nextAction)}</p>`:''}${c.result?`<p class="detail-label">完成记录</p><p class="modal-copy">${esc(c.result)}</p>`:''}${c.sourceId?`<p class="detail-label">关联来源</p>${readable?U.act(sourceAction,c.sourceId,'查看来源 '+icon('arrow',13)):'<p class="quiet-note">来源不可用</p>'}`:''}${mine?U.reminderSummary('COMMITMENT',id):''}<div class="detail-footer">${mine?`${c.status==='OPEN'?U.act('commitment-complete',id,'记为完成','btn primary'):U.act('commitment-reopen',id,'重新打开','btn soft')}${c.status==='OPEN'?U.act('commitment-reminder',id,icon('bell',14)+'我的提醒','btn soft'):''}${U.act('commitment-edit',id,'编辑','btn secondary')}${U.act(c.shared&&U.shared(c)?'commitment-unshare':'commitment-share',id,c.shared&&U.shared(c)?'撤销分享':'分享给对方')}${c.status==='OPEN'?U.act('commitment-cancel',id,'取消承诺','text-link danger'):''}${U.act('commitment-delete',id,'删除','text-link danger')}`:'<p class="quiet-note">对方的承诺仅供阅读；状态和截止时间由本人管理。</p>'}</div>`,{eyebrow:mine?'MY NEXT STEP':'SHARED WITH YOU'});
  };
  U.actions['commitment-new']=()=>U.commitmentForm();U.actions['commitment-edit']=({id})=>U.commitmentForm(id);U.actions['commitment-view']=({id})=>U.commitmentDetail(id);
  U.actions['commitment-reminder']=({id})=>U.reminderForm('COMMITMENT',id);
  U.commitmentStateForm=(id,next)=>{
    const c=U.find('commitments',id);if(!c||c.deleted||c.owner!=='me'||(next==='OPEN'?c.status==='OPEN':c.status!=='OPEN'))return;
    const labels={DONE:'记为完成',CANCELLED:'取消承诺',OPEN:'重新打开'},messages={DONE:'对方完成了一条已分享承诺',CANCELLED:'对方取消了一条已分享承诺',OPEN:'对方重新打开了一条已分享承诺'},shared=c.shared&&U.shared(c);
    const write=values=>{const current=U.find('commitments',id);U.cancelResourceReminders('COMMITMENT',id);current.status=next;current.result=next==='DONE'?values.result||'':'';current.reminder='';current.version+=1;current.updatedAt=new Date().toISOString();return {type:'COMMITMENT',id};};
    const options={action:'commitment-'+next.toLowerCase(),resourceType:'COMMITMENT',id,expectedVersion:c.version,personal:!shared,message:messages[next],validate:()=>{const current=U.find('commitments',id);return current.owner==='me'&&(next==='OPEN'?current.status!=='OPEN':current.status==='OPEN')?null:'承诺状态已变化，请重新查看。';}};
    const submit=(v,form)=>{const error=U.submitNotified(form,v,{...options,notificationMode:v.notificationMode||'IN_APP'},()=>write(v));if(error)return error;U.toast(next==='DONE'?'承诺已记为完成':next==='OPEN'?'承诺已重新打开':'承诺已取消');};
    if(!shared&&next==='OPEN'){const result=U.runNotifiedOperation({...options,key:U.operationKey()},()=>write({}));if(!result.ok)return U.toast(result.error.message,true);U.close();U.render();return U.toast('承诺已重新打开');}
    if(!shared&&next==='CANCELLED')return U.confirm('取消这条承诺？','这不会删除原记录，私人提醒与未完成的提醒邮件会取消。','取消承诺',()=>{const result=U.runNotifiedOperation({...options,key:U.operationKey()},()=>write({}));if(!result.ok)return U.toast(result.error.message,true);U.close();U.render();U.toast('承诺已取消');});
    U.form(next==='DONE'?'记下这次完成':next==='OPEN'?'重新打开这条承诺':'取消这条承诺',`${next==='DONE'?U.field('result','完成记录 <small>可选</small>','textarea','','后来做了什么？'):''}<div class="inline-note">${icon('leaf',16)}${next==='OPEN'?'重新打开会清空旧完成记录；旧提醒不会恢复，可另设新的计划。':'私人提醒与未完成的提醒邮件会取消，原记录保留。'} ${shared?'对方可以阅读状态，不需要审批。':''}</div>${shared?U.notificationOnceFields('COMMITMENT',id):''}`,submit,{label:labels[next],eyebrow:'ONE SMALL STEP'});
  };
  U.actions['commitment-complete']=({id})=>U.commitmentStateForm(id,'DONE');
  U.actions['commitment-reopen']=({id})=>U.commitmentStateForm(id,'OPEN');
  U.actions['commitment-cancel']=({id})=>U.commitmentStateForm(id,'CANCELLED');
  U.actions['commitment-share']=({id})=>{
    const c=U.find('commitments',id);if(!c||c.deleted||c.owner!=='me')return;if(!U.connected())return U.connectionRequired();if(c.shared&&U.shared(c))return U.toast('这条承诺已经分享');
    U.form('分享这条承诺',`<div class="card soft"><h3>${esc(c.title)}</h3>${c.body?`<p class="modal-copy">${esc(c.body)}</p>`:''}${c.due?`<p class="quiet-note">截止时间：${U.deadlineLabel(c)}</p>`:''}${c.nextAction?`<p class="modal-copy">下一步：${esc(c.nextAction)}</p>`:''}${c.result?`<p class="modal-copy">完成记录：${esc(c.result)}</p>`:''}</div><p class="quiet-note">对方可以阅读，不能修改状态或截止时间。私人提醒与来源原文不会分享。</p>${U.notificationOnceFields('COMMITMENT',id)}`,(v,form)=>{
      const error=U.submitNotified(form,v,{action:'commitment-share',resourceType:'COMMITMENT',id,notificationMode:v.notificationMode||'IN_APP',message:'对方与你分享了一条承诺'},()=>{const current=U.find('commitments',id);current.shared=true;current.connectionId=state.connectionId;current.version+=1;current.updatedAt=new Date().toISOString();return {type:'COMMITMENT',id};});if(error)return error;U.toast('承诺已分享给当前连接');
    },{label:'确认分享',eyebrow:'SHARE MY NEXT STEP'});
  };
  U.actions['commitment-unshare']=({id})=>{const c=U.find('commitments',id);if(!c||c.owner!=='me'||c.deleted)return;U.invalidateBusinessNotifications('COMMITMENT',id);c.shared=false;c.connectionId=null;c.version+=1;c.updatedAt=new Date().toISOString();save();U.close();U.render();U.toast('承诺已恢复为仅自己可见');};
  U.actions['commitment-delete']=({id})=>{const c=U.find('commitments',id);if(!c||c.owner!=='me'||c.deleted)return;const version=c.version;U.confirm('删除这条承诺？','这条记录与私人提醒将被删除，对方也会失去访问。','删除承诺',()=>{const current=U.find('commitments',id);if(!current||current.version!==version)return U.toast('承诺已变化，请重新查看后删除',true);U.cancelResourceReminders('COMMITMENT',id);U.invalidateBusinessNotifications('COMMITMENT',id);current.deleted=true;current.shared=false;current.reminder='';current.version+=1;save();U.close();U.render();U.toast('承诺已删除');},true);};
  U.actions.notifications=()=>{
    const list=state.notifications.filter(U.notificationVisible);U.modal('给你的提醒',`<div class="flex between"><p class="quiet-note">站内通知与自己设置的私人提醒；Mail 状态单独展示</p><button class="text-link" data-action="notifications-read">全部标为已读</button></div><div class="notification-list mt-16">${list.length?list.map(n=>`<div class="notification-item"><button class="notification-row ${n.read?'':'unread'}" data-action="notification-open" data-id="${n.id}"><span class="icon-box">${icon(n.kind==='expression'?'heart':n.kind==='invitation'?'calendar':'bell',19)}</span><span class="notification-text"><strong>${esc(n.message)}</strong><small>${U.date(n.at)} ${U.time(n.at)}</small></span>${!n.read?'<span class="dot coral"></span>':''}${icon('chevron',15)}</button>${U.mailDeliveryHTML(n)}</div>`).join(''):U.empty('这里暂时安静','收到的表达、邀约与私人提醒会出现在这里。')}</div><div class="inline-note mt-16">${icon('info',16)}邮件失败不影响站内提醒，标为已读也不会取消邮件。当前预览仅在网页打开时模拟到时处理，不发送真实邮件。</div>`,{eyebrow:'JUST FOR YOU'});
  };
  U.actions['notifications-read']=()=>{state.notifications.filter(U.notificationVisible).forEach(n=>n.read=true);save();U.render();U.actions.notifications();};
  U.actions['notification-open']=({id})=>{const n=U.find('notifications',id);if(!n||!U.notificationVisible(n))return;n.read=true;save();U.render();const action={expression:'expression-view',invitation:'invite-view',memory:'memory-view',event:'event-view',commitment:'commitment-view'}[n.kind];if(action)U.actions[action]({id:n.resourceId});else U.modal('站内通知',`<p class="modal-copy">${esc(n.message)}</p>`);};
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-action]');if(el&&!el.disabled){const action=U.actions[el.dataset.action];if(action)action({...el.dataset,element:el,event});}
    if(event.target.classList.contains('modal-backdrop'))U.close();
  });
  document.addEventListener('keydown',event=>{
    const modal=document.querySelector('.modal');if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();U.close();}
    if(event.key==='Tab'){
      const items=[...modal.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=items[0],last=items.at(-1);if(!first){event.preventDefault();return;}if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  window.addEventListener('storage',event=>{if(event.key===KEY&&event.newValue){try{state=JSON.parse(event.newValue);U.state=state;U.close();U.render();}catch(_){}}});
  document.addEventListener('DOMContentLoaded',()=>{U.render();if(!storageAvailable)U.toast('本地保存不可用，修改仅保留在本次打开期间',true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){U.expire();U.refreshReminders();U.render();}});
  setInterval(()=>{if(!document.hidden){const before=U.unread();U.expire();U.refreshReminders();if(before!==U.unread()&&!document.querySelector('.modal'))U.render();}},60000);
})();
