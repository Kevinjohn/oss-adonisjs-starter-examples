<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import AppLayout from '~/layouts/app.vue'

type Note = { id: number; body: string }
type Result = { replayed: boolean; result: { noteId: number } }

const props = defineProps<{ csrfToken: string; notes: Note[] }>()
defineOptions({ layout: AppLayout })
const notes = ref([...props.notes])
const body = ref('')
const message = ref('')
const pending = ref(false)

async function createAndRetry() {
  if (pending.value) return
  pending.value = true
  const payload = {
    body: body.value,
    commandId: crypto.randomUUID(),
    requestKey: crypto.randomUUID(),
  }
  const send = async (): Promise<Result> => {
    const response = await fetch('/notes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': props.csrfToken,
      },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(result))
    return result
  }
  try {
    const first = await send()
    const retry = await send()
    if (!retry.replayed || retry.result.noteId !== first.result.noteId) {
      throw new Error('Expected the retry to return the first note')
    }
    notes.value.push({ id: first.result.noteId, body: body.value })
    message.value = `Created note ${first.result.noteId}; retry returned the same result.`
    body.value = ''
  } catch (error) {
    message.value = String(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="page">
    <Head title="Retry safe notes" />
    <header class="page__header"><h1 class="page__title">Retry safe notes</h1></header>
    <p>
      Submit once and retry with the same command identifiers. The second response should return the
      first result while keeping one note.
    </p>
    <form class="auth__form" @submit.prevent="createAndRetry">
      <div class="field">
        <label class="field__label" for="note-body">Note</label>
        <textarea id="note-body" v-model="body" class="field__input" required />
      </div>
      <button class="btn btn--primary" type="submit" :disabled="pending">Create and retry</button>
    </form>
    <p role="status" aria-live="polite">{{ message }}</p>
    <h2>Your notes</h2>
    <ul>
      <li v-for="note in notes" :key="note.id" :data-note-id="note.id">{{ note.body }}</li>
    </ul>
  </section>
</template>
