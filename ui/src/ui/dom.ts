export type BvButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type BvDialogSize = "small" | "medium" | "large";

export const createBvButton = (label: string, variant: BvButtonVariant = "secondary") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bv-ui-button bv-ui-button--${variant}`;
    button.textContent = label;
    return button;
};

export const createBvField = (label: string, control: HTMLElement, description?: string) => {
    const field = document.createElement("label");
    field.className = "bv-ui-field";
    const caption = document.createElement("span");
    caption.className = "bv-ui-field__label";
    caption.textContent = label;
    field.append(caption, control);
    if (description) {
        const help = document.createElement("small");
        help.className = "bv-ui-field__description";
        help.textContent = description;
        field.append(help);
    }
    return field;
};

export const createBvDialog = (options: { title: string; description?: string; size?: BvDialogSize }) => {
    const dialog = document.createElement("dialog");
    dialog.className = `bv-ui bv-ui-dialog bv-ui-dialog--${options.size ?? "medium"}`;

    const header = document.createElement("header");
    header.className = "bv-ui-dialog__header";
    const heading = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = options.title;
    heading.append(title);
    if (options.description) {
        const description = document.createElement("p");
        description.textContent = options.description;
        heading.append(description);
    }
    const closeButton = createBvButton("×", "ghost");
    closeButton.classList.add("bv-ui-button--icon");
    closeButton.setAttribute("aria-label", "Close dialog");
    closeButton.onclick = () => dialog.close();
    header.append(heading, closeButton);

    const body = document.createElement("div");
    body.className = "bv-ui-dialog__body";
    const footer = document.createElement("footer");
    footer.className = "bv-ui-dialog__footer";
    dialog.append(header, body, footer);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.addEventListener("click", event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    document.body.append(dialog);

    return { dialog, body, footer, close: () => dialog.close(), show: () => dialog.showModal() };
};
