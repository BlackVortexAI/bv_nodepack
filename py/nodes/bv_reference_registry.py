from comfy_api.latest import io

from ..util.regional.reference_registry import MAX_REFERENCES, RUNTIME_PROVIDER, build_reference_provider


class BVReferenceRegistryNode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="BV Reference Registry",
            display_name="🌀 BV Reference Registry",
            category="🌀 BV Node Pack/regional/references",
            description="Collects native images, audio and video, including generated media, with stable reference identities.",
            inputs=[
                io.String.Input("config_json", default="", multiline=True, dynamic_prompts=False, socketless=True),
                io.Autogrow.Input("media", optional=True, template=io.Autogrow.TemplatePrefix(
                    io.MultiType.Input("media", types=[io.Image, io.Audio, io.Video], optional=True),
                    prefix="media", min=1, max=MAX_REFERENCES)),
            ],
            outputs=[io.Custom(RUNTIME_PROVIDER).Output("resource_provider")],
        )

    @classmethod
    def execute(cls, config_json, media=None):
        return io.NodeOutput(build_reference_provider(config_json, media or {}))


NODE_CLASS_MAPPINGS = {"BV Reference Registry": BVReferenceRegistryNode}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Reference Registry": "🌀 BV Reference Registry"}
