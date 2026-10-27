import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Info, Play, RotateCcw } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { deriveEvidenceReviewStatus } from '../../domain/validation';
import type { CompetencyLevel, EvidenceItem, StudentCode } from '../../types';

export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(' '));
}

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'success' | 'warn' | 'soft';
const BUTTON_STYLES: Record<BtnVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-card text-foreground hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  success: 'bg-success text-success-foreground hover:bg-success/90',
  warn: 'border border-warning bg-card text-warning-foreground hover:bg-warning-soft',
  soft: 'bg-primary-soft text-accent-foreground hover:bg-primary-soft/70',
};

export function Btn({ variant = 'outline', size = 'md', className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  return <button {...props} type={type} className={cn(
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    size === 'sm' && 'min-h-9 px-3 py-1.5 text-sm',
    size === 'md' && 'min-h-10 px-4 py-2 text-sm',
    size === 'lg' && 'min-h-12 px-5 py-3 text-[15px]',
    BUTTON_STYLES[variant], className,
  )} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('rounded-2xl border border-border bg-card shadow-soft', className)} />;
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-base font-semibold">{title}</h2>{hint && <p className="text-sm text-muted-foreground">{hint}</p>}</div>{right}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 rounded-xl bg-ai-soft px-3 py-2 text-sm text-foreground"><Info className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden="true" /><span>{children}</span></div>;
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground">{children}</span>;
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'review';
const TONES = {
  success: { cls: 'bg-success-soft text-success', Icon: CheckCircle2 },
  warning: { cls: 'bg-warning-soft text-warning-foreground', Icon: AlertTriangle },
  danger: { cls: 'bg-destructive-soft text-destructive', Icon: AlertTriangle },
  neutral: { cls: 'bg-muted text-muted-foreground', Icon: CircleDashed },
  info: { cls: 'bg-primary-soft text-accent-foreground', Icon: Clock },
  review: { cls: 'bg-warning-soft text-warning-foreground', Icon: RotateCcw },
};
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const { cls, Icon } = TONES[tone];
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', cls)}><Icon className="size-3.5 shrink-0" aria-hidden="true" />{children}</span>;
}

export function LevelChip({ level }: { level?: CompetencyLevel }) {
  if (!level) return <span className="text-sm text-muted-foreground">—</span>;
  if (level === 'insufficient_evidence') return <Status tone="neutral">Chưa đủ MC</Status>;
  return <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground">{level}</span>;
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md', render }: { options: T[]; value: T; onChange: (value: T) => void; size?: 'md' | 'lg'; render?: (value: T) => ReactNode }) {
  return <div className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-secondary p-1">{options.map((option) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={cn(
    'cursor-pointer rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    size === 'lg' ? 'min-h-12 px-4 py-2 text-base sm:min-w-24 sm:px-5' : 'min-h-9 px-4 py-1.5 text-sm',
    value === option ? 'bg-card text-primary shadow-soft' : 'text-muted-foreground hover:text-foreground',
  )}>{render ? render(option) : option}</button>)}</div>;
}

export function Thumb({
  label,
  small,
  light,
  selected,
  onClick,
  src,
  alt,
}: {
  label: string;
  small?: boolean;
  light?: boolean;
  selected?: boolean;
  onClick?: () => void;
  src?: string;
  alt?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={alt || `Xem ${label}`}
      className={cn(
        'group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
        light
          ? cn('border bg-muted text-muted-foreground', selected ? 'border-primary/60' : 'border-border')
          : 'bg-player text-player-foreground',
        small ? 'h-14 w-20' : 'aspect-video w-full'
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-200',
            selected === true
              ? 'opacity-100'
              : selected === false
              ? 'opacity-60 group-hover:opacity-90'
              : 'opacity-75 group-hover:opacity-95'
          )}
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,var(--ai)_0%,transparent_60%)] opacity-25" />
      )}
      <Play
        className={cn(
          'relative drop-shadow-md transition-all duration-200',
          small ? 'size-4' : 'size-6',
          selected === true
            ? 'scale-110 opacity-100 text-primary'
            : 'opacity-80 group-hover:scale-105 group-hover:opacity-100'
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'absolute bottom-1 left-1.5 rounded px-1 text-[10px] font-semibold transition-colors duration-200',
          src &&
            (selected === true
              ? 'bg-primary text-primary-foreground font-bold shadow-xs'
              : 'bg-player/80 text-player-foreground')
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function StudentDot({ code }: { code: StudentCode }) {
  return <span className="inline-flex h-6 items-center rounded-md border border-border bg-card px-1.5 text-xs font-semibold">{code}</span>;
}

export function EvidenceStatus({ evidence }: { evidence: EvidenceItem }) {
  const status = deriveEvidenceReviewStatus(evidence);
  if (status === 'conflict_or_edit') return <Status tone="warning">Cần GV xem lại</Status>;
  if (evidence.teacherStatus === 'rejected') return <Status tone="neutral">Đã bác bỏ</Status>;
  if (evidence.teacherStatus === 'accepted' || evidence.teacherStatus === 'modified_accepted') return <Status tone="success">GV đã duyệt</Status>;
  if (status === 'agreed') return <Status tone="success">Đã đồng thuận</Status>;
  if (status === 'unclear') return <Status tone="warning">Chưa rõ</Status>;
  if (evidence.origin !== 'ai') return <Status tone="info">{evidence.origin === 'student_added' ? 'HS bổ sung' : 'GV bổ sung'}</Status>;
  return <Status tone="info">Chờ kiểm chứng</Status>;
}
