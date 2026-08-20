from __future__ import annotations

import folder_paths

from ..util.text_log import LOG_MODES, write_text_log


class BVTextLogWriterNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
                "log_name": ("STRING", {"default": "regional-enhancer.txt", "multiline": False}),
                "mode": (list(LOG_MODES), {"default": "timestamped"}),
                "write_enabled": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("text", "file_path", "status")
    OUTPUT_NODE = True
    FUNCTION = "write"
    CATEGORY = "🌀 BV Node Pack/utils"

    @classmethod
    def IS_CHANGED(cls, **_kwargs):
        return float("nan")

    def write(self, text, log_name, mode, write_enabled=True):
        if not bool(write_enabled):
            status = "Writing disabled"
            return {
                "ui": {"text": [str(text)], "file_path": [""], "status": [status]},
                "result": (str(text), "", status),
            }
        path = write_text_log(folder_paths.get_output_directory(), text, log_name, mode)
        status = f"Wrote {path.name}"
        return {
            "ui": {"text": [str(text)], "file_path": [str(path)], "status": [status]},
            "result": (str(text), str(path), status),
        }


NODE_CLASS_MAPPINGS = {
    "BV Text Log Writer": BVTextLogWriterNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Text Log Writer": "🌀 BV Text Log Writer",
}
