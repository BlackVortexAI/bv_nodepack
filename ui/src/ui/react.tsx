import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function BvDialog(props: { open: boolean; onClose: () => void; title: string; description?: string; size?: "small" | "medium" | "large"; children: ReactNode; footer?: ReactNode; modal?: boolean }) {
    const host = useMemo(() => document.createElement("div"), []);
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        host.dataset.bvUiRoot = "dialog";
        document.body.append(host);
        return () => host.remove();
    }, [host]);
    useEffect(() => {
        if (!props.open) return;
        const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
        window.addEventListener("keydown", keydown, { capture:true });
        requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("button,input,select,textarea,[tabindex]:not([tabindex='-1'])")?.focus());
        return () => window.removeEventListener("keydown", keydown, { capture:true });
    }, [props.open, props.onClose]);
    if (!props.open) return null;
    return createPortal(<div className={`bv-ui bv-ui-overlay${props.modal === false ? " bv-ui-overlay--modeless" : ""}`} onPointerDown={event => { if (event.target === event.currentTarget) props.onClose(); }}>
        <div ref={panel} className={`bv-ui-dialog bv-ui-dialog--${props.size ?? "medium"}`} role="dialog" aria-modal={props.modal !== false} aria-labelledby={titleId} onPointerDown={event => event.stopPropagation()}>
            <header className="bv-ui-dialog__header"><div><h2 id={titleId}>{props.title}</h2>{props.description && <p>{props.description}</p>}</div><button type="button" className="bv-ui-button bv-ui-button--ghost bv-ui-button--icon" onClick={props.onClose} aria-label="Close dialog">×</button></header>
            <div className="bv-ui-dialog__body">{props.children}</div>
            {props.footer && <footer className="bv-ui-dialog__footer">{props.footer}</footer>}
        </div>
    </div>, host);
}
