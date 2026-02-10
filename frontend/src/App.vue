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
    height: 100%;
    background: transparent !important; /* Let DarkBackground component show */
}
body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}
</style>
