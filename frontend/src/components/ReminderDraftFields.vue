<script setup lang="ts">
import { computed } from 'vue'
import { localCandidates } from '../time'
import type { ReminderDraftMode } from '../reminderCreate'

const props = defineProps<{ prefix: string; timezone: string; mailAvailable: boolean }>()
const mode = defineModel<ReminderDraftMode>('mode', { required: true })
const local = defineModel<string>('local', { required: true })
const offset = defineModel<string>('offset', { required: true })
const candidates = computed(() => {
  if (!local.value) return []
  try { return localCandidates(local.value, props.timezone) }
  catch { return [] }
})
</script>

<template>
  <fieldset class="reminder-draft-fields"><legend>自己的到时提醒 <small>可选</small></legend>
    <div class="field"><label :for="`${prefix}-mode`">到时怎样提醒我</label>
      <select :id="`${prefix}-mode`" v-model="mode"><option value="NONE">不通知</option>
        <option value="IN_APP">站内通知</option>
        <option value="IN_APP_AND_MAIL" :disabled="!mailAvailable">站内通知 + 邮件通知{{ mailAvailable ? '' : '（当前不可用）' }}</option></select></div>
    <template v-if="mode !== 'NONE'"><div class="field"><label :for="`${prefix}-time`">提醒时间（{{ timezone }}）</label>
      <input :id="`${prefix}-time`" v-model="local" type="datetime-local" required @input="offset = ''" />
      <p v-if="local && !candidates.length" class="form-error">这个当地时刻不存在，请另选时间。</p></div>
      <div v-if="candidates.length > 1" class="field"><label :for="`${prefix}-offset`">选择 UTC 偏移</label>
        <select :id="`${prefix}-offset`" v-model="offset" required><option value="">请选择</option>
          <option v-for="candidate in candidates" :key="candidate.instant" :value="candidate.offset">
            UTC{{ candidate.offset }} · {{ candidate.instant }}</option></select></div></template>
    <p class="field-help">不设置就不会创建提醒。过去时间可设置，将由后端在下次扫描时处理。</p>
    <p v-if="!mailAvailable" class="field-help">邮件通知尚未启用，目前可使用站内提醒。</p>
  </fieldset>
</template>
