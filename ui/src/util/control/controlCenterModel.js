export function nodesInControlGroup(item, isExcluded = () => false) {
    const nativeNodes = item.group.nodes ?? item.group._nodes;
    if (Array.isArray(nativeNodes)) {
        const resolved = nativeNodes.filter((node) => node && typeof node === "object" && !isExcluded(node));
        if (resolved.length > 0) return resolved;
    }

    const [gx, gy] = item.group.pos || [0, 0];
    const [gw, gh] = item.group.size || [0, 0];
    return (item.graph._nodes ?? item.graph.nodes ?? []).filter((node) => {
        if (isExcluded(node)) return false;
        const [x, y] = node.pos || [0, 0];
        const [w, h] = node.size || [0, 0];
        return x + w / 2 >= gx && x + w / 2 <= gx + gw && y + h / 2 >= gy && y + h / 2 <= gy + gh;
    });
}

const ACTION_PRIORITY = { activate: 3, mute: 2, bypass: 1 };
const actionLabel = (action) => action.charAt(0).toUpperCase() + action.slice(1);

export function findActiveControlConflicts(config) {
    const assignmentsByGroup = new Map();
    for (const control of config.controls ?? []) {
        if (!control.enabled) continue;
        for (const assignment of control.assignments ?? []) {
            if (assignment.unresolved) continue;
            const entries = assignmentsByGroup.get(assignment.groupId) ?? [];
            entries.push({
                controlId: control.id,
                controlName: control.name,
                action: assignment.action,
                groupId: assignment.groupId,
                groupPath: assignment.groupPath || assignment.groupTitle || assignment.groupId,
            });
            assignmentsByGroup.set(assignment.groupId, entries);
        }
    }

    const conflicts = [];
    for (const entries of assignmentsByGroup.values()) {
        if (new Set(entries.map((entry) => entry.action)).size < 2) continue;
        const winnerAction = entries.reduce((winner, entry) =>
            ACTION_PRIORITY[entry.action] > ACTION_PRIORITY[winner] ? entry.action : winner,
        entries[0].action);
        conflicts.push({
            groupId: entries[0].groupId,
            groupPath: entries[0].groupPath,
            winnerAction,
            entries,
        });
    }
    return conflicts;
}

export function formatControlConflictStatus(conflicts) {
    if (!conflicts.length) return "✓ No active conflicts";
    if (conflicts.length > 1) return `⚠ ${conflicts.length} active control conflicts`;
    const conflict = conflicts[0];
    const overridden = [...new Set(conflict.entries
        .filter((entry) => entry.action !== conflict.winnerAction)
        .map((entry) => entry.action))].join(", ");
    return `⚠ ${conflict.groupPath}: ${actionLabel(conflict.winnerAction)} overrides ${overridden.split(", ").map(actionLabel).join(", ")}`;
}
