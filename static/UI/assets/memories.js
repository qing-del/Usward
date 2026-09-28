(() => {
  const {esc,icon}=U;
  function filtered({applyTag=true}={}) {
    const v=U.view.memories;const query=v.search.toLocaleLowerCase();
    return U.state.memories.filter(U.memoryVisible).filter(m=>v.tab==='archived'?m.owner==='me'&&m.archived:v.tab==='partner'?m.owner==='partner':v.tab==='mine'?m.owner==='me'&&!m.archived:m.owner==='partner'||!m.archived).filter(m=>(v.category==='all'||m.category===v.category)&&(!applyTag||!v.tag||m.tags.includes(v.tag))).filter(m=>!query||[m.title,m.body].join(' ').toLocaleLowerCase().includes(query)).sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||0)-Date.parse(a.updatedAt||a.createdAt||0)||String(b.id).localeCompare(String(a.id)));
  }
  function card(m) {
    const shared=m.shared&&U.shared(m);const mine=m.owner==='me';
    return `<article class="memory-card memory-${m.color||'sage'}"><button class="memory-open" data-action="memory-view" data-id="${m.id}"><div class="memory-top"><span class="memory-category">${icon(m.category==='自我反思'?'leaf':m.category==='相处偏好'?'chat':m.category==='喜好兴趣'?'cup':'memory',15)}${esc(m.category)}</span>${!mine?U.avatar('partner','small'):icon(shared?'link':'lock',13)}</div><h3 class="serif">${esc(m.title||'一件值得记住的小事')}</h3><p class="memory-body">${esc(m.body)}</p>${m.tags.length?`<div class="memory-tags">${m.tags.map(t=>`<span># ${esc(t)}</span>`).join('')}</div>`:''}<div class="memory-source ${m.source==='INTERPRETATION'?'interpretation':''}"><span class="dot"></span>${esc(U.sources[m.source])}</div>${m.nextAction?`<div class="memory-next">${icon('arrow',12)}<span>${esc(m.nextAction)}</span></div>`:''}<div class="memory-bottom"><span>${mine?m.archived?'已归档':shared?'已分享 · 由我记录':'仅自己可见':esc(U.state.partner.name)+' 分享'}</span><span>${U.date(m.sourceDate||U.currentDay(),{month:'numeric',day:'numeric'})}</span></div></button></article>`;
  }
  function tagsHTML(){const counts=new Map();filtered({applyTag:false}).forEach(m=>new Set(m.tags).forEach(tag=>counts.set(tag,(counts.get(tag)||0)+1)));return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([tag,count])=>`<button class="tag-filter ${U.view.memories.tag===tag?'active':''}" data-action="memory-tag" data-value="${esc(tag)}" aria-pressed="${U.view.memories.tag===tag}"># ${esc(tag)} · ${count}</button>`).join('');}
  function resultHTML() {
    const list=filtered();const limit=U.view.memories.limit;return list.length?`<div class="memory-grid">${list.slice(0,limit).map(card).join('')}</div>${list.length>limit?`<div class="memory-load-more"><button class="btn secondary" data-action="memory-load-more">再翻 ${Math.min(9,list.length-limit)} 张记忆</button></div>`:''}`:U.empty('暂时没有找到这张记忆','可以试试别的关键词，或清除筛选后再看看。','memory-filters-clear','清除筛选');
  }
  U.pages.memories=()=>{
    if(!U.view.memories)U.view.memories={tab:location.hash==='#archived'?'archived':'all',category:'all',tag:'',search:'',limit:9};
    const v=U.view.memories;
    return `${U.heading('LITTLE THINGS, WELL KEPT','记得你，也记得自己。','偏好、边界、平常的瞬间，都可以慢慢收好。',`<button class="btn primary" data-action="memory-new">${icon('plus',16)}记一张卡片</button>`)}
    <div class="memory-intro"><span class="icon-box">${icon('memory',22)}</span><p>记忆是一份温柔的备忘，不是关于彼此的定论。<span>新记录默认「我的理解，待确认」，分享由你自己决定。</span></p><span class="memory-intro-flower">${icon('flower',29)}</span></div>
    <div class="toolbar memory-toolbar"><div class="tabs" aria-label="记忆范围">${[['all','全部记忆'],['mine','我的记忆'],['partner','对方分享'],['archived','已归档']].filter(([tab])=>U.connected()||tab!=='partner').map(([tab,label])=>`<button class="tab ${v.tab===tab?'active':''}" data-action="memory-tab" data-value="${tab}" aria-pressed="${v.tab===tab}">${label}</button>`).join('')}</div><div class="search-box">${icon('search',17)}<label class="sr-only" for="memory-search">搜索记忆</label><input id="memory-search" type="search" placeholder="找一件记得的小事…" value="${esc(v.search)}"></div></div>
    <div class="memory-filters"><div class="filter-chips category-chips" aria-label="类别筛选">${['all',...U.categories].map(category=>`<button class="filter-chip ${v.category===category?'active':''}" data-action="memory-category" data-value="${esc(category)}" aria-pressed="${v.category===category}">${category==='all'?'所有类别':category}</button>`).join('')}</div><div class="memory-tag-filters" id="memory-tags"><span class="tag-label">标签</span>${tagsHTML()}${v.tag||v.category!=='all'||v.search?'<button class="text-link" data-action="memory-filters-clear">清除筛选</button>':''}</div></div>
    <div class="memory-results-heading"><p><span id="memory-result-count">${filtered().length}</span> 张小小的记忆</p><span>${icon('lock',12)} 新建内容默认私密</span></div><section id="memory-results" aria-label="记忆卡片">${resultHTML()}</section><p class="memory-end-note">${icon('leaf',14)}不是记住所有事，而是记住那些对你们重要的事。</p>`;
  };
  U.actions['memory-tab']=({value})=>{U.view.memories.search=document.querySelector('#memory-search')?.value||'';U.view.memories.tab=value;U.view.memories.limit=9;U.render();};
  U.actions['memory-category']=({value})=>{U.view.memories.category=value;U.view.memories.limit=9;U.render();};
  U.actions['memory-tag']=({value})=>{U.view.memories.tag=U.view.memories.tag===value?'':value;U.view.memories.limit=9;U.render();};
  U.actions['memory-filters-clear']=()=>{U.view.memories.search='';U.view.memories.category='all';U.view.memories.tag='';U.view.memories.limit=9;U.render();};
  U.actions['memory-load-more']=()=>{U.view.memories.limit+=9;U.render();};
  const search=event=>{if(event.target.id==='memory-search'){U.view.memories.search=event.target.value;U.view.memories.limit=9;document.querySelector('#memory-results').innerHTML=resultHTML();document.querySelector('#memory-result-count').textContent=filtered().length;document.querySelector('#memory-tags').innerHTML='<span class="tag-label">标签</span>'+tagsHTML();}};
  ['input','change','search'].forEach(type=>document.addEventListener(type,search));
})();
