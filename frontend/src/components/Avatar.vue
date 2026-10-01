<script setup lang="ts">
import { computed } from 'vue'
import type { AvatarStyle } from '../types'

const props = defineProps<{ nickname: string; style?: AvatarStyle; small?: boolean }>()
const mark = computed(() => ({ INITIAL: [...props.nickname].at(-1) ?? '我',
  FLOWER: '✿', SUN: '☼', SPROUT: '芽' })[props.style ?? 'INITIAL'])
</script>

<template>
  <span class="avatar" :class="[`avatar-${(style ?? 'INITIAL').toLowerCase()}`, { 'avatar-small': small }]"
    role="img" :aria-label="`${nickname}的头像`">{{ mark }}</span>
</template>
