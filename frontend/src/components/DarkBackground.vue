<script setup>
</script>

<template>
  <div class="dark-bg-layer">
     <div class="blue-beam"></div>
  </div>
</template>

<style scoped>
.dark-bg-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    --bg-base: #eef2f8;
    --light-overlay-opacity: 1;
    --beam-opacity: 0.18;
    --beam-soft-opacity: 0.08;
    --beam-blur: 22px;
    --beam-animate: none;
    --beam-will-change: auto;
    background: var(--bg-base);
    overflow: hidden;
    z-index: 0;
    pointer-events: none;
    display: block;
    contain: paint;
}

:global(html.dark) .dark-bg-layer {
    --bg-base: radial-gradient(circle at 26% 16%, #0d1527 0%, #070d1a 52%, #03070f 100%);
    --light-overlay-opacity: 0;
    --beam-opacity: 0.82;
    --beam-soft-opacity: 0.4;
    --beam-blur: 30px;
    --beam-animate: beamDrift 24s ease-in-out infinite alternate;
    --beam-will-change: transform;
}

.dark-bg-layer::before {
    content: '';
    position: absolute;
    inset: -18%;
    opacity: var(--light-overlay-opacity);
    background:
        radial-gradient(
            66% 52% at 16% 12%,
            rgba(255, 255, 255, 0.78) 0%,
            rgba(255, 255, 255, 0.22) 40%,
            rgba(255, 255, 255, 0) 76%
        ),
        radial-gradient(
            52% 46% at 84% 24%,
            rgba(169, 208, 255, 0.42) 0%,
            rgba(169, 208, 255, 0.1) 42%,
            rgba(169, 208, 255, 0) 74%
        ),
        linear-gradient(
            140deg,
            rgba(255, 255, 255, 0.3) 0%,
            rgba(255, 255, 255, 0.1) 42%,
            rgba(255, 255, 255, 0) 68%
        );
}

.blue-beam {
    position: absolute;
    right: -12%;
    bottom: -30%;
    width: min(90vw, 1080px);
    height: min(58vh, 620px);
    border-radius: 999px;
    background: radial-gradient(
        ellipse at 38% 54%,
        rgba(124, 219, 255, var(--beam-opacity)) 0%,
        rgba(89, 184, 255, var(--beam-soft-opacity)) 36%,
        rgba(40, 122, 210, 0.12) 58%,
        rgba(8, 18, 35, 0) 78%
    );
    transform: rotate(-14deg) translate3d(0, 0, 0);
    filter: blur(var(--beam-blur));
    animation: var(--beam-animate);
    will-change: var(--beam-will-change);
    opacity: 1;
}

@media (max-width: 768px) {
    .blue-beam {
        right: -30%;
        bottom: -36%;
        width: min(118vw, 920px);
        height: min(52vh, 460px);
        filter: blur(calc(var(--beam-blur) - 8px));
    }
}

@media (prefers-reduced-motion: reduce) {
    .blue-beam {
        animation: none;
    }
}

@keyframes beamDrift {
    0% {
        transform: rotate(-14deg) translate3d(-2%, 0, 0) scale(0.98);
    }
    50% {
        transform: rotate(-12deg) translate3d(4%, -3%, 0) scale(1.02);
    }
    100% {
        transform: rotate(-15deg) translate3d(1%, 2%, 0) scale(1);
    }
}
</style>
