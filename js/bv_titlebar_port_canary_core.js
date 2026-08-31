// THROW AWAY - DO NOT MERGE OR RELEASE.
// Pure branch-local capability model for one Classic provider slot. It never
// changes graph arrays, links, normal slots, widgets, labels, visibility or size.

export const CANARY_SENDER = "BV Titlebar Port Canary Sender (THROW AWAY)";
export const CANARY_RECEIVER = "BV Titlebar Port Canary Receiver (THROW AWAY)";
export const CANARY_PROVIDER_TYPE = "BV_RUNTIME_RESOURCE_PROVIDER";
export const CANARY_MODES = ["Native", "A - Title midline", "B - Body seam", "C - Top rail"];

const CONTRACTS = new Map([
    [CANARY_SENDER, { direction: "output", count: 6, providerIndex: 2, providerName: "resource_provider" }],
    [CANARY_RECEIVER, { direction: "input", count: 6, providerIndex: 3, providerName: "resource_provider" }],
]);
const MODE_Y = new Map([
    ["A - Title midline", -15],
    ["B - Body seam", 0],
    ["C - Top rail", -30],
]);
const nodeStates = new WeakMap();
const inspectionRevisions = new WeakMap();

function ownDescriptor(target, key) {
    return Object.getOwnPropertyDescriptor(target, key);
}

function capturePositionOrigin(slot) {
    const descriptor = ownDescriptor(slot, "pos");
    if (descriptor) return { kind: "own", descriptor };
    if ("pos" in slot) return { kind: "inherited", value: slot.pos };
    return { kind: "absent" };
}

function restorePosition(slot, origin) {
    if (!slot || !origin) return;
    if (origin.kind === "own") Object.defineProperty(slot, "pos", origin.descriptor);
    else delete slot.pos;
}

function contractSlots(node, contract) {
    return contract.direction === "input" ? node?.inputs : node?.outputs;
}

function isWidgetBackedInput(slot) {
    return Boolean(slot?.widget && typeof slot.widget === "object");
}

function contractPortEntries(node, contract) {
    const slots = contractSlots(node, contract);
    if (!Array.isArray(slots)) return null;
    return slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => contract.direction !== "input" || !isWidgetBackedInput(slot));
}

export function validateCanaryContract(node, nodeName) {
    const contract = CONTRACTS.get(nodeName);
    if (!contract) return { ok: false, status: "IGNORED", reason: "not a canary node" };
    const entries = contractPortEntries(node, contract);
    if (!entries || entries.length !== contract.count) {
        return { ok: false, status: "BLOCKED", reason: `${contract.direction}s must contain exactly ${contract.count} connectable slots` };
    }
    const providerEntry = entries[contract.providerIndex];
    const provider = providerEntry?.slot;
    if (providerEntry?.index !== contract.providerIndex) {
        return { ok: false, status: "BLOCKED", reason: `provider graph index mismatch at ${contract.direction}[${providerEntry?.index}]` };
    }
    if (provider?.name !== contract.providerName || provider?.type !== CANARY_PROVIDER_TYPE) {
        return { ok: false, status: "BLOCKED", reason: `provider contract mismatch at ${contract.direction}[${contract.providerIndex}]` };
    }
    const slots = entries.map(({ slot }) => slot);
    const slotIndexes = entries.map(({ index }) => index);
    const matches = slots.filter(slot => slot?.name === contract.providerName && slot?.type === CANARY_PROVIDER_TYPE);
    if (matches.length !== 1) return { ok: false, status: "BLOCKED", reason: "provider must occur exactly once" };
    return { ok: true, status: "READY", contract, slots, slotIndexes, provider, providerArrayIndex: providerEntry.index };
}

function graphLink(graph, linkId) {
    if (linkId == null) return null;
    if (graph?._links?.get) return graph._links.get(linkId) ?? null;
    if (graph?.links?.get) return graph.links.get(linkId) ?? null;
    return graph?.links?.[linkId] ?? graph?._links?.[linkId] ?? null;
}

function providerLinkTuples(node, validated) {
    if (!validated.ok) return [];
    const linkIds = validated.contract.direction === "input"
        ? (validated.provider.link == null ? [] : [validated.provider.link])
        : [...(validated.provider.links ?? [])];
    return linkIds.map(id => {
        const link = graphLink(node?.graph, id);
        return link ? {
            id,
            origin_id: link.origin_id,
            origin_slot: Number(link.origin_slot),
            target_id: link.target_id,
            target_slot: Number(link.target_slot),
            type: String(link.type ?? ""),
        } : { id, missing: true };
    });
}

function captureStructure(node, validated) {
    return {
        inputs: node.inputs,
        outputs: node.outputs,
        widgets: node.widgets,
        inputSlots: [...(node.inputs ?? [])],
        outputSlots: [...(node.outputs ?? [])],
        widgetObjects: [...(node.widgets ?? [])],
        inputShape: (node.inputs ?? []).map(slot => [slot?.name, slot?.type]),
        outputShape: (node.outputs ?? []).map(slot => [slot?.name, slot?.type]),
        providerIndex: validated.contract.providerIndex,
        links: providerLinkTuples(node, validated),
    };
}

function sameReferences(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function compareStructure(node, validated, baseline) {
    if (!baseline) return { ok: false, reason: "baseline not captured" };
    const current = captureStructure(node, validated);
    const checks = {
        inputArray: current.inputs === baseline.inputs,
        outputArray: current.outputs === baseline.outputs,
        widgetArray: current.widgets === baseline.widgets,
        inputSlots: sameReferences(current.inputSlots, baseline.inputSlots),
        outputSlots: sameReferences(current.outputSlots, baseline.outputSlots),
        widgets: sameReferences(current.widgetObjects, baseline.widgetObjects),
        inputShape: sameJson(current.inputShape, baseline.inputShape),
        outputShape: sameJson(current.outputShape, baseline.outputShape),
        providerIndex: current.providerIndex === baseline.providerIndex,
        linkTuples: sameJson(current.links, baseline.links),
    };
    return { ok: Object.values(checks).every(Boolean), checks };
}

function ensureState(node, validated) {
    let state = nodeStates.get(node);
    if (!state) {
        state = { slot: validated.provider, positionOrigin: capturePositionOrigin(validated.provider), baseline: null, mode: "Native" };
        nodeStates.set(node, state);
    } else if (state.slot !== validated.provider) {
        restorePosition(state.slot, state.positionOrigin);
        state.slot = validated.provider;
        state.positionOrigin = capturePositionOrigin(validated.provider);
        state.baseline = null;
        state.mode = "Native";
    }
    return state;
}

export function captureCanaryBaseline(node, nodeName) {
    const validated = validateCanaryContract(node, nodeName);
    if (!validated.ok) return validated;
    const state = ensureState(node, validated);
    if (state.mode !== "Native") return { ok: false, status: "BLOCKED", reason: "capture baseline in Native mode" };
    state.baseline = captureStructure(node, validated);
    return { ok: true, status: "BASELINE_CAPTURED", comparison: compareStructure(node, validated, state.baseline) };
}

function expectedAnchor(node, validated, localPosition) {
    return [Number(node?.pos?.[0] ?? 0) + localPosition[0], Number(node?.pos?.[1] ?? 0) + localPosition[1]];
}

function currentAnchor(node, validated) {
    if (typeof node?.getSlotPosition !== "function") return null;
    const point = node.getSlotPosition(validated.providerArrayIndex, validated.contract.direction === "input");
    return point ? [Number(point[0]), Number(point[1])] : null;
}

function legacyCurrentAnchor(node, validated) {
    if (typeof node?.getConnectionPos !== "function") return null;
    const point = node.getConnectionPos(validated.contract.direction === "input", validated.providerArrayIndex);
    return point ? [Number(point[0]), Number(point[1])] : null;
}

function pointsMatch(left, right) {
    return Boolean(left && right && Math.abs(left[0] - right[0]) <= 0.5 && Math.abs(left[1] - right[1]) <= 0.5);
}

function dirty(node) {
    node?.setDirtyCanvas?.(true, true);
    node?.graph?.setDirtyCanvas?.(true, true);
}

export function applyCanaryMode(node, nodeName, requestedMode, options = {}) {
    const validated = validateCanaryContract(node, nodeName);
    if (!validated.ok) {
        restoreCanaryNode(node);
        return validated;
    }
    const state = ensureState(node, validated);
    const mode = CANARY_MODES.includes(requestedMode) ? requestedMode : "Native";
    if (mode === "Native") {
        restorePosition(state.slot, state.positionOrigin);
        state.mode = "Native";
        dirty(node);
        return { ok: true, status: "NATIVE", mode, comparison: compareStructure(node, validated, state.baseline) };
    }
    if (options.nodes2Active === true) {
        restorePosition(state.slot, state.positionOrigin);
        state.mode = "Native";
        dirty(node);
        return { ok: false, status: "UNSUPPORTED_SURFACE", reason: "Nodes 2.0 is outside this Classic-only Canary" };
    }

    const original = ownDescriptor(state.slot, "pos");
    if (original && original.configurable === false && original !== state.positionOrigin.descriptor) {
        return { ok: false, status: "BLOCKED", reason: "provider pos is non-configurable" };
    }
    const y = MODE_Y.get(mode);
    const localPosition = [validated.contract.direction === "input" ? 0 : Number(node?.size?.[0] ?? 0), y];
    try {
        Object.defineProperty(state.slot, "pos", {
            value: localPosition,
            writable: true,
            configurable: true,
            enumerable: false,
        });
    } catch (error) {
        restorePosition(state.slot, state.positionOrigin);
        state.mode = "Native";
        return { ok: false, status: "BLOCKED", reason: `provider pos cannot be projected: ${String(error)}` };
    }
    dirty(node);
    const expected = expectedAnchor(node, validated, localPosition);
    const actual = currentAnchor(node, validated);
    const legacyActual = legacyCurrentAnchor(node, validated);
    if (!pointsMatch(expected, actual)) {
        restorePosition(state.slot, state.positionOrigin);
        state.mode = "Native";
        dirty(node);
        return { ok: false, status: "UNSUPPORTED_SURFACE", reason: "unified slot renderer did not use provider slot.pos", expected, actual, legacyActual };
    }
    state.mode = mode;
    return { ok: true, status: "PROJECTED", mode, expected, actual, legacyActual, comparison: compareStructure(node, validated, state.baseline) };
}

function slotPositionSummary(slot) {
    const descriptor = ownDescriptor(slot, "pos");
    return {
        own: Boolean(descriptor),
        enumerable: descriptor?.enumerable ?? null,
        value: slot?.pos == null ? null : [...slot.pos],
    };
}

function serializeProbe(node, validated) {
    try {
        const serialized = node?.serialize?.();
        const slots = validated.contract.direction === "input" ? serialized?.inputs : serialized?.outputs;
        const provider = slots?.[validated.providerArrayIndex];
        return {
            available: Boolean(serialized),
            providerHasOwnPos: Boolean(provider && Object.hasOwn(provider, "pos")),
            providerPos: provider?.pos ?? null,
        };
    } catch (error) {
        return { available: false, error: String(error) };
    }
}

function measuredSlots(node, validated) {
    if (typeof node?.getSlotPosition !== "function") return [];
    return validated.slots.map((slot, ordinal) => {
        const index = validated.slotIndexes[ordinal];
        const point = node.getSlotPosition(index, validated.contract.direction === "input");
        return { index, name: slot?.name, x: Number(point?.[0]), y: Number(point?.[1]) };
    });
}

function legacyMeasuredSlots(node, validated) {
    if (typeof node?.getConnectionPos !== "function") return [];
    return validated.slots.map((slot, ordinal) => {
        const index = validated.slotIndexes[ordinal];
        const point = node.getConnectionPos(validated.contract.direction === "input", index);
        return { index, name: slot?.name, x: Number(point?.[0]), y: Number(point?.[1]) };
    });
}

export function inspectCanaryNode(node, nodeName) {
    const validated = validateCanaryContract(node, nodeName);
    if (!validated.ok) {
        restoreCanaryNode(node);
        return validated;
    }
    const state = ensureState(node, validated);
    let computedSize = null;
    try { computedSize = node?.computeSize?.() ?? null; } catch { computedSize = null; }
    return {
        ok: true,
        status: state.mode === "Native" ? "NATIVE" : "PROJECTED",
        mode: state.mode,
        direction: validated.contract.direction,
        canonicalProviderIndex: validated.contract.providerIndex,
        canonicalSlotCount: validated.slots.length,
        providerPosition: slotPositionSummary(validated.provider),
        links: providerLinkTuples(node, validated),
        comparison: compareStructure(node, validated, state.baseline),
        measuredSlots: measuredSlots(node, validated),
        legacyMeasuredSlots: legacyMeasuredSlots(node, validated),
        widgetMetrics: (node.widgets ?? []).map(widget => ({ name: widget?.name, y: widget?.y ?? null, last_y: widget?.last_y ?? null })),
        nodeSize: node?.size ? [...node.size] : null,
        computedSize: computedSize ? [...computedSize] : null,
        serialization: serializeProbe(node, validated),
    };
}

export function scheduleCanaryInspection(node, nodeName, publish, scheduleFrame = globalThis.requestAnimationFrame) {
    if (typeof scheduleFrame !== "function") return 0;
    const revision = (inspectionRevisions.get(node) ?? 0) + 1;
    inspectionRevisions.set(node, revision);
    scheduleFrame(() => scheduleFrame(() => {
        if (inspectionRevisions.get(node) !== revision) return;
        publish(inspectCanaryNode(node, nodeName));
    }));
    return revision;
}

export function restoreCanaryNode(node) {
    const state = nodeStates.get(node);
    if (!state) return false;
    restorePosition(state.slot, state.positionOrigin);
    nodeStates.delete(node);
    inspectionRevisions.set(node, (inspectionRevisions.get(node) ?? 0) + 1);
    dirty(node);
    return true;
}
