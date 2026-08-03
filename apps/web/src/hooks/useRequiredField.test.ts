import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { describe, expect, it } from "vitest";
import { useRequiredField } from "./useRequiredField";

function changeEvent(value: string) {
  return { target: { value } } as ChangeEvent<HTMLInputElement>;
}

describe("useRequiredField", () => {
  it("starts with no error", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));
    expect(result.current.error).toBeNull();
  });

  it("sets the error message when validating a blank value", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));

    act(() => {
      expect(result.current.validate()).toBe(false);
    });

    expect(result.current.error).toBe("Name is required.");
  });

  it("treats a whitespace-only value as blank", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));

    act(() => {
      result.current.onChange(changeEvent("   "));
    });
    act(() => {
      expect(result.current.validate()).toBe(false);
    });

    expect(result.current.error).toBe("Name is required.");
  });

  it("passes validation and has no error for a non-blank value", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));

    act(() => {
      result.current.onChange(changeEvent("Sushi Spot"));
    });
    act(() => {
      expect(result.current.validate()).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it("clears an existing error as soon as the value changes", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));

    act(() => {
      result.current.validate();
    });
    expect(result.current.error).toBe("Name is required.");

    act(() => {
      result.current.onChange(changeEvent("a"));
    });

    expect(result.current.error).toBeNull();
  });

  it("reset clears both value and error", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));

    act(() => {
      result.current.onChange(changeEvent("Sushi Spot"));
      result.current.validate();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.value).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("inputProps reflects value and aria-invalid", () => {
    const { result } = renderHook(() => useRequiredField("Name is required."));

    expect(result.current.inputProps.value).toBe("");
    expect(result.current.inputProps["aria-invalid"]).toBe(false);

    act(() => {
      result.current.validate();
    });

    expect(result.current.inputProps["aria-invalid"]).toBe(true);
  });
});
