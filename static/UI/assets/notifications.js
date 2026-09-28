/* v1.3 local notification model. This file never contacts an API or SMTP server. */
(() => {
  'use strict';
  const {esc,icon}=U;
  const modes={NONE:'不通知',IN_APP:'站内通知',IN_APP_AND_MAIL:'站内通知+邮件通知'};
  const collections={MEMORY_CARD:'memories',EXPRESSION:'expressions',CALENDAR_INVITATION:'invitations',CALENDAR_EVENT:'events',COMMITMENT:'commitments'};
  const kinds={MEMORY_CARD:'memory',EXPRESSION:'expression',CALENDAR_INVITATION:'invitation',CALENDAR_EVENT:'event',COMMITMENT:'commitment'};
  const actions={MEMORY_CARD:'memory-view',EXPRESSION:'expression-view',CALENDAR_INVITATION:'invite-view',CALENDAR_EVENT:'event-view',COMMITMENT:'commitment-view'};
  const overrides=new Map();
  const person=username=>[U.state.user,U.state.partner].find(p=>p.username===username);
  const owner=item=>item.owner==='me'?U.state.user.username:U.state.partner.username;
  const resource=(type,id)=>U.find(collections[type],id);
  const validMode=mode=>Object.hasOwn(modes,mode);
  const failure=(code,message,extra={})=>({ok:false,error:{code,message,...extra}});
  U.operationKey=()=>crypto.randomUUID();
  U.notificationModeLabel=mode=>modes[mode]||modes.IN_APP;
  U.mailAvailableFor=username=>!!(U.state.previewMail.enabled&&U.state.previewMail.configured&&U.validNotificationEmail(person(username)?.notificationEmail));
  const readable=(type,id,username=U.state.user.username)=>{
    const item=resource(type,id);if(!item||item.deleted)return false;
    if(type==='MEMORY_CARD'||type==='COMMITMENT')return owner(item)===username||(item.shared&&U.shared(item));
    if(type==='CALENDAR_EVENT'&&item.kind==='PERSONAL')return owner(item)===username;
    return U.shared(item)&&(type!=='EXPRESSION'||item.status!=='WITHDRAWN');
  };
  const settingScope=(type,id)=>{
    const item=resource(type,id);if(!item||item.deleted||!U.shared(item))return false;
    if(type==='MEMORY_CARD')return item.shared;
    if(type==='EXPRESSION')return item.status!=='WITHDRAWN';
    if(type==='CALENDAR_INVITATION')return true;
    return type==='CALENDAR_EVENT'&&item.kind==='SHARED';
  };
  const settingEditable=(type,id)=>settingScope(type,id)&&(type!=='CALENDAR_INVITATION'||resource(type,id).status==='PENDING')&&(type!=='CALENDAR_EVENT'||resource(type,id).status!=='CANCELLED');
  const setting=(type,id,username)=>U.state.notificationSettings.find(s=>s.resourceType===type&&s.resourceId===id&&s.recipient===username)||{resourceType:type,resourceId:id,recipient:username,followUpMode:'IN_APP',version:null};
  const writeSetting=(type,id,username,mode)=>{
    let current=U.state.notificationSettings.find(s=>s.resourceType===type&&s.resourceId===id&&s.recipient===username);
    if(!current){current={resourceType:type,resourceId:id,recipient:username,version:0};U.state.notificationSettings.push(current);}
    current.followUpMode=mode;current.version+=1;return current;
  };
  U.myNotificationSetting=(type,id)=>settingScope(type,id)?{...setting(type,id,U.state.user.username)}:null;
  U.notificationCapabilities=(type='',id='')=>({selfMailAvailable:U.mailAvailableFor(U.state.user.username),otherMailAvailable:U.mailAvailableFor(U.state.partner.username),effectiveOutgoingMode:type&&id&&settingScope(type,id)?setting(type,id,U.state.partner.username).followUpMode:null});
  U.copyNotificationSettings=(fromType,fromId,toType,toId)=>{
    [U.state.user,U.state.partner].forEach(p=>writeSetting(toType,toId,p.username,setting(fromType,fromId,p.username).followUpMode));
  };
  U.clearNotificationSettings=(type,id)=>{U.state.notificationSettings=U.state.notificationSettings.filter(s=>s.resourceType!==type||s.resourceId!==id);};
  U.invalidateBusinessNotifications=(type,id)=>{
    U.state.notifications.filter(n=>n.sourceType==='BUSINESS'&&n.resourceType===type&&n.resourceId===id).forEach(n=>{n.invalidatedAt=new Date().toISOString();U.cancelMailTasks(d=>d.notificationId===n.id);});
  };
  U.putNotificationSetting=(type,id,mode,expectedVersion)=>{
    if(!settingScope(type,id))return '这个内容已不可设置后续通知。';
    if(!settingEditable(type,id))return '这次协商已结束，后续通知设置仅保留为历史。';
    if(!validMode(mode))return '请选择有效的通知方式。';
    const current=setting(type,id,U.state.user.username);
    if(String(current.version)!==String(expectedVersion))return '通知设置已变化，请查看最新设置后再保存。输入已保留。';
    if(mode==='IN_APP_AND_MAIL'&&!U.mailAvailableFor(U.state.user.username))return U.mailCapability().reason+' 输入已保留，请明确改选。';
    writeSetting(type,id,U.state.user.username,mode);return null;
  };
  U.notificationModeField=(name,label,selected='IN_APP',direction='SELF')=>{
    const available=U.mailAvailableFor(direction==='SELF'?U.state.user.username:U.state.partner.username);
    const help=available?direction==='SELF'?'只影响发给你自己的通知。':'只影响本次发给对方的通知。':direction==='SELF'?U.mailCapability().reason:'对方暂时无法接收邮件通知。可以选择站内通知或不通知。';
    return `<div class="field"><label for="f-${esc(name)}">${esc(label)}</label><select id="f-${esc(name)}" name="${esc(name)}" aria-describedby="help-${esc(name)}">${Object.entries(modes).map(([mode,text])=>`<option value="${mode}" ${mode===selected?'selected':''} ${mode==='IN_APP_AND_MAIL'&&!available?'disabled':''}>${text}${mode==='IN_APP_AND_MAIL'&&!available?'（暂不可用）':''}</option>`).join('')}</select><p class="quiet-note" id="help-${esc(name)}">${esc(help)}${direction==='SELF'&&!available&&U.mailCapability().code==='RECIPIENT_EMAIL_MISSING'?' <a class="text-link" href="me.html#email">设置本人收件邮箱 '+icon('arrow',12)+'</a>':''}</p></div>`;
  };
  const metadata=(type,id)=>`data-notification-context data-connection="${esc(U.state.connectionId||'')}" data-resource-version="${esc(id?resource(type,id)?.version||1:'')}"`;
  U.notificationPlanFields=(type='',id='',{fromType='',fromId=''}={})=>{
    const caps=U.notificationCapabilities(fromType,fromId);
    const mine=fromId?U.myNotificationSetting(fromType,fromId)?.followUpMode||'IN_APP':'IN_APP';
    return `<fieldset class="notification-fields" ${metadata(type,id)}><legend>${icon('bell',15)}互动通知</legend>${U.notificationModeField('outgoingMode','本次通知对方',caps.effectiveOutgoingMode||'IN_APP','OTHER')}${U.notificationModeField('followUpMode','对方回应后通知我',mine)}<p class="quiet-note">两个方向分别设置。选择不通知仍会保存内容，对方仍可在相应页面看到。邮箱与私人到时提醒不会分享。</p></fieldset>`;
  };
  U.notificationOnceFields=(type,id)=>`<fieldset class="notification-fields" ${metadata(type,id)}><legend>${icon('bell',15)}本次互动通知</legend>${U.notificationModeField('notificationMode','本次通知对方','IN_APP','OTHER')}<p class="quiet-note">只决定这次通知，不改变承诺内容或自己的到时提醒。</p></fieldset>`;
  U.followUpNotificationFields=(type,id)=>{
    const mode=U.notificationCapabilities(type,id).effectiveOutgoingMode||'IN_APP';
    return `<div class="notification-context inline-note" ${metadata(type,id)}>${icon('bell',16)}<span>本次通知对方 · ${esc(modes[mode])}<small>按对方在本内容上保存的接收方式处理；不会修改对方设置。</small></span></div>`;
  };
  U.bindNotificationFields=form=>{
    const block=form.querySelector('[data-notification-context]');if(!block)return;
    form.dataset.notificationConnection=block.dataset.connection;
    form.dataset.notificationResourceVersion=block.dataset.resourceVersion;
  };
  U.notificationSettingHTML=(type,id)=>{
    const mine=U.myNotificationSetting(type,id);if(!mine)return '';
    return `<div class="my-notification-setting mt-16"><span>${icon('bell',14)}对方后续互动时通知我 · ${esc(modes[mine.followUpMode])}</span>${settingEditable(type,id)?`<button class="text-link" data-action="notification-setting" data-type="${type}" data-id="${esc(id)}">调整我的接收方式</button>`:'<small class="quiet-note">本次协商已结束，保留历史设置。</small>'}</div>`;
  };
  U.actions['notification-setting']=({type,id})=>{
    const mine=U.myNotificationSetting(type,id);if(!mine||!settingEditable(type,id))return U.toast('这个内容已不可调整通知方式',true);
    U.form('对方后续互动时，怎样通知我',U.notificationModeField('followUpMode','我的后续通知方式',mine.followUpMode)+'<p class="quiet-note">只调整自己的接收方式，影响之后的新互动；不重发历史通知，也不改变已生成的邮件任务或私人到时提醒。</p>',v=>{
      const error=U.putNotificationSetting(type,id,v.followUpMode,mine.version);if(error)return error;U.toast('我的后续通知方式已保存');
    },{label:'保存我的接收方式',eyebrow:'ONLY FOR ME'});
  };

  U.queueNotification=({type,id,message,recipient,mode='IN_APP',sourceType='BUSINESS',dedupeKey,operationId=null,reminder=null,changeInvitationId=null})=>{
    if(mode==='NONE')return null;
    const existing=dedupeKey&&U.state.notifications.find(n=>n.dedupeKey===dedupeKey);if(existing)return existing;
    const n={id:U.uid('n'),kind:kinds[type],resourceType:type,resourceId:id,message,recipient,connectionId:sourceType==='BUSINESS'?U.state.connectionId:null,sourceType,read:false,at:new Date().toISOString(),dedupeKey,operationId,reminderId:reminder?.id||null,reminderRevision:reminder?.revision||null,changeInvitationId};
    U.state.notifications.unshift(n);
    if(mode==='IN_APP_AND_MAIL'){
      const email=person(recipient)?.notificationEmail,config=U.state.previewMail;
      const failureCode=!U.validNotificationEmail(email)?'RECIPIENT_EMAIL_MISSING':!config.enabled?'MAIL_DISABLED':!config.configured?'MAIL_CONFIG_INCOMPLETE':null;
      U.state.mailDeliveries.push({id:U.uid('delivery'),notificationId:n.id,sourceType,operationId,reminderId:n.reminderId,reminderRevision:n.reminderRevision,changeInvitationId,recipient,recipientEmail:email||null,status:failureCode?'FAILED':'QUEUED',failureCode,sentAt:null,nextAttemptAt:null,attemptCount:0});
    }
    return n;
  };
  U.mailTaskValid=d=>{
    const n=U.state.notifications.find(n=>n.id===d.notificationId);
    if(!n||n.invalidatedAt||!readable(n.resourceType,n.resourceId,d.recipient)||person(d.recipient)?.notificationEmail!==d.recipientEmail)return false;
    if(n.connectionId&&n.connectionId!==U.state.connectionId)return false;
    if(d.sourceType==='BUSINESS')return true;
    const r=U.state.reminders.find(r=>r.id===d.reminderId),item=r&&resource(r.resourceType,r.resourceId);
    if(!r||r.revision!==d.reminderRevision||!item||item.status==='CANCELLED'||(r.resourceType==='COMMITMENT'&&item.status!=='OPEN'))return false;
    if(d.sourceType==='REMINDER_CHECK')return ['PENDING','FIRED'].includes(r.status)&&U.find('invitations',d.changeInvitationId)?.status==='ACCEPTED';
    return r.status==='FIRED';
  };
  U.reminderCheckNotifications=(eventId,invitationId)=>{
    U.state.reminders.filter(r=>r.resourceType==='CALENDAR_EVENT'&&r.resourceId===eventId&&r.status==='PENDING').forEach(r=>U.queueNotification({type:'CALENDAR_EVENT',id:eventId,message:'共同安排已改期，请检查自己的提醒',recipient:r.recipient,mode:r.deliveryMode,sourceType:'REMINDER_CHECK',dedupeKey:'reminder-check:'+invitationId+':'+r.id+':'+r.revision,reminder:r,changeInvitationId:invitationId}));
  };
  const contextFor=options=>{
    const item=options.id&&resource(options.resourceType,options.id),other=setting(options.resourceType,options.id,U.state.partner.username);
    return JSON.stringify([U.state.user.username,options.action,options.resourceType,options.id,U.state.connectionId,item?.version||null,other.version,other.followUpMode]);
  };
  const offerOverride=(options,changed=false)=>{
    const token=U.operationKey();overrides.set(token,{context:contextFor(options),expiresAt:Date.now()+120000});
    return failure(changed?'NOTIFICATION_CONTEXT_CHANGED':'MAIL_NOT_AVAILABLE',changed?'通知上下文已变化，请重新明确选择本次通知方式。':'对方当前无法接收已选择的邮件通知。请明确选择本次仅站内通知或本次不通知。',{overrideToken:token});
  };
  const stable=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(stable):Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
  // Local non-cryptographic request fingerprint; formal request hashing belongs to the backend.
  const fingerprint=value=>{
    const text=JSON.stringify(stable(value));let a=2166136261,b=2166136261;
    for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(text.length-1-i),16777619);}
    return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
  };
  U.runNotifiedOperation=(options,mutate)=>{
    U.prepareNotifications();
    const actor=U.state.user.username,key=options.key||U.operationKey(),hash=fingerprint({action:options.action,type:options.resourceType,id:options.id,connectionId:options.connectionId,expectedVersion:options.expectedVersion,plan:options.notificationPlan,mode:options.notificationMode,override:options.override,payload:options.payload||{}});
    const receipt=U.state.notificationOperations.find(r=>r.actor===actor&&r.key===key);
    if(receipt){
      if(receipt.action!==options.action||receipt.payloadHash!==hash)return failure('IDEMPOTENCY_KEY_REUSED','这次提交已成功保存，不能用同一次提交覆盖不同内容。请先核对结果。');
      if(!readable(receipt.result.type,receipt.result.id))return failure('RESOURCE_NOT_FOUND','原内容已不存在或不可访问。');
      return {ok:true,result:receipt.result,replayed:true};
    }
    if(!options.personal&&(!U.connected()||(options.connectionId!==undefined&&options.connectionId!==U.state.connectionId)))return failure('NOTIFICATION_CONTEXT_CHANGED','连接已变化，请重新查看内容。草稿不会自动发给新的连接。');
    const item=options.id&&resource(options.resourceType,options.id);
    if(options.id&&!readable(options.resourceType,options.id))return failure('RESOURCE_NOT_FOUND','这个内容已不存在或不可访问。');
    if(options.expectedVersion!==undefined&&options.expectedVersion!==''&&String(item?.version)!==String(options.expectedVersion))return failure('VERSION_CONFLICT','原内容已变化，请查看最新内容后再提交。输入已保留。');
    const invalid=options.validate?.();if(invalid)return failure('INVALID_STATE',invalid);
    let mode='NONE';
    if(!options.personal){
      if(options.notificationPlan){
        const plan=options.notificationPlan;if(!validMode(plan.outgoingMode)||!validMode(plan.followUpMode))return failure('VALIDATION_ERROR','请分别选择两个方向的通知方式。');
        const directions=[];
        if(plan.outgoingMode==='IN_APP_AND_MAIL'&&!U.mailAvailableFor(U.state.partner.username))directions.push('OTHER');
        if(plan.followUpMode==='IN_APP_AND_MAIL'&&!U.mailAvailableFor(actor))directions.push('SELF');
        if(directions.length)return failure('MAIL_NOT_AVAILABLE',(directions.includes('OTHER')?'本次通知对方的邮件方式暂不可用。 ':'')+(directions.includes('SELF')?'回应后通知自己的邮件方式暂不可用。 ':'')+'输入已保留，请明确改选。',{unavailableDirections:directions});
        mode=plan.outgoingMode;
      }else if(options.followUp){
        if(!settingScope(options.resourceType,options.id))return failure('RESOURCE_NOT_FOUND','这个内容已不可继续互动。');
        mode=setting(options.resourceType,options.id,U.state.partner.username).followUpMode;
        if(options.override){
          const grant=overrides.get(options.override.token);
          if(!grant||grant.expiresAt<=Date.now()||grant.context!==contextFor(options))return offerOverride(options,true);
          if(!['NONE','IN_APP'].includes(options.override.mode))return failure('VALIDATION_ERROR','本次改选只能是不通知或站内通知。');
          mode=options.override.mode;
        }else if(mode==='IN_APP_AND_MAIL'&&!U.mailAvailableFor(U.state.partner.username))return offerOverride(options);
      }else{
        mode=options.notificationMode||'IN_APP';if(!validMode(mode))return failure('VALIDATION_ERROR','请选择有效的通知方式。');
        if(mode==='IN_APP_AND_MAIL'&&!U.mailAvailableFor(U.state.partner.username))return failure('MAIL_NOT_AVAILABLE','对方暂时无法接收邮件通知。输入已保留，请明确改选。');
      }
    }
    const snapshot=JSON.parse(JSON.stringify(U.state));
    try{
      const result=mutate();if(!result?.type||!result.id)throw new Error('Missing result reference');
      if(options.notificationPlan){
        U.clearNotificationSettings(result.type,result.id);
        if(options.inheritFrom)U.copyNotificationSettings(options.inheritFrom.type,options.inheritFrom.id,result.type,result.id);
        writeSetting(result.type,result.id,actor,options.notificationPlan.followUpMode);
      }
      U.queueNotification({type:result.type,id:result.id,message:options.message,recipient:U.state.partner.username,mode,sourceType:'BUSINESS',operationId:key,dedupeKey:'business:'+actor+':'+key+':'+options.action+':'+U.state.partner.username});
      U.state.notificationOperations.push({actor,key,action:options.action,payloadHash:hash,result:{type:result.type,id:result.id,...(result.eventId?{eventId:result.eventId}:{})}});
      U.save();return {ok:true,result,replayed:false};
    }catch(_){U.replaceState(snapshot);return failure('OPERATION_FAILED','这次操作未保存，请保留输入后重试。');}
  };
  U.submitNotified=(form,values,options,mutate)=>{
    const result=U.runNotifiedOperation({...options,key:form?.dataset.operationKey,connectionId:form?.dataset.notificationConnection??options.connectionId,expectedVersion:form?.dataset.notificationResourceVersion??options.expectedVersion,payload:values,override:form?.dataset.notificationOverrideToken&&values.notificationOverrideMode?{token:form.dataset.notificationOverrideToken,mode:values.notificationOverrideMode}:undefined},mutate);
    if(result.ok)return null;
    if(result.error.overrideToken&&form){
      form.dataset.notificationOverrideToken=result.error.overrideToken;
      form.querySelector('.notification-override')?.remove();
      form.querySelector('.form-message').insertAdjacentHTML('beforebegin','<fieldset class="notification-fields notification-override"><legend>明确选择这一次怎样通知对方</legend>'+U.select('notificationOverrideMode','本次通知对方',[['','请选择本次方式'],['IN_APP','本次仅站内通知'],['NONE','本次不通知']],'')+'<p class="quiet-note">重新点击提交后按这次选择处理；对方保存的方式保持不变。</p></fieldset>');
    }
    return result.error.message;
  };
  U.prepareNotifications=()=>{
    const s=U.state;s.notificationSettings||=[];s.notificationOperations||=[];
    Object.values(collections).forEach(collection=>s[collection].forEach(item=>{item.version||=1;item.updatedAt||=item.createdAt||new Date().toISOString();}));
    s.notifications.forEach(n=>{n.resourceType||=Object.keys(kinds).find(type=>kinds[type]===n.kind);n.sourceType||=n.reminderId||n.message==='你设置的私人提醒到了'?'REMINDER_DUE':'BUSINESS';});
    s.mailDeliveries.forEach(d=>{d.sourceType||=d.reminderId?'REMINDER_DUE':'BUSINESS';});
    s.notificationSettings=s.notificationSettings.filter(setting=>settingScope(setting.resourceType,setting.resourceId));
  };
  const render=U.render;
  U.render=()=>{U.prepareReminders();U.prepareNotifications();render();};
  U.prepareNotifications();U.save();
})();
