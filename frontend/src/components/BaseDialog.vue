<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean; busy?: boolean }>(), {
  wide: false, busy: false,
})
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let previousOverflow = ''

watch(() => props.open, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    const focus = panel.value?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select, button')
    ;(focus ?? panel.value)?.focus()
  } else {
    document.body.style.overflow = previousOverflow
    previousFocus?.focus()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  previousFocus?.focus()
})

function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) { emit('close'); return }
  if (event.key !== 'Tab' || !panel.value) return
  const focusable = [...panel.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
  )].filter(element => element.offsetParent !== null)
  if (!focusable.length) { event.preventDefault(); panel.value.focus(); return }
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="!busy && emit('close')">
      <section ref="panel" class="dialog" :class="{ wide }" role="dialog" aria-modal="true"
        :aria-label="title" tabindex="-1" @keydown="keydown">
        <div class="dialog-header"><div><span class="eyebrow">KEEP A LITTLE THING</span><h2>{{ title }}</h2></div>
          <button class="icon-button" type="button" aria-label="关闭对话框" :disabled="busy" @click="emit('close')">×</button></div>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
