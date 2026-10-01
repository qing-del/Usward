<script setup lang="ts">
import { computed } from 'vue'
import type { AvatarStyle } from '../types'

const props = defineProps<{ nickname: string; avatarStyle?: AvatarStyle; small?: boolean }>()
const mark = computed(() => ({ INITIAL: [...props.nickname].at(-1) ?? '我',
  FLOWER: '✿', SUN: '☼', SPROUT: '芽' })[props.avatarStyle ?? 'INITIAL'])
</script>

<template>
  <span class="avatar" :class="[`avatar-${(avatarStyle ?? 'INITIAL').toLowerCase()}`, { 'avatar-small': small }]"
    role="img" :aria-label="`${nickname}的头像`">{{ mark }}</span>
</template>
