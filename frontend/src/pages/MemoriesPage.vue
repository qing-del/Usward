<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import BaseDialog from '../components/BaseDialog.vue'
import { ApiError, errorMessage } from '../api'
import { categoryLabels, createMemory, deleteMemory, getMemory, listMemories,
  patchMemory, setMemoryArchived, sourceLabels } from '../memories'
import type { MemoryCategory, MemoryDetail, MemorySummary, MemoryWrite, SourceType } from '../memories'
import { session } from '../session'

const route = useRoute()
const archived = ref(route.query.archived === '1')
const keyword = ref('')
const category = ref<MemoryCategory | null>(null)
const tag = ref('')
const items = ref<MemorySummary[]>([])
const total = ref(0)
const tags = ref<{ tag: string; count: number }[]>([])
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const listError = ref('')
let abort: AbortController | null = null
let sequence = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

const mode = ref<'create' | 'detail' | 'edit' | null>(null)
const detail = ref<MemoryDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const operationPending = ref(false)
const confirmDelete = ref(false)
const latestVersion = ref<string | null>(null)
const editVersion = ref('')
const draft = reactive({ title: '', body: '', category: '' as MemoryCategory | '',
  tagsText: '', sourceType: 'INTERPRETATION' as SourceType, sourceDate: '', nextAction: '' })

async function load(targetPage: number) {
  abort?.abort()
  abort = new AbortController()
  const current = ++sequence
  if (targetPage === 1) { loading.value = true; items.value = []; total.value = 0; listError.value = '' }
  else loadingMore.value = true
  try {
    const result = await listMemories({ archived: archived.value, keyword: keyword.value,
      category: category.value, tag: tag.value, page: targetPage, size: 9 }, abort.signal)
    if (current !== sequence) return
    items.value = targetPage === 1 ? result.items : [...items.value, ...result.items]
    total.value = result.total
    tags.value = result.availableTags
    hasMore.value = result.hasMore
    page.value = result.page
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    if (current === sequence) listError.value = errorMessage(cause)
  } finally {
    if (current === sequence) { loading.value = false; loadingMore.value = false }
  }
}

function resetFilters() {
  keyword.value = ''
  category.value = null
  tag.value = ''
}

watch([archived, category, tag, keyword], (next, previous) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(1), next[3] === previous[3] ? 0 : 280)
})
onMounted(() => {
  load(1)
  if (route.query.new === '1') newMemory()
  else if (typeof route.query.memory === 'string' && /^[1-9]\d*$/.test(route.query.memory)) {
    openMemory(route.query.memory)
  }
})
onBeforeUnmount(() => { abort?.abort(); if (searchTimer) clearTimeout(searchTimer) })

function closeDialog() {
  if (operationPending.value) return
  mode.value = null
  detailError.value = ''
  confirmDelete.value = false
  latestVersion.value = null
}

function newMemory() {
  Object.assign(draft, { title: '', body: '', category: '', tagsText: '',
    sourceType: 'INTERPRETATION', sourceDate: '', nextAction: '' })
  detail.value = null
  detailError.value = ''
  latestVersion.value = null
  mode.value = 'create'
}

async function openMemory(id: string) {
  mode.value = 'detail'
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  confirmDelete.value = false
  try { detail.value = await getMemory(id) }
  catch (cause) {
    detailError.value = cause instanceof ApiError && cause.status === 404
      ? '这张卡片已不可访问。请返回列表查看最新内容。' : errorMessage(cause)
  } finally { detailLoading.value = false }
}

function editMemory() {
  if (!detail.value) return
  const memory = detail.value
  Object.assign(draft, { title: memory.title ?? '', body: memory.body,
    category: memory.category ?? '', tagsText: memory.tags.join('，'),
    sourceType: memory.sourceType, sourceDate: memory.sourceDate ?? '',
    nextAction: memory.nextAction ?? '' })
  editVersion.value = memory.version
  latestVersion.value = null
  detailError.value = ''
  mode.value = 'edit'
}

function parseTags(): string[] {
  return [...new Set(draft.tagsText.split(/[,，\n]/).map(value => value.trim()).filter(Boolean))]
}

async function saveMemory() {
  if (operationPending.value) return
  detailError.value = ''
  if (!draft.body.trim()) { detailError.value = '请填写卡片正文。'; return }
  const parsedTags = parseTags()
  if (parsedTags.some(value => [...value].length > 100)) {
    detailError.value = '每个标签最多 100 个字。'; return
  }
  const write: MemoryWrite = {
    title: draft.title.trim() || null, body: draft.body.trim(),
    category: draft.category || null, tags: parsedTags, sourceType: draft.sourceType,
    sourceDate: draft.sourceDate || null, nextAction: draft.nextAction.trim() || null,
  }
  operationPending.value = true
  try {
    const saved = mode.value === 'edit' && detail.value
      ? await patchMemory(detail.value.id, editVersion.value, write) : await createMemory(write)
    detail.value = saved
    mode.value = 'detail'
    latestVersion.value = null
    if (archived.value) archived.value = false
    else await load(1)
  } catch (cause) {
    detailError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT' && detail.value) {
      try { latestVersion.value = (await getMemory(detail.value.id)).version }
      catch { /* The user's draft remains available. */ }
    }
  } finally { operationPending.value = false }
}

function useLatestVersion() {
  if (!latestVersion.value) return
  editVersion.value = latestVersion.value
  latestVersion.value = null
  detailError.value = '请核对当前输入，然后再次保存。'
}

async function toggleArchived() {
  if (!detail.value || operationPending.value) return
  detailError.value = ''
  operationPending.value = true
  try {
    detail.value = await setMemoryArchived(detail.value.id, detail.value.version, !detail.value.archived)
    await load(1)
  } catch (cause) {
    detailError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT' && detail.value) {
      try { detail.value = await getMemory(detail.value.id) } catch { /* Keep the error visible. */ }
    }
  } finally { operationPending.value = false }
}

async function removeMemory() {
  if (!detail.value || operationPending.value) return
  detailError.value = ''
  operationPending.value = true
  try {
    await deleteMemory(detail.value.id, detail.value.version)
    closeDialogAfterDelete()
    await load(1)
  } catch (cause) {
    detailError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT' && detail.value) {
      try { detail.value = await getMemory(detail.value.id) } catch { /* Keep the error visible. */ }
    }
  } finally { operationPending.value = false }
}

function closeDialogAfterDelete() {
  mode.value = null
  detail.value = null
  confirmDelete.value = false
}

function readableDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: session.user?.timezone ?? 'Asia/Shanghai',
    year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">LITTLE THINGS, WELL KEPT</span>
      <h1 class="serif">记得你，也记得自己。</h1>
      <p class="subtitle">偏好、边界、平常的瞬间，都可以慢慢收好。</p></div>
      <button class="btn primary" @click="newMemory">＋ 记一张卡片</button></div>
    <div class="memory-intro"><span class="memory-intro-mark">✿</span>
      <p>记忆是一份温柔的备忘，不是关于彼此的定论。<br /><small>新记录默认“我的理解，待确认”；目前所有卡片都仅自己可见。</small></p></div>
    <div class="memory-toolbar toolbar"><div class="tabs" aria-label="记忆状态">
      <button class="tab" :aria-pressed="!archived" @click="archived = false">我的记忆</button>
      <button class="tab" :aria-pressed="archived" @click="archived = true">已归档</button></div>
      <div class="search-field"><label class="sr-only" for="memory-search">搜索记忆</label>
        <span aria-hidden="true">⌕</span><input id="memory-search" v-model="keyword" type="search" placeholder="找一件记得的小事…" /></div></div>
    <div class="memory-filters"><div class="filter-chips" aria-label="类别筛选">
      <button class="filter-chip" :aria-pressed="category === null" @click="category = null">所有类别</button>
      <button v-for="(label, value) in categoryLabels" :key="value" class="filter-chip"
        :aria-pressed="category === value" @click="category = value">{{ label }}</button></div>
      <div class="memory-tags"><span class="muted">标签</span>
        <button v-for="entry in tags" :key="entry.tag" class="filter-chip" :aria-pressed="tag === entry.tag"
          @click="tag = tag === entry.tag ? '' : entry.tag"># {{ entry.tag }} · {{ entry.count }}</button>
        <button v-if="keyword || category || tag" class="text-button" @click="resetFilters">清除筛选</button></div></div>
    <div class="results-heading"><strong>{{ total }} 张小小的记忆</strong><span>♧ 新建内容默认私密</span></div>
    <div v-if="loading" class="loading-state" role="status">正在翻看记忆…</div>
    <div v-else-if="listError" class="card"><p class="form-error" role="alert">{{ listError }}</p>
      <button class="btn secondary mt-16" @click="load(1)">重试</button></div>
    <div v-else-if="!items.length" class="card empty-state"><span class="empty-mark">✿</span>
      <h3>暂时没有找到记忆</h3><p>可以换个关键词，或清除筛选后再看看。</p>
      <button v-if="keyword || category || tag" class="btn secondary mt-16" @click="resetFilters">清除筛选</button></div>
    <div v-else class="memory-grid">
      <article v-for="memory in items" :key="memory.id" class="memory-card">
        <button class="memory-open" @click="openMemory(memory.id)">
          <span class="memory-card-top"><span>{{ memory.category ? categoryLabels[memory.category] : '未分类' }}</span><span>♧</span></span>
          <h2 class="serif">{{ memory.title || '一件值得记住的小事' }}</h2>
          <span class="memory-source" :class="{ interpretation: memory.sourceType === 'INTERPRETATION' }">
            {{ sourceLabels[memory.sourceType] }}</span>
          <span v-if="memory.tags.length" class="memory-card-tags">{{ memory.tags.map(item => `# ${item}`).join('　') }}</span>
          <span class="memory-card-bottom"><span>仅自己可见</span><span>{{ readableDate(memory.updatedAt) }}</span></span>
        </button></article></div>
    <div v-if="hasMore && !loading" class="more-row"><button class="btn secondary" :disabled="loadingMore"
      @click="load(page + 1)">{{ loadingMore ? '正在加载…' : '再翻 9 张记忆' }}</button></div>

    <BaseDialog :open="mode !== null" :title="mode === 'create' ? '记一张卡片' : mode === 'edit' ? '编辑记忆' : detail?.title || '记忆详情'"
      :wide="true" :busy="operationPending" @close="closeDialog">
      <div v-if="mode === 'detail'">
        <div v-if="detailLoading" class="loading-state" role="status">正在读取卡片…</div>
        <template v-else-if="detail">
          <div class="detail-meta"><span class="badge green">仅自己可见</span>
            <span v-if="detail.archived" class="badge gray">已归档</span>
            <span class="muted">{{ readableDate(detail.updatedAt) }}</span></div>
          <p class="detail-body">{{ detail.body }}</p>
          <div class="detail-tags"><span v-if="detail.category" class="badge">{{ categoryLabels[detail.category] }}</span>
            <span v-for="item in detail.tags" :key="item" class="badge"># {{ item }}</span></div>
          <p class="detail-line"><strong>来源</strong>{{ sourceLabels[detail.sourceType] }}</p>
          <p v-if="detail.sourceDate" class="detail-line"><strong>来源日期</strong>{{ detail.sourceDate }}</p>
          <p v-if="detail.nextAction" class="detail-line"><strong>下次行动</strong><span class="detail-body">{{ detail.nextAction }}</span></p>
          <div v-if="confirmDelete" class="inline-note peach mt-16"><p>删除后，这张卡片将无法从页面恢复。确定删除？</p>
            <button class="btn danger mt-16" :disabled="operationPending" @click="removeMemory">确认删除</button>
            <button class="text-button" @click="confirmDelete = false">再想一下</button></div>
          <div v-else class="dialog-actions"><button class="text-button danger" @click="confirmDelete = true">删除</button>
            <button class="btn secondary" :disabled="operationPending" @click="toggleArchived">
              {{ detail.archived ? '恢复到记忆' : '归档' }}</button>
            <button class="btn primary" @click="editMemory">编辑卡片</button></div>
        </template>
        <p v-if="detailError" class="form-error mt-16" role="alert">{{ detailError }}</p>
      </div>
      <form v-else-if="mode === 'create' || mode === 'edit'" class="form-stack" @submit.prevent="saveMemory">
        <div class="field"><label for="memory-title">标题 <small>可选</small></label>
          <input id="memory-title" v-model="draft.title" maxlength="100" placeholder="给这件小事取个名字" /></div>
        <div class="field"><label for="memory-body">记下的内容</label>
          <textarea id="memory-body" v-model="draft.body" maxlength="5000" required rows="6" placeholder="你想记住什么？" /></div>
        <div class="form-grid"><div class="field"><label for="memory-category">类别 <small>可选</small></label>
          <select id="memory-category" v-model="draft.category"><option value="">不分类</option>
            <option v-for="(label, value) in categoryLabels" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="field"><label for="memory-source">信息来源</label>
            <select id="memory-source" v-model="draft.sourceType">
              <option v-for="(label, value) in sourceLabels" :key="value" :value="value">{{ label }}</option></select></div></div>
        <div class="field"><label for="memory-tags">标签 <small>可选，用逗号分隔</small></label>
          <input id="memory-tags" v-model="draft.tagsText" placeholder="例如：散步，饮食" /></div>
        <div class="field"><label for="memory-date">来源日期 <small>可选</small></label>
          <input id="memory-date" v-model="draft.sourceDate" type="date" /></div>
        <div class="field"><label for="memory-next">下次行动 <small>可选</small></label>
          <textarea id="memory-next" v-model="draft.nextAction" maxlength="5000" rows="2" /></div>
        <div class="inline-note">这张卡片只对你自己可见。分享与提醒功能将在后端支持后接入。</div>
        <p v-if="detailError" class="form-error" role="alert">{{ detailError }}</p>
        <div v-if="latestVersion" class="inline-note peach"><p>卡片在其他位置发生了变化。当前输入已保留。</p>
          <button type="button" class="text-button" @click="useLatestVersion">使用最新版本后核对并重试</button></div>
        <div class="dialog-actions"><button type="button" class="btn secondary" @click="closeDialog">取消</button>
          <button type="submit" class="btn primary" :disabled="operationPending">{{ operationPending ? '正在保存…' : '保存卡片' }}</button></div>
      </form>
    </BaseDialog>
  </AppShell>
</template>
