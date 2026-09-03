export const SMART_PIPE_DEFAULT_TITLE = "🌀 BV Smart Pipe";
export const SMART_PIPE_MERGE_DEFAULT_TITLE = "🌀 BV Smart Pipe Merge";

export function nextMergeSourceKey(sources = []) {
  if (sources.length >= 16) return null;
  const used = new Set(sources.map(source => source.key));
  const ordinals = [...used].filter(key => /^pipe_\d+$/.test(key)).map(key => Number(key.slice(5))).filter(Number.isSafeInteger);
  let ordinal = Math.max(0, ...ordinals) + 1;
  if (!Number.isSafeInteger(ordinal) || ordinal > 16) ordinal = 1;
  for (; ordinal <= 16; ordinal++) {
    const key = `pipe_${String(ordinal).padStart(3, "0")}`;
    if (!used.has(key)) return key;
  }
  return null;
}

export function mergeSourceIdentity(source) {
  return String(source?.address || "").trim() || null;
}

export function hasMergeSource(sources, candidate) {
  const identity = mergeSourceIdentity(candidate);
  return Boolean(identity && (sources || []).some((source) => mergeSourceIdentity(source) === identity));
}

export function normalizeMergeSources(sources, connectedWiredKeys = new Set()) {
  const normalized = [];
  const seenKeys = new Set();
  const seenAddresses = new Set();
  for (const source of sources || []) {
    const key = String(source?.key || "").trim();
    const mode = source?.mode === "wired" ? "wired" : "wireless";
    const address = mergeSourceIdentity(source);
    if (!/^pipe_\d+$/.test(key) || seenKeys.has(key)) continue;
    if (mode === "wired" && !connectedWiredKeys.has(key)) continue;
    if (mode === "wireless" && !address) continue;
    if (address && seenAddresses.has(address)) continue;
    seenKeys.add(key);
    if (address) seenAddresses.add(address);
    normalized.push(source);
  }
  return normalized;
}

export function duplicateDynamicInputIndexes(inputs) {
  const groups = new Map();
  (inputs || []).forEach((input, index) => {
    if (!/^pipe_\d+$/.test(input?.name || "")) return;
    const indexes = groups.get(input.name) || [];
    indexes.push(index);
    groups.set(input.name, indexes);
  });
  const duplicates = [];
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const keep = indexes.find((index) => inputs[index]?.link != null) ?? indexes[0];
    duplicates.push(...indexes.filter((index) => index !== keep));
  }
  return duplicates.sort((left, right) => right - left);
}

export function mergePipeSchemas(schemas) {
  const order = [];
  const byId = new Map();
  const canonicalIdById = new Map();
  const normalizedName = (slot) => String(slot?.name || "").trim().toLocaleLowerCase();
  const compatibleTypes = (left, right) => !left || !right || left === "*" || right === "*" || left === right;
  for (const schema of schemas || []) {
    for (const slot of schema || []) {
      if (!slot?.id) continue;
      let canonicalId = canonicalIdById.get(slot.id);
      if (!canonicalId) {
        canonicalId = order.find((id) => {
          const candidate = byId.get(id);
          return normalizedName(candidate) === normalizedName(slot)
            && compatibleTypes(candidate?.type, slot.type);
        }) || slot.id;
        canonicalIdById.set(slot.id, canonicalId);
      }
      if (!byId.has(canonicalId)) {
        order.push(canonicalId);
        byId.set(canonicalId, { ...slot, id: canonicalId, aliases: [] });
        continue;
      }
      const current = byId.get(canonicalId);
      const aliases = new Set([...(current.aliases || []), ...(slot.aliases || [])]);
      if (slot.id !== canonicalId) aliases.add(slot.id);
      const type = current.type === "*" && slot.type && slot.type !== "*" ? slot.type : current.type;
      byId.set(canonicalId, { ...current, type, aliases: [...aliases] });
    }
  }
  return order.map((id, index) => ({ ...byId.get(id), ordinal: index + 1 }));
}

export function compactMergeNodeHeight(wiredSourceCount) {
  return 88 + Math.max(0, Number(wiredSourceCount) || 0) * 22;
}
