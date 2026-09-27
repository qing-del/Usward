/* IANA wall-time conversion shared by events, deadlines and private reminders. */
(() => {
  'use strict';
  const formatters=new Map(),offsets=new Map(),boundaries=new Map();
  const zone=()=>U.state.user.timezone;
  const formatter=tz=>{
    if(!formatters.has(tz))formatters.set(tz,new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    return formatters.get(tz);
  };
  const parts=(ms,tz)=>Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const wallMs=p=>Date.UTC(p.year,p.month-1,p.day,p.hour||0,p.minute||0,p.second||0);
  const invalid=(message,code)=>Object.assign(new Error(message),{code});
  const parse=value=>{
    const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value||'');
    if(!m)throw invalid('请选择有效的日期与时间。','INVALID_TIME');
    const p={year:+m[1],month:+m[2],day:+m[3],hour:+m[4],minute:+m[5],second:+(m[6]||0)},ms=wallMs(p),d=new Date(ms);
    if(p.year<100||d.getUTCFullYear()!==p.year||d.getUTCMonth()+1!==p.month||d.getUTCDate()!==p.day||p.hour>23||p.minute>59||p.second>59)throw invalid('请选择有效的日期与时间。','INVALID_TIME');
    return ms;
  };
  const offsetLabel=ms=>{const mins=Math.round(ms/60000),n=Math.abs(mins);return (mins<0?'-':'+')+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
  U.localCandidates=(value,tz=zone())=>{
    const assumed=parse(value),key=tz+'|'+value.slice(0,10);
    if(!offsets.has(key)){
      const found=new Set();for(let h=-48;h<=48;h+=6){const sample=assumed+h*3600000;found.add(wallMs(parts(sample,tz))-sample);}
      offsets.set(key,[...found]);
    }
    return offsets.get(key).map(offset=>({ms:assumed-offset,offset})).filter(x=>wallMs(parts(x.ms,tz))===assumed).sort((a,b)=>a.ms-b.ms).map(x=>({instant:new Date(x.ms).toISOString(),offset:offsetLabel(x.offset)}));
  };
  U.fromLocal=(value,tz=zone(),chosenOffset='')=>{
    if(!value)return '';
    const candidates=U.localCandidates(value,tz);
    if(!candidates.length)throw invalid('这个当地时刻因夏令时跳跃而不存在，请重新选择。','NONEXISTENT_TIME');
    if(candidates.length===1)return candidates[0].instant;
    const chosen=candidates.find(x=>x.offset===chosenOffset);if(chosen)return chosen.instant;
    throw invalid('这个当地时刻重复出现，请明确选择 UTC 偏移。','AMBIGUOUS_TIME');
  };
  U.local=(value,tz=zone())=>{
    const p=parts(Date.parse(value),tz),pad=n=>String(n).padStart(2,'0');return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  };
  U.offsetAt=(value,tz=zone())=>offsetLabel(wallMs(parts(Date.parse(value),tz))-Math.floor(Date.parse(value)/1000)*1000);
  U.startOfDay=(day,tz=zone())=>{
    parse(day+'T00:00');const key=tz+'|'+day;if(boundaries.has(key))return boundaries.get(key);
    const at=minute=>day+'T'+String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
    for(let minute=0;minute<1440;minute+=30){
      const found=U.localCandidates(at(minute),tz);if(!found.length)continue;
      for(let first=Math.max(0,minute-29);first<=minute;first++){const candidates=U.localCandidates(at(first),tz);if(candidates.length){boundaries.set(key,candidates[0].instant);return candidates[0].instant;}}
    }
    throw invalid('所选日期在这个时区整日不存在，请改选日期。','SKIPPED_DATE');
  };
  U.eventTimeValues=(v,item={})=>{
    const tz=item.eventTimezone||zone();
    if(v.allDay){const endDate=U.addDay(v.lastDate,1);if(!v.startDate||!v.lastDate||endDate<=v.startDate)throw invalid('结束日期不能早于开始日期。','INVALID_TIME');return {allDay:true,startDate:v.startDate,endDate,eventTimezone:tz,start:U.startOfDay(v.startDate,tz),end:U.startOfDay(endDate,tz)};}
    return {allDay:false,startDate:null,endDate:null,eventTimezone:tz,start:U.fromLocal(v.start,tz,v.startOffset),end:U.fromLocal(v.end,tz,v.endOffset)};
  };
  U.eventBounds=e=>e.allDay?{start:U.startOfDay(e.startDate,e.eventTimezone||zone()),end:U.startOfDay(e.endDate,e.eventTimezone||zone())}:{start:e.start,end:e.end};
  U.occursOn=(e,day)=>{const bounds=U.eventBounds(e);return Date.parse(bounds.start)<Date.parse(U.startOfDay(U.addDay(day,1)))&&Date.parse(bounds.end)>Date.parse(U.startOfDay(day));};

  U.bindWallTimeFields=form=>{
    form.querySelectorAll('input[type="datetime-local"]').forEach(input=>{
      const name=input.name+'Offset';let saved=form.elements.namedItem(name)?.value||U.state.drafts[form.dataset.draftKey]?.[name]||input.dataset.utcOffset||'';
      const update=()=>{
        const tz=input.dataset.timezone||zone();let candidates=[],message='';
        try{if(input.value)candidates=U.localCandidates(input.value,tz);if(input.value&&!candidates.length)message='这个时刻不存在，请重新选择。';}catch(error){message=error.message;}
        const previous=form.elements.namedItem(name)?.value||saved;
        if(input.dataset.offsetFor&&input.dataset.offsetFor!==input.value)saved='';else saved=previous;
        input.dataset.offsetFor=input.value;
        let block=input.parentElement.querySelector('.time-offset');
        if(!block){block=document.createElement('div');block.className='time-offset';input.parentElement.append(block);}
        block.innerHTML=candidates.length>1?`<label for="offset-${U.esc(input.name)}">重复时刻的 UTC 偏移</label><select name="${U.esc(name)}" id="offset-${U.esc(input.name)}"><option value="">请选择这一次的时刻</option>${candidates.map((x,i)=>`<option value="${x.offset}" ${saved===x.offset?'selected':''}>UTC${x.offset} · ${i?'较晚':'较早'}的时刻</option>`).join('')}</select><p class="quiet-note">${U.esc(tz)} 的这个时刻出现两次，请明确选择。</p>`:message?`<p class="form-message">${U.esc(message)}</p>`:'';
        block.hidden=!block.innerHTML;
      };
      input.addEventListener('input',update);input.addEventListener('change',update);update();
    });
  };
  U.commitmentDueValues=(v,c={})=>{
    const kind=v.dueKind||(v.due?(v.dueTime?'INSTANT':'DATE'):'NONE');
    if(kind==='NONE')return {dueKind:kind,dueDate:null,dueTimezone:null,dueAt:null,due:''};
    if(kind==='INSTANT'){
      const instant=U.fromLocal(v.dueAtInput||v.due+'T'+v.dueTime,zone(),v.dueAtInputOffset||v.dueOffset);
      if(!instant)throw invalid('请选择精确截止时间。','INVALID_TIME');return {dueKind:kind,dueDate:null,dueTimezone:null,dueAt:instant,due:U.day(instant)};
    }
    if(kind!=='DATE'||!v.due)throw invalid('请选择有效的截止方式与日期。','INVALID_TIME');
    const tz=c.dueKind==='DATE'?c.dueTimezone:zone();U.startOfDay(v.due,tz);U.startOfDay(U.addDay(v.due,1),tz);
    return {dueKind:kind,dueDate:v.due,dueTimezone:tz,dueAt:null,due:v.due};
  };
  U.deadline=c=>{
    const kind=c.dueKind||(c.dueAt?'INSTANT':c.due?'DATE':'NONE'),tz=c.dueTimezone||zone(),date=c.dueDate||c.due;
    const at=kind==='INSTANT'?c.dueAt:kind==='DATE'?U.startOfDay(U.addDay(date,1),tz):null;
    const overdue=c.status==='OPEN'&&!!at&&Date.now()>=Date.parse(at);
    const today=c.status==='OPEN'&&!overdue&&(kind==='INSTANT'?U.day(c.dueAt)===U.currentDay():kind==='DATE'?date===new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()):false);
    return {deadlineAt:at,isOverdue:overdue,isDueToday:today};
  };
  U.overdue=c=>U.deadline(c).isOverdue;
  U.compareDeadline=(a,b)=>(Date.parse(U.deadline(a).deadlineAt)||Infinity)-(Date.parse(U.deadline(b).deadlineAt)||Infinity)||String(a.id).localeCompare(String(b.id));
  U.deadlineLabel=c=>c.dueKind==='NONE'||(!c.dueAt&&!c.due&&!c.dueDate)?'未设定截止':c.dueKind==='INSTANT'||c.dueAt?U.date(c.dueAt)+' '+U.time(c.dueAt):U.date(c.dueDate||c.due)+' · 全天（'+(c.dueTimezone||zone())+'）';
  U.dueFields=c=>{
    const kind=c?.dueKind||(c?.dueAt?'INSTANT':c?.due?'DATE':'NONE');
    return U.select('dueKind','截止方式',[['NONE','不设截止'],['DATE','按日期 · 整天有效'],['INSTANT','精确到时间']],kind)+`<div class="due-date-fields">${U.field('due','截止日期','date',c?.dueDate||c?.due||'')}<p class="quiet-note">日期按 ${U.esc(c?.dueTimezone||zone())} 的整天计算，修改显示时区不会改变边界。</p></div><div class="due-instant-fields">${U.field('dueAtInput','精确截止时间','datetime-local',c?.dueAt?U.local(c.dueAt):'','',c?.dueAt?'data-utc-offset="'+U.offsetAt(c.dueAt)+'"':'')}</div>`;
  };
  U.bindDueFields=form=>{
    const kind=form.elements.namedItem('dueKind');if(!kind)return;
    const update=()=>{[['DATE','.due-date-fields','due'],['INSTANT','.due-instant-fields','dueAtInput']].forEach(([mode,selector,name])=>{form.querySelector(selector).hidden=kind.value!==mode;const input=form.elements.namedItem(name);input.disabled=kind.value!==mode;input.required=kind.value===mode;});};kind.addEventListener('change',update);update();
  };
  U.prepareDates=()=>{
    U.state.commitments.forEach(c=>{
      c.dueKind||=c.dueAt?'INSTANT':c.due&&c.due.includes('T')?'INSTANT':c.due?'DATE':'NONE';
      if(c.dueKind==='INSTANT'){c.dueAt||=c.due;c.dueDate=null;c.dueTimezone=null;c.due=U.day(c.dueAt);}
      else if(c.dueKind==='DATE'){c.dueDate||=c.due;c.dueTimezone||=zone();c.dueAt=null;}
      else{c.dueAt=null;c.dueDate=null;c.dueTimezone=null;c.due='';}
    });
    U.state.events.filter(e=>e.kind==='PERSONAL').forEach(e=>{if(e.offline&&!e.offlineConfirmedAt)e.offlineConfirmedAt=new Date().toISOString();e.offline=!!e.offlineConfirmedAt;});
  };
  const render=U.render;U.render=()=>{U.prepareDates();render();};U.prepareDates();U.save();
})();
