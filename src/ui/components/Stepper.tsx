import { useEffect, useRef, useState } from 'react';
import { MAX_CALL } from '../../domain/types';

/** − [ 4 ] + control. Typing is optional; the buttons and QuickPick cover the common case. */
export function Stepper({ value, onChange, label, min = 0, max = MAX_CALL }: { value: number; onChange: (n: number) => void; label: string; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  const [warn, setWarn] = useState(false);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = () => {
    setWarn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWarn(false), 1800);
  };

  const commit = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setText(digits);
    if (digits === '') return;
    let n = parseInt(digits, 10);
    if (n > max) { n = max; setText(String(n)); flash(); }
    onChange(n);
  };

  return (
    <div className="stepper-wrap">
      <div className="stepper" role="group" aria-label={label}>
        <button type="button" className="sbtn" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          aria-label={label}
          aria-invalid={warn}
          value={text}
          onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
          onBlur={() => { focused.current = false; setText(String(value)); }}
          onChange={(e) => commit(e.target.value)}
        />
        <button type="button" className="sbtn" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
      {warn && <div className="error-text" role="alert">Use a number from {min} to {max}</div>}
    </div>
  );
}

/** Tap-to-pick grid 0..13 (or from `min`). */
export function QuickPick({ value, onPick, label, min = 0, max = MAX_CALL }: { value: number; onPick: (n: number) => void; label: string; min?: number; max?: number }) {
  const nums: number[] = [];
  for (let i = min; i <= max; i++) nums.push(i);
  return (
    <div className="quick" role="group" aria-label={`Quick pick ${label}`}>
      {nums.map((n) => (
        <button key={n} type="button" className={value === n ? 'on' : ''} aria-pressed={value === n} aria-label={`${label} ${n}`} onClick={() => onPick(n)}>{n}</button>
      ))}
    </div>
  );
}
