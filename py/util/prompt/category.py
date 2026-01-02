from __future__ import annotations

from typing import Any, Dict, List


ASTNode = Dict[str, Any]


def parse_prompt_to_ast(
    text: str,
    *,
    comment_prefix: str = "##",
) -> ASTNode:
    """
    Parse prompt text into an AST preserving:
      - Block directives: @@cat (standalone line), @@ (reset to default)
      - Inline spans: @<cat> ... @@ (nested)
      - Comments: '## ...' (both line comments and inline comments)
      - Exact ordering and text (including whitespace and newlines)

    Node types:
      - doc:     {"type":"doc","children":[...]}
      - block:   {"type":"block","cat":"default|...","children":[...]}
      - span:    {"type":"span","cat":"...","children":[...]}
      - text:    {"type":"text","v":"..."}
      - comment: {"type":"comment","v":"## ..."}  # kept in AST, optional in renderers
    """

    def make_node(t: str, **kwargs) -> ASTNode:
        n: ASTNode = {"type": t}
        n.update(kwargs)
        return n

    def is_valid_cat(cat: str) -> bool:
        return bool(cat) and all(ch.isalnum() or ch in "_-" for ch in cat)

    root = make_node("doc", children=[])

    # Always start with a default block
    current_block = make_node("block", cat="default", children=[])
    root["children"].append(current_block)

    # Stack for nested spans (span nodes)
    span_stack: List[ASTNode] = []

    def current_children() -> List[ASTNode]:
        return span_stack[-1]["children"] if span_stack else current_block["children"]

    def emit_text(s: str) -> None:
        if not s:
            return
        children = current_children()
        if children and children[-1]["type"] == "text":
            children[-1]["v"] += s
        else:
            children.append(make_node("text", v=s))

    def emit_comment(s: str) -> None:
        if not s:
            return
        current_children().append(make_node("comment", v=s))

    def start_span(cat: str) -> None:
        span = make_node("span", cat=cat, children=[])
        current_children().append(span)
        span_stack.append(span)

    def end_span() -> None:
        if span_stack:
            span_stack.pop()

    # Process line-by-line to support block directives
    for line in text.splitlines(keepends=True):
        # --- Block directive handling (standalone line starting with @@) ---
        if line.startswith("@@"):
            # Only treat as directive if the entire line is "@@<cat>\n" (or "@@\n")
            raw = line[2:]
            candidate = raw.strip("\r\n").strip()
            if candidate == "" or is_valid_cat(candidate):
                # Close any open spans at a block boundary (fail-soft)
                span_stack.clear()
                cat = candidate or "default"
                current_block = make_node("block", cat=cat, children=[])
                root["children"].append(current_block)
                continue
            # else: it's just text that happens to start with @@ -> fall through

        # --- Inline parse (spans + comments) ---
        i = 0
        while i < len(line):
            # Inline or line comment detection (outside of special structures)
            # Treat everything from comment_prefix to end-of-line as a comment node.
            if line.startswith(comment_prefix, i):
                emit_comment(line[i:])  # includes newline (keepends=True)
                break

            # Inline span end: @@ (pop one span)
            if line.startswith("@@", i) and span_stack:
                end_span()
                i += 2
                continue

            # Inline span start: @<cat>
            if line.startswith("@<", i):
                j = i + 2
                cat_chars: List[str] = []
                while j < len(line) and line[j] != ">":
                    cat_chars.append(line[j])
                    j += 1

                if j < len(line) and line[j] == ">":
                    cat = "".join(cat_chars).strip()
                    if is_valid_cat(cat):
                        start_span(cat)
                        i = j + 1
                        # Swallow exactly one whitespace after the '>'
                        if i < len(line) and line[i] in (" ", "\t"):
                            i += 1
                        continue
                # Not a valid span header -> treat as literal text below

            # Normal char
            emit_text(line[i])
            i += 1

    return root


def ast_to_plain_text(ast: ASTNode, *, include_comments: bool = False) -> str:
    """
    Render AST to plain text for a normal text encoder:
      - Removes @@block directives (they are structure, not text)
      - Removes @<cat> ... @@ wrappers (they are structure, not text)
      - Keeps all text nodes in order
      - Optionally includes comments (comment nodes)
    """
    out: List[str] = []

    def walk(node: ASTNode) -> None:
        t = node.get("type")

        if t == "text":
            out.append(node.get("v", ""))
            return

        if t == "comment":
            if include_comments:
                out.append(node.get("v", ""))
            return

        for c in node.get("children", []) or []:
            walk(c)

    walk(ast)
    return "".join(out)


def ast_to_tagged_text(ast: ASTNode, *, include_comments: bool = True) -> str:
    """
    Render AST back to your tagged syntax:
      - block nodes produce @@cat\\n (or @@\\n for default)
      - span nodes produce @<cat> ... @@
      - text nodes produce literal text
      - comment nodes optionally included (verbatim)
    """
    out: List[str] = []

    def walk(node: ASTNode) -> None:
        t = node.get("type")

        if t == "doc":
            for c in node.get("children", []) or []:
                walk(c)
            return

        if t == "block":
            cat = node.get("cat", "default")
            out.append(f"@@{'' if cat == 'default' else cat}\n")
            for c in node.get("children", []) or []:
                walk(c)
            return

        if t == "span":
            out.append(f"@<{node.get('cat', '')}>")
            for c in node.get("children", []) or []:
                walk(c)
            out.append("@@")
            return

        if t == "text":
            out.append(node.get("v", ""))
            return

        if t == "comment":
            if include_comments:
                out.append(node.get("v", ""))
            return

        # Unknown node: best-effort traversal
        for c in node.get("children", []) or []:
            walk(c)

    walk(ast)
    return "".join(out)


def extract_plain_text_by_category(
    ast: Dict[str, Any],
    cats: str,
    *,
    include_comments: bool = False,
    inherit: bool = True,
    mode: str = "any",   # "any" | "all"
) -> str:
    """
    Extract plain text that belongs to one or more categories.

    cats: comma-separated list, e.g. "face, ice"
    mode:
      - "any": include text if ANY target category matches
      - "all": include text if ALL target categories match simultaneously
    inherit:
      - True: match if category appears anywhere in the active path (block + span stack)
      - False: match only against the nearest active category (last span, else block)

    Comments are included only if include_comments=True and they match.
    """
    targets = [c.strip() for c in (cats or "").split(",") if c.strip()]
    if not targets:
        return ""

    mode = (mode or "any").lower()
    if mode not in ("any", "all"):
        mode = "any"

    out: List[str] = []

    def matches_path(path: List[str], nearest: str) -> bool:
        if inherit:
            active = set(path)
        else:
            active = {nearest}

        if mode == "all":
            return all(t in active for t in targets)
        return any(t in active for t in targets)

    def walk(node: Dict[str, Any], path: List[str], nearest: str) -> None:
        t = node.get("type")

        if t == "block":
            bcat = node.get("cat", "default")
            new_path = path + ([bcat] if bcat else [])
            new_nearest = bcat or nearest
            for c in node.get("children", []) or []:
                walk(c, new_path, new_nearest)
            return

        if t == "span":
            scat = node.get("cat", "")
            new_path = path + ([scat] if scat else [])
            new_nearest = scat or nearest
            for c in node.get("children", []) or []:
                walk(c, new_path, new_nearest)
            return

        if t == "text":
            if matches_path(path, nearest):
                out.append(node.get("v", ""))
            return

        if t == "comment":
            if include_comments and matches_path(path, nearest):
                out.append(node.get("v", ""))
            return

        for c in node.get("children", []) or []:
            walk(c, path, nearest)

    walk(ast, [], "default")
    return "".join(out)
