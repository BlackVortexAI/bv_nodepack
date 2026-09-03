export const ROUTE_INPUT = "bv_smart_pipe_route_json";
export const ROOT_ROUTING_PROPERTY = "bvSmartPipeRootId";
export const ROUTE_REGISTRY_PROPERTY = "bvSmartPipeRoutes";
export const HOST_ROUTING_PROPERTY = "bvSmartPipeHost";

export function logicalAddress(rootId, hostPath, nodeId) {
  return [rootId, ...(hostPath || []), nodeId].map((part) => encodeURIComponent(String(part))).join("/");
}

export function parseLogicalAddress(address) {
  return String(address || "").split("/").filter(Boolean).map((part) => decodeURIComponent(part));
}

export function cloneRouteRegistryPrefix(registry, oldPrefix, newPrefix) {
  const normalizedOld = `${String(oldPrefix).replace(/\/$/, "")}/`;
  const normalizedNew = `${String(newPrefix).replace(/\/$/, "")}/`;
  const additions = [];
  for (const [destination, edge] of Object.entries(registry || {})) {
    if (!destination.startsWith(normalizedOld)) continue;
    const clonedDestination = `${normalizedNew}${destination.slice(normalizedOld.length)}`;
    if (registry[clonedDestination]) continue;
    const cloned = typeof structuredClone === "function" ? structuredClone(edge) : JSON.parse(JSON.stringify(edge));
    if (cloned.predecessorAddress?.startsWith(normalizedOld)) {
      cloned.predecessorAddress = `${normalizedNew}${cloned.predecessorAddress.slice(normalizedOld.length)}`;
    }
    for (const source of cloned.sources || []) {
      if (source.address?.startsWith(normalizedOld)) {
        source.address = `${normalizedNew}${source.address.slice(normalizedOld.length)}`;
      }
    }
    additions.push([clonedDestination, cloned]);
  }
  for (const [destination, edge] of additions) registry[destination] = edge;
  return additions.length;
}

// Pure preparation: callers publish only after the complete mapping has passed.
export function relocateRouteRegistry(registry, mapping) {
  const targets = new Set();
  for (const [oldAddress, newAddress] of mapping) {
    if (targets.has(newAddress) || (oldAddress !== newAddress && registry[newAddress] && !mapping.has(newAddress))) {
      throw new Error(`SmartPipe relocation target conflict: ${newAddress}`);
    }
    targets.add(newAddress);
  }
  const result = structuredClone(registry);
  for (const address of mapping.keys()) delete result[address];
  for (const [address, edge] of Object.entries(registry)) {
    const cloned = structuredClone(edge);
    if (mapping.has(cloned.predecessorAddress)) cloned.predecessorAddress = mapping.get(cloned.predecessorAddress);
    for (const source of cloned.sources || []) {
      if (mapping.has(source.address)) source.address = mapping.get(source.address);
    }
    result[mapping.get(address) || address] = cloned;
  }
  return result;
}

export function reconcileRouteRegistryDestinations(registry, liveAddresses, state, now, graceMs = 1000) {
  state.missingSince ??= new Map();
  state.backups ??= new Map();
  let removed = 0;
  let restored = 0;
  for (const address of liveAddresses) {
    state.missingSince.delete(address);
    if (!registry[address] && state.backups.has(address)) {
      registry[address] = state.backups.get(address);
      state.backups.delete(address);
      restored++;
    }
  }
  for (const [address, edge] of Object.entries(registry || {})) {
    if (liveAddresses.has(address)) continue;
    const missingSince = state.missingSince.get(address);
    if (missingSince == null) {
      state.missingSince.set(address, now);
      continue;
    }
    if (now - missingSince < graceMs) continue;
    state.backups.set(address, edge);
    state.missingSince.delete(address);
    delete registry[address];
    removed++;
  }
  return { removed, restored };
}

export function uniqueHostName(baseName, usedNames) {
  return uniqueRoutingName(baseName || "Subgraph", usedNames);
}

export function detachedHostRouting(value) {
  return { ...(value || {}) };
}

export function preferredHostRoutingName({ storedName, storedDefinitionName, title, lastAppliedTitle, definitionName }) {
  const definitionWasRenamed = Boolean(storedDefinitionName && definitionName && storedDefinitionName !== definitionName);
  const legacyDefaultName = !storedDefinitionName && /^New Subgraph(?:_\d+)?$/.test(storedName || title || "");
  if (definitionWasRenamed || (legacyDefaultName && definitionName)) return definitionName;
  if (lastAppliedTitle && title && title !== lastAppliedTitle) return title;
  return storedName || title || definitionName || "Subgraph";
}

export function routingChoiceLabel(number, name) {
  const parts = String(number).split(".");
  const position = Math.max(1, Number.parseInt(parts[1] || "1", 10) || 1);
  const level = Math.max(0, position - 1) + Math.max(0, parts.length - 2);
  return `${"\u00a0".repeat(level * 3)}${number}. ${name}`;
}

export function compareRoutingNumbers(left, right) {
  const leftParts = String(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index++) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function uniqueRoutingName(baseName, usedNames) {
  const base = String(baseName || "Pipe").trim() || "Pipe";
  if (!usedNames.has(base)) return base;
  let suffix = 1;
  while (usedNames.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

export function routingCollisionOwner(left, right) {
  const leftInitialized = Boolean(left?.__bvLastRoutingTitle);
  const rightInitialized = Boolean(right?.__bvLastRoutingTitle);
  if (leftInitialized !== rightInitialized) return leftInitialized ? left : right;
  const graph = left?.graph && left.graph === right?.graph ? left.graph : null;
  const nodes = graph?._nodes || graph?.nodes || [];
  const leftIndex = nodes.indexOf(left);
  const rightIndex = nodes.indexOf(right);
  if (leftIndex >= 0 && rightIndex >= 0 && leftIndex !== rightIndex) {
    return leftIndex < rightIndex ? left : right;
  }
  return String(left?.id ?? "") <= String(right?.id ?? "") ? left : right;
}

export function executionScope(executionId) {
  const parts = String(executionId).split(":");
  parts.pop();
  return parts.join(":");
}

export function crossScopeDescriptors(descriptors, ownDescriptor) {
  const ownPath = ownDescriptor?.hostPath || [];
  return (descriptors || []).filter((descriptor) => {
    if (!descriptor || descriptor.address === ownDescriptor?.address) return false;
    const path = descriptor.hostPath || [];
    return path.length !== ownPath.length || path.some((part, index) => part !== ownPath[index]);
  });
}

export function routingDisplayNumbers(routes) {
  const byId = new Map(routes.map((route) => [route.nodeId, route]));
  const routeIndexes = new Map(routes.map((route, index) => [route.nodeId, index]));
  const routeSort = (left, right) => String(left.name).localeCompare(String(right.name)) || String(left.nodeId).localeCompare(String(right.nodeId));
  const graphOrderSort = (left, right) => (routeIndexes.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER)
    - (routeIndexes.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER) || routeSort(left, right);
  const rootById = new Map();
  const rootOf = (route, visiting = new Set()) => {
    if (rootById.has(route.nodeId)) return rootById.get(route.nodeId);
    if (route.mode === "merge" || route.mode !== "follow" || !byId.has(route.predecessorId) || visiting.has(route.nodeId)) {
      rootById.set(route.nodeId, route);
      return route;
    }
    visiting.add(route.nodeId);
    const root = rootOf(byId.get(route.predecessorId), visiting);
    visiting.delete(route.nodeId);
    rootById.set(route.nodeId, root);
    return root;
  };
  routes.forEach((route) => rootOf(route));
  const roots = [...new Map(routes.map((route) => {
    const root = rootById.get(route.nodeId);
    return [root.nodeId, root];
  })).values()];
  const dependencies = new Map(roots.map((root) => [root.nodeId, new Set()]));
  for (const root of roots) {
    if (root.mode !== "merge") continue;
    for (const sourceId of root.sourceIds || []) {
      const source = byId.get(sourceId);
      const sourceRoot = source && rootById.get(source.nodeId);
      if (sourceRoot && sourceRoot.nodeId !== root.nodeId) dependencies.get(root.nodeId).add(sourceRoot.nodeId);
    }
  }
  const orderedRoots = [];
  const emitted = new Set();
  while (orderedRoots.length < roots.length) {
    const ready = roots.filter((root) => !emitted.has(root.nodeId)
      && [...dependencies.get(root.nodeId)].every((dependency) => emitted.has(dependency))).sort(graphOrderSort);
    const next = ready[0] || roots.filter((root) => !emitted.has(root.nodeId)).sort(graphOrderSort)[0];
    emitted.add(next.nodeId);
    orderedRoots.push(next);
  }
  const rootNumbers = new Map(orderedRoots.map((root, index) => [root.nodeId, index + 1]));
  const children = new Map();
  for (const route of routes) {
    if (route.mode !== "follow" || !byId.has(route.predecessorId)) continue;
    const group = children.get(route.predecessorId) || [];
    group.push(route);
    children.set(route.predecessorId, group);
  }
  children.forEach((group) => group.sort(routeSort));
  const labels = new Map();
  const labelChildren = (route, tree, depth, branchPath, visiting = new Set()) => {
    if (visiting.has(route.nodeId)) return;
    visiting.add(route.nodeId);
    labels.set(route.nodeId, [tree, depth, ...branchPath].join("."));
    const descendants = children.get(route.nodeId) || [];
    descendants.forEach((child, index) => {
      if (descendants.length === 1) labelChildren(child, tree, depth + 1, branchPath, visiting);
      else labelChildren(child, tree, depth, [...branchPath, index + 1], visiting);
    });
    visiting.delete(route.nodeId);
  };
  for (const root of orderedRoots) labelChildren(root, rootNumbers.get(root.nodeId), 1, []);
  return labels;
}

export function predecessorChoiceRoutes(routes, destinationId) {
  const blocked = new Set(destinationId ? [destinationId] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const route of routes || []) {
      if (blocked.has(route.nodeId)) continue;
      const dependsOnBlocked = route.mode === "follow"
        ? blocked.has(route.predecessorId)
        : route.mode === "merge" && (route.sourceIds || []).some((sourceId) => blocked.has(sourceId));
      if (!dependsOnBlocked) continue;
      blocked.add(route.nodeId);
      changed = true;
    }
  }
  return (routes || []).filter((route) => !blocked.has(route.nodeId));
}

export function effectiveDescriptorMode(descriptor) {
  const modes = [descriptor?.node?.mode, ...(descriptor?.ancestorModes || [])];
  return modes.includes(2) ? 2 : modes.includes(4) ? 4 : 0;
}

export function promptModeState(descriptors = [], registry = {}) {
  const muted = descriptors.filter((descriptor) => effectiveDescriptorMode(descriptor) === 2);
  const bypassed = descriptors.filter((descriptor) => descriptor?.kind === "pipe" && effectiveDescriptorMode(descriptor) === 4);
  return {
    bypassedAddresses: new Set(bypassed.map((descriptor) => descriptor.address)),
    bypassPredecessorAddresses: new Map(bypassed.map((descriptor) => {
      if (Object.hasOwn(descriptor, "physicalPredecessorAddress")) return [descriptor.address, descriptor.physicalPredecessorAddress];
      if (registry[descriptor.address]?.predecessorAddress) return [descriptor.address, registry[descriptor.address].predecessorAddress];
      const predecessor = descriptors.find((candidate) => candidate?.kind === "pipe"
        && executionScope(candidate.executionId) === executionScope(descriptor.executionId)
        && candidate.route?.nodeId === descriptor.route?.predecessorId);
      return predecessor ? [descriptor.address, predecessor.address] : null;
    }).filter(Boolean)),
    mutedAddresses: new Set(muted.map((descriptor) => descriptor.address)),
    prunedExecutionIds: new Set(muted.map((descriptor) => descriptor.executionId)),
  };
}

function parseRoute(entry, executionId) {
  const raw = entry?.inputs?.[ROUTE_INPUT];
  if (typeof raw !== "string") return null;
  try {
    const route = JSON.parse(raw);
    if (!route?.nodeId) return null;
    return { executionId, entry, route, scope: executionScope(executionId) };
  } catch {
    throw new Error(`BV Smart Pipe ${executionId}: Routing metadata is invalid.`);
  }
}

export function materializeAddressedPipeLinks(apiPrompt, addressByExecutionId, routeRegistry = {}, modeState = {}) {
  const executionByAddress = new Map();
  for (const [executionId, address] of Object.entries(addressByExecutionId || {})) {
    if (executionByAddress.has(address)) throw new Error(`Duplicate BV Smart Pipe address: ${address}`);
    executionByAddress.set(address, executionId);
  }
  const bypassedAddresses = modeState.bypassedAddresses || new Set();
  const mutedAddresses = modeState.mutedAddresses || new Set();
  const resolvePredecessor = (destinationAddress, predecessorAddress, visited = new Set()) => {
    if (mutedAddresses.has(predecessorAddress)) {
      return null;
    }
    if (bypassedAddresses.has(predecessorAddress)) {
      if (visited.has(predecessorAddress)) {
        throw new Error(`BV Smart Pipe "${destinationAddress}": Bypass cycle detected at "${predecessorAddress}".`);
      }
      visited.add(predecessorAddress);
      const recorded = modeState.bypassPredecessorAddresses;
      const next = recorded?.has(predecessorAddress) ? recorded.get(predecessorAddress) : routeRegistry?.[predecessorAddress]?.predecessorAddress;
      if (!next) {
        throw new Error(`BV Smart Pipe "${destinationAddress}": Bypassed predecessor "${predecessorAddress}" has no predecessor to pass through.`);
      }
      return resolvePredecessor(destinationAddress, next, visited);
    }
    const predecessorId = executionByAddress.get(predecessorAddress);
    if (!predecessorId || !["BV Smart Pipe", "BV Smart Pipe Merge"].includes(apiPrompt?.[predecessorId]?.class_type)) {
      throw new Error(`BV Smart Pipe "${destinationAddress}": Cross-scope predecessor "${predecessorAddress}" is missing.`);
    }
    return predecessorId;
  };
  const edges = new Map();
  for (const [destinationAddress, route] of Object.entries(routeRegistry || {})) {
    const destinationId = executionByAddress.get(destinationAddress);
    if (!destinationId || !route?.predecessorAddress) continue;
    const destination = apiPrompt?.[destinationId];
    if (!destination || destination.class_type !== "BV Smart Pipe" || destination.inputs?.pipe != null) continue;
    const predecessorId = resolvePredecessor(destinationAddress, route.predecessorAddress);
    if (!predecessorId) {
      modeState.prunedExecutionIds?.add(destinationId);
      continue;
    }
    edges.set(destinationId, predecessorId);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (executionId) => {
    if (visited.has(executionId)) return;
    if (visiting.has(executionId)) throw new Error(`BV Smart Pipe "${executionId}": Cross-scope cycle detected.`);
    visiting.add(executionId);
    const predecessorId = edges.get(executionId);
    if (predecessorId) visit(predecessorId);
    visiting.delete(executionId);
    visited.add(executionId);
  };
  edges.forEach((_, destinationId) => visit(destinationId));
  for (const [destinationId, predecessorId] of edges) {
    apiPrompt[destinationId].inputs.pipe = [predecessorId, 0];
  }
  return apiPrompt;
}

export function materializeSmartPipeMergeSources(apiPrompt, addressByExecutionId, routeRegistry = {}, modeState = {}) {
  const executionByAddress = new Map(Object.entries(addressByExecutionId || {}).map(([executionId, address]) => [address, executionId]));
  const bypassedAddresses = modeState.bypassedAddresses || new Set();
  const mutedAddresses = modeState.mutedAddresses || new Set();
  const resolveSourceAddress = (destinationAddress, sourceAddress, visited = new Set()) => {
    if (mutedAddresses.has(sourceAddress)) return null;
    if (!bypassedAddresses.has(sourceAddress)) return sourceAddress;
    if (visited.has(sourceAddress)) {
      throw new Error(`BV Smart Pipe Merge "${destinationAddress}": Bypass cycle detected at "${sourceAddress}".`);
    }
    visited.add(sourceAddress);
    const recorded = modeState.bypassPredecessorAddresses;
    const predecessorAddress = recorded?.has(sourceAddress) ? recorded.get(sourceAddress) : routeRegistry?.[sourceAddress]?.predecessorAddress;
    if (!predecessorAddress) {
      throw new Error(`BV Smart Pipe Merge "${destinationAddress}": Bypassed source "${sourceAddress}" has no predecessor to pass through.`);
    }
    return resolveSourceAddress(destinationAddress, predecessorAddress, visited);
  };
  for (const [destinationAddress, route] of Object.entries(routeRegistry || {})) {
    if (route?.kind !== "merge" || !Array.isArray(route.sources)) continue;
    const destinationId = executionByAddress.get(destinationAddress);
    const destination = apiPrompt?.[destinationId];
    if (!destination || destination.class_type !== "BV Smart Pipe Merge") continue;
    const activeSources = [];
    for (const source of route.sources) {
      if (!source?.key) continue;
      const resolvedAddress = resolveSourceAddress(destinationAddress, source.address);
      if (!resolvedAddress) {
        delete destination.inputs[source.key];
        continue;
      }
      activeSources.push(source);
      if (destination.inputs?.[source.key] != null) continue;
      if (source.mode !== "wireless" && resolvedAddress === source.address) continue;
      const predecessorId = executionByAddress.get(resolvedAddress);
      if (!predecessorId || !["BV Smart Pipe", "BV Smart Pipe Merge"].includes(apiPrompt?.[predecessorId]?.class_type)) {
        throw new Error(`BV Smart Pipe Merge "${destinationAddress}": Source "${resolvedAddress || source.label || source.key}" is missing.`);
      }
      destination.inputs[source.key] = [predecessorId, 0];
    }
    destination.inputs.bv_smart_pipe_merge_json = JSON.stringify(activeSources);
    if (route.sources.length && activeSources.length === 0) {
      modeState.prunedExecutionIds?.add(destinationId);
    }
  }
  return apiPrompt;
}

function resolveLocalPredecessor(record, byScope, modeState = {}, visited = new Set()) {
  const key = `${record.scope}\u0000${record.route.predecessorId || ""}`;
  const predecessor = byScope.get(key);
  if (predecessor) return predecessor;
  if (modeState.mutedScopedNodeIds?.has(key)) {
    return null;
  }
  if (modeState.bypassedScopedNodeIds?.has(key)) {
    if (visited.has(key)) throw new Error(`BV Smart Pipe "${record.route.name}": Bypass cycle detected.`);
    visited.add(key);
    const explicitPredecessor = modeState.bypassPredecessorsByScopedNodeId?.get(key);
    if (explicitPredecessor?.kind === "merge") {
      const mergeKey = `${explicitPredecessor.scope}\u0000${explicitPredecessor.route.nodeId}`;
      if (modeState.mutedScopedNodeIds?.has(mergeKey)) return null;
      if (!modeState.activeExecutionIds?.has(explicitPredecessor.executionId)) throw new Error(`BV Smart Pipe "${record.route.name}": Bypassed predecessor Merge is not active.`);
      return explicitPredecessor;
    }
    if (explicitPredecessor) return explicitPredecessor.kind !== "merge" && explicitPredecessor.route?.nodeId
      ? resolveLocalPredecessor({scope:explicitPredecessor.scope,route:{...record.route,predecessorId:explicitPredecessor.route.nodeId}},byScope,modeState,visited)
      : explicitPredecessor;
    if (modeState.bypassPredecessorsByScopedNodeId?.has(key)) throw new Error(`BV Smart Pipe "${record.route.name}": Bypassed predecessor has no proven predecessor to pass through.`);
    const route = modeState.routesByScopedNodeId?.get(key);
    if (!route?.predecessorId) {
      throw new Error(`BV Smart Pipe "${record.route.name}": Bypassed predecessor has no predecessor to pass through.`);
    }
    return resolveLocalPredecessor({ ...record, route }, byScope, modeState, visited);
  }
  throw new Error(`BV Smart Pipe "${record.route.name}": Wireless predecessor is missing.`);
}

export function validateWirelessRecords(records, modeState = {}) {
  const byScope = new Map();
  for (const record of records) {
    const key = `${record.scope}\u0000${record.route.nodeId}`;
    if (byScope.has(key)) throw new Error(`Duplicate BV Smart Pipe ID for "${record.route.name || record.route.nodeId}".`);
    byScope.set(key, record);
  }

  for (const record of records) {
    if (record.entry.inputs?.pipe != null || record.route.mode !== "follow") continue;
    resolveLocalPredecessor(record, byScope, modeState);
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (record) => {
    const key = `${record.scope}\u0000${record.route.nodeId}`;
    if (visited.has(key) || record.entry.inputs?.pipe != null || record.route.mode !== "follow") return;
    if (visiting.has(key)) throw new Error(`BV Smart Pipe "${record.route.name}": Wireless cycle detected.`);
    visiting.add(key);
    const predecessor = byScope.get(`${record.scope}\u0000${record.route.predecessorId}`);
    if (predecessor) visit(predecessor);
    visiting.delete(key);
    visited.add(key);
  };
  records.forEach(visit);
  return byScope;
}

export function materializeWirelessPipeLinks(apiPrompt, modeState = {}) {
  const records = Object.entries(apiPrompt || {})
    .filter(([, entry]) => entry?.class_type === "BV Smart Pipe")
    .map(([executionId, entry]) => parseRoute(entry, executionId))
    .filter(Boolean);
  const byScope = validateWirelessRecords(records, modeState);
  for (const record of records) {
    if (record.entry.inputs?.pipe != null || record.route.mode !== "follow") continue;
    const predecessor = resolveLocalPredecessor(record, byScope, modeState);
    if (!predecessor) modeState.prunedExecutionIds?.add(record.executionId);
    else record.entry.inputs.pipe = [predecessor.executionId, 0];
  }
  return apiPrompt;
}

export function prunePromptBranches(apiPrompt, initialExecutionIds = new Set()) {
  const pruned = new Set([...initialExecutionIds].map(String));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [executionId, entry] of Object.entries(apiPrompt || {})) {
      if (pruned.has(executionId)) continue;
      const dependsOnPruned = Object.values(entry?.inputs || {}).some((value) => Array.isArray(value) && pruned.has(String(value[0])));
      if (!dependsOnPruned) continue;
      pruned.add(executionId);
      changed = true;
    }
  }
  for (const executionId of pruned) delete apiPrompt?.[executionId];
  return apiPrompt;
}

export function validateMaterializedPipeGraph(apiPrompt) {
  const pipeEntries = new Map(Object.entries(apiPrompt || {}).filter(([, entry]) => ["BV Smart Pipe", "BV Smart Pipe Merge"].includes(entry?.class_type)));
  const visiting = new Set();
  const visited = new Set();
  const visit = (executionId) => {
    if (visited.has(executionId)) return;
    if (visiting.has(executionId)) throw new Error(`BV Smart Pipe "${executionId}": Cycle detected across wired and wireless connections.`);
    visiting.add(executionId);
    const inputs = pipeEntries.get(executionId)?.inputs || {};
    for (const [name, value] of Object.entries(inputs)) {
      if (name !== "pipe" && !/^pipe_\d+$/.test(name)) continue;
      const predecessorId = Array.isArray(value) ? String(value[0]) : null;
      if (predecessorId && pipeEntries.has(predecessorId)) visit(predecessorId);
    }
    visiting.delete(executionId);
    visited.add(executionId);
  };
  pipeEntries.forEach((_, executionId) => visit(executionId));
  return apiPrompt;
}

export function remapPromptOutputLinks(apiPrompt, outputIndexMaps) {
  for (const entry of Object.values(apiPrompt || {})) {
    for (const [inputName, value] of Object.entries(entry?.inputs || {})) {
      if (!Array.isArray(value) || value.length < 2) continue;
      const map = outputIndexMaps?.[String(value[0])];
      const remapped = map?.[String(value[1])];
      if (remapped == null || remapped === value[1]) continue;
      entry.inputs[inputName] = [value[0], remapped];
    }
  }
  return apiPrompt;
}

/** Read-only projection of the COMPLETE, validated compiler result. Never resolve
 * routing here: the same compiler owns wired priority, modes, pruning and cycles. */
export function effectiveSmartPipeEdges(apiPrompt, descriptors, wiredInputs = new Map()) {
  const byExecution = new Map(descriptors.map((item) => [String(item.executionId), item]));
  const edges = [];
  for (const [executionId, entry] of Object.entries(apiPrompt || {})) {
    const target = byExecution.get(executionId);
    const classes = { pipe: "BV Smart Pipe", merge: "BV Smart Pipe Merge" };
    if (!target || entry?.class_type !== classes[target.kind]) continue;
    for (const [input, link] of Object.entries(entry.inputs || {})) {
      if (!(target.kind === "pipe" ? input === "pipe" : /^pipe_\d+$/.test(input))) continue;
      if (wiredInputs.get(executionId)?.has(input) || !Array.isArray(link) || link[1] !== 0) continue;
      const source = byExecution.get(String(link[0]));
      if (!source || !classes[source.kind] || apiPrompt[String(link[0])]?.class_type !== classes[source.kind]) continue;
      edges.push(Object.freeze({ source: source.address, target: target.address, targetInput: input }));
    }
  }
  return Object.freeze(edges);
}
