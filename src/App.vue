<script setup lang="ts">
import { usePreferredDark } from '@vueuse/core'
import { watchEffect } from 'vue'

const prefersDark = usePreferredDark()
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', prefersDark.value ? 'dark' : 'light')
})
</script>

<template>
  <div class="app-container">
    <div class="panel">
      <div class="panel-header">
        <span class="brand-logo">
          <i class="fa-solid fa-diagram-project"></i>
          German Shepherd
        </span>
      </div>
      <div class="panel-content">
        <p>Editor panel</p>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Preview</span>
      </div>
      <div class="panel-content">
        <p>SVG preview</p>
      </div>
    </div>
  </div>
</template>
