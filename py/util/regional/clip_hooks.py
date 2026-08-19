from __future__ import annotations

from typing import Any


def clip_with_hooks(clip: Any, hooks: Any) -> Any:
    if hooks is None:
        return clip
    import comfy.hooks

    hooked = clip.clone(disable_dynamic=True)
    hooked.apply_hooks_to_conds = hooks
    hooked.patcher.forced_hooks = hooks.clone()
    hooked.use_clip_schedule = False
    hooked.patcher.forced_hooks.set_keyframes_on_hooks(None)
    hooked.patcher.register_all_hook_patches(
        hooks, comfy.hooks.create_target_dict(comfy.hooks.EnumWeightTarget.Clip)
    )
    return hooked
