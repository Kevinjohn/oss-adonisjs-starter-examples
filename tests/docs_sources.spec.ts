import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from '@japa/runner'

const root = join(import.meta.dirname, '..')
const MARKER = /^<!-- source: (\S+) -->$/

/** Every Markdown file under `docs/`. */
function markdownFiles(folder = join(root, 'docs')): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

/**
 * Problems with the code fences marked `<!-- source: <path> -->`: the fence must follow the
 * marker, and its lines must appear in that file as a contiguous block of whole lines.
 */
export function sourceProblems(markdown: string, readSource: (path: string) => string | null) {
  const lines = markdown.split('\n')
  const problems: string[] = []
  let sourced = 0
  lines.forEach((line, index) => {
    const path = line.match(MARKER)?.[1]
    if (!path) return
    const fence = lines[index + 1]?.match(/^(`{3,})\w*$/)
    if (!fence) return problems.push(`line ${index + 1}: no code fence after the source marker`)
    const end = lines.findIndex((other, at) => at > index + 1 && other === fence[1])
    if (end === -1) return problems.push(`line ${index + 1}: the code fence is not closed`)
    const source = readSource(path)
    if (source === null) return problems.push(`line ${index + 1}: ${path} does not exist`)
    const snippet = lines.slice(index + 2, end).join('\n')
    const sourceLines = `\n${source}\n`
    if (!snippet || !sourceLines.includes(`\n${snippet}\n`)) {
      return problems.push(`line ${index + 1}: the snippet is not a block of lines in ${path}`)
    }
    sourced++
  })
  return { problems, sourced }
}

const readFromRoot = (path: string) => {
  try {
    return readFileSync(join(root, path), 'utf8')
  } catch {
    return null
  }
}

test.group('sourced documentation snippets', () => {
  test('match the files they name', ({ assert }) => {
    let sourced = 0
    const problems = markdownFiles().flatMap((file) => {
      const result = sourceProblems(readFileSync(file, 'utf8'), readFromRoot)
      sourced += result.sourced
      return result.problems.map((problem) => `${relative(root, file)} ${problem}`)
    })
    assert.deepEqual(problems, [])
    assert.isAbove(sourced, 0)
  })

  test('report a changed snippet, a missing file and a missing fence', ({ assert }) => {
    const read = (path: string) => (path === 'app.ts' ? 'a\n  b\nc\n' : null)
    const page = (path: string, body: string) => `<!-- source: ${path} -->\n${body}`
    assert.deepEqual(sourceProblems(page('app.ts', '```ts\n  b\nc\n```'), read).problems, [])
    assert.deepEqual(sourceProblems(page('app.ts', '```ts\nb\n```'), read).problems, [
      'line 1: the snippet is not a block of lines in app.ts',
    ])
    assert.deepEqual(sourceProblems(page('gone.ts', '```ts\na\n```'), read).problems, [
      'line 1: gone.ts does not exist',
    ])
    assert.deepEqual(sourceProblems(page('app.ts', 'text'), read).problems, [
      'line 1: no code fence after the source marker',
    ])
  })
})
