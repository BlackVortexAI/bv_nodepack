export type CompletionPlacement = "caret" | "field";
export type CompletionPopupPosition = { left: number; top: number; width: number };

const COPIED_STYLES = [
    "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing",
    "lineHeight", "textTransform", "textIndent", "textAlign", "wordSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
] as const;

export function textareaCaretRect(textarea: HTMLTextAreaElement, caret = textarea.selectionStart ?? textarea.value.length) {
    const bounds = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, {
        position: "fixed", visibility: "hidden", pointerEvents: "none",
        left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`,
        height: `${bounds.height}px`, boxSizing: style.boxSizing,
        whiteSpace: "pre-wrap", overflowWrap: "break-word", overflow: "hidden",
    });
    COPIED_STYLES.forEach(property => { mirror.style[property] = style[property]; });
    mirror.textContent = textarea.value.slice(0, caret);
    const marker = document.createElement("span");
    marker.textContent = textarea.value.slice(caret, caret + 1) || "\u200b";
    mirror.append(marker);
    document.body.append(mirror);
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
    const markerRect = marker.getBoundingClientRect();
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 16;
    mirror.remove();
    return { left: markerRect.left, top: markerRect.top, bottom: markerRect.top + lineHeight };
}

export function completionPopupPosition(textarea: HTMLTextAreaElement, placement: CompletionPlacement, popupHeight = 210): CompletionPopupPosition {
    const gap = 4, viewportGap = 4;
    const field = textarea.getBoundingClientRect();
    const caret = placement === "caret" ? textareaCaretRect(textarea) : { left: field.left, top: field.top, bottom: field.bottom };
    const preferredWidth = placement === "caret" ? Math.min(460, Math.max(320, field.width * .8)) : field.width;
    const width = Math.max(180, Math.min(preferredWidth, window.innerWidth - viewportGap * 2));
    const left = Math.max(viewportGap, Math.min(caret.left, window.innerWidth - width - viewportGap));
    const below = caret.bottom + gap;
    const top = below + popupHeight <= window.innerHeight - viewportGap
        ? below
        : Math.max(viewportGap, caret.top - popupHeight - gap);
    return { left, top, width };
}
