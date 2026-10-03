/** A choice of a few, side by side (Light/Dark, On/Off). Styled by `.theme` in app.css.
 *  With `multiple`, each button toggles on its own and `value` is the list that is on
 *  (in option order), so any mix — or none — can be picked. */
type Choice<T> = { multiple?: false; value: T; onChange: (value: T) => void } | { multiple: true; value: T[]; onChange: (value: T[]) => void };

export function Segmented<T extends string>(props: { label: string; options: { value: T; label: string }[] } & Choice<T>) {
  const { label, options } = props;
  const on = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const pick = (v: T) => {
    if (!props.multiple) return props.onChange(v);
    props.onChange(options.map((o) => o.value).filter((x) => (x === v ? !on(x) : on(x))));
  };
  return (
    <div className="theme" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={on(o.value)} onClick={() => pick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
