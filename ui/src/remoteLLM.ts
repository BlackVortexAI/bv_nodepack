import { createElement } from "react";
import { mountBvView } from "./ui";
import { RemoteLlmApiKeyDialog } from "./remoteLLMDialog";

type ProviderProfile = {
    id: string;
    label: string;
    endpoint: string;
    allow_custom_endpoint: boolean;
    default_model: string;
    auth_mode: "bearer" | "none";
    configured: boolean;
    approved_endpoint: string | null;
    effective_endpoint: string | null;
};

type ProviderCatalog = {
    profiles: ProviderProfile[];
    // Server capability, not a per-request decision: whether this server accepts
    // management requests from anyone (loopback-only listener or operator opt-in).
    management: { allowed: boolean; local_server: boolean; remote_management: boolean };
    private_storage: boolean;
};

let catalogPromise: Promise<ProviderCatalog> | null = null;

const loadCatalog = (api: any, refresh = false) => {
    if (refresh || !catalogPromise) {
        catalogPromise = fetch(api.apiURL("/bv_nodepack/remote_llm/providers"))
            .then(async response => {
                if (!response.ok) throw new Error(await response.text());
                const value = await response.json();
                return {
                    profiles: Array.isArray(value.profiles) ? value.profiles : [],
                    management: value.management ?? { allowed: true, local_server: true, remote_management: false },
                    private_storage: value.private_storage !== false,
                } as ProviderCatalog;
            });
    }
    return catalogPromise;
};
const loadProfiles = (api: any, refresh = false) => loadCatalog(api, refresh).then(catalog => catalog.profiles);

const widget = (node: any, name: string) => node.widgets?.find((item: any) => item.name === name);

const hostOf = (endpoint: string | null) => {
    if (!endpoint) return null;
    try { return new URL(endpoint).host; } catch { return endpoint; }
};

// The node has no endpoint widget: the destination is decided by the backend from the
// provider catalog, the approved API-key binding or the local settings file. The button
// label only mirrors that decision so the user can see where requests will go.
let serverState: Pick<ProviderCatalog, "management" | "private_storage"> = { management: { allowed: true, local_server: true, remote_management: false }, private_storage: true };

const applyProfile = (node: any, profiles: ProviderProfile[], previousLabel?: string) => {
    const selected = profiles.find(profile => profile.label === String(widget(node, "provider_profile")?.value ?? ""));
    if (!selected) return;
    const model = widget(node, "model");
    if (model && previousLabel && previousLabel !== selected.label) {
        const previous = profiles.find(profile => profile.label === previousLabel);
        const current = String(model.value ?? "").trim();
        if (!current || current === previous?.default_model) model.value = selected.default_model;
    }
    const status = widget(node, "configure_api_key");
    if (status) {
        const destination = hostOf(selected.effective_endpoint ?? selected.endpoint);
        if (selected.auth_mode === "none") {
            status.disabled = true;
            status.label = `✓ No API key required · ${destination}`;
        } else if (!serverState.private_storage) {
            status.disabled = true;
            status.label = "⚠ API keys need a ComfyUI with private user storage";
        } else if (!serverState.management.allowed) {
            status.disabled = true;
            status.label = "⚠ Key management is local-only on this server";
        } else {
            status.disabled = false;
            const ready = selected.configured && selected.approved_endpoint;
            status.label = ready
                ? `✓ Configure ${selected.label} API Key · ${hostOf(selected.approved_endpoint)}`
                : `⚠ Configure ${selected.label} API Key`;
        }
    }
    node.setDirtyCanvas?.(true, true);
};

const dialog = (api: any, node: any, profiles: ProviderProfile[]) => {
    const selected = profiles.find(profile => profile.label === String(widget(node, "provider_profile")?.value ?? "")) ?? profiles[0];
    if (!selected) return;
    if (selected.auth_mode === "none") return;
    mountBvView(close => createElement(RemoteLlmApiKeyDialog, {
      label: selected.label,
      configured: selected.configured,
      // Custom profiles enter and confirm the destination inside the dialog; fixed profiles show the catalog address.
      destination: selected.approved_endpoint ?? selected.endpoint,
      destinationEditable: selected.allow_custom_endpoint,
      approvedEndpoint: selected.approved_endpoint,
      close,
      onSave: async (apiKey: string, destination: string) => {
        const response = await fetch(api.apiURL("/bv_nodepack/remote_llm/api_key"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: selected.id, api_key: apiKey, endpoint: destination }),
        });
        if (!response.ok) return (await response.json().catch(() => null))?.error ?? "Could not save API key.";
        selected.configured = true;
        selected.approved_endpoint = destination;
        selected.effective_endpoint = destination;
        applyProfile(node, profiles);
        loadProfiles(api, true);
      }, onDelete: async () => {
        const response = await fetch(api.apiURL(`/bv_nodepack/remote_llm/api_key/${encodeURIComponent(selected.id)}`), { method: "DELETE" });
        if (!response.ok) return "Could not delete API key.";
        selected.configured = false;
        selected.approved_endpoint = null;
        selected.effective_endpoint = selected.allow_custom_endpoint ? null : selected.endpoint;
        applyProfile(node, profiles);
        loadProfiles(api, true);
      }
    }),{scope:"global"});
};

export const upgradeRemoteLLMProvider = (node: any, api: any) => {
    loadCatalog(api).then(catalog => {
        serverState = { management: catalog.management, private_storage: catalog.private_storage };
        const profiles = catalog.profiles;
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
