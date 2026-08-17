export type RegionChoice = { id: string; name: string; label: string };

export function regionChoices(regions: Array<{ id: string; name: string }>): RegionChoice[] {
    const counts = new Map<string, number>();
    for (const region of regions) counts.set(region.name, (counts.get(region.name) ?? 0) + 1);
    return regions.map(region => ({
        ...region,
        label: counts.get(region.name) === 1 ? region.name : `${region.name} · ${region.id.slice(0, 8)}`,
    }));
}

export function normalizeRegionId(value: unknown, choices: RegionChoice[]) {
    const id = String(value ?? "");
    return choices.some(choice => choice.id === id) ? id : choices[0]?.id ?? "";
}
