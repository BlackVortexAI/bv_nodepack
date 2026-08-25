import { parseLoraV3Config, serializeLoraV3Config } from "./loraV3Config";
import { parseDocument, type RegionalDocument } from "./model";

export const REGIONAL_DRAFT_PROPERTY = "bvRegionalEditorDraftV1";
export const REGIONAL_MIGRATION_EVENT = "bv-regional-migration-report";
export const REGIONAL_VALIDATION_EVENT = "bv-regional-validation-changed";

export type RegionalDraftIssue = {
    field: string;
    section: string;
    message: string;
    fallback: unknown;
};

export type RegionalEditorDraft = {
    schema: "bv.regional.editor-draft";
    version: 1;
    raw: Record<string, unknown>;
    issues: RegionalDraftIssue[];
};

export type RegionalMigrationResult = {
    nodeId: string;
    nodeTitle: string;
    migrated: boolean;
    assumedDefaults: string[];
    error?: string;
};

type Widget = { name?: string; value?: unknown; callback?: (value: unknown) => void };
type NodeLike = {
    id?: string | number;
    title?: string;
    type?: string;
    comfyClass?: string;
    properties?: Record<string, unknown>;
    widgets?: Widget[];
    graph?: { change?: () => void; setDirtyCanvas?: (foreground: boolean, background: boolean) => void };
};

const widget = (node: NodeLike, name: string) => node.widgets?.find(item => item.name === name);
const nodeClass = (node: NodeLike) => String(node.comfyClass ?? node.type ?? "");
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function parseRegionalEditorDraft(value: unknown): RegionalEditorDraft | null {
    if (value == null) return null;
    if (typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Partial<RegionalEditorDraft>;
    if (candidate.schema !== "bv.regional.editor-draft" || candidate.version !== 1 || !candidate.raw || typeof candidate.raw !== "object" || Array.isArray(candidate.raw)) return null;
    return {
        schema: "bv.regional.editor-draft",
        version: 1,
        raw: structuredClone(candidate.raw),
        issues: Array.isArray(candidate.issues) ? structuredClone(candidate.issues) : [],
    };
}

export function persistRegionalEditorDraft(node: NodeLike, draft: RegionalEditorDraft | null) {
    node.properties ??= {};
    if (draft) node.properties[REGIONAL_DRAFT_PROPERTY] = structuredClone(draft);
    else delete node.properties[REGIONAL_DRAFT_PROPERTY];
    node.graph?.change?.();
    node.graph?.setDirtyCanvas?.(true, true);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(REGIONAL_VALIDATION_EVENT, { detail: { node } }));
}

export function regionalEditorDraft(node: NodeLike): RegionalEditorDraft | null {
    return parseRegionalEditorDraft(node.properties?.[REGIONAL_DRAFT_PROPERTY]);
}

export function applyRegionalPrimitiveDraft(
    document: RegionalDocument,
    raw: Record<string, unknown>,
): { canonical: RegionalDocument; draft: RegionalEditorDraft } {
    const canonical = structuredClone(document), issues: RegionalDraftIssue[] = [];
    if (Object.prototype.hasOwnProperty.call(raw, "title")) {
        const title = typeof raw.title === "string" ? raw.title.trim() : "";
        if (title) canonical.title = title;
        else issues.push({ field: "title", section: "document", message: "Title is required.", fallback: canonical.title });
    }
    for (const [field, minimum, maximum] of [["canvas.width", 64, 16384], ["canvas.height", 64, 16384]] as const) {
        if (!Object.prototype.hasOwnProperty.call(raw, field)) continue;
        const number = typeof raw[field] === "number" ? raw[field] : Number(raw[field]);
        if (Number.isInteger(number) && number >= minimum && number <= maximum) canonical.canvas[field.endsWith("width") ? "width" : "height"] = number;
        else issues.push({ field, section: "canvas", message: `${field} must be an integer from ${minimum} to ${maximum}.`, fallback: canonical.canvas[field.endsWith("width") ? "width" : "height"] });
    }
    return { canonical, draft: { schema: "bv.regional.editor-draft", version: 1, raw: structuredClone(raw), issues } };
}

// BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Workflow-load migration coordinator.
// Remove with document v1 and LoRA config v1/v2 parsers once old workflow loading is unsupported.
export function migrateRegionalNode(node: NodeLike): RegionalMigrationResult {
    const result: RegionalMigrationResult = { nodeId: String(node.id ?? ""), nodeTitle: node.title || "BV Regional node", migrated: false, assumedDefaults: [] };
    const candidates: Array<{ target: Widget; value: string }> = [];
    try {
        const documentWidget = widget(node, "regional_json");
        if (documentWidget) {
            const before = typeof documentWidget.value === "string" ? JSON.parse(documentWidget.value) : structuredClone(documentWidget.value);
            const document = parseDocument(before);
            const value = JSON.stringify(document);
            if (before?.version === 1) result.assumedDefaults.push("region usage = generation");
            if (String(documentWidget.value ?? "") !== value) candidates.push({ target: documentWidget, value });
        }
        const loraWidget = widget(node, "lora_v3_config_json")
            ?? (nodeClass(node) === "BV Regional LoRA" ? widget(node, "config_json") : undefined);
        if (loraWidget && String(loraWidget.value ?? "").trim()) {
            const parsed = parseLoraV3Config(loraWidget.value), value = serializeLoraV3Config(parsed);
            if (String(loraWidget.value ?? "") !== value) candidates.push({ target: loraWidget, value });
        }
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        return result;
    }
    for (const candidate of candidates) {
        candidate.target.value = candidate.value;
        candidate.target.callback?.(candidate.value);
    }
    result.migrated = candidates.length > 0;
    if (result.migrated) {
        node.graph?.change?.();
        node.graph?.setDirtyCanvas?.(true, true);
    }
    return result;
}

let pendingReports: RegionalMigrationResult[] = [], scheduled = false;
export function queueRegionalMigrationReport(result: RegionalMigrationResult) {
    if (!result.migrated && !result.error) return;
    const key = `${result.nodeId}:${result.nodeTitle}`;
    pendingReports = [...pendingReports.filter(item => `${item.nodeId}:${item.nodeTitle}` !== key), result];
    if (scheduled || typeof window === "undefined") return;
    scheduled = true;
    queueMicrotask(() => {
        scheduled = false;
        const reports = pendingReports; pendingReports = [];
        window.dispatchEvent(new CustomEvent(REGIONAL_MIGRATION_EVENT, { detail: { reports } }));
    });
}

export function migrationReportMessage(reports: RegionalMigrationResult[]) {
    const migrated = reports.filter(item => item.migrated), failed = reports.filter(item => item.error);
    const defaults = [...new Set(migrated.flatMap(item => item.assumedDefaults))];
    return {
        title: failed.length ? "Regional migration needs attention" : "Regional configuration migrated",
        message: `${migrated.length} migrated, ${failed.length} failed${defaults.length ? ` · Defaults: ${defaults.join(", ")}` : ""}.`,
        tone: failed.length ? "warning" as const : "info" as const,
    };
}
