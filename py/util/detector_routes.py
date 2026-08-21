from aiohttp import web
import folder_paths
from server import PromptServer


routes = PromptServer.instance.routes


@routes.get("/bv_nodepack/detectors/models")
async def detector_models(_request):
    def names(folder):
        try:
            return folder_paths.get_filename_list(folder)
        except Exception:
            return []

    ultralytics = [f"bbox/{name}" for name in names("ultralytics_bbox")]
    ultralytics += [f"segm/{name}" for name in names("ultralytics_segm")]
    sams = [name for name in names("sams") if name.endswith((".pt", ".pth", ".safetensors")) and "hq" not in name]
    return web.json_response({
        "ultralytics": ultralytics,
        "onnx": names("onnx"),
        "sam": sams,
    })
