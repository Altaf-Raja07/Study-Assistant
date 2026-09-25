const MAX_CHARS = 4000;

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} props.disabled
 */
export default function TextInput({ value, onChange, disabled }) {
  return (
    <div className="text-input">
      <textarea
        id="notes-input"
        className="text-input__field"
        placeholder="Paste your notes, textbook excerpt, or lecture transcript here..."
        rows={6}
        maxLength={MAX_CHARS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Study material input"
      />
      <label className="text-input__counter" htmlFor="notes-input">
        {value.length} / {MAX_CHARS}
      </label>
    </div>
  );
}
