export function SelectControl({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}
