import importlib
from pathlib import Path

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"

try:
    from .py.util.completion import routes as _completion_routes  # noqa: F401
except Exception as error:
    print(f"BV Node Pack: completion API unavailable: {error}")

try:
    from .py.util import remote_llm_routes as _remote_llm_routes  # noqa: F401
except Exception as error:
    print(f"BV Node Pack: remote LLM settings API unavailable: {error}")

try:
    from .py.util import detector_routes as _detector_routes  # noqa: F401
except Exception as error:
    print(f"BV Node Pack: detector model API unavailable: {error}")


def get_ext_dir(subpath=None, mkdir=False):
    root = Path(__file__).parent
    path = root / subpath if subpath else root
    path = path.resolve()

    if mkdir:
        path.mkdir(parents=True, exist_ok=True)
    return path


nodes_dir = get_ext_dir("py/nodes")

if nodes_dir.exists():
    for file in nodes_dir.glob("*.py"):
        if file.name == "__init__.py":
            continue

        module_name = f".py.nodes.{file.stem}"
        try:
            imported_module = importlib.import_module(module_name, __name__)
            NODE_CLASS_MAPPINGS.update(getattr(imported_module, "NODE_CLASS_MAPPINGS", {}))
            NODE_DISPLAY_NAME_MAPPINGS.update(getattr(imported_module, "NODE_DISPLAY_NAME_MAPPINGS", {}))
        except Exception as e:
            print(f"Failed to load module {module_name}: {e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
