// Registered presentation exception: dynamic-pipe-slot-structure.
// See PRESENTATION_EXCEPTIONS in ui/src/regional/nodePresentation.ts.
import { app } from "../../scripts/app.js";
import { moveMarkedPortToEnd, nextFreeOrdinal, promoteConnectedInheritedSlots, promoteInheritedSlot, resolveLocalSlotNameCollisions, retainedMissingSlots, reusableSmartPipePortIndex, smartPipeSlotName, uniqueSmartPipeSlotName, updateSmartPipePort } from "./bv_smart_pipe_slots.js";
import { mergePipeSchemas, SMART_PIPE_DEFAULT_TITLE } from "./bv_smart_pipe_merge_model.js";
import {
  HOST_ROUTING_PROPERTY,
  cloneRouteRegistryPrefix,
  compareRoutingNumbers,
  crossScopeDescriptors,
  detachedHostRouting,
  executionScope,
  logicalAddress,
  materializeAddressedPipeLinks,
  materializeSmartPipeMergeSources,
  materializeWirelessPipeLinks,
  preferredHostRoutingName,
  predecessorChoiceRoutes,
  promptModeState,
  prunePromptBranches,
  reconcileRouteRegistryDestinations,
  ROOT_ROUTING_PROPERTY,
  remapPromptOutputLinks,
  ROUTE_INPUT,
  ROUTE_REGISTRY_PROPERTY,
  routingChoiceLabel,
  routingDisplayNumbers,
  routingCollisionOwner,
  uniqueHostName,
  uniqueRoutingName,
  validateMaterializedPipeGraph,
} from "./bv_smart_pipe_routing.js";

const NODE_CLASS = "BV Smart Pipe";
const MAX_SLOTS = 100;
const ADD_SLOT_NAME = "bv_add_slot";
const activeGraphContexts = new WeakMap();

export function isSmartPipe(node) {
  return node?.comfyClass === NODE_CLASS || node?.type === NODE_CLASS;
}

function stateFor(node) {
  node.properties ??= {};
  node.properties.bvSmartPipe ??= { version: 1, localSlots: [], inheritedSlots: [] };
  const state = node.properties.bvSmartPipe;
  if (!state.nextOrdinal) {
    const slots = [...(state.inheritedSlots || []), ...(state.localSlots || []), ...(state.resolvedSlots || [])];
    state.nextOrdinal = Math.max(0, ...slots.map((slot) => slot.ordinal || 0)) + 1;
  }
  return state;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `bv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pipeNodes(graph) {
  return (graph?._nodes || graph?.nodes || []).filter(isSmartPipe);
}

function propagateGraph(graph) {
  pipeNodes(graph).forEach((candidate) => propagate(candidate));
}

function subgraphFor(node) {
  return node?.subgraph || node?.getSubgraph?.() || null;
}

function graphNodes(graph) {
  return graph?._nodes || graph?.nodes || [];
}

function containsSmartPipe(graph, visited = new Set()) {
  if (!graph || visited.has(graph)) return false;
  visited.add(graph);
  return graphNodes(graph).some((node) => isSmartPipe(node) || isSmartPipeMerge(node) || containsSmartPipe(subgraphFor(node), visited));
}

function rootRoutingState(graph) {
  graph.extra ??= {};
  graph.extra[ROOT_ROUTING_PROPERTY] ??= newId();
  graph.extra[ROUTE_REGISTRY_PROPERTY] ??= {};
  return {
    rootId: graph.extra[ROOT_ROUTING_PROPERTY],
    registry: graph.extra[ROUTE_REGISTRY_PROPERTY],
  };
}

function ensureHostRouting(host, usedIds, usedNames) {
  host.properties ??= {};
  const existing = detachedHostRouting(host.properties[HOST_ROUTING_PROPERTY]);
  host.properties[HOST_ROUTING_PROPERTY] = existing;
  let replacedId = null;
  if (!existing.id || usedIds.has(existing.id)) {
    replacedId = existing.id || null;
    existing.id = newId();
  }
  const definitionName = subgraphFor(host)?.name;
  const requestedName = preferredHostRoutingName({
    storedName: existing.name,
    storedDefinitionName: existing.definitionName,
    title: host.title,
    lastAppliedTitle: host.__bvLastHostRoutingTitle,
    definitionName,
  });
  existing.name = uniqueHostName(requestedName, usedNames);
  if (definitionName) existing.definitionName = definitionName;
  host.title = existing.name;
  host.__bvLastHostRoutingTitle = existing.name;
  usedIds.add(existing.id);
  usedNames.add(existing.name);
  return { routing: existing, replacedId };
}

function isSmartPipeMerge(node) {
  return node?.comfyClass === "BV Smart Pipe Merge" || node?.type === "BV Smart Pipe Merge";
}

function routableNodeId(node) {
  if (isSmartPipe(node)) return routingFor(node).nodeId;
  node.properties ??= {};
  node.properties.bvSmartPipeMerge ??= { version: 1, nodeId: newId(), sources: [] };
  const state = node.properties.bvSmartPipeMerge;
  if (!state.nodeId) state.nodeId = newId();
  return state.nodeId;
}

export function collectExpandedPipeAddresses(rootGraph) {
  const { rootId, registry } = rootRoutingState(rootGraph);
  const addressByExecutionId = {};
  const descriptors = [];
  const walk = (graph, numericPath = [], hostPath = [], hostNames = []) => {
    const participatingHosts = graphNodes(graph).filter((node) => containsSmartPipe(subgraphFor(node)));
    const usedHostIds = new Set();
    const usedHostNames = new Set();
    const seenDefinitions = new Set();
    for (const node of graphNodes(graph)) {
      const executionId = [...numericPath, node.id].join(":");
      if (isSmartPipe(node) || isSmartPipeMerge(node)) {
        const route = isSmartPipe(node) ? routingFor(node) : { nodeId: routableNodeId(node), name: node.title || "Pipe Merge" };
        const address = logicalAddress(rootId, hostPath, route.nodeId);
        addressByExecutionId[executionId] = address;
        descriptors.push({ address, executionId, node, route, kind: isSmartPipeMerge(node) ? "merge" : "pipe", hostPath: [...hostPath], hostNames: [...hostNames] });
      }
      const subgraph = subgraphFor(node);
      if (!subgraph || !participatingHosts.includes(node)) continue;
      const definitionAlreadySeen = seenDefinitions.has(subgraph);
      seenDefinitions.add(subgraph);
      const { routing: host, replacedId } = ensureHostRouting(node, usedHostIds, usedHostNames);
      if (!definitionAlreadySeen && subgraph.name && subgraph.name !== host.name) {
        subgraph.name = host.name;
        host.definitionName = host.name;
      }
      if (replacedId) {
        cloneRouteRegistryPrefix(
          registry,
          logicalAddress(rootId, hostPath, replacedId),
          logicalAddress(rootId, hostPath, host.id),
        );
      }
      walk(subgraph, [...numericPath, node.id], [...hostPath, host.id], [...hostNames, host.name]);
    }
  };
  walk(rootGraph);
  return { addressByExecutionId, descriptors, registry, rootId };
}

function applyInstanceSchemaProjections(apiPrompt, routing) {
  for (const descriptor of routing.descriptors) {
    if (!isSmartPipe(descriptor.node)) continue;
    const projection = routing.registry[descriptor.address]?.projection;
    if (!projection?.resolvedSlots?.length) continue;
    const entry = apiPrompt?.[descriptor.executionId];
    if (!entry || entry.class_type !== NODE_CLASS) continue;
    entry.inputs.bv_smart_pipe_schema_json = JSON.stringify(projection.resolvedSlots.map((slot) => {
      const input = descriptor.node.inputs?.find((item) => item.bvSlotId === slot.id);
      const output = descriptor.node.outputs?.find((item) => item.bvSlotId === slot.id);
      return { ...slot, connected: input?.link != null || Boolean(output?.links?.length) };
    }));
  }
  return apiPrompt;
}

function remapSmartPipeOutputLinks(apiPrompt, routing) {
  const outputIndexMaps = {};
  for (const descriptor of routing.descriptors) {
    const schema = routing.registry[descriptor.address]?.projection?.resolvedSlots || stateFor(descriptor.node).resolvedSlots || [];
    const ordinalById = new Map(schema.map((slot) => [slot.id, slot.ordinal]));
    const indexMap = { 0: 0 };
    for (let index = 1; index < (descriptor.node.outputs?.length || 0); index++) {
      const slotId = descriptor.node.outputs[index]?.bvSlotId;
      const ordinal = ordinalById.get(slotId);
      if (ordinal) indexMap[index] = ordinal;
    }
    outputIndexMaps[descriptor.executionId] = indexMap;
  }
  return remapPromptOutputLinks(apiPrompt, outputIndexMaps);
}

function samePath(left, right) {
  return left?.length === right?.length && left.every((part, index) => part === right[index]);
}

export function activeDescriptorFor(node, routing = collectExpandedPipeAddresses(app.graph)) {
  const hostPath = node.graph === app.graph ? [] : activeGraphContexts.get(node.graph)?.hostPath;
  if (hostPath) return routing.descriptors.find((descriptor) => descriptor.node === node && samePath(descriptor.hostPath, hostPath)) || null;
  const candidates = routing.descriptors.filter((descriptor) => descriptor.node === node);
  return candidates.length === 1 ? candidates[0] : null;
}

function applyMergeConfigurations(apiPrompt, routing) {
  for (const descriptor of routing.descriptors) {
    if (descriptor.kind !== "merge") continue;
    const entry = apiPrompt?.[descriptor.executionId];
    if (!entry || entry.class_type !== "BV Smart Pipe Merge") continue;
    const sources = routing.registry[descriptor.address]?.sources || descriptor.node.properties?.bvSmartPipeMerge?.sources || [];
    entry.inputs.bv_smart_pipe_merge_json = JSON.stringify(sources);
  }
}

function installSubgraphContextTracking() {
  if (app.__bvSmartPipeContextTracking || !app.canvas?.addEventListener) return;
  app.__bvSmartPipeContextTracking = true;
  if (app.graph) activeGraphContexts.set(app.graph, { hostPath: [], hostNames: [] });
  app.canvas.addEventListener("subgraph-opened", (event) => {
    const detail = event.detail || event;
    const parent = detail.closingGraph === app.graph
      ? { hostPath: [], hostNames: [] }
      : activeGraphContexts.get(detail.closingGraph);
    if (!parent || !detail.fromNode || !detail.subgraph) return;
    collectExpandedPipeAddresses(app.graph);
    const host = detail.fromNode.properties?.[HOST_ROUTING_PROPERTY];
    if (!host) return;
    activeGraphContexts.set(detail.subgraph, {
      hostPath: [...parent.hostPath, host.id],
      hostNames: [...parent.hostNames, host.name],
    });
    requestAnimationFrame(() => propagateGraph(detail.subgraph));
  });
  app.canvas.addEventListener("litegraph:set-graph", (event) => {
    const detail = event.detail || event;
    if (detail.newGraph === app.graph) activeGraphContexts.set(app.graph, { hostPath: [], hostNames: [] });
    requestAnimationFrame(() => propagateGraph(detail.newGraph));
  });
}

function routingFor(node) {
  const state = stateFor(node);
  state.routing ??= { version: 1, nodeId: newId(), name: !node.title || node.title === "Pipe" ? SMART_PIPE_DEFAULT_TITLE : node.title, mode: "root", predecessorId: null };
  const route = state.routing;
  const siblings = pipeNodes(node.graph).filter((candidate) => candidate !== node);
  const duplicateIdOwner = siblings.find((candidate) => stateFor(candidate).routing?.nodeId === route.nodeId);
  if (duplicateIdOwner && routingCollisionOwner(node, duplicateIdOwner) !== node) route.nodeId = newId();
  const requestedName = node.__bvLastRoutingTitle && node.title !== node.__bvLastRoutingTitle ? node.title : route.name;
  const usedNames = new Set(siblings
    .filter((candidate) => {
      const siblingName = stateFor(candidate).routing?.name;
      return siblingName !== requestedName || routingCollisionOwner(node, candidate) !== node;
    })
    .map((candidate) => stateFor(candidate).routing?.name)
    .filter(Boolean));
  route.name = uniqueRoutingName(requestedName, usedNames);
  node.title = route.name;
  node.__bvLastRoutingTitle = route.name;
  if (!route.predecessorId) route.mode = "root";
  return route;
}

function linkAt(graph, id) {
  return graph?.links?.get?.(id) ?? graph?.links?.[id];
}

function upstreamNode(node) {
  const input = node.inputs?.find((slot) => slot.name === "pipe");
  if (input?.link == null) return null;
  const link = linkAt(node.graph, input.link);
  return link ? node.graph?.getNodeById?.(link.origin_id) : null;
}

function wirelessUpstreamNode(node) {
  const route = routingFor(node);
  if (route.mode !== "follow" || !route.predecessorId) return null;
  return pipeNodes(node.graph).find((candidate) => routingFor(candidate).nodeId === route.predecessorId) || null;
}

function crossScopeRouteFor(node, routing = collectExpandedPipeAddresses(app.graph), descriptorOverride = null) {
  const destination = descriptorOverride || activeDescriptorFor(node, routing);
  if (!destination) return null;
  const edge = routing.registry[destination.address];
  if (!edge?.predecessorAddress) return null;
  const predecessor = routing.descriptors.find((descriptor) => descriptor.address === edge.predecessorAddress);
  return predecessor ? { destination, predecessor, edge, routing } : null;
}

function crossScopeUpstreamNode(node) {
  return crossScopeRouteFor(node)?.predecessor?.node || null;
}

function effectiveUpstreamNode(node) {
  return upstreamNode(node) || crossScopeUpstreamNode(node) || wirelessUpstreamNode(node);
}

function registerUpstream(node, upstream) {
  if (node.__bvSmartPipeUpstream === upstream) return;
  node.__bvSmartPipeUpstream?.__bvSmartPipeTargets?.delete(node);
  node.__bvSmartPipeUpstream = upstream;
  if (!upstream) return;
  upstream.__bvSmartPipeTargets ??= new Set();
  upstream.__bvSmartPipeTargets.add(node);
}

function copySlot(slot, missing = slot.missing ?? false) {
  return {
    id: slot.id,
    name: slot.name,
    ordinal: slot.ordinal,
    type: slot.type || "*",
    showInput: slot.showInput ?? false,
    showOutput: slot.showOutput ?? false,
    missing,
    dormant: slot.dormant ?? false,
  };
}

function slotHasConnections(node, slotId) {
  const input = node.inputs?.find((item) => item.bvSlotId === slotId);
  const output = node.outputs?.find((item) => item.bvSlotId === slotId);
  return input?.link != null || Boolean(output?.links?.length);
}

function slotHasInputConnection(node, slotId) {
  return node.inputs?.some((item) => item.bvSlotId === slotId && item.link != null) ?? false;
}

function downstreamPipeNodes(node) {
  return pipeNodes(node.graph).filter((candidate) => candidate !== node && effectiveUpstreamNode(candidate) === node);
}

function slotUsedDownstream(node, slotId, visited = new Set()) {
  if (!node || visited.has(node)) return false;
  visited.add(node);
  for (const target of downstreamPipeNodes(node)) {
    if (slotHasConnections(target, slotId) || slotUsedDownstream(target, slotId, visited)) return true;
  }
  return false;
}

function schemaProjectionFor(node, descriptorOverride = null, routing = collectExpandedPipeAddresses(app.graph)) {
  const definition = stateFor(node);
  const crossRoute = crossScopeRouteFor(node, routing, descriptorOverride);
  if (!crossRoute) return { definition, projection: definition };
  crossRoute.edge.projection ??= { version: 1, inheritedSlots: [], resolvedSlots: [] };
  return { definition, projection: crossRoute.edge.projection };
}

function descriptorForWiredMergeInput(mergeDescriptor, input, routing) {
  if (input?.link == null) return null;
  const link = linkAt(mergeDescriptor.node.graph, input.link);
  const sourceNode = link ? mergeDescriptor.node.graph?.getNodeById?.(link.origin_id) : null;
  return routing.descriptors.find((candidate) => candidate.node === sourceNode && samePath(candidate.hostPath, mergeDescriptor.hostPath)) || null;
}

function resolveDescriptorSchema(descriptor, resolving, routing) {
  if (!descriptor) return null;
  if (descriptor.kind === "pipe") return resolveSchema(descriptor.node, resolving, descriptor);
  const resolvingKey = descriptor.address;
  if (resolving.has(resolvingKey)) return [];
  resolving.add(resolvingKey);
  const sources = routing.registry[descriptor.address]?.sources || descriptor.node.properties?.bvSmartPipeMerge?.sources || [];
  const schemas = sources.map((source) => {
    const sourceDescriptor = source.mode === "wireless"
      ? routing.descriptors.find((candidate) => candidate.address === source.address)
      : descriptorForWiredMergeInput(descriptor, descriptor.node.inputs?.find((input) => input.name === source.key), routing);
    return resolveDescriptorSchema(sourceDescriptor, resolving, routing) || [];
  });
  resolving.delete(resolvingKey);
  return mergePipeSchemas(schemas);
}

function resolveSchema(node, resolving = new Set(), descriptorOverride = null) {
  const routing = collectExpandedPipeAddresses(app.graph);
  const descriptor = descriptorOverride || activeDescriptorFor(node, routing);
  const { definition, projection } = schemaProjectionFor(node, descriptor, routing);
  const resolvingKey = descriptor?.address || node;
  if (resolving.has(resolvingKey)) return projection.resolvedSlots || [];
  resolving.add(resolvingKey);
  const physicalUpstream = upstreamNode(node);
  const crossRoute = physicalUpstream ? null : crossScopeRouteFor(node, routing, descriptor);
  const localUpstream = physicalUpstream || (!crossRoute ? wirelessUpstreamNode(node) : null);
  const upstream = physicalUpstream || crossRoute?.predecessor?.node || localUpstream;
  const upstreamDescriptor = crossRoute?.predecessor || (descriptor && upstream
    ? routing.descriptors.find((candidate) => candidate.node === upstream && samePath(candidate.hostPath, descriptor.hostPath))
    : null);
  const upstreamSchema = upstreamDescriptor
    ? resolveDescriptorSchema(upstreamDescriptor, resolving, routing)
    : isSmartPipe(upstream) ? resolveSchema(upstream, resolving, upstreamDescriptor) : null;
  let previous = projection.inheritedSlots || [];
  if (!upstreamSchema) {
    const connectedSlotIds = new Set((node.inputs || []).filter((input) => input.link != null && input.bvSlotId).map((input) => input.bvSlotId));
    const promotionState = { inheritedSlots: projection.inheritedSlots || [], localSlots: definition.localSlots };
    promoteConnectedInheritedSlots(promotionState, connectedSlotIds);
    projection.inheritedSlots = promotionState.inheritedSlots;
    definition.localSlots = promotionState.localSlots;
    previous = projection.inheritedSlots || [];
  }
  if (upstreamSchema) {
    const upstreamIds = new Set(upstreamSchema.map((slot) => slot.id));
    const adopted = definition.localSlots.filter((slot) => upstreamIds.has(slot.id));
    if (adopted.length) {
      const projections = new Map(previous.map((slot) => [slot.id, slot]));
      for (const slot of adopted) {
        const projection = projections.get(slot.id);
        projections.set(slot.id, {
          ...copySlot(slot),
          showInput: projection?.showInput ?? slot.showInput ?? false,
          showOutput: projection?.showOutput ?? slot.showOutput ?? false,
        });
      }
      previous = [...projections.values()];
      definition.localSlots = definition.localSlots.filter((slot) => !upstreamIds.has(slot.id));
    }
    const renamed = resolveLocalSlotNameCollisions(definition.localSlots, upstreamSchema.map((slot) => slot.name));
    if (renamed.length) definition.renameNotices = renamed;
  }
  const inherited = upstreamSchema
    ? [
        ...upstreamSchema.map((slot) => {
        const projection = previous.find((item) => item.id === slot.id);
        const hasInput = slotHasInputConnection(node, slot.id);
        const directlyUsed = slotHasConnections(node, slot.id);
        const usedDownstream = slotUsedDownstream(node, slot.id);
        return {
          ...copySlot(slot, Boolean(slot.missing) && !hasInput),
          showInput: projection?.showInput ?? false,
          showOutput: projection?.showOutput ?? false,
          dormant: Boolean(slot.missing) && !hasInput && !directlyUsed && usedDownstream,
        };
        }),
        ...retainedMissingSlots(previous, new Set(upstreamSchema.map((slot) => slot.id)), (slot) => slotHasConnections(node, slot.id) || slotUsedDownstream(node, slot.id))
          .map((slot) => ({ ...copySlot(slot, true), dormant: !slotHasConnections(node, slot.id) })),
      ]
    : retainedMissingSlots(previous, new Set(), (slot) => slotHasConnections(node, slot.id) || slotUsedDownstream(node, slot.id))
      .map((slot) => ({ ...copySlot(slot, true), dormant: !slotHasConnections(node, slot.id) }));

  const usedOrdinals = new Set(inherited.map((slot) => slot.ordinal));
  for (const slot of definition.localSlots) {
    if (!slot.ordinal || usedOrdinals.has(slot.ordinal)) {
      slot.ordinal = nextFreeOrdinal(usedOrdinals, definition.nextOrdinal, MAX_SLOTS);
      if (slot.ordinal) definition.nextOrdinal = slot.ordinal + 1;
    }
    if (slot.ordinal) definition.nextOrdinal = Math.max(definition.nextOrdinal, slot.ordinal + 1);
    usedOrdinals.add(slot.ordinal);
  }

  projection.inheritedSlots = inherited;
  projection.resolvedSlots = [...inherited, ...definition.localSlots.map((slot) => copySlot(slot))]
    .filter((slot) => slot.ordinal)
    .sort((left, right) => left.ordinal - right.ordinal);
  resolving.delete(resolvingKey);
  return projection.resolvedSlots;
}

function removeSlot(node, kind, index) {
  if (kind === "input") node.removeInput(index);
  else node.removeOutput(index);
}

function typesAreCompatible(left, right) {
  const leftTypes = String(left || "*").split(",").map((value) => value.trim()).filter(Boolean);
  const rightTypes = String(right || "*").split(",").map((value) => value.trim()).filter(Boolean);
  return leftTypes.includes("*") || rightTypes.includes("*") || leftTypes.some((type) => rightTypes.includes(type));
}

function temporarilyRevealOutput(node, slot) {
  return node.__bvSmartPipeRevealTypes?.some((type) => typesAreCompatible(type, slot.type));
}

function reconcilePorts(node, schema) {
  const desiredInputs = new Set(schema.filter((slot) => !slot.dormant && (slot.showInput || slot.missing)).map((slot) => `v_${String(slot.ordinal).padStart(3, "0")}`));
  const desiredOutputs = new Set(schema.filter((slot) => !slot.dormant && (slot.showOutput || slot.missing || temporarilyRevealOutput(node, slot))).map((slot) => `out_${String(slot.ordinal).padStart(3, "0")}`));

  for (let index = (node.inputs?.length || 0) - 1; index >= 0; index--) {
    const slot = node.inputs[index];
    if (slot.bvAddSlot) continue;
    if (slot.name !== "pipe" && !desiredInputs.has(slot.name) && slot.link == null) removeSlot(node, "input", index);
  }
  for (let index = (node.outputs?.length || 0) - 1; index >= 0; index--) {
    const slot = node.outputs[index];
    if (slot.name !== "pipe" && !desiredOutputs.has(slot.name) && !(slot.links?.length)) removeSlot(node, "output", index);
  }


  for (const slot of schema) {
    const inputName = `v_${String(slot.ordinal).padStart(3, "0")}`;
    const outputName = `out_${String(slot.ordinal).padStart(3, "0")}`;
    const label = `${slot.missing ? "⚠ Missing: " : ""}${slot.name}`;
    let inputIndex = reusableSmartPipePortIndex(node.inputs, { slotId: slot.id, portName: inputName, label: slot.name, type: slot.type });
    let input = inputIndex >= 0 ? node.inputs[inputIndex] : null;
    if (!slot.dormant && (slot.showInput || slot.missing) && !input) input = node.addInput(inputName, slot.type || "*");
    if (input) {
      inputIndex = node.inputs.indexOf(input);
      node.inputs[inputIndex] = updateSmartPipePort(input, label, slot.type || "*", slot.id);
      node.inputs[inputIndex].name = inputName;
    }
    let outputIndex = reusableSmartPipePortIndex(node.outputs, { slotId: slot.id, portName: outputName, label: slot.name, type: slot.type });
    let output = outputIndex >= 0 ? node.outputs[outputIndex] : null;
    if (!slot.dormant && (slot.showOutput || slot.missing || temporarilyRevealOutput(node, slot)) && !output) output = node.addOutput(outputName, slot.type || "*");
    if (output) {
      outputIndex = node.outputs.indexOf(output);
      node.outputs[outputIndex] = updateSmartPipePort(output, label, slot.type || "*", slot.id);
      node.outputs[outputIndex].name = outputName;
    }
  }

  for (const kind of ["input", "output"]) {
    const ports = kind === "input" ? node.inputs || [] : node.outputs || [];
    const indexesByName = new Map();
    ports.forEach((port, index) => {
      if (port.name === "pipe" || port.bvAddSlot) return;
      const indexes = indexesByName.get(port.name) || [];
      indexes.push(index);
      indexesByName.set(port.name, indexes);
    });
    for (const indexes of indexesByName.values()) {
      if (indexes.length < 2) continue;
      const connected = indexes.find((index) => kind === "input" ? ports[index]?.link != null : Boolean(ports[index]?.links?.length));
      const keep = connected ?? indexes[0];
      for (const index of [...indexes].sort((left, right) => right - left)) {
        if (index !== keep) removeSlot(node, kind, index);
      }
    }
  }
  const addSlots = (node.inputs || []).filter((input) => input.bvAddSlot);
  const keepAddSlot = schema.length < MAX_SLOTS;
  for (let index = addSlots.length - 1; index >= (keepAddSlot ? 1 : 0); index--) removeSlot(node, "input", node.inputs.indexOf(addSlots[index]));
  if (keepAddSlot && !addSlots.length) {
    const addSlot = node.addInput(ADD_SLOT_NAME, "*");
    addSlot.label = "＋ Add Slot";
    addSlot.localized_name = "＋ Add Slot";
    addSlot.bvAddSlot = true;
  }
  moveMarkedPortToEnd(node.inputs, (input) => input.bvAddSlot);
  node.inputs = [...(node.inputs || [])];
  node.outputs = [...(node.outputs || [])];
}

function sourceOutput(node, linkInfo) {
  const source = node.graph?.getNodeById?.(linkInfo?.origin_id);
  return source?.outputs?.[linkInfo?.origin_slot] || null;
}

function convertAddSlot(node, index, linkInfo) {
  const input = node.inputs?.[index];
  if (!input?.bvAddSlot) return false;
  const state = stateFor(node);
  const schema = resolveSchema(node);
  const usedOrdinals = new Set(schema.map((slot) => slot.ordinal));
  const ordinal = nextFreeOrdinal(usedOrdinals, state.nextOrdinal, MAX_SLOTS);
  if (!ordinal) return false;

  const output = sourceOutput(node, linkInfo);
  const baseName = smartPipeSlotName(output?.localized_name || output?.label || output?.name);
  const name = uniqueSmartPipeSlotName(baseName, new Set(schema.map((slot) => slot.name)));
  const inferredType = linkInfo?.type || linkInfo?.origin_type || output?.type;
  const type = inferredType && inferredType !== "*" ? inferredType : "*";
  const slot = { id: newId(), name, ordinal, type, showInput: true, showOutput: false };
  state.localSlots.push(slot);
  state.nextOrdinal = ordinal + 1;

  const converted = updateSmartPipePort(input, name, type, slot.id);
  converted.name = `v_${String(ordinal).padStart(3, "0")}`;
  delete converted.bvAddSlot;
  node.inputs[index] = converted;
  return true;
}

function updateSchemaWidget(node, schema) {
  const widget = node.widgets?.find((item) => item.name === "bv_smart_pipe_schema_json");
  if (!widget) return;
  const serialized = schema.map((slot) => {
    const input = node.inputs?.find((item) => item.bvSlotId === slot.id);
    const output = node.outputs?.find((item) => item.bvSlotId === slot.id);
    return { ...slot, connected: input?.link != null || Boolean(output?.links?.length) };
  });
  widget.value = JSON.stringify(serialized);
  widget.computeSize = () => [0, -4];
  widget.type = "converted-widget";
  widget.draw = () => {};
  widget.hidden = true;
  widget.options ??= {};
  widget.options.hidden = true;
  if (widget.element) widget.element.style.display = "none";
}

function updateRouteWidget(node) {
  const route = routingFor(node);
  const widget = node.widgets?.find((item) => item.name === ROUTE_INPUT);
  if (!widget) return;
  widget.value = JSON.stringify(route);
  widget.computeSize = () => [0, -4];
  widget.type = "converted-widget";
  widget.draw = () => {};
  widget.hidden = true;
  widget.options ??= {};
  widget.options.hidden = true;
  if (widget.element) widget.element.style.display = "none";
}

function wirelessChoices(node) {
  const nodes = pipeNodes(node.graph);
  const routing = collectExpandedPipeAddresses(app.graph);
  const ownDescriptor = activeDescriptorFor(node, routing);
  const scopeDescriptors = ownDescriptor
    ? routing.descriptors.filter((descriptor) => samePath(descriptor.hostPath, ownDescriptor.hostPath))
    : [];
  const descriptorByAddress = new Map(scopeDescriptors.map((descriptor) => [descriptor.address, descriptor]));
  const displayRoutes = scopeDescriptors.length
    ? scopeDescriptors.map((descriptor) => {
        if (descriptor.kind === "merge") {
          const sources = routing.registry[descriptor.address]?.sources
            || descriptor.node.properties?.bvSmartPipeMerge?.sources
            || [];
          return {
            nodeId: descriptor.route.nodeId,
            name: descriptor.route.name,
            mode: "merge",
            sourceIds: sources.map((source) => descriptorByAddress.get(source.address)?.route.nodeId).filter(Boolean),
          };
        }
        const predecessor = effectiveUpstreamNode(descriptor.node);
        const predecessorId = predecessor ? routableNodeId(predecessor) : null;
        return {
          ...descriptor.route,
          mode: predecessorId ? "follow" : "root",
          predecessorId,
        };
      })
    : nodes.map(routingFor);
  const numbers = routingDisplayNumbers(predecessorChoiceRoutes(displayRoutes, ownDescriptor?.route.nodeId));
  const choices = [];
  for (const candidate of nodes) {
    if (candidate === node) continue;
    const visited = new Set();
    let cursor = candidate;
    let createsCycle = false;
    while (cursor && !visited.has(cursor)) {
      if (cursor === node) {
        createsCycle = true;
        break;
      }
      visited.add(cursor);
      cursor = effectiveUpstreamNode(cursor);
    }
    if (createsCycle) continue;
    const route = routingFor(candidate);
    const number = numbers.get(route.nodeId);
    choices.push({ label: routingChoiceLabel(number, route.name), id: route.nodeId, address: null, number, scope: "local" });
  }
  if (ownDescriptor) {
    const sameScopeDescriptors = routing.descriptors
      .filter((descriptor) => descriptor.address !== ownDescriptor.address && samePath(descriptor.hostPath, ownDescriptor.hostPath));
    for (const descriptor of sameScopeDescriptors.filter((candidate) => candidate.kind === "merge")) {
      const number = numbers.get(descriptor.route.nodeId);
      choices.push({ label: routingChoiceLabel(number, descriptor.route.name), id: null, address: descriptor.address, number, scope: "local" });
    }
    choices.sort((left, right) => compareRoutingNumbers(left.number, right.number) || left.label.localeCompare(right.label));
    const crossChoices = crossScopeDescriptors(routing.descriptors, ownDescriptor)
      .map((descriptor) => {
        const scope = descriptor.hostNames.length ? descriptor.hostNames.join(" › ") : "Root";
        return { label: `↗ ${scope} › ${descriptor.route.name}`, id: null, address: descriptor.address, number: "", scope };
      })
      .sort((left, right) => left.scope.localeCompare(right.scope) || left.label.localeCompare(right.label));
    choices.push(...crossChoices);
  } else {
    choices.sort((left, right) => compareRoutingNumbers(left.number, right.number) || left.label.localeCompare(right.label));
  }
  return [{ label: "Start new pipe", id: null, address: null, number: "0", scope: "local" }, ...choices];
}

function updatePredecessorWidget(node) {
  const widget = node.__bvPredecessorWidget;
  if (!widget) return;
  const wired = upstreamNode(node);
  const route = routingFor(node);
  const choices = wirelessChoices(node);
  if (wired) {
    widget.options.values = [`Wired: ${routingFor(wired).name}`];
    widget.value = widget.options.values[0];
    widget.disabled = false;
    widget.__bvWired = true;
    return;
  }
  widget.__bvWired = false;
  widget.__bvChoices = choices;
  widget.options.values = choices.map((choice) => choice.label);
  const crossRoute = crossScopeRouteFor(node);
  widget.value = crossRoute
    ? choices.find((choice) => choice.address === crossRoute.predecessor.address)?.label || `⚠ Missing: ${crossRoute.edge.predecessorAddress}`
    : choices.find((choice) => choice.id === route.predecessorId)?.label || "Start new pipe";
}

export function propagate(node, visited = new Set()) {
  if (!node || visited.has(node)) return;
  visited.add(node);
  registerUpstream(node, effectiveUpstreamNode(node));
  const schema = resolveSchema(node);
  reconcilePorts(node, schema);
  updateSchemaWidget(node, schema);
  updateRouteWidget(node);
  updatePredecessorWidget(node);
  const visibleSlots = Math.max((node.inputs?.length || 1) - 1, (node.outputs?.length || 1) - 1);
  const presentation = globalThis.__bvNodePresentationBridge;
  if (presentation?.applyClassic) {
    presentation.applyClassic(node, NODE_CLASS);
    const projectNodes2 = () => node.__bvApplyNodes2Presentation?.();
    requestAnimationFrame(() => {
      projectNodes2();
      requestAnimationFrame(projectNodes2);
      setTimeout(() => presentation.applyClassic(node, NODE_CLASS), 100);
      setTimeout(() => presentation.applyClassic(node, NODE_CLASS), 500);
    });
  }
  else node.setSize?.([Math.max(260, node.size?.[0] || 0), 90 + visibleSlots * 22]);
  node.setDirtyCanvas?.(true, true);
  for (const target of node.__bvSmartPipeTargets || []) propagate(target, visited);
}

function validateSlots(node) {
  const state = stateFor(node);
  const names = new Set();
  for (const slot of resolveSchema(node)) {
    const local = state.localSlots.find((item) => item.id === slot.id);
    if (local) {
      local.name = local.name.trim();
      local.showInput = true;
    }
    const name = local?.name ?? slot.name;
    if (!name) throw new Error("Jeder lokale Slot benötigt einen Namen.");
    if (names.has(name)) throw new Error(`Duplicate slot name: ${name}`);
    names.add(name);
  }
}

function openEditor(node) {
  window.dispatchEvent(new CustomEvent("bv-open-smart-pipe-editor", { detail: { node, kind: "pipe" } }));
}
globalThis.__bvSmartPipeEditorBridge ??= {};
globalThis.__bvSmartPipeEditorBridge.pipe = {
  read(node) {
    const { definition, projection } = schemaProjectionFor(node);
    return structuredClone({ definition, projection, slots: resolveSchema(node) });
  },
  predecessor(node) {
    const widget = node.__bvPredecessorWidget;
    return { value: String(widget?.value ?? "Start new pipe"), options: (widget?.__bvChoices ?? []).map((choice) => ({ value: choice.label, label: choice.label })) };
  },
  validation(node, draft) {
    return (draft.definition?.localSlots ?? []).filter((slot) => !slotHasInputConnection(node, slot.id)).map((slot) => ({ id: slot.id, message: `Local slot “${slot.name || slot.id}” requires a connected input.` }));
  },
  setPredecessor(node, value) {
    const widget = node.__bvPredecessorWidget;
    if (!widget || widget.__bvWired) return;
    widget.value = value;
    widget.callback?.(value);
    node.graph?.setDirtyCanvas?.(true, true);
  },
  save(node, draft) {
    const { definition, projection } = schemaProjectionFor(node);
    definition.localSlots = structuredClone(draft.definition?.localSlots ?? []);
    definition.nextOrdinal = Number(draft.definition?.nextOrdinal ?? definition.nextOrdinal);
    projection.inheritedSlots = structuredClone(draft.projection?.inheritedSlots ?? []);
    validateSlots(node);
    propagate(node);
    node.graph?.setDirtyCanvas?.(true, true);
  },
};

function setupNode(node) {
  if (node.__bvSmartPipeReady) return;
  node.__bvSmartPipeReady = true;
  const originalRemoved = node.onRemoved;
  node.onRemoved = function () {
    globalThis.__bvNodePresentationBridge?.remove?.(this);
    return originalRemoved?.apply(this, arguments);
  };
  stateFor(node);
  routingFor(node);
  const predecessor = node.addWidget?.("combo", "Pipe predecessor", "Start new pipe", (label) => {
    if (upstreamNode(node) || predecessor.__bvWired) return;
    const route = routingFor(node);
    const selected = predecessor.__bvChoices?.find((choice) => choice.label === label);
    const routing = collectExpandedPipeAddresses(app.graph);
    const destination = activeDescriptorFor(node, routing);
    if (destination) delete routing.registry[destination.address];
    if (selected?.address && destination) {
      routing.registry[destination.address] = { version: 1, predecessorAddress: selected.address };
      route.mode = "root";
      route.predecessorId = null;
    } else {
      route.mode = selected?.id ? "follow" : "root";
      route.predecessorId = selected?.id || null;
    }
    requestAnimationFrame(() => propagateGraph(node.graph));
  }, { values: ["Start new pipe"], serialize: false });
  if (predecessor) {
    predecessor.label = "Pipe predecessor";
    predecessor.serialize = false;
    node.__bvPredecessorWidget = predecessor;
  }
  const button = node.addWidget?.("button", "Configure", null, () => openEditor(node), { serialize: false });
  if (button) button.label = "Configure Smart Pipe";
  setTimeout(() => globalThis.__bvNodePresentationBridge?.applyClassic?.(node, NODE_CLASS), 500);
  const originalConnectionsChange = node.onConnectionsChange;
  node.onConnectionsChange = function (type, index, connected, linkInfo) {
    originalConnectionsChange?.apply(this, arguments);
    if (type === 1 && connected) {
      if (convertAddSlot(this, index, linkInfo)) {
        requestAnimationFrame(() => propagate(this));
        return;
      }
      if (index <= 0) return;
      const input = this.inputs?.[index];
      const slot = resolveSchema(this).find((item) => item.id === input?.bvSlotId);
      const inferred = linkInfo?.type || linkInfo?.origin_type;
      if (slot?.missing) {
        const { definition, projection } = schemaProjectionFor(this);
        const promotionState = { inheritedSlots: projection.inheritedSlots || [], localSlots: definition.localSlots };
        promoteInheritedSlot(promotionState, slot.id, inferred);
        projection.inheritedSlots = promotionState.inheritedSlots;
        definition.localSlots = promotionState.localSlots;
      }
      if (slot && slot.type === "*" && inferred && inferred !== "*") {
        const local = stateFor(this).localSlots.find((item) => item.id === slot.id);
        if (local) local.type = inferred;
      }
    }
    if (type === 1 && index === 0 && !connected) {
      const route = routingFor(this);
      route.mode = "root";
      route.predecessorId = null;
    }
    if (type === 2 && connected) {
      const output = this.outputs?.[index];
      const slot = resolveSchema(this).find((item) => item.id === output?.bvSlotId);
      const projection = schemaProjectionFor(this).projection;
      const target = stateFor(this).localSlots.find((item) => item.id === slot?.id)
        || projection.inheritedSlots.find((item) => item.id === slot?.id);
      if (target) target.showOutput = true;
    }
    requestAnimationFrame(() => propagate(this));
  };
  requestAnimationFrame(() => propagate(node));
}

function installPromptMaterializer() {
  if (app.__bvSmartPipePromptMaterializer || typeof app.graphToPrompt !== "function") return;
  app.__bvSmartPipePromptMaterializer = true;
  const original = app.graphToPrompt;
  app.graphToPrompt = async function () {
    const seenGraphs = new Set();
    const refreshGraph = (graph) => {
      if (!graph || seenGraphs.has(graph)) return;
      seenGraphs.add(graph);
      for (const node of graph._nodes || graph.nodes || []) {
        if (isSmartPipe(node)) propagate(node);
        const subgraph = subgraphFor(node);
        if (subgraph) refreshGraph(subgraph);
      }
    };
    refreshGraph(app.graph);
    const routing = collectExpandedPipeAddresses(app.graph);
    const modeState = promptModeState(routing.descriptors);
    const { prunedExecutionIds } = modeState;
    const localModeState = {
      routesByScopedNodeId: new Map(routing.descriptors.filter((descriptor) => descriptor.kind === "pipe")
        .map((descriptor) => [`${executionScope(descriptor.executionId)}\u0000${descriptor.route.nodeId}`, descriptor.route])),
      bypassedScopedNodeIds: new Set(routing.descriptors.filter((descriptor) => descriptor.kind === "pipe" && descriptor.node?.mode === 4)
        .map((descriptor) => `${executionScope(descriptor.executionId)}\u0000${descriptor.route.nodeId}`)),
      mutedScopedNodeIds: new Set(routing.descriptors.filter((descriptor) => descriptor.kind === "pipe" && descriptor.node?.mode === 2)
        .map((descriptor) => `${executionScope(descriptor.executionId)}\u0000${descriptor.route.nodeId}`)),
      prunedExecutionIds,
      bypassPredecessorsByScopedNodeId: new Map(routing.descriptors.filter((descriptor) => descriptor.kind === "pipe" && descriptor.node?.mode === 4)
        .map((descriptor) => {
          const edge = routing.registry[descriptor.address];
          const predecessor = edge?.predecessorAddress
            ? routing.descriptors.find((candidate) => candidate.address === edge.predecessorAddress)
            : routing.descriptors.find((candidate) => candidate.hostPath.length === descriptor.hostPath.length
              && candidate.hostPath.every((part, index) => part === descriptor.hostPath[index])
              && candidate.route.nodeId === descriptor.route.predecessorId);
          return predecessor ? [`${executionScope(descriptor.executionId)}\u0000${descriptor.route.nodeId}`, {
            executionId: predecessor.executionId,
            route: predecessor.route,
            scope: executionScope(predecessor.executionId),
          }] : null;
        }).filter(Boolean)),
    };
    const result = await original.apply(this, arguments);
    applyInstanceSchemaProjections(result?.output, routing);
    applyMergeConfigurations(result?.output, routing);
    remapSmartPipeOutputLinks(result?.output, routing);
    materializeAddressedPipeLinks(result?.output, routing.addressByExecutionId, routing.registry, modeState);
    materializeSmartPipeMergeSources(result?.output, routing.addressByExecutionId, routing.registry, modeState);
    materializeWirelessPipeLinks(result?.output, localModeState);
    prunePromptBranches(result?.output, prunedExecutionIds);
    validateMaterializedPipeGraph(result?.output);
    return result;
  };
}

let revealMonitorStarted = false;
const routingSignatures = new WeakMap();
let lastHostRoutingCheck = 0;
let hostRoutingSignature = "";
const registryCleanupStates = new WeakMap();

function monitorHostRoutingNames(timestamp) {
  if (!app.graph || timestamp - lastHostRoutingCheck < 250) return;
  lastHostRoutingCheck = timestamp;
  const routing = collectExpandedPipeAddresses(app.graph);
  let cleanupState = registryCleanupStates.get(app.graph);
  if (!cleanupState) {
    cleanupState = { missingSince: new Map(), backups: new Map() };
    registryCleanupStates.set(app.graph, cleanupState);
  }
  reconcileRouteRegistryDestinations(
    routing.registry,
    new Set(routing.descriptors.map((descriptor) => descriptor.address)),
    cleanupState,
    timestamp,
  );
  const nextSignature = routing.descriptors
    .map((descriptor) => `${descriptor.address}\u0000${descriptor.hostNames.join("\u0000")}`)
    .sort()
    .join("\u0001");
  if (hostRoutingSignature && hostRoutingSignature !== nextSignature) {
    const graphs = new Set(routing.descriptors.map((descriptor) => descriptor.node.graph));
    graphs.forEach((graph) => propagateGraph(graph));
  }
  hostRoutingSignature = nextSignature;
}

function monitorRoutingNames(graph, visited = new Set()) {
  if (!graph || visited.has(graph)) return;
  visited.add(graph);
  const nodes = pipeNodes(graph);
  const signature = nodes.map((node) => {
    const route = routingFor(node);
    return `${route.nodeId}\u0000${route.name}\u0000${node.title}\u0000${route.mode}\u0000${route.predecessorId || ""}`;
  }).join("\u0001");
  if (routingSignatures.has(graph) && routingSignatures.get(graph) !== signature) {
    propagateGraph(graph);
  }
  routingSignatures.set(graph, nodes.map((node) => {
    const route = routingFor(node);
    return `${route.nodeId}\u0000${route.name}\u0000${node.title}\u0000${route.mode}\u0000${route.predecessorId || ""}`;
  }).join("\u0001"));
  for (const node of graphNodes(graph)) monitorRoutingNames(subgraphFor(node), visited);
}

function startTypedOutputRevealMonitor() {
  if (revealMonitorStarted) return;
  revealMonitorStarted = true;
  let previousKey = "";
  let previousGraph = null;
  const monitor = (timestamp = performance.now()) => {
    monitorHostRoutingNames(timestamp);
    monitorRoutingNames(app.graph);
    const connector = app.canvas?.linkConnector;
    const renderLinks = connector?.renderLinks || [];
    const types = connector?.state?.connectingTo === "output"
      ? [...new Set(renderLinks.map((link) => link.fromSlot?.type).filter(Boolean).map(String))]
      : [];
    const key = types.slice().sort().join("|");
    const currentGraph = app.canvas?.getCurrentGraph?.() || app.canvas?.graph || app.graph;
    if (key !== previousKey || currentGraph !== previousGraph) {
      previousKey = key;
      previousGraph = currentGraph;
      for (const node of graphNodes(currentGraph)) {
        if (!isSmartPipe(node)) continue;
        node.__bvSmartPipeRevealTypes = types;
        propagate(node);
      }
    }
    requestAnimationFrame(monitor);
  };
  requestAnimationFrame(monitor);
}

app.registerExtension({
  name: "bv_nodepack.smart_pipe",
  init() {
    installSubgraphContextTracking();
    startTypedOutputRevealMonitor();
    installPromptMaterializer();
    if (document.getElementById("bv-internal-widget-style")) return;
    const style = document.createElement("style");
    style.id = "bv-internal-widget-style";
    style.textContent = `
      .dom-widget:has(textarea[placeholder="bv_smart_pipe_schema_json"]), .dom-widget:has(textarea[placeholder="bv_smart_pipe_route_json"]), .dom-widget:has(textarea[placeholder="bv_control_config_json"]) { display: none !important; }
    `;
    document.head.append(style);
  },
  async nodeCreated(node) {
    if (isSmartPipe(node)) {
      setupNode(node);
      requestAnimationFrame(() => pipeNodes(node.graph).forEach((candidate) => propagate(candidate)));
    }
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;
    const originalConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = originalConfigure?.apply(this, arguments);
      setupNode(this);
      requestAnimationFrame(() => propagate(this));
      return result;
    };
    const originalMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (_, options) {
      originalMenu?.apply(this, arguments);
      options.unshift({ content: "Configure Smart Pipe", callback: () => openEditor(this) });
    };
  },
});
