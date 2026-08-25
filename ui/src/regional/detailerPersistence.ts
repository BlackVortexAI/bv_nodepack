export const DETAILER_BACKEND_WIDGET_NAMES = [
    "region",
    "global_influence",
    "background_influence",
    "primary_region_influence",
    "context_regions_json",
] as const;

type WidgetLike = { name?: string; value?: unknown };

export const detailerBackendWidgetValues = (widgets: WidgetLike[] | undefined): unknown[] =>
    DETAILER_BACKEND_WIDGET_NAMES.map(name => widgets?.find(widget => widget.name === name)?.value);

export const normalizeDetailerWidgetValues = (values: unknown): unknown => {
    if (!Array.isArray(values)) return values;

    // BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Positional widget repair.
    // Remove after workflows from early Detailer builds have passed the migration window.
    // Early Detailer builds inserted the visual region selector before the primary
    // influence. LiteGraph persisted serialize:false as a positional null placeholder.
    if (
        values.length === DETAILER_BACKEND_WIDGET_NAMES.length + 1
        && values[3] == null
        && typeof values[4] === "number"
        && typeof values[5] === "string"
    ) {
        return [...values.slice(0, 3), ...values.slice(4)];
    }

    return values;
};
