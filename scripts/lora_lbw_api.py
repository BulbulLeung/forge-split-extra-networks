import importlib.util
import logging
import os
import sys

import gradio as gr
from fastapi import FastAPI

from modules import paths_internal, script_callbacks, shared

logger = logging.getLogger("forge_en_lora_lbw_api")

_LBW_MODULE = None
_LBW_LOAD_ATTEMPTED = False

_ARCH_PREFIXES = (
    ("[SD/XL]", "sdxl", "SDXL_PRESETS"),
    ("[Flux1]", "flux", "FLUX_PRESETS"),
    ("[Flux]", "flux", "FLUX_PRESETS"),
    ("[F2-K9B]", "flux_k9b", "FLUX_KLEIN_9B_PRESETS"),
    ("[F2-K4B]", "flux_k4b", "FLUX_KLEIN_4B_PRESETS"),
    ("[Anima]", "anima", "ANIMA_PRESETS"),
)


def _lbw_script_path() -> str:
    return os.path.join(
        paths_internal.extensions_dir,
        "lora-block-weight-neo",
        "scripts",
        "lora_block_weight.py",
    )


def _load_lbw_module():
    global _LBW_MODULE, _LBW_LOAD_ATTEMPTED

    if _LBW_LOAD_ATTEMPTED:
        return _LBW_MODULE

    _LBW_LOAD_ATTEMPTED = True
    script_path = _lbw_script_path()
    if not os.path.isfile(script_path):
        return None

    module_name = "forge_en_lora_block_weight"
    try:
        spec = importlib.util.spec_from_file_location(module_name, script_path)
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        _LBW_MODULE = module
    except Exception as ex:
        logger.error("forge-en-lora: failed to load lora-block-weight-neo: %s", ex)
        _LBW_MODULE = None

    return _LBW_MODULE


def _preset_dict_for_choice(module, choice: str):
    for prefix, _arch, attr in _ARCH_PREFIXES:
        if prefix not in choice:
            continue
        parts = choice.split("] ", 1)
        if len(parts) != 2:
            continue
        name = parts[1].strip()
        presets = getattr(module, attr, None)
        if isinstance(presets, dict):
            weights = presets.get(name)
            if weights is not None:
                return name, weights
    return None, None


def resolve_lbw_archs(forge_preset: str, checkpoint_name: str) -> list[str]:
    preset = (forge_preset or "").strip().lower()
    ckpt = (checkpoint_name or "").strip().lower()

    if preset in ("sd", "xl"):
        return ["sdxl"]
    if preset == "flux":
        return ["flux"]
    if preset == "klein":
        if "4b" in ckpt:
            return ["flux_k4b"]
        return ["flux_k9b"]
    if preset == "anima":
        return ["anima"]
    return []


def _current_forge_context() -> tuple[str, str]:
    forge_preset = str(getattr(shared.opts, "forge_preset", "") or "")
    checkpoint_name = str(getattr(shared.opts, "sd_model_checkpoint", "") or "")
    return forge_preset, checkpoint_name


def _empty_lbw_payload(*, available: bool = False) -> dict:
    forge_preset, checkpoint_name = _current_forge_context()
    lbw_archs = resolve_lbw_archs(forge_preset, checkpoint_name)
    return {
        "available": available,
        "forge_preset": forge_preset,
        "checkpoint": checkpoint_name,
        "lbw_archs": lbw_archs,
        "lbw_supported": bool(lbw_archs),
        "presets": [],
    }


def _collect_all_presets(module) -> list[dict]:
    get_choices = getattr(module, "_get_preset_choices", None)
    if not callable(get_choices):
        return []

    presets = []
    for choice in get_choices():
        if choice == "— none —":
            continue
        name, weights = _preset_dict_for_choice(module, choice)
        if name is None:
            continue
        arch = "sdxl"
        for prefix, arch_key, _attr in _ARCH_PREFIXES:
            if prefix in choice:
                arch = arch_key
                break
        presets.append(
            {
                "choice": choice,
                "name": name,
                "arch": arch,
                "weights": weights,
            }
        )
    return presets


def get_lbw_presets_payload() -> dict:
    forge_preset, checkpoint_name = _current_forge_context()
    lbw_archs = resolve_lbw_archs(forge_preset, checkpoint_name)
    lbw_supported = bool(lbw_archs)

    module = _load_lbw_module()
    if module is None:
        return _empty_lbw_payload(available=False)

    all_presets = _collect_all_presets(module)
    if not all_presets:
        return _empty_lbw_payload(available=False)

    arch_set = set(lbw_archs)
    presets = [preset for preset in all_presets if preset.get("arch") in arch_set]

    return {
        "available": True,
        "forge_preset": forge_preset,
        "checkpoint": checkpoint_name,
        "lbw_archs": lbw_archs,
        "lbw_supported": lbw_supported,
        "presets": presets,
    }


def register_lora_lbw_routes(_: gr.Blocks, app: FastAPI):
    @app.get("/forge-en-lora/lbw/presets")
    async def get_lbw_presets():
        return get_lbw_presets_payload()


script_callbacks.on_app_started(
    register_lora_lbw_routes,
    name="forge-split-extra-networks-lora-lbw-api",
)
