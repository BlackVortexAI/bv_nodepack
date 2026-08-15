export function parseDynamicComboOptions(text) {
  return String(text ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

export function normalizeDynamicComboSelection(value, options) {
  const current = String(value ?? "");
  return options.includes(current) || options.length === 0 ? current : options[0];
}
