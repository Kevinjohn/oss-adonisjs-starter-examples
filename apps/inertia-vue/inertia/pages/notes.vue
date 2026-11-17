<script setup lang="ts">
import { ref } from 'vue'
import { Head } from '@inertiajs/vue3'
import AppLayout from '~/layouts/app.vue'

type Note = { id: number; body: string }
type Submission = { body: string; commandId: string; requestKey: string }
type Result = { replayed: boolean; result: { noteId: number } }

const props = defineProps<{ csrfToken: string; notes: Note[] }>()
defineOptions({ layout: AppLayout })
const notes = ref([...props.notes])
const body = ref('')
const message = ref('')
const pending = ref(false)
const submission = ref<Submission>()

async function createAndRetry() {
  if (pending.value) return
  if (!body.value.trim()) {
    message.value = 'Enter a note.'
    return
  }
  const previousSubmission = submission.value
  const payload = previousSubmission ?? {
    body: body.value,
    commandId: crypto.randomUUID(),
    requestKey: crypto.randomUUID(),
  }
  submission.value = payload
  pending.value = true
  message.value = ''
  let rejected = false
  const send = async (allowCorrection = false): Promise<Result> => {
    const response = await fetch('/notes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': props.csrfToken,
      },
      body: JSON.stringify(payload),
    })
    if (allowCorrection && (response.status === 400 || response.status === 413)) {
      rejected = true
      throw new Error(`HTTP ${response.status}`)
    }
    const result = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(result))
    return result
  }
  try {
    const first = await send(!previousSubmission)
    const retry = await send()
    if (!retry.replayed || retry.result.noteId !== first.result.noteId) {
      throw new Error('Expected the retry to return the first note')
    }
    notes.value.push({ id: first.result.noteId, body: payload.body })
    message.value = `Created note ${first.result.noteId}; retry returned the same result.`
    body.value = ''
    submission.value = undefined
  } catch (error) {
    if (rejected) {
      submission.value = undefined
      message.value = 'The server rejected the note. Edit it and try again.'
    } else {
      message.value = `The submission could not be confirmed. Retry the same note. ${error}`
    }
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
        <textarea
          id="note-body"
          v-model="body"
          class="field__input"
          :readonly="!!submission"
          required
        />
      </div>
      <button class="btn btn--primary" type="submit" :disabled="pending">
        {{ submission && !pending ? 'Retry submission' : 'Create and retry' }}
      </button>
    </form>
    <p role="status" aria-live="polite">{{ message }}</p>
    <h2>Your notes</h2>
    <ul>
      <li v-for="note in notes" :key="note.id" :data-note-id="note.id">{{ note.body }}</li>
    </ul>
  </section>
</template>
