<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { NODE_TYPE_CATEGORY, NODE_TYPE_ICONS } from '@/types/index'
import type { NodeType } from '@/types/index'

const props = defineProps<NodeProps>()

const nodeData = computed(() => props.data as {
  name: string
  type: NodeType
  note?: string
  tags?: string[]
  theme: 'simple' | 'icon' | 'image'
  showTags: boolean
  isLintWarning?: boolean
})

const category = computed(() => NODE_TYPE_CATEGORY[nodeData.value.type] ?? 'server')
const colorVar = computed(() => `var(--node-${category.value})`)

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

function getIconChar(): string {
  const cls = NODE_TYPE_ICONS[nodeData.value.type] ?? ''
  const name = cls.split(' ').find(c => c.startsWith('fa-') && c !== 'fa-solid') ?? ''
  return FA_UNICODE[name] ?? '\uf059'
}
</script>

<template>
  <div
    class="gs-node"
    :class="{ 'lint-warning': nodeData.isLintWarning }"
    :style="{ borderColor: colorVar, backgroundColor: `color-mix(in srgb, ${colorVar} 18%, transparent)` }"
  >
    <!-- Handles for all 4 sides (both source and target for reconnection) -->
    <Handle type="source" :position="Position.Top" :id="`${props.id}-top`" />
    <Handle type="source" :position="Position.Bottom" :id="`${props.id}-bottom`" />
    <Handle type="source" :position="Position.Left" :id="`${props.id}-left`" />
    <Handle type="source" :position="Position.Right" :id="`${props.id}-right`" />
    <Handle type="target" :position="Position.Top" :id="`${props.id}-top`" />
    <Handle type="target" :position="Position.Bottom" :id="`${props.id}-bottom`" />
    <Handle type="target" :position="Position.Left" :id="`${props.id}-left`" />
    <Handle type="target" :position="Position.Right" :id="`${props.id}-right`" />

    <template v-if="nodeData.theme === 'icon' || nodeData.theme === 'image'">
      <div class="node-icon" :style="{ color: colorVar }">{{ getIconChar() }}</div>
      <div class="node-name">{{ nodeData.name }}</div>
      <div class="node-type-small">{{ nodeData.type }}</div>
    </template>

    <template v-else>
      <div class="node-name">{{ nodeData.name }}</div>
      <div class="node-type">{{ nodeData.type }}</div>
      <div v-if="nodeData.note" class="node-note">{{ nodeData.note }}</div>
      <div v-if="nodeData.showTags && nodeData.tags?.length" class="node-tags">
        <span v-for="tag in nodeData.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
    </template>

    <span v-if="nodeData.isLintWarning" class="lint-icon">⚠</span>
  </div>
</template>

<style scoped>
.gs-node {
  padding: 8px 12px;
  border: 1px solid;
  border-radius: 6px;
  min-width: 120px;
  text-align: center;
  font-size: 12px;
  position: relative;
}

.gs-node.lint-warning {
  border: 2px dashed var(--lint-error);
}

.node-icon {
  font-family: 'Font Awesome 6 Free';
  font-weight: 900;
  font-size: 20px;
  margin-bottom: 4px;
}

.node-name {
  font-weight: 700;
  font-size: 12px;
  color: var(--color-text-primary);
}

.node-type {
  font-size: 10px;
  color: var(--color-text-muted);
}

.node-type-small {
  font-size: 9px;
  color: var(--color-text-muted);
}

.node-note {
  font-size: 9px;
  font-style: italic;
  color: var(--color-text-muted);
}

.node-tags {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-top: 4px;
}

.tag {
  font-size: 8px;
  padding: 1px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-accent) 25%, transparent);
  color: var(--color-accent);
}

.lint-icon {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 11px;
  color: var(--lint-error);
}
</style>
