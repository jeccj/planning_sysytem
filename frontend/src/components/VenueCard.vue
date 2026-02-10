<script setup>
import { User, Location, Collection, ArrowRight, View } from '@element-plus/icons-vue'

defineProps({
    venue: Object
})

defineEmits(['book', 'view-detail'])
</script>

<template>
    <div class="vibrant-glass-card list-mode">
        <div class="card-glass-substrate"></div>
        <div class="card-sheen"></div>
        
        <div class="card-content-row">
            <!-- Left: Title & Type -->
            <div class="row-section title-section" @click="$emit('view-detail', venue)">
                <div class="venue-icon">
                    <img v-if="venue.image" :src="venue.image" />
                    <el-icon v-else><Collection /></el-icon>
                </div>
                <div class="text-group">
                    <h3 class="venue-name">{{ venue.name }}</h3>
                    <div class="type-pill">{{ { 'Classroom': '集思教室', 'Hall': '多功能厅', 'Lab': '创新实验室' }[venue.type] || venue.type }}</div>
                </div>
            </div>

            <!-- Middle: Info Stats -->
            <div class="row-section info-section" @click="$emit('view-detail', venue)">
                <div class="info-pill">
                    <el-icon><User /></el-icon>
                    <span>{{ venue.capacity }}人</span>
                </div>
                <div class="info-pill">
                    <el-icon><Location /></el-icon>
                    <span>{{ venue.location }}</span>
                </div>
            </div>

            <!-- Right: Facilities & Action -->
            <div class="row-section action-section">
                <div class="facilities-row d-none-mobile">
                    <span v-for="f in (venue.facilities || []).slice(0, 3)" :key="f" class="micro-tag">{{ f }}</span>
                </div>
                
                <div class="action-buttons">
                    <div class="action-btn-circle view-btn" @click.stop="$emit('view-detail', venue)" title="查看详情">
                        <el-icon><View /></el-icon>
                    </div>
                    <div class="action-btn-circle" :class="{ 'is-busy': venue.status !== 'available' }" @click.stop="$emit('book', venue)" title="预约">
                        <el-icon><ArrowRight /></el-icon>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.vibrant-glass-card {
    position: relative;
    border-radius: 28px;
    padding: 0; /* Clear padding, handled by inner row */
    min-height: 88px; /* Compact Row Height */
    cursor: pointer;
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
}

.card-glass-substrate {
    position: absolute;
    inset: 0;
    backdrop-filter: blur(25px) saturate(180%);
    -webkit-backdrop-filter: blur(25px) saturate(180%);
    background: rgba(255, 255, 255, 0.05); /* Slight base tint */
    border: none !important;
    border-radius: inherit;
    z-index: 1;
    transition: background 0.4s;
}

.vibrant-glass-card:hover .card-glass-substrate {
    background: rgba(255, 255, 255, 0.2);
}

.card-content-row {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    gap: 24px;
    height: 100%;
}

/* Sections */
.row-section {
    display: flex;
    align-items: center;
    gap: 16px;
}

.title-section {
    flex: 2;
    min-width: 200px;
}

.info-section {
    flex: 2;
    justify-content: center;
    gap: 24px;
}

.action-section {
    flex: 1.5;
    justify-content: flex-end;
}

/* Elements */
.venue-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: var(--el-color-primary);
    overflow: hidden;
}
.venue-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.venue-name {
    margin: 0 0 4px 0;
    font-size: 17px;
    font-weight: 700;
    color: #1d1d1f;
}

.type-pill {
    font-size: 12px;
    opacity: 0.6;
    font-weight: 500;
}

.info-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.2);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    color: #1d1d1f;
}

.micro-tag {
    font-size: 12px;
    opacity: 0.5;
    margin-right: 8px;
}

.action-btn-circle {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--el-color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 18px;
    transition: all 0.3s;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

.vibrant-glass-card:hover .action-btn-circle {
    transform: scale(1.1);
    box-shadow: 0 8px 20px rgba(64, 158, 255, 0.4);
}

.action-btn-circle.is-busy {
    background: rgba(0, 0, 0, 0.1);
    color: #999;
    box-shadow: none;
    cursor: not-allowed;
}

.action-buttons {
    display: flex;
    gap: 10px;
    align-items: center;
}

.view-btn {
    background: rgba(144, 147, 153, 0.8);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.view-btn:hover {
    background: rgba(144, 147, 153, 1);
}

/* Responsive Media Queries */
@media (max-width: 768px) {
    .card-content-row {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas: 
            "title action"
            "info info";
        gap: 12px;
        padding: 16px;
        align-items: center;
    }
    
    .title-section {
        grid-area: title;
        width: 100%;
        margin: 0;
    }
    
    .action-section {
        grid-area: action;
        /* Position relative to grid, no absolute */
        position: static; 
        width: auto;
        display: flex;
        justify-content: flex-end;
    }
    
    .info-section {
        grid-area: info;
        width: 100%;
        display: flex;
        flex-wrap: wrap; /* Wrap pills if narrow */
        gap: 8px;
        justify-content: flex-start;
        margin-top: 4px;
    }
    
    .d-none-mobile { display: none; }
    .venue-name { font-size: 16px; }
    
    .venue-icon {
        width: 40px;
        height: 40px; /* Slightly smaller icon on mobile */
    }
}

html.dark .venue-name, html.dark .type-pill { color: #eee; }
html.dark .info-pill { background: rgba(255,255,255,0.1); color: #ccc; }
</style>
