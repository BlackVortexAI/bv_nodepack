import { applyCompletionDatasetSetting, completionDatasetSelection } from "./settings";

type Dataset = { id: string; name: string; bytes: number };

export function renderCompletionDatasetSetting(_name: string, setter: (value: unknown) => void, value: unknown) {
    applyCompletionDatasetSetting(value);
    const root = document.createElement("div");
    root.className = "bv-settings-datasets";
    const heading = document.createElement("strong");
    heading.textContent = "Completion datasets";
    const description = document.createElement("small");
    description.textContent = "Choose and prioritize local CSV/TSV sources. The topmost enabled dataset wins duplicate tags.";
    const list = document.createElement("div");
    list.textContent = "Loading datasets…";
    root.append(heading, description, list);

    void fetch("/bv_nodepack/completion/status").then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }).then(payload => {
        const datasets: Dataset[] = Array.isArray(payload?.datasets) ? payload.datasets : [];
        list.replaceChildren();
        if (!datasets.length) {
            list.textContent = "No local CSV/TSV dataset found.";
            return;
        }
        const stored = completionDatasetSelection();
        let active = stored ?? datasets.map(item => item.id);
        const save = () => {
            setter(JSON.stringify(active));
            applyCompletionDatasetSetting(active);
        };
        const renderRows = () => {
          list.replaceChildren();
          const byId = new Map(datasets.map(item => [item.id, item]));
          const ordered = [...active.map(id => byId.get(id)).filter((item): item is Dataset => Boolean(item)), ...datasets.filter(item => !active.includes(item.id))];
          for (const dataset of ordered) {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = active.includes(dataset.id);
            const title = document.createElement("span");
            title.textContent = dataset.name;
            title.title = dataset.id;
            const size = document.createElement("small");
            size.textContent = `${(dataset.bytes / 1048576).toFixed(1)} MiB`;
            checkbox.addEventListener("change", () => {
                active = checkbox.checked ? [...active, dataset.id] : active.filter(id => id !== dataset.id);
                save();
                renderRows();
            });
            const order = document.createElement("span");
            order.className = "dataset-order";
            const index = active.indexOf(dataset.id);
            for (const [symbol, offset] of [["↑", -1], ["↓", 1]] as const) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = symbol;
                button.title = offset < 0 ? "Move up" : "Move down";
                button.disabled = index < 0 || index + offset < 0 || index + offset >= active.length;
                button.addEventListener("click", () => {
                    const target = index + offset;
                    [active[index], active[target]] = [active[target], active[index]];
                    save();
                    renderRows();
                });
                order.append(button);
            }
            label.append(checkbox, title, size, order);
            list.append(label);
          }
        };
        renderRows();
    }).catch(reason => {
        list.className = "dataset-error";
        list.textContent = `Could not load datasets: ${reason instanceof Error ? reason.message : String(reason)}`;
    });
    return root;
}
