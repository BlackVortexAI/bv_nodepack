# bv_prompt_category_switch.py
from __future__ import annotations

from typing import Any, Dict, List, Tuple

AST = "BV_AST"
ASTNode = Dict[str, Any]


def _parse_cats(s: str) -> List[str]:
    return [c.strip() for c in (s or "").split(",") if c.strip()]


def _matches_targets(
    *,
    path: List[str],
    nearest: str,
    targets: List[str],
    inherit: bool,
    mode: str,   # "any" | "all"
) -> bool:
    if not targets:
        return False

    active = set(path) if inherit else {nearest}

    if mode == "all":
        return all(t in active for t in targets)
    return any(t in active for t in targets)


def category_switch_ast(
    ast: ASTNode,
    *,
    enable: List[str],
    disable: List[str],
    inherit: bool = True,
    mode: str = "any",
) -> Tuple[ASTNode, Dict[str, int]]:
    """
    Returns (new_ast, stats)

    Rules:
      - If enable list is non-empty: keep only nodes that match enable.
      - Always remove nodes that match disable (disable wins).
      - Applies to "text" and "comment" nodes equally.
      - Spans get removed if they become empty.
      - Blocks are kept (even if empty) to preserve structure/categories.
    """

    mode = (mode or "any").lower()
    if mode not in ("any", "all"):
        mode = "any"

    stats = {
        "removed_text": 0,
        "removed_comment": 0,
        "kept_text": 0,
        "kept_comment": 0,
    }

    enable_active = bool(enable)

    def keep_node_for_enable(path: List[str], nearest: str) -> bool:
        # If enable list is empty => keep everything (subject to disable)
        if not enable_active:
            return True
        return _matches_targets(path=path, nearest=nearest, targets=enable, inherit=inherit, mode=mode)

    def remove_node_for_disable(path: List[str], nearest: str) -> bool:
        if not disable:
            return False
        return _matches_targets(path=path, nearest=nearest, targets=disable, inherit=inherit, mode=mode)

    def walk(node: ASTNode, path: List[str], nearest: str) -> ASTNode | None:
        t = node.get("type")

        if t == "doc":
            new_children: List[ASTNode] = []
            for c in node.get("children", []) or []:
                cc = walk(c, path, nearest)
                if cc is not None:
                    new_children.append(cc)
            return {"type": "doc", "children": new_children}

        if t == "block":
            bcat = node.get("cat", "default")
            new_path = path + ([bcat] if bcat else [])
            new_nearest = bcat or nearest

            new_children: List[ASTNode] = []
            for c in node.get("children", []) or []:
                cc = walk(c, new_path, new_nearest)
                if cc is not None:
                    new_children.append(cc)

            # Keep blocks even if empty (structure-preserving)
            return {"type": "block", "cat": bcat, "children": new_children}

        if t == "span":
            scat = node.get("cat", "")
            new_path = path + ([scat] if scat else [])
            new_nearest = scat or nearest

            new_children: List[ASTNode] = []
            for c in node.get("children", []) or []:
                cc = walk(c, new_path, new_nearest)
                if cc is not None:
                    new_children.append(cc)

            # Remove empty spans (clean AST)
            if not new_children:
                return None
            return {"type": "span", "cat": scat, "children": new_children}

        if t == "text":
            if not keep_node_for_enable(path, nearest):
                stats["removed_text"] += 1
                return None
            if remove_node_for_disable(path, nearest):
                stats["removed_text"] += 1
                return None
            stats["kept_text"] += 1
            return {"type": "text", "v": node.get("v", "")}

        if t == "comment":
            if not keep_node_for_enable(path, nearest):
                stats["removed_comment"] += 1
                return None
            if remove_node_for_disable(path, nearest):
                stats["removed_comment"] += 1
                return None
            stats["kept_comment"] += 1
            return {"type": "comment", "v": node.get("v", "")}

        # Unknown node: best-effort traverse children
        new_node: ASTNode = dict(node)
        children = node.get("children", []) or []
        if children:
            new_children: List[ASTNode] = []
            for c in children:
                cc = walk(c, path, nearest)
                if cc is not None:
                    new_children.append(cc)
            new_node["children"] = new_children
        return new_node

    new_ast = walk(ast, [], "default") or {"type": "doc", "children": []}
    return new_ast, stats


class BVPromptCategorySwitchNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ast": (AST,),
                "enable_categories": ("STRING", {"default": ""}),
                "disable_categories": ("STRING", {"default": ""}),
                "inherit": ("BOOLEAN", {"default": True, "label_on": "Include parent categories", "label_off": "Only direct category"}),
                "mode": ("BOOLEAN", {"default": True, "label_on": "Match any category", "label_off": "Match all categories"}),
            }
        }

    RETURN_TYPES = (AST, "STRING")
    RETURN_NAMES = ("ast", "report")
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/prompting"

    def run(self, ast, enable_categories, disable_categories, inherit, mode):
        enable = _parse_cats(enable_categories)
        disable = _parse_cats(disable_categories)
        mode_str = "any" if mode else "all"

        new_ast, stats = category_switch_ast(
            ast,
            enable=enable,
            disable=disable,
            inherit=bool(inherit),
            mode=mode_str,
        )

        report = (
            f"[BV Category Switch]\n"
            f"enable: {', '.join(enable) if enable else '(none)'}\n"
            f"disable: {', '.join(disable) if disable else '(none)'}\n"
            f"inherit: {bool(inherit)}\n"
            f"mode: {mode_str}\n"
            f"kept_text: {stats['kept_text']} | removed_text: {stats['removed_text']}\n"
            f"kept_comment: {stats['kept_comment']} | removed_comment: {stats['removed_comment']}\n"
        )

        return (new_ast, report)


NODE_CLASS_MAPPINGS = {
    "BV Prompt Category Switch": BVPromptCategorySwitchNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Prompt Category Switch": "🌀 BV Prompt Category Switch",
}
