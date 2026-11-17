import { useState, type FormEvent } from 'react'
import Page from '~/components/page'
import AppLayout from '~/layouts/app'

type Note = { id: number; body: string }
type Submission = { body: string; commandId: string; requestKey: string }
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
  const [submission, setSubmission] = useState<Submission>()

  async function createAndRetry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!body.trim()) {
      setMessage('Enter a note.')
      return
    }
    const previousSubmission = submission
    const payload = previousSubmission ?? {
      body,
      commandId: crypto.randomUUID(),
      requestKey: crypto.randomUUID(),
    }
    setSubmission(payload)
    setPending(true)
    setMessage('')
    let rejected = false
    const send = async (allowCorrection = false): Promise<Result> => {
      const response = await fetch('/notes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
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
      setNotes((current) => [...current, { id: first.result.noteId, body: payload.body }])
      setMessage(`Created note ${first.result.noteId}; retry returned the same result.`)
      setBody('')
      setSubmission(undefined)
    } catch (error) {
      if (rejected) {
        setSubmission(undefined)
        setMessage('The server rejected the note. Edit it and try again.')
      } else {
        setMessage(`The submission could not be confirmed. Retry the same note. ${error}`)
      }
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
            readOnly={Boolean(submission)}
            required
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={pending}>
          {submission && !pending ? 'Retry submission' : 'Create and retry'}
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
