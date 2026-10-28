import css from "./Segmented.module.css";

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className={css.seg}>
      {options.map((o) => (
        <button key={o.id} type="button" className={o.id === value ? css.on : undefined} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
