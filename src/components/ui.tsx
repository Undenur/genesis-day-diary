/** Базовые элементы интерфейса MOMENTA. Цвет всегда сопровождается подписью или формой. */
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-night font-semibold hover:bg-[#a3b8db] active:bg-[#7f98c2] disabled:bg-raised disabled:text-muted',
  secondary: 'bg-raised text-ink hover:bg-[#3d4f6c] active:bg-[#2d3b52] disabled:opacity-50',
  outline: 'border border-line text-ink hover:bg-card active:bg-raised disabled:opacity-50',
  ghost: 'text-ink hover:bg-card active:bg-raised disabled:opacity-50',
  danger: 'border border-err/60 text-err hover:bg-err/10 disabled:opacity-50',
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  size?: 'md' | 'lg' | 'sm';
  block?: boolean;
}

export function Button({ variant = 'secondary', icon: Icon, size = 'md', block, className = '', children, ...rest }: BtnProps) {
  const h = size === 'lg' ? 'min-h-[52px] px-5 text-[16px]' : size === 'sm' ? 'min-h-[40px] px-3.5 text-[14px]' : 'min-h-[48px] px-4 text-[15px]';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl transition-colors disabled:cursor-not-allowed ${h} ${VARIANT[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 18 : 20} aria-hidden="true" />}
      {children}
    </button>
  );
}

interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  tone?: 'plain' | 'glass' | 'card';
  size?: number;
}

export function IconButton({ icon: Icon, label, active, tone = 'plain', size = 22, className = '', ...rest }: IconBtnProps) {
  const toneCls =
    tone === 'glass'
      ? 'bg-black/35 backdrop-blur-md text-white hover:bg-black/50'
      : tone === 'card'
        ? 'bg-card text-ink hover:bg-raised'
        : 'text-ink hover:bg-card';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full transition-colors ${toneCls} ${active ? 'ring-2 ring-accent' : ''} ${className}`}
      {...rest}
    >
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}

export function Card({ children, className = '', as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={`rounded-[18px] bg-card ${className}`}>{children}</As>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, back = true, right, onBack }: { title: ReactNode; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 -mx-5 mb-4 flex min-h-14 items-center gap-2 bg-night/90 px-3 pt-[var(--safe-top)] backdrop-blur-md lg:mx-0 lg:px-0">
      {back && <IconButton icon={ChevronLeft} label="Назад" onClick={() => (onBack ? onBack() : window.history.length > 1 ? nav(-1) : nav('/'))} />}
      <h1 className={`flex-1 truncate text-[18px] font-semibold ${back ? '' : 'pl-2'}`}>{title}</h1>
      {right}
    </header>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 rounded-2xl bg-card p-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[14px] transition-colors ${on ? 'bg-raised font-semibold text-ink' : 'text-muted hover:text-ink'}`}
          >
            {o.icon && <o.icon size={18} aria-hidden="true" className={on ? 'text-accent' : ''} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, children, onClick, icon: Icon }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] transition-colors ${active ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line text-muted hover:text-ink'}`}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] text-err">
          <span aria-hidden="true">●</span> {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  'w-full rounded-2xl border border-line bg-card px-4 py-3 text-[16px] text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none aria-[invalid=true]:border-err';

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center lg:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            tabIndex={-1}
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className={`relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[24px] bg-card px-5 pb-[max(20px,var(--safe-bottom))] pt-3 shadow-2xl focus:outline-none lg:rounded-[24px] ${wide ? 'lg:max-w-2xl' : 'lg:max-w-lg'}`}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-raised lg:hidden" aria-hidden="true" />
            <div className="sticky -top-3 z-10 -mx-5 mb-3 flex items-center gap-2 bg-card px-5 pt-1">
              <h2 id={id} className="flex-1 text-[18px] font-semibold">
                {title}
              </h2>
              <IconButton icon={X} label="Закрыть" onClick={onClose} />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
  danger = true,
}: {
  open: boolean;
  title: string;
  text: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="text-[15px] text-muted">{text}</div>
      <div className="mt-5 flex gap-3">
        <Button variant="outline" block onClick={onClose}>
          Отмена
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} block onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-line px-6 py-8 text-center">
      <span className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-card text-accent">
        <Icon size={24} aria-hidden="true" />
      </span>
      <p className="text-[16px] font-semibold">{title}</p>
      {text && <p className="text-[14px] text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------- Уведомления ----------
type ToastTone = 'ok' | 'error' | 'info' | 'warn';
interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}
export const useToasts = create<{ list: Toast[]; push: (text: string, tone?: ToastTone) => void; drop: (id: number) => void }>()((set) => ({
  list: [],
  push: (text, tone = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ list: [...s.list.slice(-2), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ list: s.list.filter((t) => t.id !== id) })), tone === 'error' ? 6500 : 3800);
  },
  drop: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));
export const toast = (text: string, tone?: ToastTone) => useToasts.getState().push(text, tone);

const TONE: Record<ToastTone, { cls: string; mark: string; label: string }> = {
  ok: { cls: 'border-ok/50', mark: '✓', label: 'Готово' },
  error: { cls: 'border-err/60', mark: '!', label: 'Ошибка' },
  warn: { cls: 'border-warn/60', mark: '!', label: 'Внимание' },
  info: { cls: 'border-line', mark: 'i', label: 'Сообщение' },
};

export function Toaster() {
  const list = useToasts((s) => s.list);
  const drop = useToasts((s) => s.drop);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+12px)] z-[100] flex flex-col items-center gap-2 px-5" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-card/95 px-4 py-3 text-[14px] shadow-xl backdrop-blur ${TONE[t.tone].cls}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <span
              aria-label={TONE[t.tone].label}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold text-night ${t.tone === 'ok' ? 'bg-ok' : t.tone === 'error' ? 'bg-err' : t.tone === 'warn' ? 'bg-warn' : 'bg-accent'}`}
            >
              {TONE[t.tone].mark}
            </span>
            <span className="flex-1">{t.text}</span>
            <button type="button" className="-m-2 p-2 text-muted" onClick={() => drop(t.id)} aria-label="Скрыть сообщение">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
