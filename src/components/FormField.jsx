/** @param {{label: string, value: string|number, onChange: (v:string)=>void, type?: string}} props */
export function TextField({ label, value, onChange, type = "text" }) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** @param {{label: string, checked: boolean, onChange: (v:boolean)=>void}} props */
export function CheckField({ label, checked, onChange }) {
  return (
    <label className={`form-field checkbox ${checked ? "checked" : ""}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** @param {{label: string, value: string, options: string[], onChange: (v:string)=>void}} props */
export function SelectField({ label, value, options, onChange }) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
