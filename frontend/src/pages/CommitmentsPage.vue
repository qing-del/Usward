<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import BaseDialog from '../components/BaseDialog.vue'
import { ApiError, errorMessage } from '../api'
import { commitmentDueLabel, commitmentSourceLink, getCommitment, listCommitments,
  statusLabels } from '../commitments'
import type { CommitmentDetail, CommitmentSort, CommitmentStatusFilter,
  CommitmentSummary } from '../commitments'
import { session } from '../session'

const route = useRoute()
const allowedStatuses: CommitmentStatusFilter[] = ['OPEN', 'DONE', 'CANCELLED', 'ALL']
const status = ref<CommitmentStatusFilter>(allowedStatuses.includes(route.query.status as CommitmentStatusFilter)
  ? route.query.status as CommitmentStatusFilter : 'OPEN')
const sort = ref<CommitmentSort>('DEADLINE_ASC')
const items = ref<CommitmentSummary[]>([])
const counts = ref({ OPEN: 0, DONE: 0, CANCELLED: 0 })
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const listError = ref('')
const detailOpen = ref(false)
const detail = ref<CommitmentDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
let controller: AbortController | null = null
let sequence = 0

async function load(targetPage: number) {
  controller?.abort()
  controller = new AbortController()
  const current = ++sequence
  if (targetPage === 1) {
    loading.value = true
    items.value = []
    listError.value = ''
  } else loadingMore.value = true
  try {
    const result = await listCommitments({ status: status.value, sort: sort.value,
      page: targetPage, size: 20 }, controller.signal)
    if (current !== sequence) return
    items.value = targetPage === 1 ? result.items : [...items.value, ...result.items]
    counts.value = result.statusCounts
    total.value = result.total
    page.value = result.page
    hasMore.value = result.hasMore
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    if (current === sequence) listError.value = errorMessage(cause)
  } finally {
    if (current === sequence) { loading.value = false; loadingMore.value = false }
  }
}

watch([status, sort], () => load(1))
onMounted(() => {
  load(1)
  if (typeof route.query.commitment === 'string' && /^[1-9]\d*$/.test(route.query.commitment)) {
    openDetail(route.query.commitment)
  }
})
onBeforeUnmount(() => controller?.abort())

async function openDetail(id: string) {
  detailOpen.value = true
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  try { detail.value = await getCommitment(id) }
  catch (cause) {
    detailError.value = cause instanceof ApiError && cause.status === 404
      ? '这条承诺已不可访问。请返回列表查看最新内容。' : errorMessage(cause)
  } finally { detailLoading.value = false }
}

function closeDetail() { detailOpen.value = false; detail.value = null }
function dueLabel(item: CommitmentSummary | CommitmentDetail) {
  return commitmentDueLabel(item, timezone.value)
}
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">A PROMISE TO KEEP</span>
      <h1 class="serif">答应的事，慢慢做到。</h1>
      <p class="subtitle">只写下自己的下一步，让心意落在日常里。</p></div></div>
    <div class="commitment-intro"><span class="commitment-intro-mark">✿</span>
      <p><strong>下一步，是我愿意做的事。</strong><br /><small>现在的承诺仅自己可见；完成记录不代表所有感受已经解决。</small></p></div>
    <div class="toolbar commitment-toolbar"><div class="tabs" aria-label="承诺状态">
      <button v-for="choice in allowedStatuses" :key="choice" class="tab" :aria-pressed="status === choice"
        @click="status = choice">{{ choice === 'ALL' ? '全部' : statusLabels[choice] }}
        <span>{{ choice === 'ALL' ? counts.OPEN + counts.DONE + counts.CANCELLED : counts[choice] }}</span></button></div>
      <div class="field commitment-sort"><label for="commitment-sort">排序</label>
        <select id="commitment-sort" v-model="sort"><option value="DEADLINE_ASC">截止时间近的优先</option>
          <option value="UPDATED_DESC">最近更新的优先</option></select></div></div>
    <p class="results-heading"><strong>{{ total }} 条承诺</strong><span>仅自己可见</span></p>
    <div v-if="loading" class="loading-state" role="status">正在查看承诺…</div>
    <div v-else-if="listError" class="empty-state"><p class="form-error" role="alert">{{ listError }}</p>
      <button class="btn secondary mt-16" @click="load(1)">重试</button></div>
    <div v-else-if="!items.length" class="empty-state"><span class="empty-mark">✿</span>
      <h3>这里暂时没有承诺</h3><p>给自己一点时间，慢慢想下一步。</p></div>
    <div v-else class="commitment-list"><article v-for="item in items" :key="item.id" class="card commitment-card">
      <button class="commitment-open" @click="openDetail(item.id)"><span class="commitment-card-top">
        <span class="badge" :class="item.status === 'OPEN' ? 'green' : 'gray'">{{ statusLabels[item.status] }}</span>
        <span class="badge">仅自己可见</span></span>
        <strong>{{ item.title }}</strong>
        <span class="commitment-due" :class="{ overdue: item.isOverdue }">{{ dueLabel(item) }}
          <em v-if="item.isOverdue"> · 已过约定时间</em><em v-else-if="item.isDueToday"> · 今天到期</em></span>
        <span v-if="item.nextAction" class="commitment-next"><small>下一步</small>{{ item.nextAction }}</span>
        <span class="text-button">查看与跟进　↗</span></button></article></div>
    <div v-if="hasMore && !loading" class="more-row"><button class="btn secondary" :disabled="loadingMore"
      @click="load(page + 1)">{{ loadingMore ? '正在加载…' : '再看 20 条承诺' }}</button></div>

    <BaseDialog :open="detailOpen" :title="detail?.title || '承诺详情'" :wide="true" @close="closeDetail">
      <div v-if="detailLoading" class="loading-state" role="status">正在读取承诺…</div>
      <template v-else-if="detail"><div class="detail-meta"><span class="badge green">仅自己可见</span>
        <span class="badge gray">{{ statusLabels[detail.status] }}</span>
        <span v-if="detail.isOverdue" class="badge peach">已过约定时间</span>
        <span v-else-if="detail.isDueToday" class="badge">今天到期</span></div>
        <p class="detail-line"><strong>截止</strong>{{ dueLabel(detail) }}</p>
        <p v-if="detail.body" class="detail-line"><strong>说明</strong><span class="detail-body">{{ detail.body }}</span></p>
        <p v-if="detail.nextAction" class="detail-line"><strong>下一步</strong><span class="detail-body">{{ detail.nextAction }}</span></p>
        <p v-if="detail.result" class="detail-line"><strong>完成记录</strong><span class="detail-body">{{ detail.result }}</span></p>
        <p v-if="detail.sourceType" class="detail-line"><strong>来源</strong>
          <RouterLink v-if="commitmentSourceLink(detail)" class="text-button" :to="commitmentSourceLink(detail)!">查看来源 ↗</RouterLink>
          <span v-else>来源不可用</span></p>
      </template>
      <p v-if="detailError" class="form-error" role="alert">{{ detailError }}</p>
    </BaseDialog>
  </AppShell>
</template>
