import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

// Topmost-dialog tracking, so stacked dialogs (e.g. a confirmation on top of a
// list) don't all react to the same Escape or Tab press.
const stack: symbol[] = []

/**
 * Accessible modal shell shared by every dialog in the app: backdrop click and
 * Escape to close (unless `closable` is false, e.g. while saving), a focus
 * trap, focus restoration on close, and dialog semantics for screen readers.
 */
export default function Modal({
  onClose,
  closable = true,
  label,
  maxWidth = 470,
  zIndex = 40,
  children,
}: {
  onClose: () => void
  closable?: boolean
  /** Accessible name announced when the dialog opens. */
  label: string
  maxWidth?: number
  zIndex?: number
  children: ReactNode
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const closableRef = useRef(closable)
  closableRef.current = closable
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const id = Symbol('modal')
    stack.push(id)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const card = cardRef.current
    const focusables = () =>
      card
        ? Array.from(
            card.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, select'),
          )
        : []
    const initial = focusables()
    ;(initial.find((el) => el.matches('input, textarea')) ?? initial[0])?.focus()

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape') {
        if (closableRef.current) onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) {
        e.preventDefault()
        list[list.length - 1].focus()
      } else if (!e.shiftKey && i === list.length - 1) {
        e.preventDefault()
        list[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const at = stack.indexOf(id)
      if (at >= 0) stack.splice(at, 1)
      previous?.focus()
    }
  }, [])

  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(43, 38, 32, 0.42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex,
  }
  const card: CSSProperties = {
    width: '100%',
    maxWidth,
    background: '#FFFDFA',
    borderRadius: 20,
    padding: 26,
    animation: 'riseIn 0.22s ease both',
    maxHeight: '92vh',
    overflow: 'auto',
  }
  return (
    <div onClick={() => closableRef.current && onCloseRef.current()} style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={label} ref={cardRef} onClick={(e) => e.stopPropagation()} style={card}>
        {children}
      </div>
    </div>
  )
}
