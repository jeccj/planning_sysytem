<script setup>
import { computed, onMounted, onBeforeUnmount, ref, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: {
    type: [String, Number, Date, null],
    default: '',
  },
  kind: {
    type: String,
    default: 'date', // date | time | datetime
  },
  placeholder: {
    type: String,
    default: '',
  },
  valueFormat: {
    type: String,
    default: '',
  },
  format: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    default: 'default',
  },
  clearable: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'change'])
const attrs = useAttrs()
const isMobileLike = ref(false)

const syncMobileLike = () => {
  if (typeof window === 'undefined') return
  const compact = window.matchMedia('(max-width: 900px)').matches
  const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches
  isMobileLike.value = compact || touch
}

onMounted(() => {
  syncMobileLike()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncMobileLike, { passive: true })
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncMobileLike)
  }
})

const pickerKind = computed(() => {
  const value = String(props.kind || 'date').toLowerCase()
  if (value === 'time') return 'time'
  if (value === 'datetime') return 'datetime'
  return 'date'
})

const nativeType = computed(() => {
  if (pickerKind.value === 'time') return 'time'
  if (pickerKind.value === 'datetime') return 'datetime-local'
  return 'date'
})

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime())

const parseAsDate = (input) => {
  if (input === null || input === undefined || input === '') return null
  if (input instanceof Date) return isValidDate(input) ? input : null
  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const pad2 = (value) => String(value).padStart(2, '0')
const toLocalDate = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const toLocalTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
const toLocalDateTime = (date) => `${toLocalDate(date)}T${toLocalTime(date)}`

const normalizeDateValue = (raw) => {
  if (!raw) return ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = parseAsDate(raw)
  return parsed ? toLocalDate(parsed) : ''
}

const normalizeTimeValue = (raw) => {
  if (!raw) return ''
  if (typeof raw === 'string') {
    const match = raw.match(/^(\d{2}:\d{2})/)
    if (match) return match[1]
  }
  const parsed = parseAsDate(raw)
  return parsed ? toLocalTime(parsed) : ''
}

const normalizeDateTimeValue = (raw) => {
  if (!raw) return ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return raw
  }
  const parsed = parseAsDate(raw)
  return parsed ? toLocalDateTime(parsed) : ''
}

const nativeValue = computed(() => {
  if (pickerKind.value === 'time') return normalizeTimeValue(props.modelValue)
  if (pickerKind.value === 'datetime') return normalizeDateTimeValue(props.modelValue)
  return normalizeDateValue(props.modelValue)
})

const pickerValue = computed({
  get() {
    return props.modelValue
  },
  set(value) {
    emit('update:modelValue', value)
    emit('change', value)
  },
})

const handleNativeInput = (event) => {
  const raw = String(event?.target?.value || '')
  if (!raw) {
    emit('update:modelValue', '')
    emit('change', '')
    return
  }

  if (pickerKind.value === 'datetime') {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      emit('update:modelValue', '')
      emit('change', '')
      return
    }
    const iso = parsed.toISOString()
    emit('update:modelValue', iso)
    emit('change', iso)
    return
  }

  emit('update:modelValue', raw)
  emit('change', raw)
}
</script>

<template>
  <input
    v-if="isMobileLike"
    v-bind="attrs"
    class="adaptive-native-picker"
    :type="nativeType"
    :value="nativeValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="handleNativeInput"
    @change="handleNativeInput"
  />
  <el-time-picker
    v-else-if="pickerKind === 'time'"
    v-bind="attrs"
    v-model="pickerValue"
    :placeholder="placeholder"
    :value-format="valueFormat || undefined"
    :format="format || undefined"
    :size="size"
    :clearable="clearable"
    :disabled="disabled"
    :editable="false"
  />
  <el-date-picker
    v-else
    v-bind="attrs"
    v-model="pickerValue"
    :type="pickerKind === 'datetime' ? 'datetime' : 'date'"
    :placeholder="placeholder"
    :value-format="valueFormat || undefined"
    :format="format || undefined"
    :size="size"
    :clearable="clearable"
    :disabled="disabled"
    :editable="false"
  />
</template>

<style scoped>
.adaptive-native-picker {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: #fff;
  color: var(--el-text-color-regular, #606266);
  padding: 0 10px;
  font-size: 14px;
  line-height: 1.2;
}

.adaptive-native-picker:focus {
  outline: none;
  border-color: var(--el-color-primary, #409eff);
}
</style>
