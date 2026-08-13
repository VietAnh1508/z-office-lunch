import { type ChangeEvent, useState } from "react";

export function useRequiredField(errorMessage: string, initialValue = "") {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    setError(null);
  }

  function validate(): boolean {
    if (value.trim() === "") {
      setError(errorMessage);
      return false;
    }
    setError(null);
    return true;
  }

  function reset() {
    setValue(initialValue);
    setError(null);
  }

  return {
    value,
    error,
    onChange,
    validate,
    reset,
    inputProps: {
      value,
      onChange,
      "aria-invalid": error !== null,
    },
  };
}
