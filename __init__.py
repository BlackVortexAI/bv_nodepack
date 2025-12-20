import importlib
import os
from pathlib import Path

try:
    import server
    from aiohttp import web
    import nodes
except ImportError:
    server = None
    web = None
    nodes = None

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"


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

print("Hello from node", flush=True)

# Define the path to our extension
workspace_path = os.path.dirname(__file__)
dist_path = os.path.join(workspace_path, "dist/example_ext")
dist_locales_path = os.path.join(workspace_path, "dist/locales")

# Print the current paths for debugging
print(f"BV-NodePack workspace path: {workspace_path}")
print(f"Dist path: {dist_path}")
print(f"Dist locales path: {dist_locales_path}")
print(f"Locales exist: {os.path.exists(dist_locales_path)}")

# Register the static route for serving our React app assets
if os.path.exists(dist_path) and server is not None and web is not None:
    # Add the routes for the extension
    server.PromptServer.instance.app.add_routes([
        web.static("/example_ext/", dist_path),
    ])

    # Register the locale files route
    if os.path.exists(dist_locales_path):
        server.PromptServer.instance.app.add_routes([
            web.static("/locales/", dist_locales_path),
        ])
        print(f"Registered locale files route at /locales/")
    else:
        print("WARNING: Locale directory not found!")

    # Also register the standard ComfyUI extension web directory

    project_name = os.path.basename(workspace_path)

    try:
        # Method added in https://github.com/comfyanonymous/ComfyUI/pull/8357
        try:
            from comfy_config import config_parser
            project_config = config_parser.extract_node_configuration(workspace_path)
            project_name = project_config.project.name
            print(f"project name read from pyproject.toml: {project_name}")
        except ImportError:
            pass
    except Exception as e:
        print(f"Could not load project config, using default name '{project_name}': {e}")

    if nodes is not None:
        nodes.EXTENSION_WEB_DIRS[project_name] = os.path.join(workspace_path, "dist")
else:
    print("ComfyUI Example React Extension: Web directory not found")
