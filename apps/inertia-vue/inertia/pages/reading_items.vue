<script setup lang="ts">
import Page from '~/components/page.vue'
import AppLayout from '~/layouts/app.vue'
import { Form } from '@adonisjs/inertia/vue'

defineProps<{ items: { id: number; title: string; labels: string[] }[] }>()
</script>

<template>
  <AppLayout>
    <Page title="Reading list">
      <Form v-slot="{ processing }" route="reading_items.store">
        <label for="title">Title</label>
        <input id="title" name="title" required maxlength="200" />
        <label for="label">Label</label>
        <select id="label" name="label">
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="reference">Reference</option>
        </select>
        <button type="submit" :disabled="processing">Add item</button>
      </Form>
      <ul>
        <li v-for="item in items" :key="item.id">
          {{ item.title }} — {{ item.labels.join(', ') }}
        </li>
      </ul>
    </Page>
  </AppLayout>
</template>
