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

/** @param {{label: string, value: string, onChange: (v:string)=>void, onScanClick: ()=>void, scanLabel?: string, placeholder?: string}} props */
export function ScannableField({ label, value, onChange, onScanClick, scanLabel = "Scanner", placeholder = "" }) {
  return (
    <div className="form-field scannable-field">
      <span>{label}</span>
      <div className="scannable-input-group">
        <input
          type="text"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn-scan-trigger"
          onClick={onScanClick}
          title={`Scanner le code-barres pour ${label}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="8" x2="7" y2="16" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="17" y1="8" x2="17" y2="16" />
          </svg>
          <span>{scanLabel}</span>
        </button>
      </div>
    </div>
  );
}

