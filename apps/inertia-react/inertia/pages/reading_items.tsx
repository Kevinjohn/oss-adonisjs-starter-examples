import Page from '~/components/page'
import AppLayout from '~/layouts/app'
import { Form } from '@adonisjs/inertia/react'

type Item = { id: number; title: string; labels: string[] }

export default function ReadingItems({ items }: { items: Item[] }) {
  return (
    <Page title="Reading list">
      <Form route="reading_items.store">
        {({ processing }) => (
          <div>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required maxLength={200} />
            <label htmlFor="label">Label</label>
            <select id="label" name="label">
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="reference">Reference</option>
            </select>
            <button type="submit" disabled={processing}>
              Add item
            </button>
          </div>
        )}
      </Form>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.title} — {item.labels.join(', ')}
          </li>
        ))}
      </ul>
    </Page>
  )
}

ReadingItems.layout = [AppLayout]
