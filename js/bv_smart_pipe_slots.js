export function updateSmartPipePort(port, label, type, slotId) {
  if (port.label === label && port.localized_name === label && port.type === type && port.bvSlotId === slotId) return port;
  return { ...port, label, localized_name: label, type, bvSlotId: slotId };
}

export function moveMarkedPortToEnd(ports, predicate) {
  const index = ports?.findIndex(predicate) ?? -1;
  if (index < 0 || index === ports.length - 1) return ports;
  ports.push(ports.splice(index, 1)[0]);
  return ports;
}

export function reusableSmartPipePortIndex(ports, { slotId, portName, label, type }) {
  let index = ports?.findIndex((item) => item.bvSlotId === slotId) ?? -1;
  if (index >= 0) return index;
  const candidates = (ports || []).map((item, candidateIndex) => ({ item, candidateIndex })).filter(({ item }) =>
    !item.bvSlotId && item.name !== "pipe" && !item.bvAddSlot && smartPipeTypesAreCompatible(item.type, type)
    && (item.name === portName || item.label === label || item.localized_name === label || item.name === label));
  const connected = candidates.find(({ item }) => item.link != null || Boolean(item.links?.length));
  if (connected) return connected.candidateIndex;
  const exact = candidates.find(({ item }) => item.name === portName);
  if (exact) return exact.candidateIndex;
  index = candidates[0]?.candidateIndex ?? -1;
  if (index < 0) index = ports?.findIndex((item) => !item.bvSlotId && item.name !== "pipe" && !item.bvAddSlot
    && (item.label === label || item.localized_name === label || item.name === label)
    && smartPipeTypesAreCompatible(item.type, type)) ?? -1;
  return index;
}

function smartPipeTypesAreCompatible(left, right) {
  const leftTypes = String(left || "*").split(",").map((value) => value.trim()).filter(Boolean);
  const rightTypes = String(right || "*").split(",").map((value) => value.trim()).filter(Boolean);
  return leftTypes.includes("*") || rightTypes.includes("*") || leftTypes.some((candidate) => rightTypes.includes(candidate));
}

export function retainedMissingSlots(previous, upstreamIds, isUsed) {
  return previous.filter((slot) => !upstreamIds.has(slot.id) && isUsed(slot));
}

export function promoteInheritedSlot(state, slotId, inferredType) {
  const inherited = state.inheritedSlots?.find((slot) => slot.id === slotId);
  if (!inherited) return null;
  const local = {
    ...inherited,
    type: inherited.type === "*" && inferredType && inferredType !== "*" ? inferredType : inherited.type || inferredType || "*",
    showInput: true,
    showOutput: inherited.showOutput ?? false,
    missing: false,
  };
  state.inheritedSlots = state.inheritedSlots.filter((slot) => slot.id !== slotId);
  state.localSlots.push(local);
  return local;
}

export function promoteConnectedInheritedSlots(state, connectedSlotIds) {
  const promoted = [];
  for (const slot of [...(state.inheritedSlots || [])]) {
    if (connectedSlotIds.has(slot.id)) promoted.push(promoteInheritedSlot(state, slot.id));
  }
  return promoted.filter(Boolean);
}

export function smartPipeSlotName(value, fallback = "new_slot") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

export function uniqueSmartPipeSlotName(base, usedNames) {
  if (!usedNames.has(base)) return base;
  let suffix = 2;
  while (usedNames.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

export function resolveLocalSlotNameCollisions(localSlots, reservedNames) {
  const usedNames = new Set(reservedNames);
  const renamed = [];
  for (const slot of localSlots) {
    const original = slot.name;
    slot.name = uniqueSmartPipeSlotName(original, usedNames);
    usedNames.add(slot.name);
    if (slot.name !== original) renamed.push({ id: slot.id, from: original, to: slot.name });
  }
  return renamed;
}

export function nextFreeOrdinal(usedOrdinals, start, maximum) {
  let ordinal = Math.max(1, start);
  while (ordinal <= maximum && usedOrdinals.has(ordinal)) ordinal++;
  return ordinal <= maximum ? ordinal : undefined;
}
