import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Avatar as AvatarT } from '../../domain/types';
import { initials } from '../../domain/util';
import { toast, useStore } from '../../state/store';
import { AVATAR_COLORS, AVATAR_EMOJIS, imageFileToAvatarData } from '../avatars';

/* ---------- Avatar ---------- */

export function Avatar({ avatar, name, size = 40, ring }: { avatar: AvatarT; name: string; size?: number; ring?: boolean }) {
  const style = { width: size, height: size, background: avatar.color, fontSize: size * 0.4 } as const;
  return (
    <span className={'avatar' + (ring ? ' ring' : '')} style={style} role="img" aria-label={`${name} avatar`}>
      {avatar.image ? <img src={avatar.image} alt="" draggable={false} /> : avatar.emoji ? <span style={{ fontSize: size * 0.5 }}>{avatar.emoji}</span> : initials(name)}
    </span>
  );
}

/** Overlapping avatars for a team. */
export function AvatarStack({ items, size = 28 }: { items: { avatar: AvatarT; name: string }[]; size?: number }) {
  return (
    <span className="avatar-stack">
      {items.map((it, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar avatar={it.avatar} name={it.name} size={size} ring />
        </span>
      ))}
    </span>
  );
}

/* ---------- Avatar editor ---------- */

export function AvatarEditor({ value, name, onChange }: { value: AvatarT; name: string; onChange: (a: AvatarT) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const pick = async (f?: File | null) => {
    if (!f) return;
    try {
      onChange({ ...value, image: await imageFileToAvatarData(f), emoji: undefined });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="avatar-editor">
      <div className="avatar-editor-preview">
        <Avatar avatar={value} name={name || '?'} size={72} ring />
      </div>
      <div className="avatar-editor-body">
        <div className="chip-row" role="group" aria-label="Avatar colour">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" className={'swatch' + (value.color === c ? ' on' : '')} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={value.color === c} onClick={() => onChange({ ...value, color: c })} />
          ))}
        </div>
        <div className="chip-row" role="group" aria-label="Avatar emoji">
          <button type="button" className={'emoji-btn' + (!value.emoji && !value.image ? ' on' : '')} aria-pressed={!value.emoji && !value.image} onClick={() => onChange({ color: value.color })}>Aa</button>
          {AVATAR_EMOJIS.map((e) => (
            <button key={e} type="button" className={'emoji-btn' + (value.emoji === e && !value.image ? ' on' : '')} aria-pressed={value.emoji === e && !value.image} aria-label={`Emoji ${e}`} onClick={() => onChange({ color: value.color, emoji: e })}>{e}</button>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>🖼 Upload photo</button>
          <button type="button" className="btn small" onClick={() => camRef.current?.click()}>📷 Camera</button>
          {value.image && <button type="button" className="btn small ghost" onClick={() => onChange({ color: value.color })}>Remove photo</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Upload photo" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={camRef} type="file" accept="image/*" capture="user" hidden aria-label="Take photo" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
}

/* ---------- Sheet (modal) ---------- */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    document.body.classList.add('modal-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const a = nodes[0], z = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Portal to <body>: ancestors with backdrop-filter (the sticky top bar) would otherwise become the
  // containing block of this position:fixed overlay and push the sheet off screen.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Confirm dialog (promise based) ---------- */

interface ConfirmReq {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}
let setConfirmReq: ((r: ConfirmReq | null) => void) | null = null;

export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setConfirmReq) return resolve(window.confirm(opts.message));
    setConfirmReq({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    setConfirmReq = setReq;
    return () => { setConfirmReq = null; };
  }, []);
  if (!req) return null;
  const close = (v: boolean) => { req.resolve(v); setReq(null); };
  return (
    <Sheet
      title={req.title}
      onClose={() => close(false)}
      footer={
        <>
          <button type="button" className="btn" onClick={() => close(false)} data-autofocus>Cancel</button>
          <button type="button" className={'btn ' + (req.danger ? 'danger' : 'primary')} onClick={() => close(true)}>{req.confirmLabel ?? 'Confirm'}</button>
        </>
      }
    >
      <p className="muted-text">{req.message}</p>
    </Sheet>
  );
}

/* ---------- Toasts ---------- */

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>{t.message}</div>
      ))}
    </div>
  );
}

/* ---------- misc ---------- */

export function Field({ label, children, hint, error }: { label: string; children: (id: string) => ReactNode; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  );
}

export function Empty({ icon = '♠', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children && <div className="muted-text">{children}</div>}
    </div>
  );
}

export function Suit({ s, className }: { s: '♠' | '♥' | '♦' | '♣'; className?: string }) {
  return <span className={'suit ' + (s === '♥' || s === '♦' ? 'red ' : '') + (className ?? '')} aria-hidden="true">{s}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id}>{label}</label>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
        <span className="knob" />
      </button>
    </div>
  );
}
