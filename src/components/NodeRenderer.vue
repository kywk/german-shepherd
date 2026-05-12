<script setup lang="ts">
import { computed } from 'vue'
import type { DiagramNode, DiffState } from '@/types/index'
import { NODE_TYPE_CATEGORY, NODE_TYPE_ICONS } from '@/types/index'

const props = defineProps<{
  node: DiagramNode
  x: number
  y: number
  w: number
  h: number
  theme: 'simple' | 'icon' | 'image'
  showTags: boolean
  isLintWarning?: boolean
  diffState?: DiffState
  isSelected?: boolean
}>()

const category = computed(() => NODE_TYPE_CATEGORY[props.node.type] ?? 'server')
const colorVar = computed(() => `var(--node-${category.value})`)

// icon theme: fa class → unicode codepoint map
const FA_UNICODE: Record<string, string> = {
  'fa-mobile-screen': '\uf3cf',
  'fa-globe': '\uf0ac',
  'fa-shield-halved': '\ue23b',
  'fa-shield': '\uf132',
  'fa-arrows-split-up-and-left': '\ue4bc',
  'fa-hard-drive': '\uf0a0',
  'fa-server': '\uf233',
  'fa-building': '\uf1ad',
  'fa-database': '\uf1c0',
}

function getIconChar(node: DiagramNode): string {
  const cls = NODE_TYPE_ICONS[node.type] ?? ''
  const name = cls.split(' ').find(c => c.startsWith('fa-') && c !== 'fa-solid') ?? ''
  return FA_UNICODE[name] ?? '\uf059'
}
</script>

<template>
  <g
    class="node-group"
    :transform="`translate(${x}, ${y})`"
    role="img"
    :aria-label="node.name"
  >
    <!-- Background rect -->
    <rect
      :width="w"
      :height="h"
      rx="6"
      :fill="diffState && diffState !== 'unchanged' ? `var(--diff-${diffState})` : colorVar"
      :fill-opacity="diffState && diffState !== 'unchanged' ? 0.35 : 0.18"
      :stroke="isSelected ? 'var(--color-accent)' : (isLintWarning ? 'var(--lint-error)' : (diffState && diffState !== 'unchanged' ? `var(--diff-${diffState})` : colorVar))"
      :stroke-width="isSelected ? 2.5 : (diffState && diffState !== 'unchanged' ? 3 : (isLintWarning ? 2 : 1))"
      :stroke-dasharray="isLintWarning ? '4 3' : (diffState === 'removed' ? '6 3' : 'none')"
    />

    <!-- icon theme: icon + name below -->
    <template v-if="theme === 'icon' || theme === 'image'">
      <text
        :x="w / 2"
        :y="h * 0.42"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="'Font Awesome 6 Free'"
        font-weight="900"
        font-size="20"
        :fill="colorVar"
      >{{ getIconChar(node) }}</text>
      <text
        :x="w / 2"
        :y="h * 0.72"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="11"
        font-weight="600"
        fill="var(--color-text-primary)"
      >{{ node.name }}</text>
      <text
        v-if="node.type"
        :x="w / 2"
        :y="h * 0.88"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="9"
        fill="var(--color-text-muted)"
      >{{ node.type }}</text>
    </template>

    <!-- simple theme -->
    <template v-else>
      <text
        :x="w / 2"
        :y="node.note || (showTags && node.tags?.length) ? h * 0.32 : h / 2 - 6"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="12"
        font-weight="700"
        fill="var(--color-text-primary)"
      >{{ node.name }}</text>
      <text
        :x="w / 2"
        :y="node.note || (showTags && node.tags?.length) ? h * 0.52 : h / 2 + 10"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="10"
        fill="var(--color-text-muted)"
      >{{ node.type }}</text>
      <text
        v-if="node.note"
        :x="w / 2"
        :y="h * 0.72"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="9"
        font-style="italic"
        fill="var(--color-text-muted)"
      >{{ node.note }}</text>
      <!-- Tags -->
      <template v-if="showTags && node.tags?.length">
        <g v-for="(tag, i) in node.tags" :key="tag">
          <rect
            :x="w / 2 - 28 + i * 58"
            :y="h - 18"
            width="54"
            height="13"
            rx="6"
            fill="var(--color-accent)"
            fill-opacity="0.25"
          />
          <text
            :x="w / 2 - 1 + i * 58"
            :y="h - 11"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="8"
            fill="var(--color-accent)"
          >{{ tag }}</text>
        </g>
      </template>
    </template>

    <!-- Lint warning icon -->
    <text
      v-if="isLintWarning"
      :x="w - 10"
      :y="10"
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="11"
      fill="var(--lint-error)"
    >⚠</text>
  </g>
</template>

<style scoped>
.node-group {
  cursor: pointer;
  transition: filter 0.15s;
}
.node-group:hover {
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.35)) brightness(1.1);
}
</style>
