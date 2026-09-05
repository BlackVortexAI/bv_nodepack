// Saved output indices are execution identity, not presentation geometry.
const names = ["lora_count", "registry_summary", "resource_provider"];
const types = ["INT", "STRING", "BV_RUNTIME_RESOURCE_PROVIDER"];
const entries = (store: any): [any, any][] => store instanceof Map ? [...store.entries()] : Object.entries(store ?? {});
const same = (a: any, b: any) => String(a) === String(b);

/** Called only after graph configuration has restored nodes AND links. */
export function reconcileLoraRegistryOutputOrder(node: any): boolean {
    if (String(node?.comfyClass ?? node?.type) !== "BV LoRA Registry") return false;
    const graph = node.graph, outputs = node.outputs;
    if (!graph || !Array.isArray(outputs) || outputs.length !== 3) return false;
    if (names.some((name, index) => outputs.filter(slot => slot.name === name && slot.type === types[index]).length !== 1)) return false;
    if (outputs.every((slot, index) => slot.name === names[index])) return false;
    // Only the released 1.2.3 order is a recognized migration source.
    if (outputs.map(slot => slot.name).join() !== "resource_provider,lora_count,registry_summary") return false;
    const stores = [...new Set([graph._links, graph.links].filter(Boolean))];
    const records = stores.map(store => new Map(entries(store).map(([id, link]) => [String(id), link])));
    const updates = new Map<any, number>();
    const used = new Set<string>();
    for (let oldIndex = 0; oldIndex < outputs.length; oldIndex++) {
        const slot = outputs[oldIndex], nextIndex = names.indexOf(slot.name);
        if (slot.links != null && !Array.isArray(slot.links)) return false;
        for (const id of slot.links ?? []) {
            if (used.has(String(id)) || !records.length) return false;
            used.add(String(id));
            const copies = records.map(record => record.get(String(id)));
            if (copies.some(link => !link)) return false;
            const first = copies[0];
            for (const link of copies) {
                if (!same(link.origin_id, node.id) || link.origin_slot !== oldIndex || link.type !== slot.type
                    || !same(link.target_id, first.target_id) || link.target_slot !== first.target_slot) return false;
                const target = graph.getNodeById?.(link.target_id)
                    ?? (graph._nodes ?? graph.nodes ?? []).find((item: any) => same(item.id, link.target_id))
                    ?? (same(graph.outputNode?.id, link.target_id) ? graph.outputNode : null);
                if (!target) return false;
                // Native Subgraph output boundaries expose slots/linkIds, not node inputs.
                if (target === graph.outputNode) {
                    const boundary = target.slots?.[link.target_slot];
                    if (!boundary || boundary.type !== slot.type || !Array.isArray(boundary.linkIds)
                        || !boundary.linkIds.some((candidate: any) => same(candidate, id))) return false;
                } else if (!same(target.inputs?.[link.target_slot]?.link, id)) return false;
                updates.set(link, nextIndex);
            }
        }
    }
    // Reject orphaned outbound links as well as missing output-side references.
    for (const record of records) for (const [id, link] of record) {
        if (same(link?.origin_id, node.id) && !used.has(id)) return false;
    }
    const ordered = names.map(name => outputs.find(slot => slot.name === name));
    node.outputs = ordered;
    ordered.forEach((slot, index) => { if (Object.prototype.hasOwnProperty.call(slot, "slot_index")) slot.slot_index = index; });
    for (const [link, index] of updates) link.origin_slot = index;
    return true;
}

export function reconcileConfiguredNodeOutputs(root: any): number {
    const seen = new Set<any>();
    let changed = 0;
    const visit = (graph: any) => {
        if (!graph || seen.has(graph)) return;
        seen.add(graph);
        for (const node of graph._nodes ?? graph.nodes ?? []) {
            if (node.graph === graph && reconcileLoraRegistryOutputOrder(node)) changed++;
            visit(node.subgraph ?? node.getSubgraph?.());
        }
    };
    visit(root);
    return changed;
}
