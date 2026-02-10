<script setup>
</script>

<template>
  <div class="dark-bg-layer">
     <div class="glow-orb"></div>
  </div>
</template>

<style scoped>
.dark-bg-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #000000;
    z-index: -1; /* Moved up from -9999 */
    pointer-events: none;
    display: none;
}

/* Only show in dark mode */
:global(html.dark) .dark-bg-layer {
    display: block !important;
}

.glow-orb {
    position: absolute;
    bottom: -150px;
    right: -150px;
    width: 800px;
    height: 800px;
    border-radius: 50%;
    /* Stronger Blue Glow */
    background: radial-gradient(circle, rgba(64, 82, 181, 0.8) 0%, rgba(0, 0, 0, 0) 70%);
    filter: blur(100px);
}
</style>
