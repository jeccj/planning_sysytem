<script setup>
import { RouterView } from 'vue-router'
import DarkBackground from './components/DarkBackground.vue'
</script>

<template>
  <DarkBackground />
  <RouterView />
</template>

<style>
/* Force Root Reset */
html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100dvh;
    min-height: 100dvh;
    background: transparent !important; /* Let DarkBackground component show */
    overflow: hidden;
    overscroll-behavior: none;
}
body {
  color: var(--text-primary);
}
#app {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
}
#app > :not(.dark-bg-layer) {
  position: relative;
  z-index: 1;
}
</style>
