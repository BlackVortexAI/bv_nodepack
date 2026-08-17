# comfy-ex-tagcomplete: integration research

Research date: 2026-08-17
Repository: <https://github.com/jupo-ai/comfy-ex-tagcomplete>
Pinned revision: [`028631834bb99b9dc1fb98fa53307686c7e83b80`](https://github.com/jupo-ai/comfy-ex-tagcomplete/tree/028631834bb99b9dc1fb98fa53307686c7e83b80)

## Conclusion

`comfy-ex-tagcomplete` cannot currently be treated as a generic autocomplete service for arbitrary React text editors. Its automatic integration is deliberately tied to ComfyUI multiline widgets and to `<textarea>` elements rendered inside a Vue node element carrying `data-node-id`.

The BV Regional Editor is a detached/floating React application. Its prompt fields therefore will not be discovered reliably by the extension. There is no documented opt-in attribute, DOM event, global registration API, or stable exported service intended for third-party editors.

The recommended BV seam is therefore:

1. Keep BV prompt fields as standards-compliant controlled `<textarea>` elements.
2. Build a small BV-owned autocomplete controller and a provider interface.
3. Implement a BV-owned CSV/TSV provider as the dependable default.
4. Optionally add a best-effort `ExTagCompleteProvider` that calls the installed extension's search endpoint when detected, without making the extension a runtime dependency.
5. Do not import `TagCompleter` directly from another custom node or emulate its private symbol/DOM scan.

This gives users interoperability when `comfy-ex-tagcomplete` is installed, while the Regional Editor remains functional and maintainable without it.

## How the extension discovers fields

### Classic ComfyUI widgets

During extension initialization it replaces `ComfyWidgets.STRING` with a wrapper. The wrapper calls the original factory and then attempts to attach a completer to the returned widget. In addition, `beforeRegisterNodeDef` wraps every node type's `onNodeCreated` and scans `this.widgets` in a microtask. See [`web/ex_tagcomplete.js` lines 156-182 and 189-218](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/ex_tagcomplete.js#L156-L218).

A widget is eligible only when its input/widget options contain `multiline: true`. `tagcomplete: false` or the legacy-compatible `pysssss.autocomplete: false` disables completion. A small hard-coded node/input denylist is also applied. There is no corresponding `tagcomplete: true` force-enable path for a non-multiline widget. See [`web/ex_tagcomplete.js` lines 13-27](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/ex_tagcomplete.js#L13-L27).

The extension looks for a real `HTMLTextAreaElement` in this order:

- `widget.inputEl` itself;
- a descendant `<textarea>` of `widget.inputEl`;
- `widget.element` itself;
- a descendant `<textarea>` of `widget.element`.

See [`web/ex_tagcomplete.js` lines 29-55](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/ex_tagcomplete.js#L29-L55).

### Vue/Nodes 2.0 widgets

For Vue-rendered nodes it installs a document-wide `MutationObserver` and scans only this selector:

```css
[data-node-id] textarea
```

For each match it resolves the graph node from the closest `data-node-id`, derives the textarea's positional index, and maps that index to node widgets whose type is `customtext`, `textarea`, or `multiline`, or whose options contain `multiline`. Canvas-only widgets are excluded. See [`web/ex_tagcomplete.js` lines 66-150](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/ex_tagcomplete.js#L66-L150).

This index-based mapping is important: merely placing a textarea under an element with `data-node-id` is not a safe public opt-in. The matching graph node must expose a corresponding multiline widget in the same textarea order. Extra or reordered textareas can attach completion to the wrong widget.

### What is not supported

- Generic textareas elsewhere in the page.
- A detached floating panel outside a `[data-node-id]` node subtree.
- `contenteditable` elements.
- CodeMirror, Monaco, or another editor abstraction without a real mapped textarea.
- Shadow-DOM textareas, because the document query/observer does not cross shadow roots.
- An opt-in CSS class or `data-*` attribute.

The attach helper itself accepts only `HTMLTextAreaElement`; other element types are rejected. See [`web/ex_tagcomplete.js` lines 49-64](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/ex_tagcomplete.js#L49-L64).

## Runtime behavior and integration contracts

`TagCompleter` is an ES-module export, but the extension does not publish it through a global API or a ComfyUI extension service. The module-local instance marker is a private `Symbol("jupo.tagcompleter.instance")`, so another package cannot discover it by a stable property name. See [`web/ex_tagcomplete.js` lines 1-8](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/ex_tagcomplete.js#L1-L8).

Once attached, the completer listens directly for `keydown`, `input`, `click`, and `blur`. It relies on textarea-specific `value`, `selectionStart`, `selectionEnd`, and `setRangeText` behavior. See [`tag_completer.js` lines 21-37 and 114-140](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/tag-complete/tag_completer.js#L21-L37) and [`caret_helper.js` lines 197-221](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/tag-complete/caret_helper.js#L197-L221).

Insertion uses `setRangeText` and then dispatches a bubbling native `input` event. This is reasonably compatible with a normal React controlled textarea if attachment has already happened, but it is not itself a discovery mechanism. BV should likewise handle native `input`/`change` paths correctly and keep DOM value, selection, document state, undo, and autosave synchronized.

While the dropdown is visible, the extension consumes Arrow Up/Down, Tab, Enter, Escape, Page Up, and Page Down. Escape additionally calls both propagation-stopping methods. See [`keyboard_handler.js` lines 43-109](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/tag-complete/keyboard_handler.js#L43-L109). This aligns with BV's requirement to stop editor keyboard shortcuts from reaching ComfyUI, but competing listeners still require explicit interoperability testing.

## Search endpoint

The backend exposes a JSON endpoint:

```http
POST /jupo/ExTagComplete/search
Content-Type: application/json

{"term": "blue_h", "filters": []}
```

The frontend calls this endpoint through ComfyUI's `api.fetchApi`; responses are JSON suggestion objects. See [`web/utils.js` lines 3-26](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/utils.js#L3-L26), [`search_engine.js` lines 77-106](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/tag-complete/search_engine.js#L77-L106), and [`py/routes.py` lines 119-123](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/routes.py#L119-L123).

Returned entries include fields such as `term`, `text`, `display`, `value`, `category`, `postCount`, `categoryName`, `site`, `translate`, `wildcardValue`, and `note`; see [`py/data_manager.py` lines 583-602](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/data_manager.py#L583-L602).

This endpoint is the least invasive optional interoperability seam, but it is not documented as a public compatibility API and has no version/capability endpoint. A BV adapter must therefore:

- probe it lazily;
- use a short timeout and `AbortController`;
- validate the response shape;
- silently fall back to another provider on 404, invalid data, or extension disablement;
- avoid changing the extension's global settings;
- treat route and schema changes as expected compatibility failures.

## Tag-data loading

The referenced package loads **CSV**, not TSV. Its settings enumerate `*.csv` files in `tags/`; main files are those not prefixed with `extra`, and extra files are those prefixed with `extra`. Translation files are separate CSVs in `translate/`. See [`py/routes.py` lines 8-23](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/routes.py#L8-L23) and the [README settings table](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/README.en.md#L40-L61).

CSV rows require at least four columns:

1. tag;
2. category ID;
3. post count or note;
4. aliases.

The loader maps category IDs using `category_map.csv`, expands aliases, and inserts data into an in-memory SQLite database. See [`py/data_manager.py` lines 68-108 and 198-230](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/data_manager.py#L68-L108) and [`py/data_manager.py` lines 198-230](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/data_manager.py#L198-L230).

The database can also contain ComfyUI embeddings, LoRAs, and wildcards. Search is performed server-side and can use smart chunk matching, category filters, translation matches, relevance sorting, and a configured result limit. See [`py/data_manager.py` lines 163-195 and 322-434](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/data_manager.py#L163-L195) and [`py/data_manager.py` lines 322-434](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/py/data_manager.py#L322-L434).

For BV, TSV support should therefore be its own provider/parser rather than being described as compatibility with this repository. A normalized provider result can preserve source-neutral fields:

```ts
interface PromptSuggestion {
  id: string;
  insertText: string;
  label: string;
  detail?: string;
  category?: string;
  score?: number;
  source: string;
}

interface PromptCompletionProvider {
  id: string;
  isAvailable(signal?: AbortSignal): Promise<boolean>;
  suggest(request: PromptCompletionRequest, signal: AbortSignal): Promise<PromptSuggestion[]>;
}
```

The editor owns caret parsing, dropdown rendering, insertion, undo, keyboard capture, and prompt persistence. Providers only return candidates. This is also the correct seam for future natural-language completion, spell checking, model-specific vocabularies, embeddings/LoRAs, and TextLab integration.

## Licensing

The repository is MIT licensed, copyright 2025 jupo-ai. Copying or adapting substantial code requires retaining the copyright and permission notice. See the pinned [`LICENSE`](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/LICENSE).

The repository also states that three bundled tag CSV files are borrowed from `a1111-sd-webui-tagcomplete`: `danbooru.csv`, `danbooru_e621_merged.csv`, and `extra-quality-tags.csv`. Their data provenance/licensing must be reviewed separately before vendoring or redistributing them in BV. See [`README.en.md` lines 96-108](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/README.en.md#L96-L108).

Calling an installed extension's endpoint does not copy its code or bundled data into BV. Vendoring its implementation or tag databases would create additional notice and provenance obligations.

## Maintenance and compatibility risks

- **No declared public integration API:** the endpoint and ES-module exports are implementation details rather than a versioned contract.
- **Global monkey patching:** wrapping `ComfyWidgets.STRING` and every node type's `onNodeCreated` can conflict with other extensions depending on load order.
- **DOM coupling:** the Vue scanner depends on `[data-node-id]`, textarea order, widget types, and internal graph lookup behavior.
- **Floating-panel mismatch:** BV's deliberately detached panel is outside the discoverable node DOM.
- **Lifecycle leak risk:** the document-wide observer attaches completers, while automatic teardown for removed discovered textareas is not visible in the scanner. `TagCompleter.destroy()` exists, but the scanner does not call it on removed nodes.
- **Canvas-scale assumption:** caret positioning constructs `TextAreaCaretHelper` with `app.canvas.ds.scale`; a viewport-fixed floating panel should not have its popup placement coupled to graph zoom. See [`tag_completer.js` lines 69-78](https://github.com/jupo-ai/comfy-ex-tagcomplete/blob/028631834bb99b9dc1fb98fa53307686c7e83b80/web/tag-complete/tag_completer.js#L69-L78).
- **Data format mismatch:** the requested TSV source is not directly supported by this package.
- **Repository maturity:** at the pinned revision GitHub reports 52 commits, no releases, 37 stars, and 8 forks. The inspected latest commit is dated 2026-06-08. These are not defects, but they argue against hard runtime coupling.
- **Bundled-data provenance:** source code is MIT, while bundled third-party tag datasets deserve a separate redistribution review.

## Decision for BV Regional Editor

Use a hybrid architecture, not an either/or choice:

- **BV owns the editor integration and provider contract.** This guarantees floating mode, React lifecycle correctness, undo/autosave integration, shortcut isolation, and future non-tag completions.
- **BV remains friendly to external completers.** Use real textareas, native selection APIs, and bubbling `input` events. If a prompt field is ever rendered as a true ComfyUI multiline widget inside a node, `tagcomplete`/`pysssss.autocomplete` options should not be set to `false`.
- **Optional ExTagComplete bridge:** query `/jupo/ExTagComplete/search` if available and normalize results into BV suggestions. Label this provider as optional/best-effort and keep a local provider available.
- **Do not fake node ownership for the floating panel.** Adding `data-node-id` and dummy widgets purely to trigger another extension is brittle and can mis-map fields.
- **Do not directly instantiate its `TagCompleter`.** That would couple BV to another package's install path, CSS, global settings, canvas-scale assumption, and unversioned internals.

This preserves external interoperability without making the Regional Editor's core editing experience depend on a particular third-party node pack.
