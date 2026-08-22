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
    mountBvView(close => createElement(RemoteLlmApiKeyDialog, { label: selected.label, configured: selected.configured, close,
      onSave: async (apiKey: string) => {
        const response = await fetch(api.apiURL("/bv_nodepack/remote_llm/api_key"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: selected.id, api_key: apiKey }),
        });
        if (!response.ok) return (await response.json().catch(() => null))?.error ?? "Could not save API key.";
        selected.configured = true;
        applyProfile(node, profiles);
        loadProfiles(api, true);
      }, onDelete: async () => {
        const response = await fetch(api.apiURL(`/bv_nodepack/remote_llm/api_key/${encodeURIComponent(selected.id)}`), { method: "DELETE" });
        if (!response.ok) return "Could not delete API key.";
        selected.configured = false;
        applyProfile(node, profiles);
        loadProfiles(api, true);
      }
    }));
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
