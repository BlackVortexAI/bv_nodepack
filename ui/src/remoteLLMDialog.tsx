import { useState } from "react";
import { Button, Callout, Dialog, SecretField } from "./ui";

export function RemoteLlmApiKeyDialog({ label, configured, destination, approvedEndpoint, close, onSave, onDelete }: { label: string; configured: boolean; destination: string; approvedEndpoint: string | null; close: () => void; onSave: (key: string) => Promise<string | void>; onDelete: () => Promise<string | void> }) {
    const [key, setKey] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const run = async (action: () => Promise<string | void>) => { setBusy(true); setError(""); try { const result = await action(); if (result) setError(result); else close(); } finally { setBusy(false); } };
    return <Dialog open title={`${label} API Key`} description="Credentials are stored by the local BV Nodepack backend and are never written into the workflow." size="small" onClose={close} footer={<><Button intent="danger" disabled={!configured || busy} onClick={() => run(onDelete)}>Delete key</Button><Button intent="ghost" disabled={busy} onClick={close}>Cancel</Button><Button intent="primary" loading={busy} disabled={!key.trim()} onClick={() => run(() => onSave(key))}>Save key</Button></>}>
        <Callout tone="warning">Only save if you trust this destination. Saving authorizes this address to receive the key you enter.</Callout>
        <p>Destination: <strong style={{overflowWrap:"anywhere"}}>{destination || "No endpoint selected"}</strong></p>
        <Callout tone={configured && approvedEndpoint ? "info" : "warning"}>{configured ? approvedEndpoint ? <>Current approved destination: <span style={{overflowWrap:"anywhere"}}>{approvedEndpoint}</span>. Enter the key again to replace it or authorize a new destination.</> : "This existing key has no approved destination. Verify the address and enter the key again to authorize it." : "No key is configured."}</Callout>
        <SecretField label="API key" value={key} onValue={setKey}/>
        {error && <Callout tone="danger">{error}</Callout>}
    </Dialog>;
}
