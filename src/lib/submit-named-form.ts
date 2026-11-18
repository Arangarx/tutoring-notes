/**
 * Dialogs portal outside the form, and a button `form` attribute does not
 * carry a Next.js server action. Confirm looks the form up by id and submits it.
 */
export function submitNamedForm(
  formId: string,
  prepare?: (form: HTMLFormElement) => void
): void {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) return;
  prepare?.(form);
  form.requestSubmit();
}
