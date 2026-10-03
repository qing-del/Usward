<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import BaseDialog from '../components/BaseDialog.vue'
import ReminderEditor from '../components/ReminderEditor.vue'
import ReminderDraftFields from '../components/ReminderDraftFields.vue'
import ReminderRecovery from '../components/ReminderRecovery.vue'
import { ApiError, errorMessage } from '../api'
import { cancelCommitment, commitmentDueLabel, commitmentSourceLink, completeCommitment,
  createCommitment, deleteCommitment, getCommitment, listCommitments, patchCommitment,
  reopenCommitment, statusLabels } from '../commitments'
import type { CommitmentDetail, CommitmentSort, CommitmentStatusFilter,
  CommitmentSummary } from '../commitments'
import { commitmentDraftFromDetail, createCommitmentValues, emptyCommitmentDraft,
  patchCommitmentValues } from '../commitmentWrite'
import type { CommitmentDraft, CommitmentPatch, CommitmentSource,
  CommitmentWrite } from '../commitmentWrite'
import { session } from '../session'
import { useCreatedReminder } from '../useCreatedReminder'
import { localCandidates } from '../time'

const route = useRoute()
const router = useRouter()
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
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const editVersion = ref('')
const originalDraft = ref<CommitmentDraft | null>(null)
const draft = reactive<CommitmentDraft>(emptyCommitmentDraft(session.user?.timezone ?? 'Asia/Shanghai'))
const source = ref<CommitmentSource | null>(null)
const removeSource = ref(false)
const formPending = ref(false)
const formError = ref('')
const latest = ref<CommitmentDetail | null>(null)
type ActionMode = 'complete' | 'cancel' | 'reopen' | 'delete'
const actionMode = ref<ActionMode | null>(null)
const actionVersion = ref('')
const actionPending = ref(false)
const actionError = ref('')
const actionLatest = ref<CommitmentDetail | null>(null)
const resultDraft = ref('')
const timezone = computed(() => session.user?.timezone ?? 'Asia/Shanghai')
const mailAvailable = computed(() => !!session.user?.mailReminderAvailable && !!session.user.notificationEmail)
const { draft: reminderDraft, pendingId: pendingReminderId, pending: reminderPending,
  error: reminderError, review: reminderReview, reset: resetCreatedReminder,
  validate: validateCreatedReminder, apply: applyCreatedReminder, retry: retryReminder,
  clearPending: clearPendingReminder } = useCreatedReminder('COMMITMENT', () => timezone.value,
  () => mailAvailable.value)
const dueCandidates = computed(() => {
  if (!draft.dueLocal) return []
  try { return localCandidates(draft.dueLocal, timezone.value) }
  catch { return [] }
})
const actionAllowed = computed(() => !detail.value || !actionMode.value
  || actionMode.value === 'delete'
  || (actionMode.value === 'reopen' ? detail.value.status !== 'OPEN' : detail.value.status === 'OPEN'))
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
    if (session.user) session.user.stats.openCommitmentCount = result.statusCounts.OPEN
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
  if (route.query.new === '1') {
    const type = route.query.sourceType
    const id = route.query.sourceId
    const linked = (type === 'MEMORY_CARD' || type === 'CALENDAR_EVENT')
      && typeof id === 'string' && /^[1-9]\d*$/.test(id)
    openCreate(linked ? { sourceType: type, sourceId: id } : null)
  } else if (typeof route.query.commitment === 'string' && /^[1-9]\d*$/.test(route.query.commitment)) {
    openDetail(route.query.commitment)
  }
})
onBeforeUnmount(() => controller?.abort())

async function openDetail(id: string) {
  detailOpen.value = true
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  actionMode.value = null
  try { detail.value = await getCommitment(id) }
  catch (cause) {
    detailError.value = cause instanceof ApiError && cause.status === 404
      ? '这条承诺已不可访问。请返回列表查看最新内容。' : errorMessage(cause)
  } finally { detailLoading.value = false }
}

function closeDetail() { detailOpen.value = false; detail.value = null; actionMode.value = null }
function reminderChanged(value: CommitmentDetail['myReminder']) {
  if (detail.value) detail.value = { ...detail.value, myReminder: value }
  if (value) clearPendingReminder()
}
async function retryCreatedReminder() {
  const reminder = await retryReminder()
  if (detail.value && reminder) detail.value = { ...detail.value, myReminder: reminder }
  else if (detail.value && reminderReview.value) {
    detail.value = { ...detail.value, myReminder: reminderReview.value }
  }
}
function dueLabel(item: CommitmentSummary | CommitmentDetail) {
  return commitmentDueLabel(item, timezone.value)
}

function openCreate(linkedSource: CommitmentSource | null = null) {
  Object.assign(draft, emptyCommitmentDraft(timezone.value))
  source.value = linkedSource
  removeSource.value = false
  editingId.value = null
  originalDraft.value = null
  editVersion.value = ''
  formError.value = ''
  latest.value = null
  resetCreatedReminder()
  formOpen.value = true
}

function openEdit() {
  if (!detail.value) return
  Object.assign(draft, commitmentDraftFromDetail(detail.value, timezone.value))
  originalDraft.value = { ...draft }
  editingId.value = detail.value.id
  editVersion.value = detail.value.version
  source.value = null
  removeSource.value = false
  formError.value = ''
  latest.value = null
  detailOpen.value = false
  formOpen.value = true
}

async function saveCommitment() {
  if (formPending.value) return
  formError.value = ''
  let createWrite: CommitmentWrite | null = null
  let patchWrite: CommitmentPatch | null = null
  try {
    if (editingId.value && originalDraft.value) {
      patchWrite = patchCommitmentValues(draft, originalDraft.value, timezone.value,
        editVersion.value, removeSource.value)
      if (!patchWrite) { formError.value = '当前没有需要保存的修改。'; return }
    } else createWrite = createCommitmentValues(draft, timezone.value, source.value)
  } catch (cause) { formError.value = cause instanceof Error ? cause.message : '承诺内容无效。'; return }
  let reminderPlan: ReturnType<typeof validateCreatedReminder> = null
  if (!editingId.value) {
    try { reminderPlan = validateCreatedReminder() }
    catch (cause) { formError.value = cause instanceof Error ? cause.message : '提醒时间无效。'; return }
  }
  formPending.value = true
  try {
    const creating = !editingId.value
    const saved = editingId.value && patchWrite
      ? await patchCommitment(editingId.value, patchWrite)
      : await createCommitment(createWrite!)
    detail.value = saved
    detailError.value = ''
    latest.value = null
    formOpen.value = false
    detailOpen.value = true
    if (!editingId.value) await router.replace({ path: '/commitments', query: { commitment: saved.id } })
    await load(1)
    if (creating) {
      const reminder = await applyCreatedReminder(saved.id, reminderPlan)
      if (reminder) detail.value = { ...saved, myReminder: reminder }
      else if (reminderReview.value) detail.value = { ...saved, myReminder: reminderReview.value }
    }
  } catch (cause) {
    formError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT' && editingId.value) {
      try { latest.value = await getCommitment(editingId.value) }
      catch { /* Keep the user's draft. */ }
    }
  } finally { formPending.value = false }
}

function adoptLatestVersion() {
  if (!latest.value) return
  editVersion.value = latest.value.version
  latest.value = null
  formError.value = '请核对当前输入，然后再次保存。'
}

function beginAction(mode: ActionMode) {
  if (!detail.value) return
  actionMode.value = mode
  actionVersion.value = detail.value.version
  actionError.value = ''
  actionLatest.value = null
  resultDraft.value = ''
}

async function performAction() {
  if (!detail.value || !actionMode.value || actionPending.value || !actionAllowed.value) return
  actionError.value = ''
  if ([...resultDraft.value.trim()].length > 5000) {
    actionError.value = '完成记录不能超过 5000 个字。'
    return
  }
  actionPending.value = true
  try {
    const id = detail.value.id
    const version = actionVersion.value
    if (actionMode.value === 'delete') {
      await deleteCommitment(id, version)
      closeDetail()
    } else {
      const saved = actionMode.value === 'complete'
        ? await completeCommitment(id, version, resultDraft.value.trim() || null)
        : actionMode.value === 'cancel'
          ? await cancelCommitment(id, version)
          : await reopenCommitment(id, version)
      detail.value = saved
      actionMode.value = null
    }
    actionLatest.value = null
    await load(1)
  } catch (cause) {
    actionError.value = errorMessage(cause)
    if (cause instanceof ApiError && cause.status === 409 && detail.value) {
      try { actionLatest.value = await getCommitment(detail.value.id) }
      catch { /* Keep the completion draft and error visible. */ }
    }
  } finally { actionPending.value = false }
}

function adoptLatestActionVersion() {
  if (!actionLatest.value) return
  detail.value = actionLatest.value
  actionVersion.value = actionLatest.value.version
  actionLatest.value = null
  actionError.value = actionAllowed.value
    ? '请核对当前操作，然后再次提交。' : '最新状态不支持此操作，请返回详情。'
}
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><span class="eyebrow">A PROMISE TO KEEP</span>
      <h1 class="serif">答应的事，慢慢做到。</h1>
      <p class="subtitle">只写下自己的下一步，让心意落在日常里。</p></div>
      <button class="btn primary" @click="openCreate()">＋ 写下我的下一步</button></div>
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

    <BaseDialog :open="detailOpen" :title="detail?.title || '承诺详情'" :wide="true"
      :busy="actionPending" @close="closeDetail">
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
        <ReminderRecovery v-if="pendingReminderId === detail.id" :draft="reminderDraft"
          :timezone="timezone" :mail-available="mailAvailable" :error="reminderError"
          :review="reminderReview" :pending="reminderPending" prefix="commitment-retry" @retry="retryCreatedReminder" />
        <ReminderEditor v-if="detail.status === 'OPEN'" :key="detail.id" resource-type="COMMITMENT"
          :resource-id="detail.id" :reminder="detail.myReminder" @changed="reminderChanged" />
        <div v-if="actionMode" class="inline-note peach mt-16">
          <p v-if="actionMode === 'complete'">记为完成后，可以留下自己的完成记录。完成不代表所有感受已经解决。</p>
          <p v-else-if="actionMode === 'cancel'">确定取消这条承诺？之后仍可重新打开。</p>
          <p v-else-if="actionMode === 'reopen'">重新打开会清空原完成记录。确定继续？</p>
          <p v-else>删除后，这条承诺将无法从页面恢复。确定删除？</p>
          <div v-if="actionMode === 'complete'" class="field mt-16"><label for="commitment-result">完成记录 <small>可选</small></label>
            <textarea id="commitment-result" v-model="resultDraft" maxlength="5000" rows="3" /></div>
          <p v-if="actionError" class="form-error mt-16" role="alert">{{ actionError }}</p>
          <div v-if="actionLatest" class="inline-note mt-16"><p>最新版本：<strong>{{ actionLatest.title }}</strong> · {{ statusLabels[actionLatest.status] }} · {{ dueLabel(actionLatest) }}</p>
            <p v-if="actionLatest.result" class="detail-body">完成记录：{{ actionLatest.result }}</p>
            <button class="text-button" @click="adoptLatestActionVersion">使用最新版本后核对</button></div>
          <div class="dialog-actions mt-16"><button class="btn secondary" :disabled="actionPending" @click="actionMode = null">返回详情</button>
            <button class="btn" :class="actionMode === 'delete' ? 'danger' : 'primary'"
              :disabled="actionPending || !actionAllowed || !!actionLatest" @click="performAction">
              {{ actionPending ? '正在提交…' : actionMode === 'complete' ? '确认完成' : actionMode === 'cancel' ? '确认取消' : actionMode === 'reopen' ? '确认重新打开' : '确认删除' }}</button></div></div>
        <div v-else class="dialog-actions"><button class="text-button danger" @click="beginAction('delete')">删除</button>
          <button v-if="detail.status === 'OPEN'" class="btn secondary" @click="beginAction('cancel')">取消承诺</button>
          <button v-if="detail.status !== 'OPEN'" class="btn secondary" @click="beginAction('reopen')">重新打开</button>
          <button class="btn soft" @click="openEdit">编辑承诺</button>
          <button v-if="detail.status === 'OPEN'" class="btn primary" @click="beginAction('complete')">记为完成</button></div>
      </template>
      <p v-if="detailError" class="form-error" role="alert">{{ detailError }}</p>
    </BaseDialog>
    <BaseDialog :open="formOpen" :title="editingId ? '编辑承诺' : '写下我的下一步'"
      :wide="true" :busy="formPending" @close="formOpen = false">
      <form class="form-stack" @submit.prevent="saveCommitment">
        <div class="field"><label for="commitment-title">标题</label>
          <input id="commitment-title" v-model="draft.title" maxlength="100" required
            placeholder="写下自己愿意做的一件事" /></div>
        <div class="field"><label for="commitment-body">说明 <small>可选</small></label>
          <textarea id="commitment-body" v-model="draft.body" maxlength="5000" rows="4" /></div>
        <div class="field"><label for="commitment-next">下一步 <small>可选</small></label>
          <textarea id="commitment-next" v-model="draft.nextAction" maxlength="5000" rows="2" /></div>
        <div class="field"><label for="commitment-due-kind">截止方式</label>
          <select id="commitment-due-kind" v-model="draft.dueKind"><option value="NONE">不设截止</option>
            <option value="DATE">只设日期</option><option value="INSTANT">精确时间</option></select></div>
        <div v-if="draft.dueKind === 'DATE'" class="form-grid">
          <div class="field"><label for="commitment-due-date">截止日期</label>
            <input id="commitment-due-date" v-model="draft.dueDate" type="date" required /></div>
          <div class="field"><label for="commitment-due-timezone">日期所属时区</label>
            <input id="commitment-due-timezone" v-model="draft.dueTimezone" maxlength="64" required
              placeholder="Asia/Shanghai" /></div></div>
        <div v-if="draft.dueKind === 'INSTANT'" class="field">
          <label for="commitment-due-local">精确截止时间（{{ timezone }}）</label>
          <input id="commitment-due-local" v-model="draft.dueLocal" type="datetime-local" required
            @change="draft.dueOffset = ''" />
          <p v-if="draft.dueLocal && !dueCandidates.length" class="field-help form-error">这个当地时间不存在，请另选时间。</p>
          <div v-if="dueCandidates.length > 1" class="field"><label for="commitment-due-offset">选择 UTC 偏移</label>
            <select id="commitment-due-offset" v-model="draft.dueOffset" required><option value="">请选择</option>
              <option v-for="candidate in dueCandidates" :key="candidate.instant" :value="candidate.offset">
                {{ candidate.offset }} · {{ candidate.instant }}</option></select></div></div>
        <div v-if="source && !removeSource" class="inline-note"><p>关联来源：{{ source.sourceType === 'MEMORY_CARD' ? '记忆卡片' : '个人安排' }} #{{ source.sourceId }}</p>
          <button type="button" class="text-button" @click="removeSource = true; source = null">不关联来源</button></div>
        <div v-else-if="editingId && detail?.sourceType && !removeSource" class="inline-note"><p>来源{{ detail.sourceAvailable ? '已关联' : '不可用' }}，编辑其它内容时会保留。</p>
          <button type="button" class="text-button" @click="removeSource = true">移除来源关联</button></div>
        <ReminderDraftFields v-if="!editingId" prefix="commitment-create" :timezone="timezone"
          :mail-available="mailAvailable" v-model:mode="reminderDraft.mode"
          v-model:local="reminderDraft.local" v-model:offset="reminderDraft.offset" />
        <p v-else class="field-help">要调整私人提醒，请先保存承诺，再在详情中设置。</p>
        <div class="inline-note">这条承诺目前仅自己可见。截止时间不会自动创建提醒；只有明确设置才会通知自己。</div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div v-if="latest" class="inline-note peach"><p>承诺在其他位置发生了变化。当前输入已保留。最新内容：</p>
          <p><strong>{{ latest.title }}</strong> · {{ dueLabel(latest) }}</p>
          <p v-if="latest.body" class="detail-body">{{ latest.body }}</p>
          <p v-if="latest.nextAction" class="detail-body">下一步：{{ latest.nextAction }}</p>
          <button type="button" class="text-button" @click="adoptLatestVersion">使用最新版本后核对并重试</button></div>
        <div class="dialog-actions"><button type="button" class="btn secondary" @click="formOpen = false">取消</button>
          <button type="submit" class="btn primary" :disabled="formPending">{{ formPending ? '正在保存…' : '保存承诺' }}</button></div>
      </form>
    </BaseDialog>
  </AppShell>
</template>
