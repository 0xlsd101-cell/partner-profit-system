import { ChevronDown, ChevronUp } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const currentYear = new Date().getFullYear()

  return (
    <div className="page-header">
      <div className="page-title-block">
        <span className="page-eyebrow">本地数据驾驶舱</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="page-header-aside">
        <div className="page-status-line">
          <span>当前年度：{currentYear}年</span>
          <span>公历自然年度：1月1日 至 12月31日</span>
          <span>本地存储</span>
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
    </div>
  )
}

interface PanelProps {
  title?: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}

export function Panel({ title, description, children, actions }: PanelProps) {
  return (
    <section className="panel">
      {title || description || actions ? (
        <div className="panel-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
  hint?: string
}

export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

interface NoticeProps {
  children: ReactNode
  tone?: 'info' | 'warning' | 'danger' | 'success'
}

export function Notice({ children, tone = 'info' }: NoticeProps) {
  return <div className={`notice notice-${tone}`}>{children}</div>
}

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

interface EmptyStateProps {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return <button {...props} className={`button button-${variant} ${className}`.trim()} />
}

interface NumberStepperInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  value: string | number
  onValueChange: (value: string) => void
}

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function formatSteppedValue(value: number, step: string | number | undefined) {
  const stepText = String(step ?? 1)
  const decimalPlaces = stepText.includes('.') ? stepText.split('.')[1]?.length ?? 0 : 0

  return decimalPlaces > 0 ? value.toFixed(decimalPlaces).replace(/\.?0+$/, '') : String(value)
}

export function NumberStepperInput({
  value,
  onValueChange,
  className = '',
  step = 1,
  min,
  max,
  disabled,
  ...props
}: NumberStepperInputProps) {
  function stepValue(direction: 1 | -1) {
    const current = toFiniteNumber(value) ?? 0
    const stepNumber = toFiniteNumber(step) ?? 1
    const minNumber = toFiniteNumber(min)
    const maxNumber = toFiniteNumber(max)
    let nextValue = current + direction * stepNumber

    if (minNumber !== undefined && nextValue < minNumber) {
      nextValue = minNumber
    }

    if (maxNumber !== undefined && nextValue > maxNumber) {
      nextValue = maxNumber
    }

    onValueChange(formatSteppedValue(nextValue, step))
  }

  function handleStepPointerDown(event: React.PointerEvent<HTMLButtonElement>, direction: 1 | -1) {
    event.preventDefault()
    event.stopPropagation()
    stepValue(direction)
  }

  function handleStepKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, direction: 1 | -1) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    stepValue(direction)
  }

  return (
    <div className={`number-stepper ${className}`.trim()}>
      <input
        {...props}
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      <div className="number-stepper-controls">
        <button
          type="button"
          aria-label="数值增加"
          disabled={disabled}
          onPointerDown={(event) => handleStepPointerDown(event, 1)}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onKeyDown={(event) => handleStepKeyDown(event, 1)}
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          aria-label="数值减少"
          disabled={disabled}
          onPointerDown={(event) => handleStepPointerDown(event, -1)}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onKeyDown={(event) => handleStepKeyDown(event, -1)}
        >
          <ChevronDown size={12} />
        </button>
      </div>
    </div>
  )
}
