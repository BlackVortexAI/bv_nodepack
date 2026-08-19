export type NamedLoraStack = { id: string; name: string; nodeId: string };
export type RegionalLoraBindings = { schema: "bv.regional.lora_bindings"; version: 1; document_id: string; global_stack_id: string | null; regions: Record<string, string> };
export type RegionalEditorSnapshot<T extends { document_id: string; regions: Array<{ id: string }> }> = { document: T; loraBindings: RegionalLoraBindings };
export const emptyLoraBindings = (documentId: string): RegionalLoraBindings => ({ schema: "bv.regional.lora_bindings", version: 1, document_id: documentId, global_stack_id: null, regions: {} });

export function needsFreshStackId(nodeId: string, stackId: string, stacks: NamedLoraStack[]): boolean {
    if (!stackId) return false;
    const duplicates = stacks.filter(stack => stack.id === stackId);
    return duplicates.length > 1 && duplicates[0].nodeId !== nodeId;
}
export function parseLoraBindings(value: unknown, documentId: string): RegionalLoraBindings {
    if (value == null || value === "") return emptyLoraBindings(documentId);
    const candidate = typeof value === "string" ? JSON.parse(value) : structuredClone(value);
    if (candidate?.schema !== "bv.regional.lora_bindings" || candidate?.version !== 1 || typeof candidate?.regions !== "object" || Array.isArray(candidate.regions)) throw new Error("Not a valid BV regional LoRA bindings v1 value");
    if (candidate.document_id && candidate.document_id !== documentId) throw new Error("LoRA bindings target a different BV Regional document");
    const regions: Record<string, string> = {};
    for (const [regionId, stackId] of Object.entries(candidate.regions)) if (typeof stackId === "string" && stackId) regions[regionId] = stackId;
    return { schema: "bv.regional.lora_bindings", version: 1, document_id: documentId, global_stack_id: typeof candidate.global_stack_id === "string" && candidate.global_stack_id ? candidate.global_stack_id : null, regions };
}
export function reconcileLoraBindings(bindings: RegionalLoraBindings, regionIds: Set<string>): RegionalLoraBindings {
    const regions = Object.fromEntries(Object.entries(bindings.regions).filter(([regionId]) => regionIds.has(regionId)));
    return { ...bindings, regions };
}
export function createRegionalEditorSnapshot<T extends { document_id: string; regions: Array<{ id: string }> }>(document: T, bindings: RegionalLoraBindings): RegionalEditorSnapshot<T> {
    const documentCopy = structuredClone(document);
    return {
        document: documentCopy,
        loraBindings: structuredClone(reconcileLoraBindings(bindings, new Set(documentCopy.regions.map(region => region.id)))),
    };
}
export function bindingWarnings(bindings: RegionalLoraBindings, stacks: NamedLoraStack[], regionIds?: Set<string>): string[] {
    const duplicateId = stacks.find((stack, index) => stacks.findIndex(item => item.id === stack.id) !== index);
    if (duplicateId) return [`Duplicate LoRA stack ID: ${duplicateId.id}`];
    const duplicateName = stacks.find((stack, index) => stacks.findIndex(item => item.name.localeCompare(stack.name, undefined, { sensitivity: "accent" }) === 0) !== index);
    if (duplicateName) return [`Duplicate LoRA stack name: ${duplicateName.name}`];
    const orphanRegion = regionIds && Object.keys(bindings.regions).find(regionId => !regionIds.has(regionId));
    if (orphanRegion) return [`LoRA assignment targets a missing region: ${orphanRegion}`];
    const available = new Set(stacks.map(stack => stack.id));
    const assigned = [bindings.global_stack_id, ...Object.values(bindings.regions)].filter((id): id is string => !!id);
    if (!assigned.length) return [];
    if (!stacks.length) return ["LoRA stacks are assigned, but no BV Named LoRA Stack sources exist in this workflow."];
    return [...new Set(assigned.filter(id => !available.has(id)))].map(id => `Assigned LoRA stack is missing: ${id}`);
}
export function bindingSummary(bindings: RegionalLoraBindings, stacks: NamedLoraStack[], regionNames: Record<string, string>): string {
    const names = new Map(stacks.map(stack => [stack.id, stack.name])), items: string[] = [];
    if (bindings.global_stack_id) items.push(`Global: ${names.get(bindings.global_stack_id) ?? "Missing stack"}`);
    for (const [regionId, stackId] of Object.entries(bindings.regions)) items.push(`${regionNames[regionId] ?? "Missing region"}: ${names.get(stackId) ?? "Missing stack"}`);
    return items.length ? `${items.join(" · ")} · source values unchanged` : "No LoRA stacks assigned";
}
