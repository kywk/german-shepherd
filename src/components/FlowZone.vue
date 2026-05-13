<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { computed } from 'vue'

const props = defineProps<NodeProps>()

const zoneData = computed(() => props.data as {
  name: string
  depth: number
  color: string
  w: number
  h: number
})
</script>

<template>
  <div
    class="gs-zone"
    :class="{ 'top-level': zoneData.depth === 0 }"
    :style="{
      width: zoneData.w + 'px',
      height: zoneData.h + 'px',
      borderColor: zoneData.depth === 0 ? 'var(--color-text-muted)' : zoneData.color,
      backgroundColor: zoneData.depth === 0 ? 'transparent' : `color-mix(in srgb, ${zoneData.color} 8%, transparent)`,
    }"
  >
    <!-- Handles for sub-zones so edges can connect to the group boundary -->
    <template v-if="zoneData.depth > 0">
      <Handle type="source" :position="Position.Top" :id="`${props.id}-top`" />
      <Handle type="source" :position="Position.Bottom" :id="`${props.id}-bottom`" />
      <Handle type="source" :position="Position.Left" :id="`${props.id}-left`" />
      <Handle type="source" :position="Position.Right" :id="`${props.id}-right`" />
      <Handle type="target" :position="Position.Top" :id="`${props.id}-top`" />
      <Handle type="target" :position="Position.Bottom" :id="`${props.id}-bottom`" />
      <Handle type="target" :position="Position.Left" :id="`${props.id}-left`" />
      <Handle type="target" :position="Position.Right" :id="`${props.id}-right`" />
    </template>

    <div
      class="zone-header"
      :class="{ 'top-level-header': zoneData.depth === 0 }"
      :style="{ backgroundColor: zoneData.depth === 0 ? 'transparent' : `color-mix(in srgb, ${zoneData.color} 25%, transparent)` }"
    >
      {{ zoneData.name }}
    </div>
  </div>
</template>

<style scoped>
.gs-zone {
  border-radius: 8px;
  border: 1px solid;
  position: relative;
}

.gs-zone.top-level {
  border: none;
  border-left: 1.5px dashed var(--color-text-muted);
  border-radius: 0;
  opacity: 0.7;
}

.zone-header {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary);
  border-radius: 8px 8px 0 0;
}

.top-level-header {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 0;
  border-radius: 0;
}
</style>
