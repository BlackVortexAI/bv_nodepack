# BV Prompt AST Guide

BV Prompt AST stores prompt intent as structured blocks instead of repeatedly
parsing ad-hoc strings. The encoder emits both `BV_AST` and cleaned plain text;
downstream nodes can filter categories without losing the original hierarchy.

## Syntax

Unmarked text belongs to the default category:

```text
A beautiful landscape, sunset lighting
```

Block categories remain active until the next block marker:

```text
@@style
cinematic lighting
@@subject
a woman in rain
```

Inline categories delimit a smaller fragment:

```text
a portrait with @<eye> green eyes @@ and @<hair> black hair @@
```

Inline categories may be nested:

```text
@<subject> a @<face> smiling woman @@ in rain @@
```

Comments are removed while their line break is retained:

```text
a portrait ## authoring note, not part of the prompt
```

## Rules and failure cases

- Category names match `[a-zA-Z0-9_-]+`; spaces are not allowed.
- Every inline category must be closed with `@@`.
- An unmatched closing marker or unclosed category raises an error with line and column.

Invalid:

```text
@<clothing color> white dress @@
@<clothing> long dress,@@@@
```

Valid:

```text
@<clothing_color> white dress @@
@<clothing> long dress,@@
```

## Typical chain

1. **BV Prompt Encode** parses source text into `BV_AST`.
2. **BV Prompt Category Switch** enables or disables categories.
3. **BV Prompt Decode** materializes the selected plain prompt.
4. **BV Prompt AST Debug** exposes the current tree during authoring.

[![Prompt AST workflow](../examples/images/prompt-ast-categories.png)](../examples/images/prompt-ast-categories.png)

The workflow PNG contains importable ComfyUI metadata. A JSON fallback is
available at [`examples/workflows/prompt-ast-categories.json`](../examples/workflows/prompt-ast-categories.json).
