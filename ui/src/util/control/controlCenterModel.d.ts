export function nodesInControlGroup(
    item: any,
    isExcluded?: (node: any) => boolean,
): any[];

export type BVControlConflictEntry = {
    controlId: string;
    controlName: string;
    action: "activate" | "mute" | "bypass";
    groupId: string;
    groupPath: string;
};

export type BVControlConflict = {
    groupId: string;
    groupPath: string;
    winnerAction: "activate" | "mute" | "bypass";
    entries: BVControlConflictEntry[];
};

export function findActiveControlConflicts(config: any): BVControlConflict[];
export function formatControlConflictStatus(conflicts: BVControlConflict[]): string;
