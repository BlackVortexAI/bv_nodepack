# Regional attention

## Automatic Global LoRAs

Registry configuration v2 adds one initially empty, fixed `role=global` stack.
Its UI label is **Global · Automatically applied**. Stack and entry switches
remain independent. V1 migration retains ordinary stacks and every old basis
group with its original identity, order, strengths and enabled state. Basis groups
appear as migrated Global groups; no new basis group can be created. Historical
ordinary Global/region assignments and their tool opt-outs remain ordinary scoped
assignments. They are not copied into the fixed Global stack.

Enable the intended Registry's existing Global switch. It is the workflow-wide
selection across Root and nested/shared Subgraphs. An explicit off-to-on change
disables the fixed Global switches on other Registries through the existing
inventory transaction. Fresh Registries start with Global disabled. V1 migration
activates Global only when an enabled legacy basis group contains enabled entries;
persisted v2 switch values remain unchanged, including empty active groups.
Multiple saved active Registries are a visible execution conflict, never resolved
by load order. Switch the intended Registry off and on again, or disable the others.
Copying an active Registry may therefore require this explicit conflict resolution.
Disabling its fixed Global switch suppresses its migrated basis groups as well,
without changing their saved entries or individual group switches.

Regional Editor and Quick Edit show only the compact **Globalen Stack anwenden**
checkbox directly above the Global prompt. It defaults on (`apply_global` omitted
means true). The existing DG routing connects the active Registry automatically;
turning the checkbox off suppresses automatic Global LoRAs for that editor and
preserves all manual stack assignments. No Registry name or ID is shown alongside
this control. Obsolete Prompt-only `registry_ids` are removed during read/migration and ignored
by the Prompt backend; manual entry/step references remain unchanged. The standalone
Regional LoRA Editor retains `registry_ids` and its manual provider UI for compatibility.
These bindings cannot activate an inactive Registry.

The existing v3 LoRA capability carries optional
`automatic: {version: 1, resources: [...]}` provenance separately from manual
`scopes`. Resource records contain original `provider_id`, `resource_id`, `role`,
parallel `entry_ids` and `stack` occurrences. Collector transport reidentification
preserves original Registry identity. Re-materialization refreshes connected
origins and retains upstream origins; clear/replace operations affect only manual
assignments. Runtime resources carry the Registry's `global_enabled` state;
inactive origins do not contribute automatic patches. `automatic.enabled=false`
retains editor opt-out through downstream processing even with no resources.
Already globally patched MODEL/CLIP inputs cannot satisfy that opt-out: consumers
fail with an original-input instruction rather than silently retaining those patches.

`py/util/model_patcher.py` is the shared MODEL/CLIP patch service used by Native
Conditioning, SDXL, Z-Image, FLUX.2 Klein, Krea generation/edit and Anima consumers.
Automatic resources are applied before regional hooks and never enter the manual
scope stacks. Separate MODEL and CLIP occurrence ledgers preserve deliberate repeated
entries even when filenames/strengths match, while repeated paths through Collectors
apply one origin once. The existing Model Patcher is a compatibility adapter to
this same service. Changed occurrences on an already patched input fail rather than
silently accumulating; use original inputs. Old in-memory coarse basis markers
require re-executing the Patcher from original inputs because they contain no
verifiable strength/occurrence information.

Native Conditioning retains positive output 0 and negative output 1, appends
`patched_model` at output 2, and appends optional MODEL after the two old sidecar
inputs. Connect checkpoint MODEL to Native Conditioning MODEL, and its patched
MODEL output to the sampler. MODEL is required when active automatic MODEL LoRAs
exist. Old conditioning-only workflows without such patches remain executable.

The local catalog reads bounded safetensors headers, validates paired ranks and
tensor byte ranges, and distinguishes supported Krea token candidates, required
multipass, and Unknown. Exact target-model compatibility remains Unknown until
execution checks the actual model. Non-spatial time targets require multipass,
which is still regional; they are never silently moved to Global. No current
catalog evidence classifies a file as global-only, so no unsupported Global-move
offer is shown. Civitai links use validated local HTTP(S) model URLs or locally
recorded model/version IDs; no remote metadata or weights are downloaded.

`krea2_lora_names.py` delegates Diffusers aliases to ComfyUI's complete
`comfy.utils.krea2_to_diffusers` mapping. Header evidence, the residual planner
and token injection share this resolver, including time conditioning aliases.
Unavailable official mappings leave catalog compatibility Unknown and never use
a private partial alias fallback.

## Global-only conditioning

All built-in BV regional attention consumers accept a global prompt without
regions or a background prompt. Disabled and detailer-only regions do not require
generation routing.

SDXL, Z-Image, FLUX.2 Klein and Krea 2 retain their existing global slot. Its
unmasked attention covers the entire image; ordinary model validation, negative
conditioning, padding and attention-memory limits remain in effect.

Anima emits native conditioning when no usable regional chain exists. Global and
optional background text are combined per polarity; no artificial region is
created. Model validation still runs, but no regional diffusion wrapper is added.
Both LoRA modes use native global conditioning hooks in this case. Unused regional
LoRAs are excluded; global CLIP and MODEL hooks remain effective.

The adapter represents absence of regions as `None`. The built-in BV consumer
supports this. Third-party consumers of `ANIMA_CONDITIONING_REGIONS` may require
a nonempty chain and are outside this compatibility guarantee.

Global-only compilation retains the regional attention layout. CPU regression tests cover global-only
compilation, negative modes, ineligible regions, unmasked attention and Anima
global-hook dispatch. These tests do not constitute a GPU generation check.

## Krea generation LoRA routing

The `token_gated_singlepass` setting selects hybrid routing without changing the
node's ports. MODEL entries shared by every active scope are applied once through
native static LoRA loading. Matching uses path, MODEL strength and occurrence
count; CLIP strengths remain independently scoped. Explicit empty manual scopes prevent
inherited manual Global application (automatic Registry Global patches remain active). Disabled and empty-mask regions do not contribute, while
LoRA-only regions remain active even without regional prompt text.

Compatible residual files keep token gating. Files containing non-spatial
time-conditioning layers such as `tmlp` and `tproj` are applied completely in
masked native static-weight passes; they are never partially loaded as token
deltas. Incomplete adapters, unknown model targets and invalid shapes raise
errors instead of silently selecting another route. Residual global text uses
an internal scope alias so the token mask cannot override regional opt-outs.
Image coverage follows effective region and background scopes. This limits
direct LoRA application; joint attention can still couple tokens spatially.

Static passes share one native non-dynamic model delegate when multiple MODEL
stacks are needed. They reuse the existing native sampler blending and restore
the original patcher even after failure. The common router is also used by
Identity Edit through its existing adapter and compatibility guards. Hybrid
generation allows its own attention/token wrappers, requires full-image,
single-device conditioning, and rejects foreign control/weight-hook/layout
patches. Apply additional MODEL patches before the Attention node.

The log lists shared static entries, token files, static variant count and the
compatibility reasons. `multipass_legacy` remains explicitly selectable; hybrid
routing does not silently switch to conditional WeightHooks. Automatic Global LoRAs, including migrated basis groups,
are applied by the shared automatic preparation service and preserved through its occurrence ledger. Identity Edit keeps its separate
conditioning and reference-image path.

### Registry editing

The Registry dialog saves each valid edit immediately to its node configuration,
including catalog additions and Undo/Redo. Invalid drafts remain visible with an
unsaved status while the last valid configuration remains executable. External
registry changes are rebased onto draft and history snapshots, preventing Undo
from restoring a superseded Global selection. This does not save a workflow file.
The catalog starts at 1600 × 1050 pixels, subject to the shared window viewport
clamp and any previously saved user geometry.

### Catalog loading and persistent header evidence

Header classification is cached under ComfyUI's user directory at
`default/bv_nodepack/cache/lora_header_checks.json`. Each entry uses canonical
absolute path, file size and nanosecond modification time; the index has an
explicit algorithm version. Bump `HEADER_CHECK_VERSION` when validation or target
mapping changes. A file changed during inspection is not cached. Changes that
preserve both size and modification time are outside this signature contract.
Only header evidence is cached: sidecars, preview revisions and local links are
read again. Actual target-model compatibility remains an execution-time check.

The bounded, validated index is replaced atomically. Missing, corrupt or
unwritable cache files fall back to fresh checks; transient I/O/import failures
are not persisted. Concurrent writers can lose cache additions, resulting only
in extra checks. Without a user-directory provider, no package-local cache is
created.

The shared incremental resource list fills its viewport on mount, after batches,
on resize and on scroll. Frame-coalesced checks stop after sufficient overflow
or exhaustion, and are cancelled on reset/unmount. The manual load button is a
fallback, not a prerequisite for reaching the rest of the catalog.
