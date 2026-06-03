<script setup>
const props = defineProps({
  query: {
    type: String,
    default: '',
  },
  searchPlaceholder: {
    type: String,
    default: '搜索...',
  },
})

const emit = defineEmits(['update:query', 'submit'])

function updateValue(event) {
  emit('update:query', event.target.value)
}

function submit() {
  emit('submit')
}
</script>

<template>
  <div class="filter-bar make-filter-bar">
    <label class="command-input make-filter-search">
      <span>⌕</span>
      <input :value="props.query" :placeholder="searchPlaceholder" @input="updateValue" @keyup.enter="submit" />
    </label>
    <slot />
  </div>
</template>
