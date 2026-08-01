import { useEffect, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

import type {
  WorkflowClarification,
  WorkflowClarificationAnswer,
} from '@/features/workflow/assistant/types'
import { cn } from '@/lib/utils'

const OTHER_OPTION = '__other__'

interface WorkflowClarificationCardProps {
  clarification: WorkflowClarification
  isStreaming: boolean
  onSubmit: (answers: WorkflowClarificationAnswer[]) => void
}

export function WorkflowClarificationCard({
  clarification,
  isStreaming,
  onSubmit,
}: WorkflowClarificationCardProps) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    setAnswers({})
    setOtherAnswers({})
  }, [clarification])

  const selectOption = (questionId: string, value: string, multiple: boolean) => {
    setAnswers((current) => {
      const selected = current[questionId] ?? []
      return {
        ...current,
        [questionId]: multiple
          ? selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value]
          : [value],
      }
    })
  }

  const ready = clarification.questions.every((question) => {
    if (!question.required) {
      return true
    }
    const inputType = question.inputType ?? 'text'
    if (inputType === 'text') {
      return Boolean(otherAnswers[question.id]?.trim())
    }
    const selected = answers[question.id] ?? []
    return selected.length > 0
      && (!selected.includes(OTHER_OPTION) || Boolean(otherAnswers[question.id]?.trim()))
  })

  const submit = () => {
    if (!ready) {
      return
    }
    onSubmit(clarification.questions.map((question) => {
      const selected = answers[question.id] ?? []
      return {
        questionId: question.id,
        answers: selected
          .filter((value) => value !== OTHER_OPTION)
          .map((value) => (
            (question.options ?? []).find((option) => option.value === value)?.label ?? value
          )),
        other: otherAnswers[question.id],
      }
    }))
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-amber-300/16 bg-amber-400/[0.045] shadow-[0_16px_44px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(245,158,11,0.1),rgba(15,23,42,0.34))] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300/18 bg-amber-400/10 text-amber-200">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-50">需要确认关键信息</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">{clarification.summary}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-amber-300/14 bg-amber-400/[0.07] px-2 py-1 text-[10px] text-amber-100">
          {clarification.questions.length} 项
        </span>
      </div>
      <div className="space-y-3 p-4">
        {clarification.questions.map((question, index) => {
          const inputType = question.inputType ?? 'text'
          const selected = answers[question.id] ?? []
          const showOtherInput = inputType === 'text' || selected.includes(OTHER_OPTION)
          return (
            <div key={question.id} className="rounded-2xl border border-white/8 bg-slate-950/38 px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-amber-300/14 bg-amber-400/[0.07] text-[10px] font-semibold text-amber-100">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium leading-5 text-slate-100">{question.question}</p>
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-600">
                      {inputType === 'single' ? '单选' : inputType === 'multiple' ? '多选' : '填写'}
                    </span>
                  </div>
                  {question.reason && <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{question.reason}</p>}
                </div>
              </div>
              {inputType !== 'text' && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(question.options ?? []).map((option) => (
                    <OptionButton
                      key={option.value}
                      active={selected.includes(option.value)}
                      label={option.label}
                      onClick={() => selectOption(
                        question.id,
                        option.value,
                        inputType === 'multiple',
                      )}
                    />
                  ))}
                  {(question.allowOther ?? true) && (
                    <OptionButton
                      active={selected.includes(OTHER_OPTION)}
                      label="其他"
                      onClick={() => selectOption(
                        question.id,
                        OTHER_OPTION,
                        inputType === 'multiple',
                      )}
                    />
                  )}
                </div>
              )}
              {showOtherInput && (
                <input
                  type="text"
                  value={otherAnswers[question.id] ?? ''}
                  onChange={(event) => setOtherAnswers((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))}
                  placeholder={inputType === 'text' ? '请输入你的答案' : '请输入其他选项'}
                  className="mt-3 h-9 w-full rounded-xl border border-white/8 bg-slate-950/66 px-3 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/12 focus:border-amber-300/30"
                />
              )}
            </div>
          )
        })}
        <button
          type="button"
          disabled={!ready || isStreaming}
          onClick={submit}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/16 bg-amber-400 text-xs font-semibold text-slate-950 shadow-[0_10px_24px_rgba(245,158,11,0.14)] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-slate-600 disabled:shadow-none"
        >
          <Check className="h-3.5 w-3.5" />
          提交并继续规划
        </button>
      </div>
    </div>
  )
}

interface OptionButtonProps {
  active: boolean
  label: string
  onClick: () => void
}

function OptionButton({ active, label, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-2.5 py-1.5 text-[11px] transition-colors',
        active
          ? 'border-amber-300/30 bg-amber-400/12 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.04)]'
          : 'border-white/8 bg-white/[0.025] text-slate-400 hover:border-white/14 hover:bg-white/[0.055] hover:text-slate-200',
      )}
    >
      {label}
    </button>
  )
}
