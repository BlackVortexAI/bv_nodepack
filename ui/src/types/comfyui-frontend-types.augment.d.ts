import type {} from "@comfyorg/comfyui-frontend-types";

declare module "@comfyorg/comfyui-frontend-types" {
    /** Base helpers */
    export type Vec2 = [number, number];
    export type ID = number | string;

    /** Common slot shapes (LiteGraph-like) */
    export interface LGraphSlot {
        name?: string;
        type?: string;
        link?: ID | null;        // input: single link
        links?: ID[] | null;     // output: multiple links
        label?: string;
        color_off?: string;
        color_on?: string;
        [key: string]: unknown;
    }

    /** Link object (LiteGraph-like) */
    export interface LLink {
        id: ID;
        origin_id: ID;
        origin_slot: number;
        target_id: ID;
        target_slot: number;
        type?: string;
        [key: string]: unknown;
    }

    /** Group object */
    export interface LGraphGroup {
        title?: string;          // group name
        pos?: Vec2;
        size?: Vec2;
        color?: string;
        font_size?: number;
        locked?: boolean;
        // optional: you can store your own stable id here
        bv_id?: string;
        [key: string]: unknown;
    }

    /** Node object (minimal but useful) */
    export interface LGraphNode {
        id?: ID;

        // identifiers
        type?: string;          // LiteGraph node type
        title?: string;

        // ComfyUI mapping often adds these:
        comfyClass?: string;
        ComfyClass?: string;

        // layout
        pos?: Vec2;
        size?: Vec2;
        flags?: Record<string, unknown>;

        // IO
        inputs?: LGraphSlot[];
        outputs?: LGraphSlot[];

        // data / config
        properties?: Record<string, unknown>;
        widgets_values?: unknown[];

        // graph nesting
        subgraph?: LGraph | null;
        getSubgraph?: () => LGraph | null;

        // generic escape hatch
        [key: string]: unknown;
    }

    /** Graph object (main + subgraphs) */
    export interface LGraph {
        // nodes / groups
        _nodes?: LGraphNode[];
        nodes?: LGraphNode[];
        _groups?: LGraphGroup[];
        groups?: LGraphGroup[];

        // links
        links?: Record<string, LLink> | Record<number, LLink>;
        _links?: Record<string, LLink> | Record<number, LLink>;

        // misc
        version?: number;
        extra?: Record<string, unknown>;

        [key: string]: unknown;
    }

    /**
     * Optional: If your ComfyApp exposes rootGraph, you can also type it.
     * This won't hurt if it already exists; it just enriches TS understanding.
     */
    export interface ComfyApp {
        rootGraph?: LGraph;
        graph?: unknown; // many builds keep this unknown
    }
}
