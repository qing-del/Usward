/* Local reminder/mail simulation. No SMTP, API calls or external delivery. */
(() => {
  'use strict';
  const {esc, icon} = U;
  const kinds = {MEMORY_CARD:'memory', CALENDAR_EVENT:'event', COMMITMENT:'commitment'};
  const collections = {MEMORY_CARD:'memories', CALENDAR_EVENT:'events', COMMITMENT:'commitments'};
  const actions = {MEMORY_CARD:'memory-view', CALENDAR_EVENT:'event-view', COMMITMENT:'commitment-view'};
  const modes = {IN_APP:'站内提醒', IN_APP_AND_MAIL:'站内提醒 + Mail 提醒'};
  const statuses = {QUEUED:'等待发送', PROCESSING:'正在处理', SENT:'邮件服务器已接受', FAILED:'发送失败', CANCELLED:'已取消'};
  const failures = {
    RECIPIENT_EMAIL_MISSING:'触发时尚未设置收件邮箱。站内提醒已保留。',
    MAIL_DISABLED:'触发时部署尚未启用邮件提醒。站内提醒已保留。',
    MAIL_CONFIG_INCOMPLETE:'邮件配置不完整。站内提醒已保留。',
    SMTP_TEMPORARY_FAILURE:'邮件暂时未发出，将稍后再次尝试。',
    SMTP_RETRY_EXHAUSTED:'邮件多次尝试后仍未发出，已停止自动重试。站内提醒已保留。',
    SMTP_PERMANENT_FAILURE:'邮件发送失败，请检查收件地址或联系部署维护者。站内提醒仍可查看。'
  };
  const unfinished = delivery => ['QUEUED','PROCESSING'].includes(delivery.status);
  const resource = reminder => U.find(collections[reminder.resourceType], reminder.resourceId);
  const owner = item => item.owner === 'me' ? U.state.user.username : U.state.partner.username;
  const person = username => [U.state.user,U.state.partner].find(p => p.username === username);
  const visibleTo = (reminder, username = U.state.user.username) => {
    const item = resource(reminder);
    if (!item || item.deleted) return false;
    if (reminder.resourceType === 'CALENDAR_EVENT') {
      return item.kind === 'PERSONAL' ? owner(item) === username : U.shared(item);
    }
    if (reminder.resourceType === 'COMMITMENT') return owner(item) === username;
    return owner(item) === username || (item.shared && U.shared(item));
  };
  const closed = reminder => {
    const item = resource(reminder);
    return !item || item.status === 'CANCELLED' || (reminder.resourceType === 'COMMITMENT' && item.status !== 'OPEN');
  };

  U.validNotificationEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
  U.mailCapability = () => {
    const config = U.state.previewMail || {enabled:true, configured:true};
    if (!config.enabled) return {available:false, reason:'部署尚未启用邮件提醒。可以继续使用站内提醒。', code:'MAIL_DISABLED'};
    if (!config.configured) return {available:false, reason:'部署邮件配置不完整。请由维护者完成配置，或选择站内提醒。', code:'MAIL_CONFIG_INCOMPLETE'};
    if (!U.validNotificationEmail(U.state.user.notificationEmail)) return {available:false, reason:'先在“我的”设置本人收件邮箱，才可选择 Mail 提醒。', code:'RECIPIENT_EMAIL_MISSING'};
    return {available:true, reason:'邮件只发给你，不会随内容分享给对方。', code:null};
  };
  U.reminderModeLabel = mode => modes[mode] || modes.IN_APP;
  U.getReminder = (type, id, recipient = U.state.user.username) => (U.state.reminders || []).find(r => r.resourceType === type && r.resourceId === id && r.recipient === recipient) || null;

  function syncLegacy(reminder) {
    const item = resource(reminder);
    if (!item) return;
    const value = reminder.status === 'PENDING' ? reminder.scheduledAt : '';
    if (reminder.resourceType === 'CALENDAR_EVENT' && item.kind === 'SHARED') {
      item.privateReminders ||= {};
      item.privateReminders[reminder.recipient] = value;
      if (reminder.recipient === U.state.user.username) item.reminder = value;
    } else if (reminder.resourceType === 'MEMORY_CARD' && owner(item) !== reminder.recipient) {
      item.privateReminders ||= {};
      item.privateReminders[reminder.recipient] = value;
    } else item.reminder = value;
  }

  U.cancelMailTasks = predicate => {
    (U.state.mailDeliveries || []).forEach(d => {
      if (unfinished(d) && predicate(d)) {d.status = 'CANCELLED'; d.failureCode = null;}
    });
  };
  U.cancelReminder = reminder => {
    if (!reminder) return;
    if (reminder.status !== 'CANCELLED') reminder.revision += 1;
    reminder.status = 'CANCELLED';
    U.cancelMailTasks(d => d.reminderId === reminder.id);
    syncLegacy(reminder);
  };
  U.cancelResourceReminders = (type, id, predicate = () => true) => {
    (U.state.reminders || []).filter(r => r.resourceType === type && r.resourceId === id && predicate(r)).forEach(U.cancelReminder);
  };

  U.prepareReminders = () => {
    const s = U.state;
    s.user.notificationEmail ??= null;
    s.partner.notificationEmail ??= null;
    s.previewMail ||= {enabled:true, configured:true, result:'SENT'};
    s.reminders ||= [];
    s.mailDeliveries ||= [];
    // Import existing preview data; no previous reminder is upgraded to mail.
    const importPlan = (type, item, recipient, time, fired) => {
      if (!time || U.getReminder(type,item.id,recipient)) return;
      s.reminders.push({id:U.uid('reminder'),resourceType:type,resourceId:item.id,recipient,scheduledAt:time,deliveryMode:'IN_APP',revision:1,status:fired===time?'FIRED':'PENDING'});
    };
    if (!s.reminderSchema) {
      Object.entries(collections).forEach(([type,collection]) => s[collection].forEach(item => {
        const recipient = type === 'CALENDAR_EVENT' && item.kind === 'SHARED' ? s.user.username : owner(item);
        importPlan(type,item,recipient,item.reminder,item.firedReminder);
        if (type !== 'COMMITMENT') Object.entries(item.privateReminders || {}).forEach(([username,time]) => importPlan(type,item,username,time,item.firedPrivateReminders?.[username] || item.firedReminders?.[username]));
      }));
      s.reminderSchema = 1;
    }
    s.user.mailReminderAvailable = U.mailCapability().available;
    s.reminders.forEach(syncLegacy);
  };

  U.reminderFields = (type, id = '', {label='私人提醒时间', clearable=true} = {}) => {
    const reminder = id && U.getReminder(type,id);
    const capability = U.mailCapability();
    const mode = reminder?.deliveryMode || 'IN_APP';
    const time = reminder?.status === 'PENDING' ? U.local(reminder.scheduledAt) : '';
    return `<fieldset class="reminder-fields"><legend>${icon('bell',15)}只提醒我自己 <small>可选</small></legend>${U.field('reminder',label+(clearable?' <small>留空可取消</small>':''),'datetime-local',time)}<div class="field"><label for="f-deliveryMode">提醒方式</label><select id="f-deliveryMode" name="deliveryMode" aria-describedby="reminder-mode-help"><option value="IN_APP" ${mode==='IN_APP'?'selected':''}>站内提醒</option><option value="IN_APP_AND_MAIL" ${mode==='IN_APP_AND_MAIL'?'selected':''} ${capability.available?'':'disabled'}>站内提醒 + Mail 提醒${capability.available?'':'（暂不可用）'}</option></select><p class="quiet-note" id="reminder-mode-help">${esc(capability.reason)}${capability.code==='RECIPIENT_EMAIL_MISSING'?' <a class="text-link" href="me.html#email">设置收件邮箱 '+icon('arrow',12)+'</a>':''}</p></div>${reminder&&reminder.status!=='PENDING'?`<p class="quiet-note">上次提醒${reminder.status==='FIRED'?'已触发':'已取消'}。重新设置会建立新的提醒计划。</p>`:''}<p class="quiet-note">留空不会创建提醒。Mail 提醒只含通用文案和网站入口；当前预览不会发送真实邮件。</p></fieldset>`;
  };
  U.bindReminderFields = form => {
    const time = form.elements.namedItem('reminder');
    const mode = form.elements.namedItem('deliveryMode');
    if (!time || !mode) return;
    const update = () => {mode.disabled = !time.value;};
    time.addEventListener('input',update);
    update();
  };
  U.validateReminderValues = values => {
    if (!values.reminder) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.reminder)) return '请选择有效的提醒时间。';
    try {if (!Number.isFinite(Date.parse(U.fromLocal(values.reminder)))) return '请选择有效的提醒时间。';}
    catch (_) {return '请选择有效的提醒时间。';}
    const mode = values.deliveryMode || 'IN_APP';
    if (!modes[mode]) return '请选择站内提醒或站内提醒 + Mail 提醒。';
    if (mode === 'IN_APP_AND_MAIL' && !U.mailCapability().available) return U.mailCapability().reason+' 提醒输入已保留，请修改后重新保存。';
    return null;
  };
  U.saveReminder = (type, id, values) => {
    const error = U.validateReminderValues(values);
    if (error) return error;
    let reminder = U.getReminder(type,id);
    if (!values.reminder) {U.cancelReminder(reminder); return null;}
    const probe = reminder || {resourceType:type,resourceId:id};
    if (!visibleTo(probe) || closed(probe)) return '这个内容已不可设置提醒。';
    if (reminder) {U.cancelMailTasks(d => d.reminderId === reminder.id); reminder.revision += 1;}
    else {reminder={id:U.uid('reminder'),resourceType:type,resourceId:id,recipient:U.state.user.username,revision:1};U.state.reminders.push(reminder);}
    Object.assign(reminder,{scheduledAt:U.fromLocal(values.reminder),deliveryMode:values.deliveryMode||'IN_APP',status:'PENDING'});
    syncLegacy(reminder);
    return null;
  };
  U.reminderSummary = (type,id) => {
    const r = U.getReminder(type,id);
    if (!r) return '';
    if (r.status !== 'PENDING') return `<p class="quiet-note mt-16">我的上次提醒${r.status==='FIRED'?'已触发':'已取消'}，没有待触发的计划。</p>`;
    return `<div class="inline-note reminder-summary mt-16">${icon(r.deliveryMode==='IN_APP_AND_MAIL'?'mail':'bell',16)}<span>我的私人提醒 · ${U.date(r.scheduledAt)} ${U.time(r.scheduledAt)}<small>${esc(U.reminderModeLabel(r.deliveryMode))}</small></span></div>`;
  };
  U.reminderForm = (type,id) => {
    const probe = {resourceType:type,resourceId:id};
    if (!visibleTo(probe) || closed(probe)) return U.toast('这个内容已不可设置提醒',true);
    U.form('只提醒我自己',U.reminderFields(type,id),v => {
      const error = U.saveReminder(type,id,v);
      if (error) return error;
      U.toast(v.reminder?'私人提醒已保存':'私人提醒已取消');
    },{label:'保存提醒',draft:`reminder-${type}-${id}`,eyebrow:'ONLY FOR ME'});
  };
  const bySchedule = (a,b) => Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt) || a.id.localeCompare(b.id);
  U.pendingReminders = type => (U.state.reminders || []).filter(r => r.recipient === U.state.user.username && (!type || r.resourceType===type) && r.status==='PENDING' && visibleTo(r) && !closed(r)).sort(bySchedule);
  U.reminderTarget = reminder => ({item:resource(reminder),action:actions[reminder.resourceType]});
  U.reminderItemHTML = (r, settings=false) => {
    const {item,action}=U.reminderTarget(r);
    const label={MEMORY_CARD:'记忆卡片',CALENDAR_EVENT:'日历安排',COMMITMENT:'我的承诺'}[r.resourceType];
    return `<div class="reminder-list-item"><strong>${esc(item.title||'一件值得记住的事')}</strong><p>${label} · ${U.date(r.scheduledAt)} ${U.time(r.scheduledAt)}</p>${U.badge(U.reminderModeLabel(r.deliveryMode),'gray',r.deliveryMode==='IN_APP_AND_MAIL'?'mail':'bell')}<div class="flex between">${U.act(action,r.resourceId,'查看内容 '+icon('arrow',12))}${settings?closed(r)?'<span class="quiet-note">内容已结束</span>':U.act('reminder-edit',r.id,r.status==='CANCELLED'?'重新设置':'调整 / 取消提醒'):''}</div></div>`;
  };
  U.actions['reminder-edit'] = ({id}) => {
    const r=U.state.reminders.find(r=>r.id===id&&r.recipient===U.state.user.username);
    if(r)U.reminderForm(r.resourceType,r.resourceId);
  };
  U.actions['reminders-list'] = () => {
    const own=U.state.reminders.filter(r=>r.recipient===U.state.user.username&&visibleTo(r)).sort(bySchedule);
    const pending=own.filter(r=>r.status==='PENDING'&&!closed(r));
    const history=own.filter(r=>r.status!=='PENDING');
    U.modal('我的私人提醒',`<p class="quiet-note">只显示自己的设置；共享内容上的提醒也由双方各自管理。</p><h3 class="mt-24">待触发 · ${pending.length} 条</h3>${pending.length?pending.map(r=>U.reminderItemHTML(r,true)).join(''):'<p class="quiet-note mt-16">没有待触发的计划。可以从记忆、日历或自己的承诺设置提醒。</p>'}${history.length?`<details class="optional-details mt-24"><summary>已触发 / 已取消 · ${history.length} 条</summary>${history.map(r=>`<p class="quiet-note mt-16">${r.status==='FIRED'?'已触发':'已取消'}</p>${U.reminderItemHTML(r,true)}`).join('')}</details>`:''}<p class="quiet-note mt-24">取消提醒会停止未完成的邮件任务，已经生成的站内通知仍保留。再次分享或重新打开内容不会恢复旧计划。</p>`,{eyebrow:'ONLY FOR ME'});
  };

  U.refreshReminders = () => {
    U.prepareReminders();
    let changed = false;
    U.state.reminders.forEach(r => {
      if (!visibleTo(r,r.recipient) || closed(r)) {if(r.status!=='CANCELLED'){U.cancelReminder(r);changed=true;}return;}
      if (r.status !== 'PENDING' || Date.parse(r.scheduledAt) > Date.now()) return;
      const dedupeKey = `reminder:${r.id}:${r.revision}`;
      if (!U.state.notifications.some(n => n.dedupeKey===dedupeKey)) {
        const notification = {id:U.uid('n'),kind:kinds[r.resourceType],resourceId:r.resourceId,message:'你设置的私人提醒到了',recipient:r.recipient,read:false,at:new Date().toISOString(),dedupeKey,reminderId:r.id,reminderRevision:r.revision};
        U.state.notifications.unshift(notification);
        if (r.deliveryMode === 'IN_APP_AND_MAIL') {
          const config = U.state.previewMail;
          const email = person(r.recipient)?.notificationEmail;
          const failureCode = !U.validNotificationEmail(email)?'RECIPIENT_EMAIL_MISSING':!config.enabled?'MAIL_DISABLED':!config.configured?'MAIL_CONFIG_INCOMPLETE':null;
          U.state.mailDeliveries.push({id:U.uid('delivery'),notificationId:notification.id,reminderId:r.id,reminderRevision:r.revision,recipient:r.recipient,recipientEmail:email||null,status:failureCode?'FAILED':'QUEUED',failureCode,sentAt:null,nextAttemptAt:null,attemptCount:0});
        }
      }
      r.status = 'FIRED';syncLegacy(r);changed=true;
    });
    U.state.mailDeliveries.forEach(d => {
      if (!unfinished(d)) return;
      const r = U.state.reminders.find(r => r.id===d.reminderId);
      if (!r || r.revision!==d.reminderRevision || r.status!=='FIRED' || !visibleTo(r,d.recipient) || closed(r) || person(d.recipient)?.notificationEmail!==d.recipientEmail) {d.status='CANCELLED';d.failureCode=null;changed=true;}
    });
    U.state.notifications.forEach(n => {
      if (n.invalidatedAt) return;
      const type = Object.keys(kinds).find(type => kinds[type]===n.kind);
      let accessible = !n.connectionId || n.connectionId===U.state.connectionId;
      if (type) {
        const item=U.find(collections[type],n.resourceId);
        accessible &&= !!item && !item.deleted && (type==='CALENDAR_EVENT'?item.kind==='PERSONAL'?owner(item)===n.recipient:U.shared(item):owner(item)===n.recipient||(item.shared&&U.shared(item)));
      } else if (n.kind==='expression' || n.kind==='invitation') {
        const item=U.find(n.kind==='expression'?'expressions':'invitations',n.resourceId);
        accessible &&= !!item && U.shared(item) && (n.kind!=='expression'||item.status!=='WITHDRAWN');
      }
      if (!accessible) {n.invalidatedAt=new Date().toISOString();U.cancelMailTasks(d=>d.notificationId===n.id);changed=true;}
    });
    if (changed) U.save();
  };
  U.advanceMailPreview = () => {
    const unread=U.unread();
    U.refreshReminders();
    let changed=false;
    U.state.mailDeliveries.forEach(d => {
      if (!unfinished(d) || (d.nextAttemptAt && Date.parse(d.nextAttemptAt)>Date.now())) return;
      if (!U.state.previewMail.enabled || !U.state.previewMail.configured) {d.status='FAILED';d.failureCode=U.state.previewMail.enabled?'MAIL_CONFIG_INCOMPLETE':'MAIL_DISABLED';}
      else if (d.status==='QUEUED') {d.status='PROCESSING';d.attemptCount=(d.attemptCount||0)+1;d.nextAttemptAt=null;d.failureCode=null;}
      else {
        const result = U.state.previewMail.result || 'SENT';
        d.status=result;
        if (result==='SENT') {d.sentAt=new Date().toISOString();d.failureCode=null;}
        else if (result==='QUEUED') {
          if(d.attemptCount>=5){d.status='FAILED';d.failureCode='SMTP_RETRY_EXHAUSTED';}
          else {d.nextAttemptAt=new Date(Date.now()+[1,5,15,60][d.attemptCount-1]*60000).toISOString();d.failureCode=null;}
        }
        else d.failureCode='SMTP_PERMANENT_FAILURE';
      }
      changed=true;
    });
    if (changed) U.save();
    if (unread!==U.unread()) U.render();
    if (changed && document.querySelector('.notification-list')) U.actions.notifications();
  };
  U.mailDelivery = notification => (U.state.mailDeliveries || []).find(d => d.notificationId===notification.id && d.recipient===U.state.user.username) || null;
  U.mailDeliveryHTML = notification => {
    const d = U.mailDelivery(notification);
    if (!d) return '';
    return `<button class="mail-delivery-link ${d.status==='FAILED'?'failed':''}" data-action="mail-delivery-view" data-id="${esc(notification.id)}">${icon('mail',13)}<span>Mail · ${esc(statuses[d.status])}${d.status==='QUEUED'&&d.nextAttemptAt?' · 稍后重试':''}</span>${icon('chevron',12)}</button>`;
  };
  U.actions['mail-delivery-view'] = ({id}) => {
    const n = U.find('notifications',id);
    if (!n || !U.notificationVisible(n)) return U.toast('这条通知已不可访问',true);
    const d = U.mailDelivery(n);
    if (!d) return;
    const description = d.status==='SENT'?'仅表示邮件服务器已接受，不代表已经到达收件箱或已读。':d.status==='FAILED'?failures[d.failureCode]||'邮件发送失败，站内提醒仍可查看。':d.status==='CANCELLED'?'邮件任务已取消。已开始的发送可能完成，已经发送的邮件无法收回。':d.status==='PROCESSING'?'正在处理这次邮件提醒。站内已读状态不影响邮件发送。':d.nextAttemptAt?`邮件暂时未发出，计划 ${U.time(d.nextAttemptAt)} 再次尝试。`:'邮件正在等待发送，不承诺精确到秒或严格准点送达。';
    U.modal('我的 Mail 提醒',`<div class="detail-meta">${U.badge(statuses[d.status],d.status==='FAILED'?'peach':d.status==='SENT'?'green':'gray','mail')}${U.badge('仅本人可见','gray','lock')}</div><p class="modal-copy">${esc(description)}</p>${d.sentAt?`<p class="quiet-note mt-16">服务器接受时间 · ${U.date(d.sentAt)} ${U.time(d.sentAt)}</p>`:''}<div class="mail-message-preview mt-24"><p class="eyebrow">邮件内容预览</p><h3>Usward · 你设置的提醒已到</h3><p>你设置的提醒已到，请登录 Usward 查看。</p><a href="index.html" class="text-link">打开 Usward ${icon('arrow',13)}</a></div><p class="quiet-note mt-16">邮件只有通用文案和网站入口，不包含标题、正文、回应或地点。网站入口仍需登录。</p><div class="inline-note mt-16">${icon('info',16)}当前是本地投递状态演示，不会发送真实邮件。</div>`,{eyebrow:'JUST FOR YOU'});
  };
  U.updateNotificationEmail = email => {
    const value = email.trim();
    if (value && !U.validNotificationEmail(value)) return '请填写单个有效的收件邮箱。';
    if ((U.state.user.notificationEmail||'') !== value) U.cancelMailTasks(d => d.recipient===U.state.user.username);
    U.state.user.notificationEmail=value||null;
    U.state.user.mailReminderAvailable=U.mailCapability().available;
    return null;
  };
  U.actions['email-edit'] = () => {
    U.form('我的通知收件邮箱',`${U.field('email','通知收件邮箱 <small>留空可清除</small>','email',U.state.user.notificationEmail||'','例如：linan@example.com','maxlength="254" autocomplete="email"')}<p class="quiet-note">请确认这是你本人可接收邮件的地址。邮箱仅用于你主动设置的到时提醒，不作为登录账号，也不向对方公开。</p><div class="inline-note">${icon('mail',16)}设置邮箱不会自动开启所有提醒的邮件发送；请在每次设置提醒时选择方式。</div><p class="quiet-note">更换或清空邮箱，会取消尚未完成的旧地址邮件任务。已有提醒的时间与方式保留，旧邮件不会转投新地址。</p><p class="quiet-note">预览只保存本地演示设置，不验证邮箱，也不发送邮件。</p>`,v => {
      const error = U.updateNotificationEmail(v.email);
      if (error) return error;
      U.toast(v.email?'通知收件邮箱已保存':'通知收件邮箱已清除');
    },{label:'确认并保存',eyebrow:'MY NOTIFICATION EMAIL'});
  };
  U.actions['mail-preview-settings'] = () => {
    const c=U.state.previewMail;
    U.form('邮件提醒演示设置',`${U.select('capability','模拟部署邮件能力',[['AVAILABLE','已启用且配置完整'],['DISABLED','尚未启用'],['INCOMPLETE','配置不完整']],!c.enabled?'DISABLED':!c.configured?'INCOMPLETE':'AVAILABLE')}${U.select('result','模拟邮件处理结果',[['SENT','邮件服务器接受'],['QUEUED','临时失败，稍后重试'],['FAILED','发送失败']],c.result||'SENT')}<div class="inline-note">${icon('info',16)}这里只模拟预览中的可用状态与投递结果，不修改真实部署配置，也不会发送邮件。</div>`,v => {
      c.enabled=v.capability!=='DISABLED';c.configured=v.capability!=='INCOMPLETE';c.result=v.result;
      U.toast('邮件演示设置已更新');
    },{label:'保存演示设置',eyebrow:'PREVIEW ONLY'});
  };
  const render = U.render;
  U.render = () => {U.prepareReminders();render();};
  const preview = U.actions.preview;
  U.actions.preview = () => {preview();const row=document.createElement('div');row.className='list-row';row.innerHTML=`<div><h3>邮件提醒演示</h3><p>模拟邮件能力、等待、成功与失败。</p></div><button class="btn soft small" data-action="mail-preview-settings">演示设置</button>`;document.querySelector('.modal')?.append(row);};
  U.prepareReminders();
  U.save();
  document.addEventListener('DOMContentLoaded',() => {if(U.page==='me'&&location.hash==='#email')U.actions['email-edit']();});
  setInterval(() => {if(!document.hidden&&U.state.signedIn)U.advanceMailPreview();},10000);
})();
