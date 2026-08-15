import {FC, useEffect, useMemo} from "react";
import * as React from 'react';
import BVControl from "./control/BVControlComponent";

interface IBVPortalProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const BvPortal: FC<IBVPortalProps> = ({open, onClose}) => {
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
            className="bv-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}

        >
            <div
                className="bv-dialog"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <BVControl onClose={() => onClose()} />
            </div>
        </div>
    );
};

export default BvPortal;
