// Shared native-slot identity contract. Names are schema keys, never labels/types.
const configuringNodes = new WeakMap();
const configuredPrototypes = new WeakSet();
export const nativeSlotsAreConfiguring = node => (configuringNodes.get(node) || 0) > 0;
export function installNativeSlotConfigureTransaction(nodeType, validate = () => {}) {
  const prototype = nodeType.prototype;
  if (configuredPrototypes.has(prototype)) return;
  const original = prototype.configure;
  if (typeof original !== "function") return;
  configuredPrototypes.add(prototype);
  prototype.configure = function(data, ...args) {
    validate(data);
    const depth = configuringNodes.get(this) || 0;
    configuringNodes.set(this, depth + 1);
    try { return original.call(this, data, ...args); }
    finally { if (depth) configuringNodes.set(this, depth); else configuringNodes.delete(this); }
  };
}
export function updateNativeSlot(slot, values) {
  Object.assign(slot, values);
  return slot;
}

export function reusableNativeSlotIndex(ports, id, name, identityKey = "bvSlotId") {
  const entries = (ports || []).map((slot, index) => ({slot, index}));
  const identified = entries.filter(({slot}) => slot[identityKey] === id);
  const candidates = identified.length ? identified : entries.filter(({slot}) => !slot[identityKey] && slot.name === name);
  return (candidates.find(({slot}) => slot.link != null || Boolean(slot.links?.length)) || candidates[0])?.index ?? -1;
}

export function resolveNativeSlot(slot, definitions, identityKey = "bvSlotId") {
  const identity = slot?.[identityKey];
  const matches = definitions.filter(definition => identity ? definition.id === identity : definition.name === slot?.name);
  if (matches.length !== 1) throw new Error(`Missing or ambiguous slot identity: ${slot?.name}`);
  if (identity && definitions.some(definition => definition.name === slot.name && definition.id !== identity)) throw new Error(`Conflicting slot identity: ${slot.name}`);
  return matches[0];
}

export function validateSavedSlotIdentities(slots, definitions, identityKey = "bvSlotId") {
  const seen = new Set();
  for (const slot of slots || []) {
    if (!slot[identityKey]) continue;
    const definition = resolveNativeSlot(slot, definitions, identityKey);
    if (seen.has(definition.id)) throw new Error(`Duplicate saved slot identity: ${definition.id}`);
    seen.add(definition.id);
  }
}

export function nativeOutputIndexMap(outputs, definitions, reserved = {pipe: 0}) {
  const result = {}, identities = new Set();
  if (definitions.some(item => !item.id || !Number.isInteger(item.executionIndex) || item.executionIndex < 0 || Object.values(reserved).includes(item.executionIndex))) throw new Error("Invalid execution slot schema");
  if (new Set(definitions.map(item => item.id)).size !== definitions.length || new Set(definitions.map(item => item.executionIndex)).size !== definitions.length) throw new Error("Ambiguous execution slot schema");
  for (const [name, index] of Object.entries(reserved)) if (outputs?.[index]?.name !== name) throw new Error(`Missing reserved output: ${name}`);
  for (const [index, slot] of (outputs || []).entries()) {
    if (Object.hasOwn(reserved, slot.name)) {
      if (index !== reserved[slot.name] || slot.bvSlotId || (outputs || []).filter(item => item.name === slot.name).length !== 1) throw new Error(`Conflicting reserved output: ${slot.name}`);
      result[index] = reserved[slot.name]; continue;
    }
    const definition = resolveNativeSlot(slot, definitions);
    if (identities.has(definition.id)) throw new Error(`Duplicate output identity: ${definition.id}`);
    identities.add(definition.id);
    result[index] = definition.executionIndex;
  }
  return result;
}

export function validateNativeOutputLinks(prompt, maps) {
  for (const entry of Object.values(prompt || {})) for (const value of Object.values(entry?.inputs || {})) {
    if (!Array.isArray(value) || value.length !== 2) continue;
    const map = maps[String(value[0])];
    if (map && (!Number.isInteger(value[1]) || !Object.hasOwn(map, value[1]))) throw new Error(`Unknown connected output index: ${value[0]}:${value[1]}`);
  }
}

export function validateConnectedSlotIdentities(ports, connected, reserved, identityKey = "bvSlotId") {
  duplicateNativeSlotRemovals(ports, connected, reserved);
  const identities = new Set();
  for (const slot of ports || []) {
    if (reserved(slot) || !connected(slot)) continue;
    const key = slot[identityKey] || slot.name;
    if (identities.has(key)) throw new Error(`Ambiguous connected slot identity: ${slot.name}`);
    identities.add(key);
  }
}

/** Plan all removals first: no stale indices across duplicate groups, no lost links. */
export function duplicateNativeSlotRemovals(ports, connected, reserved = slot => slot.name === "pipe") {
  const groups = new Map();
  for (const [index, slot] of (ports || []).entries()) {
    if (reserved(slot)) continue;
    const group = groups.get(slot.name) || []; group.push({slot, index}); groups.set(slot.name, group);
  }
  const removals = [];
  for (const group of groups.values()) {
    const linked = group.filter(({slot}) => connected(slot));
    if (linked.length > 1) throw new Error(`Ambiguous connected slot: ${group[0].slot.name}`);
    const keep = linked[0] || group[0];
    for (const item of group) if (item !== keep) removals.push(item.index);
  }
  return removals.sort((a, b) => b - a);
}

/** Restore saved physical order before the enclosing graph restores link indices. */
export function restoreNativeSlotOrder(node, data, createMissing, identityKey = "bvSlotId") {
  const plans = [];
  for (const field of ["inputs", "outputs"]) {
    if (!Array.isArray(data?.[field])) continue;
    const used = new Set();
    const names = new Set();
    // Native cloneObject copies saved array indices onto the existing backend
    // array without truncating it. During configure the matching prefix is the
    // authoritative saved contract; trailing factory slots may duplicate names.
    const savedPrefix = nativeSlotsAreConfiguring(node) && data[field].every((saved, index) => {
      const slot = node[field]?.[index];
      if (slot?.name !== saved.name) return false;
      return field === "inputs" ? (slot.link ?? null) === (saved.link ?? null)
        : JSON.stringify(slot.links || []) === JSON.stringify(saved.links || []);
    });
    const ordered = data[field].map((saved, index) => {
      if (names.has(saved.name)) throw new Error(`Ambiguous saved ${field} slot: ${saved.name}`);
      names.add(saved.name);
      const matches = savedPrefix ? [node[field][index]] : (node[field] || []).filter(slot => slot.name === saved.name);
      if (matches.length > 1 || (matches.length && used.has(matches[0]))) throw new Error(`Ambiguous saved ${field} slot: ${saved.name}`);
      if (matches[0]?.[identityKey] && saved[identityKey] && matches[0][identityKey] !== saved[identityKey]) throw new Error(`Conflicting saved slot identity: ${saved.name}`);
      if (!matches.length) {
        const create = createMissing?.(field, saved);
        if (!create) throw new Error(`Missing saved ${field} slot: ${saved.name}`);
        if (used.has(saved.name)) throw new Error(`Duplicate saved slot: ${saved.name}`);
        used.add(saved.name);
        return {create, saved};
      }
      used.add(matches[0]);
      return {slot: matches[0], saved};
    });
    plans.push({field, ordered, savedPrefix});
  }
  for (const {field, ordered, savedPrefix} of plans) {
    for (const item of ordered) {
      if (item.create) item.slot = item.create();
      if (item.saved[identityKey]) item.slot[identityKey] = item.saved[identityKey];
      else if (savedPrefix) delete item.slot[identityKey];
    }
    node[field].splice(0, node[field].length, ...ordered.map(item => item.slot));
    node[field].forEach((slot, index) => {
      if (Object.hasOwn(slot, "slot_index")) slot.slot_index = index;
    });
  }
}

export function serializeNativeSlotIdentities(node, data, identityKey = "bvSlotId") {
  for (const field of ["inputs", "outputs"]) for (const [index, slot] of (node[field] || []).entries()) {
    if (slot[identityKey] && data[field]?.[index]) data[field][index][identityKey] = slot[identityKey];
  }
}
