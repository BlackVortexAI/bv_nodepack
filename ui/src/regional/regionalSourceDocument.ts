import { parseDocument, type RegionalDocument } from "./model";

const regionalSourceTypes = new Set(["BV Regional LoRA"]);

const nodeType = (node: any): string => String(node?.comfyClass ?? node?.type ?? "");

const graphLink = (graph: any, linkId: unknown): any =>
    linkId == null ? null : graph?.links?.[linkId as any] ?? graph?._links?.get?.(linkId);

export function sourceRegionalDocument(node: any, fallbackGraph: any = null): RegionalDocument | null {
    let current = node;
    let concreteGraph = node?.__bvConcreteGraph ?? node?.graph ?? fallbackGraph;
    const visited = new Set<any>();

    while (current && !visited.has(current)) {
        visited.add(current);
        concreteGraph = current.__bvConcreteGraph ?? current.graph ?? concreteGraph;
        const input = current.inputs?.find((item: any) => item.name === "regional" || item.name === "regional_prompt");
        const link = graphLink(concreteGraph, input?.link);
        const source = link ? concreteGraph?.getNodeById?.(link.origin_id) : null;
        const type = nodeType(source);
        if (type === "BV Regional Prompt") {
            const value = source.widgets?.find((widget: any) => widget.name === "regional_json")?.value;
            try { return parseDocument(value); } catch { return null; }
        }
        if (!regionalSourceTypes.has(type)) return null;
        current = source;
    }
    return null;
}
