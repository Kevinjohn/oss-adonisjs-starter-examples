import { useState, type FormEvent } from 'react'
import Page from '~/components/page'
import AppLayout from '~/layouts/app'

type Note = { id: number; body: string }
type Result = { replayed: boolean; result: { noteId: number } }

export default function Notes({
  csrfToken,
  notes: initialNotes,
}: {
  csrfToken: string
  notes: Note[]
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  async function createAndRetry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    const payload = { body, commandId: crypto.randomUUID(), requestKey: crypto.randomUUID() }
    const send = async (): Promise<Result> => {
      const response = await fetch('/notes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
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
      setNotes((current) => [...current, { id: first.result.noteId, body }])
      setMessage(`Created note ${first.result.noteId}; retry returned the same result.`)
      setBody('')
    } catch (error) {
      setMessage(String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Page title="Retry safe notes">
      <p>
        Submit once and retry with the same command identifiers. The second response should return
        the first result while keeping one note.
      </p>
      <form className="auth__form" onSubmit={createAndRetry}>
        <div className="field">
          <label className="field__label" htmlFor="note-body">
            Note
          </label>
          <textarea
            id="note-body"
            className="field__input"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={pending}>
          Create and retry
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <h2>Your notes</h2>
      <ul>
        {notes.map((note) => (
          <li key={note.id} data-note-id={note.id}>
            {note.body}
          </li>
        ))}
      </ul>
    </Page>
  )
}

Notes.layout = [AppLayout]
