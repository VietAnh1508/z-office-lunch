---
paths:
  - "apps/web/src/**/*.tsx"
---

# Required-field validation

Every required text input uses `useRequiredField` (`apps/web/src/hooks/useRequiredField.ts`) instead of the native HTML `required` attribute:

```tsx
const name = useRequiredField("Name is required.");

async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
  e.preventDefault();
  if (!name.validate()) return;
  // ... submit using name.value ...
  name.reset();
}

return (
  <form onSubmit={handleSubmit} noValidate>
    <Input placeholder="Name" {...name.inputProps} />
    {name.error && <p className="text-sm text-destructive">{name.error}</p>}
    ...
  </form>
);
```

- The `<form>` gets `noValidate` so the browser never shows its own validation bubble — the inline `<p className="text-sm text-destructive">` under the field is the only validation UI the user sees.
- `handleSubmit` calls `validate()` before doing anything else and bails out if it returns `false` — never posts with a known-invalid field.
- A field-level error (`name.error`) renders directly under that field. It stays separate from API/network failures (a failed request, a 500, a dropped connection) on submit — those now surface as a toast, see `.claude/rules/mutation-feedback.md` — never repurpose a toast for a validation message a field owns itself.

Established in `apps/web/src/routes/admin/Restaurants.tsx`'s Name field — see `tasks/011-custom-required-field-validation.md`.
