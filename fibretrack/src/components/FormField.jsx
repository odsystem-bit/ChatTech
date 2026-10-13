/** @param {{label: string, value: string|number, onChange: (v:string)=>void, onBlur?: ()=>void, type?: string}} props */
export function TextField({ label, value, onChange, onBlur, type = "text" }) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

/** @param {{label: string, checked: boolean, onChange: (v:boolean)=>void, onBlur?: ()=>void}} props */
export function CheckField({ label, checked, onChange, onBlur }) {
  return (
    <label className={`form-field checkbox ${checked ? "checked" : ""}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        onBlur={onBlur}
      />
      <span>{label}</span>
    </label>
  );
}

/** @param {{label: string, value: string, options: string[], onChange: (v:string)=>void, onBlur?: ()=>void}} props */
export function SelectField({ label, value, options, onChange, onBlur }) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
