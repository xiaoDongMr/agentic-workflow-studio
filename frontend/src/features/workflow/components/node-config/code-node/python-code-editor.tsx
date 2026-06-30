import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, lineNumbers, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

const PYTHON_BUILTINS = new Set(['Args', 'Output', 'dict', 'float', 'int', 'len', 'list', 'range', 'str', 'sum'])

interface PythonCodeEditorProps {
  value: string
  onChange: (value: string) => void
  minHeight?: number
  fill?: boolean
}

export function PythonCodeEditor({
  value,
  onChange,
  minHeight = 220,
  fill = false,
}: PythonCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          lineNumbers(),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          createPythonSyntaxHighlighter(),
          EditorView.theme({
            '&': {
              height: fill ? '100%' : 'auto',
              minHeight: fill ? '100%' : `${minHeight}px`,
              fontSize: '12px',
              lineHeight: '20px',
              color: 'rgb(226 232 240)',
              backgroundColor: 'transparent',
            },
            '.cm-python-comment': {
              color: 'rgb(100 116 139)',
              fontStyle: 'italic',
            },
            '.cm-python-keyword': {
              color: 'rgb(125 211 252)',
              fontWeight: 600,
            },
            '.cm-python-builtin': {
              color: 'rgb(196 181 253)',
            },
            '.cm-python-string': {
              color: 'rgb(134 239 172)',
            },
            '.cm-python-number': {
              color: 'rgb(253 186 116)',
            },
            '.cm-scroller': {
              height: fill ? '100%' : 'auto',
              minHeight: fill ? '100%' : `${minHeight}px`,
              fontFamily:
                'SFMono-Regular, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              outline: 'none',
            },
            '.cm-content': {
              minHeight: fill ? '100%' : `${minHeight}px`,
              padding: '12px 0',
              caretColor: 'rgb(125 211 252)',
            },
            '.cm-line': {
              padding: '0 14px',
            },
            '.cm-gutters': {
              borderRight: '1px solid rgba(255,255,255,0.08)',
              backgroundColor: 'rgba(15,23,42,0.62)',
              color: 'rgb(71 85 105)',
            },
            '.cm-activeLineGutter': {
              backgroundColor: 'rgba(14,165,233,0.08)',
              color: 'rgb(148 163 184)',
            },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
              backgroundColor: 'rgba(14,165,233,0.22)',
            },
            '&.cm-focused': {
              outline: 'none',
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [fill, minHeight])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  return <div ref={hostRef} className={cn('overflow-hidden bg-transparent', fill ? 'h-full' : 'min-h-0')} />
}

function createPythonSyntaxHighlighter() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildPythonSyntaxDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildPythonSyntaxDecorations(update.view)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  )
}

function buildPythonSyntaxDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (const { from, to } of view.visibleRanges) {
    const startLine = doc.lineAt(from).number
    const endLine = doc.lineAt(to).number
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = doc.line(lineNumber)
      addPythonLineDecorations(builder, line.text, line.from)
    }
  }

  return builder.finish()
}

function addPythonLineDecorations(builder: RangeSetBuilder<Decoration>, line: string, lineStart: number) {
  let index = 0
  while (index < line.length) {
    const char = line[index]

    if (char === '#') {
      addPythonTokenDecoration(builder, lineStart + index, lineStart + line.length, 'cm-python-comment')
      break
    }

    if (char === '"' || char === "'") {
      const end = findPythonStringEnd(line, index)
      addPythonTokenDecoration(builder, lineStart + index, lineStart + end, 'cm-python-string')
      index = end
      continue
    }

    if (/\d/.test(char)) {
      const match = line.slice(index).match(/^\d+(?:\.\d+)?/)
      if (match) {
        addPythonTokenDecoration(builder, lineStart + index, lineStart + index + match[0].length, 'cm-python-number')
        index += match[0].length
        continue
      }
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = line.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)
      if (match) {
        const token = match[0]
        if (PYTHON_KEYWORDS.has(token)) {
          addPythonTokenDecoration(builder, lineStart + index, lineStart + index + token.length, 'cm-python-keyword')
        } else if (PYTHON_BUILTINS.has(token)) {
          addPythonTokenDecoration(builder, lineStart + index, lineStart + index + token.length, 'cm-python-builtin')
        }
        index += token.length
        continue
      }
    }

    index += 1
  }
}

function findPythonStringEnd(line: string, start: number) {
  const quote = line[start]
  const tripleQuote = line.slice(start, start + 3) === quote.repeat(3)
  let index = start + (tripleQuote ? 3 : 1)
  while (index < line.length) {
    if (line[index] === '\\') {
      index += 2
      continue
    }
    if (tripleQuote && line.slice(index, index + 3) === quote.repeat(3)) {
      return index + 3
    }
    if (!tripleQuote && line[index] === quote) {
      return index + 1
    }
    index += 1
  }
  return line.length
}

function addPythonTokenDecoration(
  builder: RangeSetBuilder<Decoration>,
  from: number,
  to: number,
  className: string,
) {
  if (to <= from) {
    return
  }
  builder.add(from, to, Decoration.mark({ class: className }))
}
