from typing import Dict, Any, List


def parse_prompt_to_ast(text: str) -> Dict[str, Any]:
    def make_node(t: str, **kwargs):
        n = {"type": t}
        n.update(kwargs)
        return n

    root = make_node("doc", children=[])
    current_block = make_node("block", cat="default", children=[])
    root["children"].append(current_block)

    # Stack for nested spans: each entry is a node with children
    span_stack: List[Dict[str, Any]] = []

    def current_container_children() -> List[Dict[str, Any]]:
        if span_stack:
            return span_stack[-1]["children"]
        return current_block["children"]

    def emit_text(s: str):
        if not s:
            return
        children = current_container_children()
        # merge adjacent text nodes to keep AST compact
        if children and children[-1]["type"] == "text":
            children[-1]["v"] += s
        else:
            children.append(make_node("text", v=s))

    def is_valid_cat(cat: str) -> bool:
        return bool(cat) and all(ch.isalnum() or ch in "_-" for ch in cat)

    for line in text.splitlines(keepends=True):
        # Block directive only if standalone line starting with @@
        if line.startswith("@@"):
            raw = line[2:]
            cat_candidate = raw.strip("\r\n").strip()
            if cat_candidate == "" or is_valid_cat(cat_candidate):
                # close any open spans (fail-soft: auto-close at block boundary)
                span_stack.clear()
                current_block = make_node("block", cat=(cat_candidate or "default"), children=[])
                root["children"].append(current_block)
                continue

        i = 0
        while i < len(line):
            ch = line[i]

            # Try span start: {cat| ...}
            if ch == "{":
                j = i + 1
                cat_chars = []
                while j < len(line) and line[j] not in "|}":
                    cat_chars.append(line[j])
                    j += 1
                if j < len(line) and line[j] == "|":
                    cat = "".join(cat_chars).strip()
                    if is_valid_cat(cat):
                        # start span
                        span = make_node("span", cat=cat, children=[])
                        current_container_children().append(span)
                        span_stack.append(span)
                        i = j + 1
                        continue
                # else: treat '{' as literal

            # Span end
            if ch == "}" and span_stack:
                span_stack.pop()
                i += 1
                continue

            # Normal char
            emit_text(ch)
            i += 1

    return root


def ast_to_plain_text(ast: Dict[str, Any]) -> str:
    out: List[str] = []

    def walk(node: Dict[str, Any]):
        t = node["type"]
        if t == "text":
            out.append(node["v"])
        else:
            for c in node.get("children", []):
                walk(c)

    walk(ast)
    return "".join(out)


def ast_to_tagged_text(ast: Dict[str, Any]) -> str:
    out: List[str] = []

    def walk(node: Dict[str, Any]):
        t = node["type"]
        if t == "doc":
            for c in node["children"]:
                walk(c)

        elif t == "block":
            cat = node.get("cat", "default")
            out.append(f"@@{'' if cat == 'default' else cat}\n")
            for c in node.get("children", []):
                walk(c)

        elif t == "span":
            out.append("{%s|" % node.get("cat", ""))
            for c in node.get("children", []):
                walk(c)
            out.append("}")

        elif t == "text":
            out.append(node["v"])

    walk(ast)
    return "".join(out)


def extract_text_by_category(ast: Dict[str, Any], cat: str) -> str:
    out: List[str] = []
    cat = cat.strip()

    def walk(node: Dict[str, Any], active: List[str]):
        t = node["type"]

        if t == "block":
            active2 = active + ([node["cat"]] if node["cat"] != "default" else [])
            for c in node.get("children", []):
                walk(c, active2)

        elif t == "span":
            active2 = active + [node["cat"]]
            for c in node.get("children", []):
                walk(c, active2)

        elif t == "text":
            if cat in active:
                out.append(node["v"])

        else:  # doc
            for c in node.get("children", []):
                walk(c, active)

    walk(ast, [])
    return "".join(out)


def ast_to_plain_text(ast: Dict[str, Any]) -> str:
    out: List[str] = []

    def walk(node: Dict[str, Any]):
        t = node.get("type")

        if t == "text":
            out.append(node.get("v", ""))
            return

        for child in node.get("children", []) or []:
            walk(child)

    walk(ast)
    return "".join(out)


def ast_to_tagged_text(ast: Dict[str, Any]) -> str:
    out: List[str] = []

    def walk(node: Dict[str, Any]):
        t = node.get("type")

        if t == "doc":
            for child in node.get("children", []) or []:
                walk(child)
            return

        if t == "block":
            cat = node.get("cat", "default")
            out.append(f"@@{'' if cat == 'default' else cat}\n")
            for child in node.get("children", []) or []:
                walk(child)
            return

        if t == "span":
            cat = node.get("cat", "")
            out.append("{%s|" % cat)
            for child in node.get("children", []) or []:
                walk(child)
            out.append("}")
            return

        if t == "text":
            out.append(node.get("v", ""))
            return

        # Unknown node types: best-effort traverse
        for child in node.get("children", []) or []:
            walk(child)

    walk(ast)
    return "".join(out)
