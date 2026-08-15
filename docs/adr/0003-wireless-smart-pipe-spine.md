# ADR 0003: Optional wireless Smart Pipe spine

- Status: Proposed
- Date: 2026-08-15

## Question

Can the `BV_SMART_PIPE` connection between Smart Pipe nodes be made optional without
turning Smart Pipe into a global, type-based auto-wiring system?

The proposal is deliberately narrow: only the `pipe` connection between two
`BV Smart Pipe` nodes may be virtual. Value-slot links from Smart Pipe outputs to
consumer nodes remain ordinary, visible ComfyUI links.

## Findings

### ComfyUI still needs a real execution dependency

The frontend converts every active graph node, including flattened inner Subgraph
nodes, into API-prompt entries. Ordinary input links become `[origin_id,
origin_slot]` references. Links whose origin is absent from the prompt are removed.
Therefore a wireless pipe cannot merely share frontend state: before submission it
must become an equivalent prompt-level input reference so the backend can build the
correct dependency graph.

Sources:

- [ComfyUI frontend `graphToPrompt`: flattening, widget and link serialization](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts#L24-L148)
- [ComfyUI queue path calls `graphToPrompt` before submitting the API prompt](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/scripts/app.ts#L1494-L1617)
- [ComfyUI backend creates its `DynamicPrompt` and `ExecutionList` from the submitted prompt](https://github.com/Comfy-Org/ComfyUI/blob/master/execution.py)

The current Smart Pipe backend already has the correct runtime contract. Its
optional `pipe` input supplies the upstream stable-ID value map; local values
override inherited values. Wireless mode only needs to synthesize that one input
reference. No value-slot or consumer behavior needs to change.

Source:

- [`BVSmartPipe.run` and the `BV_SMART_PIPE` input contract](../../py/nodes/bv_smart_pipe.py)

### Use Everywhere proves the technique, but its matching model is too broad

Use Everywhere analyses unconnected inputs, finds compatible broadcasters, creates
temporary real graph links, invokes the original `graphToPrompt`, and restores the
graph afterwards. It wraps `app.graphToPrompt` and `app.queuePrompt` to enter this
process. Its conflict strategy sorts matching broadcasters by priority and refuses
equal-priority ties.

Sources:

- [Use Everywhere graph analysis and temporary modification lifecycle](https://github.com/chrisgoringe/cg-use-everywhere/blob/main/js/use_everywhere_graph_analysis.js#L16-L135)
- [Use Everywhere temporary link creation and restoration](https://github.com/chrisgoringe/cg-use-everywhere/blob/main/js/use_everywhere_apply.js#L99-L221)
- [Use Everywhere `graphToPrompt` interception](https://github.com/chrisgoringe/cg-use-everywhere/blob/main/js/use_everywhere.js#L261-L305)
- [Use Everywhere deterministic priority handling and tie rejection](https://github.com/chrisgoringe/cg-use-everywhere/blob/main/js/use_everywhere_classes.js#L348-L406)
- [Use Everywhere documented matching, priority, conflicts and Nodes 2.0 limitations](https://github.com/chrisgoringe/cg-use-everywhere/blob/main/README.md#where-will-the-data-be-sent)

Smart Pipe should not copy the global type/name matching model. `BV_SMART_PIPE` is
an ordered carrier with stable slot ownership, not an ambient value provider. A
wrong automatic match can silently inherit an entirely different schema and value
set.

### There is no documented pre-prompt extension hook

The public `ComfyExtension` interface exposes lifecycle hooks such as setup,
node-definition registration, node creation and graph configuration, but no
awaitable hook that can rewrite the API prompt immediately before submission.
Use Everywhere consequently wraps `app.graphToPrompt`, which is effective but is a
compatibility seam rather than a declared extension hook.

Sources:

- [Official `ComfyExtension` interface](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/types/comfy.ts#L100-L258)
- [Official extension development guide](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/docs/extensions/development.md)
- [Current `ComfyApp.graphToPrompt` implementation](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/scripts/app.ts#L1494-L1498)

This means the feature is feasible today, including Nodes 2.0, but it must be
isolated behind a small adapter and covered by integration tests because the hook
can change and multiple extensions may wrap the same method.

### Subgraph identities and execution addresses

ComfyUI distinguishes three relevant identities:

1. A Subgraph **definition** has a UUID and contains the reusable inner nodes.
2. A Subgraph **instance** is an ordinary host node whose `type` references the
   definition UUID. Instance properties are serialized separately from the shared
   definition.
3. An expanded node has a `NodeExecutionId`: the colon-separated numeric host-node
   path followed by the inner node ID, for example `12:45:7`.

`ExecutableNodeDTO` constructs this execution ID from every containing Subgraph
instance node ID plus the definition-local inner node ID. Nested Subgraphs recurse
with the extended path. Consequently, two instances of the same definition produce
different API-prompt node IDs even though both wrap the same definition-local node.

Sources:

- [Official locator and execution-ID formats](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/types/nodeIdentification.ts#L3-L28)
- [`ExecutableNodeDTO` builds IDs from the Subgraph instance path](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/subgraph/ExecutableNodeDTO.ts#L51-L105)
- [`SubgraphNode.getInnerNodes` recursively expands each instance](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/subgraph/SubgraphNode.ts#L739-L786)
- [Serialized Subgraph definitions versus instance properties](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/types/serialisation.ts#L31-L43)
- [`ExportedSubgraphInstance.type` references the reusable definition](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/types/serialisation.ts#L103-L117)
- [Official workflow flattening maps every definition to its instance execution paths](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/platform/workflow/core/utils/workflowFlattening.ts#L57-L99)

The API-prompt address is therefore sufficient to materialize a direct dependency
between any two expanded Smart Pipe nodes, including root to Subgraph, Subgraph to
root, nested Subgraphs, and two different instances. The backend receives a flat
prompt graph and follows the referenced execution IDs.

It is not suitable as the persisted wireless identity. Copy/paste or import may
assign a Subgraph host a new numeric node ID, changing every descendant execution
ID. A durable address must be resolved at prompt-build time from a persisted logical
address.

### Durable composite address

A stable logical address can be represented as:

```text
[subgraph-instance-routing-uuid, ...] + pipe-routing-uuid
```

Every Subgraph host instance on the path needs its own serialized routing UUID.
Every Smart Pipe definition node needs its own routing UUID. The full parent path
distinguishes the same internal Pipe in multiple instances and nested instances.
At prompt build, this logical address maps to the current numeric `NodeExecutionId`.

Copy rules must be explicit:

- Copying a Subgraph **instance** keeps its definition reference and definition-local
  Pipe UUIDs, but the copied host instance receives a new routing UUID. Its complete
  descendant logical-address prefix is therefore new.
- Copying a whole parent instance recursively changes only the copied outer host
  prefix; shared nested definition-local IDs remain valid beneath that new prefix.
- Creating an independent copied Subgraph **definition** must regenerate the copied
  definition's internal routing UUIDs and repair routes inside that copied
  definition. Otherwise the two definitions would share logical Pipe identities.
- Copying a root follower retains its old source address unless both endpoints are
  part of a coordinated multi-node copy operation that can remap the copied route.

The frontend already serializes arbitrary custom properties per Subgraph instance,
so storing a host routing UUID is structurally possible. Its current `clone()` does
not deep-clone the definition, reinforcing the distinction between duplicating an
instance and duplicating a definition.

Sources:

- [`SubgraphNode` is constructed from a shared definition plus instance data](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/subgraph/SubgraphNode.ts#L55-L99)
- [`SubgraphNode.serialize` persists instance properties and `clone` does not deep-clone definitions](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/subgraph/SubgraphNode.ts#L864-L908)
- [New Subgraph definitions receive their own UUID](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/LGraph.ts#L1643-L1669)

### Why the address alone does not make cross-boundary routing safe

Runtime addressing is solvable, but Smart Pipe currently stores its schema and
inherited projection on the inner definition node. That state is shared by every
instance. Instance A and instance B can receive different runtime values through
their different API-prompt IDs, but the same internal Smart Pipe cannot safely show
two different inherited schemas or two different predecessor configurations without
an additional host-scoped override model.

Root to Subgraph and instance-to-instance routing therefore require more than an
address:

- route edges must live in root-workflow or Subgraph-instance state, keyed by the
  full logical destination address, rather than solely on the shared inner node;
- inherited schema projections must either remain identical across all instances or
  become instance-scoped;
- the editor must know which concrete Subgraph instance path is being configured;
- copy/paste, definition duplication and instance deletion must remap or invalidate
  the host-scoped route registry atomically.

ComfyUI's official architecture explicitly treats Subgraph inputs and outputs as a
typed boundary contract and notes that per-instance values are naturally expressed
through those interface inputs. Use Everywhere likewise keeps broadcasting within
one graph and crosses boundaries through explicit Subgraph interfaces.

Sources:

- [Official typed Subgraph boundary model](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/docs/architecture/subgraph-boundaries-and-promotion.md#2-graph-boundary-model)
- [Official analysis of shared-definition versus per-instance state](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/docs/architecture/subgraph-boundaries-and-promotion.md#tradeoff-matrix)
- [Use Everywhere Subgraph boundary policy](https://github.com/chrisgoringe/cg-use-everywhere/blob/main/README.md#subgraphs)

For the first wireless implementation, links should therefore resolve only within
the same graph scope. To cross a Subgraph boundary, expose and connect
`BV_SMART_PIPE` normally. Cross-boundary wireless routing remains technically
possible as a later feature, but only after introducing the host-scoped route and
schema-projection model; directly persisting numeric execution paths is rejected.

## Considered ordering strategies

### Canvas position

Rejected. X/Y position is presentation state, changes during layout, and cannot
express branches reliably.

### Node ID or creation order

Rejected. Copy/paste, import, Subgraph instantiation and workflow migration can
change execution identities. Node IDs are identifiers, not domain ordering.

### Channel plus priority/stage number

Feasible, but not preferred. It imposes manual sequencing and makes insertion or
branching awkward. Equal values still require a conflict rule.

### Stable predecessor identity

Recommended. Each wireless Smart Pipe stores the stable routing identity of exactly
one predecessor in the same graph scope. The first node is a root. Several nodes may
follow the same predecessor, so branching is natural. The relationship is an
explicit edge even though it is not drawn as an ordinary cable.

This removes the need for priority numbers. If the editor finds exactly one valid
candidate it may offer it as the default, but it must never silently choose among
multiple candidates.

## Proposed model

Each Smart Pipe receives serialized routing metadata independent of its slot schema:

```json
{
  "version": 1,
  "nodeId": "stable-node-uuid",
  "mode": "wired | wireless-root | wireless-follow",
  "predecessorId": "stable-node-uuid-or-null"
}
```

`nodeId` is a routing identity, not the ComfyUI numeric node ID. Duplicate routing
identities are repaired on copy/load by assigning the copy a new UUID. A follower's
`predecessorId` is retained when copying a single follower, making the copy another
branch from the same upstream node.

For the proposed same-scope first version, `predecessorId` is definition-local to
that graph. A future cross-boundary version must replace it with the composite
instance-routing-UUID path described above and store instance-specific edges outside
the shared inner node.

Rules:

1. A physical `pipe` link is authoritative. Wireless metadata is ignored while the
   physical link exists.
2. `wireless-root` has no predecessor.
3. `wireless-follow` requires exactly one live predecessor in the same graph scope.
4. The stored predecessor graph must be acyclic. Cycles block queueing with a clear
   node-level error.
5. A deleted/missing predecessor is treated like a missing inherited producer and
   blocks queueing while the follower or its outputs are used.
6. A bypassed Smart Pipe is transparently replaced by its nearest active predecessor,
   matching ComfyUI's pass-through semantics while skipping the bypassed node's local
   Slot writes. A muted Smart Pipe temporarily prunes its dependent branch from the API
   prompt without changing the saved workflow. A Merge omits muted sources for that run
   and remains active while at least one source is available; with no active sources,
   the Merge and its exclusively dependent branch are pruned as well. Deleted or unknown
   predecessors are never skipped.
7. Wireless routing changes only `pipe`. Local `v_NNN` inputs and all consumer links
   remain untouched.

## Prompt materialization

Preferred implementation:

1. Call the original `app.graphToPrompt` first.
2. Index the returned active `BV Smart Pipe` prompt entries by graph scope and stable
   routing identity.
3. Validate uniqueness, same-scope predecessor references and acyclicity.
4. For each eligible follower without a physical `pipe` input, set only
   `inputs.pipe = [predecessorExecutionId, 0]` in the returned API prompt.
5. Leave the serialized workflow and live LiteGraph graph unchanged.

This is narrower than Use Everywhere's temporary graph mutation: it does not add or
remove canvas links, disturb autogrow inputs, or require graph restoration. Because
`graphToPrompt` includes all active nodes before dependency pruning, the predecessor
entry is available even though no visible pipe link led to it.

The adapter must chain cooperatively by capturing the current `app.graphToPrompt`,
calling it with the original receiver and arguments, and modifying only its returned
prompt. It must be idempotent so extension load order does not create duplicate
effects.

## UX

Add an optional `Pipe Connection` section to the existing Smart Pipe editor:

- `Wired` (default)
- `Wireless root`
- `Follow wirelessly` with a predecessor picker
- compact status on the node: channel/root or predecessor name, plus an error badge
- optional dashed preview line on selection/hover; no permanent canvas cable

The picker should show title plus stable short ID and only Smart Pipes in the same
graph scope. A later convenience action may offer `Continue from selected Smart
Pipe`, which creates a correctly paired follower without exposing IDs or numbers.

## Risks and required tests

- Extension interoperability: test with other known `graphToPrompt` wrappers,
  especially Use Everywhere and VHS-style extensions.
- Nodes 2.0 drift: test every supported frontend release because `graphToPrompt` is
  not an extension hook.
- Save/load, copy/paste and undo/redo of root, follower and whole chains.
- Deleted, muted and bypassed predecessors.
- Cycle and duplicate-UUID rejection.
- Branches and multiple independent wireless chains in one graph.
- Same Subgraph definition instantiated more than once.
- Nested Subgraphs and explicit boundary connections.
- Subgraph instance copy versus independent definition duplication.
- Stable logical-address to current `NodeExecutionId` resolution after numeric ID
  remapping.
- Partial execution: the synthesized prompt dependency must pull in all wireless
  predecessors needed by the selected consumer.
- API export must contain materialized `pipe` links even though the saved editable
  workflow retains wireless routing metadata.

## Recommendation

Proceed with a small prototype of **same-graph wireless Smart Pipe predecessors**.
Do not use global type matching, spatial order, node numbers or implicit priority.
The stable predecessor relationship gives deterministic order and branches, while
prompt-level materialization preserves ComfyUI's real execution tree.

Keep the feature opt-in and marked experimental until the wrapper has passed the
Nodes 2.0, Subgraph, partial-execution and extension-interoperability matrix. If
ComfyUI later adds an official pre-prompt transformation hook, move the isolated
materializer to that hook without changing the routing model.

The follow-up identity analysis confirms that a future composite address of
Subgraph-instance UUID path plus internal Pipe UUID can target root, nested and
cross-instance execution nodes deterministically. It does **not** remove the shared
definition-state problem. Cross-boundary wireless routing should remain deferred
until Smart Pipe gains host-scoped route edges and inherited-schema projections.

## Follow-up decisions

The product decision is to support cross-scope routing after the same-scope compiler
has been proven. Every root workflow and Subgraph host instance receives a stable
routing UUID. A durable node address is the root routing UUID, followed by every
containing host-instance routing UUID, followed by the Smart Pipe routing UUID.
Cross-scope routes live in a host-scoped route registry so shared Subgraph
definitions can have instance-specific predecessors and inherited-schema
projections.

Smart Pipe branches are derived exclusively from predecessor edges; successor
lists, branch numbers and virtual links are never persisted. A future
`BV Smart Pipe Merge` is a separate node. Its ordered source list may mix physical
and wireless sources. Slot provenance is introduced before Merge so inherited base
values cannot overwrite genuine changes from another branch.

New local value slots start with their output hidden. They are setters by default;
an output becomes visible only through explicit configuration or typed-output
wiring.
