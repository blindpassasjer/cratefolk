import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

interface PromptOptions {
  title: string
  message?: ReactNode
  label: string
  type?: 'text' | 'password'
  confirmLabel?: string
  /** Return an error message to block submitting, or null if the value is fine. */
  validate?: (value: string) => string | null
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

type ActiveDialog =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }

const ToastContext = createContext<ToastApi | null>(null)
const DialogContext = createContext<DialogApi | null>(null)

const MAX_TOASTS = 4
const LIFETIME_MS: Record<Kind, number> = { success: 4000, info: 4000, error: 7000 }

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<ActiveDialog | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-(MAX_TOASTS - 1)), { id, kind, message }])
      setTimeout(() => dismiss(id), LIFETIME_MS[kind])
    },
    [dismiss],
  )

  const toast = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  )

  const dialogs = useMemo<DialogApi>(
    () => ({
      confirm: (options) => new Promise((resolve) => setDialog({ kind: 'confirm', options, resolve })),
      prompt: (options) => new Promise((resolve) => setDialog({ kind: 'prompt', options, resolve })),
    }),
    [],
  )

  return (
    <ToastContext.Provider value={toast}>
      <DialogContext.Provider value={dialogs}>
        {children}
        <ToastStack toasts={toasts} onDismiss={dismiss} />
        {dialog && <Dialog dialog={dialog} close={() => setDialog(null)} />}
      </DialogContext.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside NotifyProvider')
  return ctx
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog outside NotifyProvider')
  return ctx
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info } as const
const ACCENT: Record<Kind, string> = { success: 'text-wax', error: 'text-danger', info: 'text-ink-300' }

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:w-96">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="toast-in pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3 text-sm text-ink-100 shadow-xl"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${ACCENT[t.kind]}`} />
            <p className="min-w-0 flex-1 break-words">{t.message}</p>
            <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="shrink-0 text-ink-500 hover:text-ink-100">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Dialog({ dialog, close }: { dialog: ActiveDialog; close: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { options } = dialog

  function finish(result: boolean | string | null) {
    if (dialog.kind === 'confirm') dialog.resolve(result === true)
    else dialog.resolve(typeof result === 'string' ? result : null)
    close()
  }

  const cancel = () => finish(dialog.kind === 'confirm' ? false : null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (dialog.kind === 'confirm') return finish(true)
    const problem = dialog.options.validate?.(value) ?? null
    if (problem) return setError(problem)
    finish(value)
  }

  const danger = dialog.kind === 'confirm' && dialog.options.danger
  const confirmLabel = options.confirmLabel ?? (dialog.kind === 'confirm' ? 'Confirm' : 'Save')

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
    >
      <form
        onSubmit={submit}
        role={dialog.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-sm space-y-4 rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-2xl"
      >
        <div className="space-y-1.5">
          <h2 id="dialog-title" className="font-semibold">
            {options.title}
          </h2>
          {options.message && <div className="text-sm text-ink-300">{options.message}</div>}
        </div>

        {dialog.kind === 'prompt' && (
          <label className="block space-y-1.5 text-sm text-ink-300">
            {dialog.options.label}
            <input
              autoFocus
              type={dialog.options.type ?? 'text'}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              autoComplete={dialog.options.type === 'password' ? 'new-password' : 'off'}
              className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-wax"
            />
            {error && <span className="block text-xs text-danger">{error}</span>}
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:border-ink-500">
            Cancel
          </button>
          <button
            autoFocus={dialog.kind === 'confirm'}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              danger ? 'bg-danger text-white hover:opacity-90' : 'bg-wax text-on-wax hover:bg-wax-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
