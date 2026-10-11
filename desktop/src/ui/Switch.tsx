/** The one on/off switch (rule 29: one look per function): `role="switch"`, its state in
 *  `aria-checked`, the accent when on (never the status green, which means "healthy"). `label`
 *  is its accessible name. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}
