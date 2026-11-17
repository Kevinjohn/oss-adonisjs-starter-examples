<script setup lang="ts">
import { Form } from '@adonisjs/inertia/vue'
import AppLayout from '~/layouts/app.vue'
defineOptions({ layout: AppLayout })
defineProps<{ emailVerified: boolean }>()
</script>
<template>
  <section class="page">
    <div v-if="!emailVerified" class="panel" style="padding: 16px; margin-bottom: 16px">
      <Form v-slot="{ processing }" route="email_verifications.store"
        ><p style="display: flex; gap: 12px; align-items: center; margin: 0">
          Confirm your email address with a verification link. Requests within one minute may reuse
          your current link.<button
            class="btn btn--secondary btn--sm"
            type="submit"
            :disabled="processing"
          >
            {{ processing ? 'Sending…' : 'Resend link' }}
          </button>
        </p></Form
      >
    </div>
    <div class="empty">
      <div class="empty__mark" aria-hidden="true">◆</div>
      <h1>Your dashboard is ready</h1>
      <nav aria-label="Examples">
        <a href="/notes">Notes</a> · <a href="/reading-items">Reading list</a> ·
        <a href="/settings/secure-note">Secure note</a>
      </nav>
    </div>
  </section>
</template>
