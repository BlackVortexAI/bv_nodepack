import {FC, useEffect, useMemo} from "react";
import * as React from 'react';
import { getApp } from "../appHelper.js";
import {collectAllGroups} from "../util/control/collector";
import BVControl from "./control/BVControlComponent";

interface IBVPortalProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const BvPortal: FC<IBVPortalProps> = ({open, onClose, children}) => {

    const comfyApp = getApp();

    const el = useMemo(() => document.createElement("div"), []);

    useEffect(() => {
        // so landet es wirklich "oben" im DOM
        el.setAttribute("data-addon-modal-root", "true");
        document.body.appendChild(el);
        return () => {
            document.body.removeChild(el);
        };
    }, [el]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}

            style={{
                position: "fixed",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.45)",
                zIndex: 2147483647,
            }}
        >
            <div
                className={"p-dialog"}
                // style={{
                //     minWidth: 320,
                //     maxWidth: "min(720px, 92vw)",
                //     maxHeight: "min(80vh, 720px)",
                //     overflow: "auto",
                //     borderRadius: 12,
                //     // background: "white",
                //     boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
                //     padding: 16,
                // }}
                onMouseDown={(e) => e.stopPropagation()}
            >

                <BVControl onClose={() => onClose()} />


                {/*{collectAllGroups(comfyApp).map((group) => (*/}
                {/*    <div>{group.group.title}</div>*/}
                {/*))}*/}
            </div>

        </div>
    );
};

export default BvPortal;
