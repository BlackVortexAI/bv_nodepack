# Security

This file describes the security model of BV Node Pack as shipped: what the pack's
own entry points accept, where they write, which network destinations they use and
which limits apply. It is a description, not a certification, and the Comfy Registry
review status of a version is recorded separately from it. The dated long form with
the route-by-route evidence table lives in the wiki:
[Security and Registry evidence](https://blackvortexai.github.io/bv_nodepack_wiki/reference/security-and-registry-evidence/).

## Scope and supported configuration

BV Node Pack runs inside ComfyUI and inherits its process permissions, HTTP exposure
and installed extensions. It is not a sandbox for hostile workflows, plugins, model
files or users with access to the host file system. The controls below apply to
BV-owned entry points; ComfyUI's own loaders and other extensions have their own
contracts.

Releases before 1.4.1 and 1.4.2 do not contain the file-access, private-storage and
management-route hardening described below. The version a Registry-based installer
offers is the newest version the Registry lists as active, which can be older than
the newest release. An older active version is not more secure than a newer flagged
one; read the changelog of the version you install.

## Server access and provider credentials

Management routes (saving or deleting API keys, installing LUTs, switching the catalog
channel, writing assistance) answer only when ComfyUI listens on loopback addresses
exclusively and the request's own socket peer is a loopback address. This is a
reachability restriction, not user authentication. A reverse proxy on the same host
satisfies both checks for remote clients; the operator must authenticate or restrict
access at that proxy. Forwarded headers and the client-supplied ComfyUI user header
are ignored on purpose, because a client can set them freely.

The private `admin_settings.json` can enable remote management for a `--listen`
server. This opens the management routes to every client that can reach the server;
it does not create per-user authorization. There is no separate management token.

Provider secrets, private settings, working catalogs and caches are stored through
ComfyUI's private System User directory, which the public `/userdata` routes do not
serve. Without that API the pack fails closed instead of using the public user tree.
Private storage protects against other HTTP clients, not against the operating-system
account, other extensions in the same process or the host administrator. Keys that
were stored before 1.4.2 lived under the public `user/default/` tree; if the server
was ever reachable from other machines while such a key existed, rotate the key. The
migration moved the files; it cannot tell whether anyone read them.

Each API key is bound to the endpoint it was approved for. Workflow fields, writing
assistance requests and the settings file cannot redirect a key to another
destination. Remote endpoints use HTTPS with normal certificate verification; plain
HTTP is accepted for loopback endpoints only. Redirects are rejected. Every provider
request has one wall-clock budget, the configured timeout, that covers everything
after the provider's host name has been resolved: connecting to each resolved
address, the TLS handshake, waiting for the status line and headers, and reading the
body. Responses are capped in size; a provider that stalls or trickles data is cut
off and the request fails. Name resolution itself is bounded by the operating system,
not by this budget.

Using the Prompt Enhancer or the writing assistance intentionally sends the selected
prompt text, and for writing assistance the configured style guide, to the configured
provider. Both are the only routes that send user content to a third party, both are
management-gated, and the effective destination is shown before the first use. Do not
put secrets into prompts or style guides: node properties are saved with the workflow
and embedded in image metadata.

## Files, downloads and public endpoints

The pack's LoRA loaders resolve names inside the configured ComfyUI LoRA directories,
follow no links outside them and load `.safetensors` files only through the safe
loader. The Text Log Writer writes only below its log directory, accepts only text
extensions, and refuses names that resolve to links or existing directories. LUT
installation accepts validated catalog entries only, downloads from one fixed host,
rejects redirects and checks size, hash and format before the file becomes visible.
Model patches for the optional LLLite integration are resolved through ComfyUI's
configured directories and loaded by ComfyUI's own loader.

The catalog refresh route is deliberately public: any client that reaches ComfyUI can
ask the pack to fetch the current LUT catalog from its fixed source and store it in
private working storage. The pack also requests one such refresh when ComfyUI starts.
Both operations are bounded in size and time, use one fixed host, follow no redirects
and take no URL from the caller. They are documented here as a decision, not as an
oversight; an installation that must not contact the network at startup should block
that host at the network level.

Read routes (catalogs, model lists, provider status) are public. They expose the
names of configured models and the provider endpoints in use, not key material.
Catalog reads can create the download directory and inspect installed files.

Every JSON body the pack's routes accept is read with a route-specific size limit
before it is parsed, and rejected with a 413 or 400 status when it is larger or not a
JSON object. These limits protect the server from oversized requests; they do not
provide per-user isolation on a shared server.

## Frontend bundle and third-party code

`js/bv_nodepack.core.js` is built by Vite from the TypeScript sources in `ui/src`. It is
minified, not obfuscated: the bundle starts with a readable header naming the
vendored libraries and their versions, the build is reproducible from the lockfile,
and `THIRD_PARTY_NOTICES.md` lists every bundled library with license and integrity
hash. BV refactors its own code freely, but does not edit vendored library code,
including not to change how automated code scans read it.

## Release process

A release is published only from a commit whose validation workflow passed, by a
publish job with read-only repository permissions and a pinned publishing tool. The
job writes a manifest of the packaged files with their hashes, refuses to publish
when a development-only or secret-looking file would be included, and after the
upload compares the archive the Registry stored with that manifest. The test suite
includes a lexical replica of the patterns the Registry scan reported for this pack;
it fails on any match outside a documented baseline. That replica is a compatibility
check with written exceptions, not a security test, and it cannot predict the
Registry's decision.

## Reporting a concern

Please open an issue in the
[bv_nodepack repository](https://github.com/BlackVortexAI/bv_nodepack/issues) naming
the affected release, the entry point, the input and the observed effect. Do not post
credentials, private prompts or sensitive workflow files. If a report needs
confidential handling, say so in the issue without the details and the maintainer will
name a private channel. The Registry review history is in
[registry-backend issue 217](https://github.com/Comfy-Org/registry-backend/issues/217).
