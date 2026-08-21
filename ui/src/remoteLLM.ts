import { createBvButton, createBvDialog, createBvField } from "./ui/dom";

type ProviderProfile = {
    id: string;
    label: string;
    endpoint: string;
    allow_custom_endpoint: boolean;
    default_model: string;
    auth_mode: "bearer" | "none";
    configured: boolean;
};

let profilesPromise: Promise<ProviderProfile[]> | null = null;

const loadProfiles = (api: any, refresh = false) => {
    if (refresh || !profilesPromise) {
        profilesPromise = fetch(api.apiURL("/bv_nodepack/remote_llm/providers"))
            .then(async response => {
                if (!response.ok) throw new Error(await response.text());
                const value = await response.json();
                return Array.isArray(value.profiles) ? value.profiles : [];
            });
    }
    return profilesPromise;
};

const widget = (node: any, name: string) => node.widgets?.find((item: any) => item.name === name);

const applyProfile = (node: any, profiles: ProviderProfile[], previousLabel?: string) => {
    const selected = profiles.find(profile => profile.label === String(widget(node, "provider_profile")?.value ?? ""));
    if (!selected) return;
    const endpoint = widget(node, "custom_endpoint");
    const model = widget(node, "model");
    if (endpoint) {
        if (!selected.allow_custom_endpoint || !String(endpoint.value ?? "").trim()) endpoint.value = selected.endpoint;
        // LiteGraph hides the value of disabled string widgets. Keep it visible and
        // enforce managed endpoints through the callback plus the backend catalog.
        endpoint.disabled = false;
        if (endpoint.element) endpoint.element.readOnly = !selected.allow_custom_endpoint;
        endpoint.label = selected.allow_custom_endpoint ? "custom endpoint" : "endpoint (managed)";
        if (!endpoint.__bvRemoteEndpointHooked) {
            endpoint.__bvRemoteEndpointHooked = true;
            const originalEndpointCallback = endpoint.callback;
            endpoint.callback = function () {
                const result = originalEndpointCallback?.apply(this, arguments);
                const active = profiles.find(profile => profile.label === String(widget(node, "provider_profile")?.value ?? ""));
                if (active && !active.allow_custom_endpoint) endpoint.value = active.endpoint;
                return result;
            };
        }
    }
    if (model && previousLabel && previousLabel !== selected.label) {
        const previous = profiles.find(profile => profile.label === previousLabel);
        const current = String(model.value ?? "").trim();
        if (!current || current === previous?.default_model) model.value = selected.default_model;
    }
    const status = widget(node, "configure_api_key");
    if (status) {
        status.disabled = selected.auth_mode === "none";
        status.label = selected.auth_mode === "none"
            ? "✓ No API key required"
            : `${selected.configured ? "✓" : "⚠"} Configure ${selected.label} API Key`;
    }
    node.setDirtyCanvas?.(true, true);
};

const dialog = (api: any, node: any, profiles: ProviderProfile[]) => {
    const selected = profiles.find(profile => profile.label === String(widget(node, "provider_profile")?.value ?? "")) ?? profiles[0];
    if (!selected) return;
    if (selected.auth_mode === "none") return;
    const shell = createBvDialog({ title: `${selected.label} API Key`, description: "Credentials are stored by the local BV Nodepack backend and are never written into the workflow.", size: "small" });
    const status = document.createElement("div");
    status.textContent = selected.configured ? "A key is configured. Enter a new key to replace it." : "No key is configured.";
    status.className = "bv-ui-status";
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "off";
    input.placeholder = "Paste API key";
    const error = document.createElement("div");
    error.className = "bv-ui-status bv-ui-status--error";
    const close = createBvButton("Cancel"), remove = createBvButton("Delete key", "danger"), save = createBvButton("Save key", "primary");
    remove.disabled = !selected.configured;
    close.onclick = shell.close;
    save.onclick = async () => {
        error.textContent = "";
        const response = await fetch(api.apiURL("/bv_nodepack/remote_llm/api_key"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: selected.id, api_key: input.value }),
        });
        if (!response.ok) { error.textContent = (await response.json().catch(() => null))?.error ?? "Could not save API key."; return; }
        selected.configured = true;
        applyProfile(node, profiles);
        shell.close();
        loadProfiles(api, true);
    };
    remove.onclick = async () => {
        const response = await fetch(api.apiURL(`/bv_nodepack/remote_llm/api_key/${encodeURIComponent(selected.id)}`), { method: "DELETE" });
        if (!response.ok) { error.textContent = "Could not delete API key."; return; }
        selected.configured = false;
        applyProfile(node, profiles);
        shell.close();
        loadProfiles(api, true);
    };
    shell.body.append(status, createBvField("API key", input), error);
    shell.footer.append(remove, close, save);
    shell.show();
    input.focus();
};

export const upgradeRemoteLLMProvider = (node: any, api: any) => {
    loadProfiles(api).then(profiles => {
        let previousLabel = String(widget(node, "provider_profile")?.value ?? "");
        const selector = widget(node, "provider_profile");
        if (selector && !selector.__bvRemoteLLMHooked) {
            selector.__bvRemoteLLMHooked = true;
            const original = selector.callback;
            selector.callback = function (value: string) {
                const result = original?.apply(this, arguments);
                applyProfile(node, profiles, previousLabel);
                previousLabel = value;
                return result;
            };
        }
        let configure = widget(node, "configure_api_key");
        if (!configure) {
            configure = node.addWidget("button", "configure_api_key", null, () => dialog(api, node, profiles), { serialize: false });
            configure.serialize = false;
        }
        applyProfile(node, profiles);
    }).catch(error => console.error("BV Remote LLM settings unavailable", error));
};
