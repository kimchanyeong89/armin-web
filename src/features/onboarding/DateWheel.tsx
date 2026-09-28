import React, { useEffect, useRef } from "react";

/* One column of a date picker: the values scroll past a band in the middle,
   and whatever rests in the band is chosen. A tap on a value scrolls it into
   the band; arrow keys step it. Three of these side by side make the birthday. */

export const WHEEL_ROW = 44;
const PAD_ROWS = 2; // rows above and below the band, so the first and last can reach it

export default function DateWheel({ values, value, onChange, format, label }: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef<number | null>(null);
  const userScrolling = useRef(false);
  const index = Math.max(0, values.indexOf(value));

  /* a value set from outside (a first load, a day pulled back into a shorter month) moves the column */
  useEffect(() => {
    const el = ref.current;
    if (!el || userScrolling.current) return;
    const top = index * WHEEL_ROW;
    if (Math.abs(el.scrollTop - top) > 1) el.scrollTo({ top, behavior: el.scrollTop === 0 && index > 0 ? "auto" : "smooth" });
  }, [index, values.length]);

  const onScroll = () => {
    userScrolling.current = true;
    if (settling.current) window.clearTimeout(settling.current);
    settling.current = window.setTimeout(() => {
      userScrolling.current = false;
      const el = ref.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_ROW)));
      if (values[i] !== value) onChange(values[i]);
    }, 90);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = values[Math.min(values.length - 1, Math.max(0, index + step))];
    if (next !== undefined) onChange(next);
  };

  return (
    <div
      ref={ref}
      className="ob-wheel"
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${label}-${value}`}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      style={{ height: WHEEL_ROW * (PAD_ROWS * 2 + 1) }}
    >
      <div style={{ height: WHEEL_ROW * PAD_ROWS }} aria-hidden="true" />
      {values.map((v) => (
        <button
          key={v}
          id={`${label}-${v}`}
          type="button"
          role="option"
          aria-selected={v === value}
          tabIndex={-1}
          className={v === value ? "is-on" : ""}
          style={{ height: WHEEL_ROW }}
          onClick={() => onChange(v)}
        >
          {format(v)}
        </button>
      ))}
      <div style={{ height: WHEEL_ROW * PAD_ROWS }} aria-hidden="true" />
    </div>
  );
}
