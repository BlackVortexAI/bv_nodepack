import { collectSuggestions, completionRequest, insertSuggestion, type CompletionSuggestion } from "./engine";
import { localCompletionProvider } from "./localProvider";
import { COMPLETION_CHANGE_EVENT, COMPLETION_PLACEMENT_CHANGE_EVENT, completionEnabled, completionPlacement } from "./settings";
import { completionPopupPosition } from "./position";

type Attached = { close: () => void; destroy: () => void };
const attached = new Map<HTMLTextAreaElement, Attached>();
let uninstallGlobalAdapter: (() => void) | null = null;

export function isEligibleCompletionTextarea(element: HTMLTextAreaElement) {
    if (element.disabled || element.readOnly || element.closest("#bv-root")) return false;
    if (element.dataset.bvAutocomplete === "off" || element.closest('[data-bv-autocomplete="off"]')) return false;
    return element.matches("textarea.comfy-multiline-input") || Boolean(element.closest("[data-node-id]"));
}

function attach(textarea: HTMLTextAreaElement) {
    if (attached.has(textarea) || !isEligibleCompletionTextarea(textarea)) return;
    let suggestions: CompletionSuggestion[] = [];
    let selected = 0;
    let request: ReturnType<typeof completionRequest> = null;
    let abort: AbortController | null = null;
    let timer: number | null = null;
    let popup: HTMLDivElement | null = null;

    const close = () => {
        abort?.abort();
        abort = null;
        suggestions = [];
        request = null;
        popup?.remove();
        popup = null;
    };
    const position = () => {
        if (!popup) return;
        const next = completionPopupPosition(textarea, completionPlacement(), popup.offsetHeight || 210);
        popup.style.left = `${next.left}px`;
        popup.style.top = `${next.top}px`;
        popup.style.width = `${next.width}px`;
    };
    const render = () => {
        popup?.remove();
        popup = document.createElement("div");
        popup.className = "bv-completion-popup bv-global-completion-popup";
        popup.setAttribute("role", "listbox");
        suggestions.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.classList.toggle("active", index === selected);
            const label = document.createElement("span");
            label.textContent = item.label;
            const detail = document.createElement("small");
            detail.textContent = [item.category, item.detail, item.source].filter(Boolean).join(" · ");
            button.append(label, detail);
            button.addEventListener("pointerdown", event => { event.preventDefault(); accept(index); });
            popup!.append(button);
        });
        document.body.append(popup);
        position();
    };
    const accept = (index = selected) => {
        const item = suggestions[index];
        if (!request || !item) return;
        const next = insertSuggestion(textarea.value, request, item);
        textarea.value = next.text;
        textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: item.insertText }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(next.caret, next.caret); });
    };
    const search = () => {
        if (!completionEnabled()) return close();
        if (textarea.selectionStart !== textarea.selectionEnd) return close();
        if (timer != null) window.clearTimeout(timer);
        abort?.abort();
        request = completionRequest(textarea.value, textarea.selectionStart ?? textarea.value.length, { scope: "generic", polarity: "positive" });
        if (!request) return close();
        const current = request;
        abort = new AbortController();
        const controller = abort;
        timer = window.setTimeout(async () => {
            const items = await collectSuggestions(current, [localCompletionProvider], controller.signal);
            if (controller.signal.aborted || document.activeElement !== textarea) return;
            suggestions = items;
            selected = 0;
            items.length ? render() : close();
        }, 120);
    };
    const keydown = (event: KeyboardEvent) => {
        if (!suggestions.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
            render();
        } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); accept();
        } else if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); close();
        }
    };
    const blur = () => window.setTimeout(() => { if (!popup?.contains(document.activeElement)) close(); }, 120);
    textarea.addEventListener("input", search);
    textarea.addEventListener("select", search);
    textarea.addEventListener("keydown", keydown, true);
    textarea.addEventListener("blur", blur);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    attached.set(textarea, { close, destroy: () => {
        close();
        textarea.removeEventListener("input", search);
        textarea.removeEventListener("select", search);
        textarea.removeEventListener("keydown", keydown, true);
        textarea.removeEventListener("blur", blur);
        window.removeEventListener("resize", position);
        window.removeEventListener("scroll", position, true);
    } });
}

function scan(root: ParentNode) {
    if (root instanceof HTMLTextAreaElement) attach(root);
    root.querySelectorAll?.("textarea").forEach(element => attach(element as HTMLTextAreaElement));
}

function detach(root: ParentNode) {
    const elements = root instanceof HTMLTextAreaElement ? [root] : [...(root.querySelectorAll?.("textarea") ?? [])] as HTMLTextAreaElement[];
    elements.forEach(element => {
        attached.get(element)?.destroy();
        attached.delete(element);
    });
}

export function installGlobalTextareaCompletion() {
    if (uninstallGlobalAdapter) return uninstallGlobalAdapter;
    scan(document);
    const observer = new MutationObserver(records => records.forEach(record => {
        record.addedNodes.forEach(node => { if (node instanceof Element) scan(node); });
        record.removedNodes.forEach(node => { if (node instanceof Element) detach(node); });
    }));
    observer.observe(document.body, { childList: true, subtree: true });
    const settingChanged = () => { if (!completionEnabled()) attached.forEach(value => value.close()); };
    const placementChanged = () => attached.forEach(value => value.close());
    window.addEventListener(COMPLETION_CHANGE_EVENT, settingChanged);
    window.addEventListener(COMPLETION_PLACEMENT_CHANGE_EVENT, placementChanged);
    uninstallGlobalAdapter = () => {
        observer.disconnect();
        window.removeEventListener(COMPLETION_CHANGE_EVENT, settingChanged);
        window.removeEventListener(COMPLETION_PLACEMENT_CHANGE_EVENT, placementChanged);
        attached.forEach(value => value.destroy());
        attached.clear();
        uninstallGlobalAdapter = null;
    };
    return uninstallGlobalAdapter;
}
