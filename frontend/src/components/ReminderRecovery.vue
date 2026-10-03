<script setup lang="ts">
import ReminderDraftFields from './ReminderDraftFields.vue'
import type { ReminderDraft } from '../reminderCreate'
import type { ReminderDetail } from '../reminders'
import { reminderStatusLabels } from '../reminders'

defineProps<{ draft: ReminderDraft; timezone: string; mailAvailable: boolean; error: string;
  review: ReminderDetail | null; pending: boolean; prefix: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="reminder-recovery inline-note peach mt-16">
    <p class="form-error" role="alert">{{ error }}</p>
    <p v-if="review" class="mt-8">服务端已有{{ reminderStatusLabels[review.status] }}提醒，修订号 {{ review.revision }}。
      请先在详情核对；这里不会覆盖它。</p>
    <ReminderDraftFields :prefix="prefix" :timezone="timezone" :mail-available="mailAvailable"
      v-model:mode="draft.mode" v-model:local="draft.local" v-model:offset="draft.offset" />
    <button type="button" class="btn secondary mt-16" :disabled="pending || !!review" @click="$emit('retry')">
      {{ pending ? '正在核对提醒…' : '只重试提醒' }}</button>
  </div>
</template>
