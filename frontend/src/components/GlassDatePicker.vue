<script setup>
import { ref, computed, watch } from 'vue'
import { Calendar, Clock, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

const props = defineProps(['modelValue', 'placeholder'])
const emit = defineEmits(['update:modelValue'])

const showPicker = ref(false)
const viewDate = ref(props.modelValue ? new Date(props.modelValue) : new Date())
const selectedDate = ref(props.modelValue ? new Date(props.modelValue) : null)

const hours = ref(selectedDate.value ? selectedDate.value.getHours() : 14)
const minutes = ref(selectedDate.value ? selectedDate.value.getMinutes() : 0)

// Calendar Logic
const daysInMonth = computed(() => {
    const year = viewDate.value.getFullYear()
    const month = viewDate.value.getMonth()
    return new Date(year, month + 1, 0).getDate()
})

const startDayOfWeek = computed(() => {
    const year = viewDate.value.getFullYear()
    const month = viewDate.value.getMonth()
    return new Date(year, month, 1).getDay()
})

const calendarDays = computed(() => {
    const days = []
    for (let i = 0; i < startDayOfWeek.value; i++) days.push(null)
    for (let i = 1; i <= daysInMonth.value; i++) days.push(i)
    return days
})

const changeMonth = (delta) => {
    viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + delta, 1)
}

const selectDay = (day) => {
    if (!day) return
    const newDate = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth(), day, hours.value, minutes.value)
    selectedDate.value = newDate
}

const confirmSelection = () => {
    if (selectedDate.value) {
        selectedDate.value.setHours(hours.value)
        selectedDate.value.setMinutes(minutes.value)
        emit('update:modelValue', selectedDate.value.toISOString())
        showPicker.value = false
    }
}

const formatDisplay = computed(() => {
    if (!props.modelValue) return props.placeholder
    return new Date(props.modelValue).toLocaleString([], { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    })
})
</script>

<template>
  <div class="glass-date-picker">
    <div class="pill-button-trigger" @click="showPicker = true">
      <span>{{ formatDisplay }}</span>
      <el-icon><Calendar /></el-icon>
    </div>

    <el-dialog
        v-model="showPicker"
        width="90%"
        style="max-width: 380px"
        :teleported="false"
        :modal-append-to-body="false"
        class="glass-dialog spatial-modal"
        title="选择时间"
        align-center
    >
      <div class="custom-picker">
        <!-- Header -->
        <div class="picker-top">
            <el-button circle @click="changeMonth(-1)"><el-icon><ArrowLeft /></el-icon></el-button>
            <span class="month-label">{{ viewDate.getFullYear() }}年 {{ viewDate.getMonth() + 1 }}月</span>
            <el-button circle @click="changeMonth(1)"><el-icon><ArrowRight /></el-icon></el-button>
        </div>

        <!-- Calendar Grid -->
        <div class="calendar-grid">
            <div v-for="w in ['日','一','二','三','四','五','六']" :key="w" class="weekday">{{ w }}</div>
            <div 
                v-for="(day, index) in calendarDays" 
                :key="index" 
                class="day-cell"
                :class="{ 
                    'empty': !day, 
                    'selected': selectedDate && day === selectedDate.getDate() && viewDate.getMonth() === selectedDate.getMonth() 
                }"
                @click="selectDay(day)"
            >
                {{ day }}
            </div>
        </div>

        <!-- Time Selector -->
        <div class="time-strip">
            <el-icon><Clock /></el-icon>
            <div class="time-inputs">
                <input type="number" v-model="hours" min="0" max="23" @change="selectDay(selectedDate?.getDate())" />
                <span>:</span>
                <input type="number" v-model="minutes" min="0" max="59" @change="selectDay(selectedDate?.getDate())" />
            </div>
        </div>

        <!-- Footer -->
        <div class="picker-actions">
            <el-button @click="showPicker = false">取消</el-button>
            <el-button type="primary" class="vibrant-btn" @click="confirmSelection">确定</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.custom-picker { 
    padding: 20px; 
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur)) saturate(160%);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(160%);
    border: var(--glass-border);
    border-radius: 35px;
    box-shadow: var(--glass-shadow);
}
.picker-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.month-label { font-weight: 800; font-size: 18px; color: var(--text-primary); }

.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 25px;
}
.weekday { text-align: center; font-size: 13px; opacity: 0.6; font-weight: 800; margin-bottom: 8px; }
.day-cell {
    aspect-ratio: 1/1;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    font-weight: 700;
    transition: all 0.2s;
    color: var(--text-primary);
    background: rgba(255,255,255,0.05);
}
.day-cell:hover:not(.empty) { background: rgba(255,255,255,0.25); transform: scale(1.1); }
.day-cell.selected { background: var(--el-color-primary) !important; color: white !important; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.day-cell.empty { cursor: default; background: transparent; }

.time-strip {
    display: flex; align-items: center; justify-content: center;
    background: var(--glass-input-bg);
    backdrop-filter: blur(10px);
    padding: 12px; border-radius: 20px; margin-bottom: 25px;
    gap: 15px;
    border: 1px solid rgba(255,255,255,0.2);
}

.time-inputs { display: flex; align-items: center; gap: 8px; }
.time-inputs input {
    width: 60px; height: 40px;
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px;
    text-align: center; font-weight: 800; font-size: 18px;
    outline: none; color: var(--text-primary);
}
html.dark .time-inputs input { background: rgba(255,255,255,0.08); }

.picker-actions { 
    display: flex; justify-content: flex-end; gap: 12px; 
    border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; 
}
</style>
