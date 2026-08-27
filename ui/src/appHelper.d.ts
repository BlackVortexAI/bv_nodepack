import type { ComfyApp } from "@comfyorg/comfyui-frontend-types";
declare module "./appHelper.js" {
    export function getApp(): ComfyApp;
    export function getApi(): {
        addEventListener(type: string, callback: (event: CustomEvent<any>) => void): void;
        removeEventListener(type: string, callback: (event: CustomEvent<any>) => void): void;
        apiURL(path: string): string;
        fetchApi(route: string, options?: RequestInit): Promise<Response>;
    };
}
