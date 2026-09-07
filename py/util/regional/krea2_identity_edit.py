"""Global single-image Identity Edit, separate from regional token routing.

Sequence/grounding follow conradlocke's Identity Edit training contract and
lbouaraba/comfyui-krea2edit (Apache-2.0); see docs/design/krea2-identity-edit.md.
"""
import copy
import math

import torch
import torch.nn.functional as F

from .clip_hooks import clip_with_hooks
from .document import selection_prompts
from .dense_attention import check_dense_mask_budget
from .krea2_attention import CONDITIONING_WIDTH, _require_krea2
from .krea2_edit_geometry import _fit_encode_image

WRAPPER_KEY = "bv_krea2_identity_edit"
TEMPLATE = (
    "<|im_start|>system\nDescribe the image by detailing the color, shape, size, "
    "texture, quantity, text, spatial relationships of the objects and background:"
    "<|im_end|>\n<|im_start|>user\n<|vision_start|><|image_pad|><|vision_end|>"
    "{}<|im_end|>\n<|im_start|>assistant\n"
)


def require_compatible_patches(options, *, installed=False):
    from .edit_lora_passes import WRAPPER_KEY as lora_wrapper
    wrappers = options.get("wrappers", {})
    foreign = any(value for kind, entries in wrappers.items() for key, value in entries.items()
                  if not (installed and len(value) == 1 and ((kind == "diffusion_model" and key == WRAPPER_KEY) or (kind == "calc_cond_batch" and key == lora_wrapper))))
    if options.get("patches") or options.get("patches_replace") or foreign:
        raise ValueError("Identity Edit cannot be combined with another attention/edit/token patch; weight LoRAs and merged checkpoints are supported")


def edit_prompts(document, scope="global", region_id=None):
    background = document["prompts"]["background"]
    if background["positive_source"].strip() or background["negative_source"].strip():
        raise ValueError("Identity Edit currently requires an empty Background prompt; use the Global prompt")
    if document.get("negative_mode") == "zero_out":
        raise ValueError("Identity Edit needs an image-grounded negative; choose Auto or Prompt instead of Zero out")
    clean = copy.deepcopy(document)
    pair = (next(region["prompts"] for region in clean["regions"] if region["id"] == region_id)
            if scope == "region" else clean["prompts"][scope])
    selected = document["reference_images"][0]
    for polarity in ("positive", "negative"):
        source = pair[f"{polarity}_source"].encode("utf-16-le")
        for mention in reversed(pair.get("references", {}).get(polarity, [])):
            if any(mention[key] != selected[key] for key in ("collector_id", "resource_id")):
                raise ValueError("Identity Edit mentions must refer to the selected source image")
            source = source[:mention["start"]*2] + "the source image".encode("utf-16-le") + source[mention["end"]*2:]
        pair[f"{polarity}_source"] = source.decode("utf-16-le")
    pair.pop("references", None)
    positive, negative = selection_prompts({"document": clean, "scope": scope, "region_id": region_id})
    return positive["text"], negative["text"]


def validate_inputs(image, target_latent, vae, *, model):
    if not torch.is_tensor(image) or image.ndim != 4 or image.shape[0] != 1 or image.shape[-1] not in (3, 4) or min(image.shape[1:3]) < 1:
        raise ValueError("Identity Edit source must be one RGB/RGBA IMAGE, not an image batch")
    target = target_latent.get("samples") if isinstance(target_latent, dict) else None
    if target_latent is None:
        raise ValueError("Identity Edit requires target_latent: connect the same LATENT that feeds the sampler")
    if not torch.is_tensor(target) or target.is_nested or target.ndim not in (4, 5) or min(target.shape) < 1 or (target.ndim == 5 and target.shape[2] != 1):
        raise ValueError("Identity Edit target_latent must contain an image LATENT tensor (4D or 5D with one frame)")
    # Match the sampler: generic empty latents are adapted to the model before use.
    from comfy.sample import fix_empty_latent_channels
    target = fix_empty_latent_channels(model, target,
        target_latent.get("downscale_ratio_spacial"), target_latent.get("downscale_ratio_temporal"))
    if target.ndim not in (4, 5) or target.shape[1] != 16 or min(target.shape) < 1 or (target.ndim == 5 and target.shape[2] != 1):
        raise ValueError(f"Identity Edit target_latent must resolve to a 16-channel image LATENT; got {tuple(target.shape)} after sampler normalization")
    if vae is None or not callable(getattr(vae, "encode", None)):
        raise ValueError("Identity Edit requires the model's compatible VAE")
    return tuple(target.shape[-2:])


def grounded_encode(clip, positive, negative, image, hooks=None, grounding_px=768):
    encoder = clip_with_hooks(clip, hooks)
    pixels = image[..., :3]
    h, w = pixels.shape[1:3]
    if max(h, w) > grounding_px:
        scale = grounding_px / max(h, w)
        pixels = F.interpolate(pixels.movedim(-1, 1), size=(max(1, round(h*scale)), max(1, round(w*scale))), mode="area").movedim(1, -1)
    results = []
    for text in (positive, negative):
        encoded = encoder.encode_from_tokens_scheduled(encoder.tokenize(text, images=[pixels], llama_template=TEMPLATE))
        if len(encoded) != 1 or encoded[0][0].ndim != 3 or encoded[0][0].shape[-1] != CONDITIONING_WIDTH:
            raise ValueError("Identity Edit needs a Krea 2 Qwen3-VL encoder with vision support and one unscheduled prompt")
        embedding, metadata = encoded[0]
        metadata = dict(metadata)
        metadata.pop("hooks", None)  # Reattached once by the existing global MODEL hook pass.
        attention = metadata.pop("attention_mask", None)
        if attention is not None:
            if attention.shape != embedding.shape[:2] or embedding.shape[0] != 1:
                raise ValueError("Unsupported Identity Edit conditioning attention mask")
            embedding = embedding[:, attention[0].bool(), :]
        if embedding.shape[0] != 1 or embedding.shape[1] == 0:
            raise ValueError("Identity Edit requires one nonempty conditioning sequence")
        results.append([[embedding, metadata]])
    return tuple(results)


def edit_forward(model, x, timesteps, context, source, options, ref_boost, fit_mode):
    from comfy.ldm.flux.layers import timestep_embedding
    temporal = x.ndim == 5
    if temporal:
        if x.shape[2] != 1:
            raise ValueError("Identity Edit supports still images only")
        x = x[:, :, 0]
    batch, _, height, width = x.shape
    patch = model.patch
    x = F.pad(x, (0, -width % patch, 0, -height % patch), mode="replicate")
    source = source.to(x.device, x.dtype).expand(batch, -1, -1, -1)
    source = F.pad(source, (0, -source.shape[-1] % patch, 0, -source.shape[-2] % patch), mode="replicate")
    th, tw = x.shape[-2]//patch, x.shape[-1]//patch
    sh, sw = source.shape[-2]//patch, source.shape[-1]//patch
    def tokens(value):
        b, c, h, w = value.shape
        packed = value.reshape(b,c,h//patch,patch,w//patch,patch).permute(0,2,4,1,3,5).reshape(b,(h//patch)*(w//patch),c*patch*patch)
        return model.first(packed)
    target_tokens, source_tokens = tokens(x), tokens(source)
    t = model.tmlp(timestep_embedding(timesteps, model.tdim).unsqueeze(1).to(target_tokens.dtype))
    tvec = model.tproj(t)
    text = model.txtmlp(model.txtfusion(model._unpack_context(context), mask=None, transformer_options=options))
    nt, ns, nx = text.shape[1], source_tokens.shape[1], target_tokens.shape[1]
    combined = torch.cat((text, source_tokens, target_tokens), dim=1)
    def positions(frame, h, w, oy=0., ox=0.):
        ids = torch.zeros((batch, h, w, 3), device=x.device)
        ids[..., 0] = frame
        ids[..., 1] = torch.arange(h, device=x.device)[:, None] + oy
        ids[..., 2] = torch.arange(w, device=x.device)[None, :] + ox
        return ids.reshape(batch, h*w, 3)
    offset = (max(0., (th-sh)/2), max(0., (tw-sw)/2)) if fit_mode == "fit" else (0., 0.)
    ids = torch.cat((torch.zeros(batch, nt, 3, device=x.device), positions(1, sh, sw, *offset), positions(0, th, tw)), dim=1)
    freqs = model.pe_embedder(ids)
    bias = None
    if ref_boost != 1.:
        length = nt+ns+nx
        check_dense_mask_budget(length, 1, combined.dtype, label="Krea Identity Edit reference bias")
        bias = torch.zeros((1, 1, length, length), device=x.device, dtype=combined.dtype)
        bias[:, :, nt+ns:, nt:nt+ns] = math.log(max(ref_boost, 1e-4))
    # No regional token hooks: their native text/target/reference layout differs.
    for block in model.blocks:
        combined = block(combined, tvec, freqs, bias, transformer_options=options)
    result = model.last(combined, t)[:, nt+ns:nt+ns+nx]
    result = result.reshape(batch,th,tw,model.channels,patch,patch).permute(0,3,1,4,2,5).reshape(batch,model.channels,th*patch,tw*patch)
    result = result[:, :, :height, :width]
    return result.unsqueeze(2) if temporal else result


def apply_identity_edit(model, image, vae, target_latent, *, fit_mode="fit", ref_boost=1.):
    import comfy.model_base
    import comfy.patcher_extension
    _require_krea2(model, comfy.model_base.Krea2)
    shape = validate_inputs(image, target_latent, vae, model=model)
    if fit_mode not in ("fit", "crop") or not math.isfinite(ref_boost) or not 0 < ref_boost <= 100:
        raise ValueError("Invalid Identity Edit fit mode or reference boost")
    options = model.model_options.get("transformer_options", {})
    require_compatible_patches(options)
    class CheckedVae:
        def encode(self, pixels):
            latent = vae.encode(pixels)
            if not torch.is_tensor(latent) or latent.ndim not in (4, 5) or (latent.ndim == 5 and latent.shape[2] != 1) or latent.shape[0] != 1 or latent.shape[1] != 16 or tuple(latent.shape[-2:]) != (pixels.shape[1]//8, pixels.shape[2]//8):
                raise ValueError("Identity Edit requires a 16-channel VAE with 8x spatial compression")
            return latent.unsqueeze(2) if latent.ndim == 4 else latent
    source = _fit_encode_image(image, CheckedVae(), *shape, {}, (), fit_mode)
    if source.ndim != 5 or source.shape[2] != 1 or source.shape[0] != 1 or source.shape[1] != 16:
        raise ValueError("Identity Edit VAE must encode a single 16-channel image latent")
    # Krea uses Wan21's per-channel statistics with a singleton time dimension.
    source = model.model.process_latent_in(source)[:, :, 0]
    result = model.clone()
    def wrapper(executor, x, timesteps, context, *args, **kwargs):
        if tuple(x.shape[-2:]) != shape:
            raise ValueError("Identity Edit target_latent and sampler resolution differ; connect the same latent to both")
        opts = kwargs.get("transformer_options")
        if opts is None:
            opts = next((arg for arg in reversed(args) if isinstance(arg, dict)), {})
        require_compatible_patches(opts, installed=True)
        native_refs = kwargs.get("ref_latents")
        if native_refs or (len(args) >= 3 and args[-2] is not None and len(args[-2])):
            raise ValueError("Identity Edit cannot be combined with other native reference latents")
        return edit_forward(executor.class_obj, x, timesteps, context, source, dict(opts), ref_boost, fit_mode)
    comfy.patcher_extension.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY, wrapper, result.model_options.setdefault("transformer_options", {}))
    return result
