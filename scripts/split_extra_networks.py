import gradio as gr
import os
import sys

from modules import errors, script_callbacks, scripts, shared, ui_extra_networks, ui_components
from modules.options import OptionDiv

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
for _path in (_EXT_DIR, _SCRIPTS_DIR):
    if _path not in sys.path:
        sys.path.insert(0, _path)

_FORGE_EN_TAB_CHOICES = [
    "output_browser",
    "prompt",
    "wildcard",
    "lora",
    "checkpoints",
    "textual_inversion",
]


def _parse_en_tab_slugs(text: str) -> list[str]:
    if not text or not str(text).strip():
        return []
    return [
        part.strip().lower().replace(" ", "_")
        for part in str(text).split(",")
        if part.strip()
    ]


def _forge_en_tab_dropdown():
    return {"choices": list(_FORGE_EN_TAB_CHOICES)}


_FORGE_EN_LOCAL_AI_TRANSLATE_LANGS = (
    "English",
    "繁體中文",
    "简体中文",
    "日本語",
    "한국어",
    "Français",
    "Deutsch",
    "Español",
    "Português",
    "Русский",
)


def _forge_en_local_ai_translate_lang_dropdown():
    return {"choices": list(_FORGE_EN_LOCAL_AI_TRANSLATE_LANGS)}


def _forge_en_local_ai_model_dropdown():
    try:
        from local_ai_api import get_cached_model_choices

        choices = get_cached_model_choices()
    except Exception:
        choices = []
    current = (getattr(shared.opts, "forge_en_local_ai_model", None) or "").strip()
    if current and current not in choices:
        choices = [current, *choices]
    return {"choices": choices if choices else [""]}


def _refresh_local_ai_models():
    try:
        from local_ai_api import list_local_ai_models

        list_local_ai_models()
    except Exception:
        pass


def _forge_en_settings_spacer():
    return OptionDiv()


shared.options_templates.update(
    shared.options_section(
        ("forge_en_split", "Split Extra Networks layout", "ui"),
        {
            # --- Split layout ---
            "forge_en_split_enabled": shared.OptionInfo(
                True,
                "Enable split layout (Generation left, Extra Networks right)",
            ).needs_reload_ui(),
            "forge_en_split_default_width": shared.OptionInfo(
                520,
                "Default Extra Networks panel width (px)",
                gr.Slider,
                {"minimum": 280, "maximum": 2000, "step": 10},
            ),
            "forge_en_split_remember_width": shared.OptionInfo(
                True,
                "Remember panel width after resize (localStorage)",
            ),
            "forge_en_split_pane_viewport_offset_px": shared.OptionInfo(
                512,
                "Extra Networks preview pane: viewport offset (px)",
                gr.Slider,
                {"minimum": 80, "maximum": 600, "step": 8},
            ),
            # --- Output Browser ---
            "forge_en_spacer_output_browser": _forge_en_settings_spacer(),
            "forge_en_output_browser_enabled": shared.OptionInfo(
                True,
                "Show Output Browser tab in Extra Networks",
            ).needs_reload_ui(),
            "forge_en_output_browser_max_items": shared.OptionInfo(
                500,
                "Output Browser: maximum number of images to list",
                gr.Slider,
                {"minimum": 100, "maximum": 5000, "step": 50},
            ),
            "forge_en_output_browser_selection_outline_px": shared.OptionInfo(
                5,
                "Output Browser: selection outline width (px)",
                gr.Slider,
                {"minimum": 1, "maximum": 12, "step": 1},
            ),
            "forge_en_output_browser_auto_refresh": shared.OptionInfo(
                True,
                "Output Browser: auto-refresh after txt2img/img2img generation completes",
            ),
            # --- Wildcard ---
            "forge_en_spacer_wildcard": _forge_en_settings_spacer(),
            "forge_en_wildcard_enabled": shared.OptionInfo(
                True,
                "Show Wildcard tab in Extra Networks",
            ).needs_reload_ui(),
            # --- Prompt / Local AI ---
            "forge_en_spacer_prompt": _forge_en_settings_spacer(),
            "forge_en_prompt_tab_enabled": shared.OptionInfo(
                True,
                "Show Prompt tab in Extra Networks",
            ).needs_reload_ui(),
            "forge_en_local_ai_enabled": shared.OptionInfo(
                False,
                "Enable Local AI auto prompt (tooltip translation and smart insert)",
            ),
            "forge_en_local_ai_translate_lang": shared.OptionInfo(
                "繁體中文",
                "Local AI: tooltip translation language",
                gr.Dropdown,
                _forge_en_local_ai_translate_lang_dropdown,
            ),
            "forge_en_local_ai_backend": shared.OptionInfo(
                "Ollama",
                "Local AI: backend",
                gr.Radio,
                {"choices": ("Ollama", "LM Studio")},
            ),
            "forge_en_local_ai_host": shared.OptionInfo(
                "127.0.0.1",
                "Local AI: host / IP",
                gr.Textbox,
            ).info("Hostname or IP where Ollama or LM Studio is running"),
            "forge_en_local_ai_model": shared.OptionInfo(
                "",
                "Local AI: model",
                ui_components.DropdownEditable,
                _forge_en_local_ai_model_dropdown,
                refresh=_refresh_local_ai_models,
            ).info("Use Detect Local AI to load models, or type a custom model name"),
            # --- LoRA ---
            "forge_en_spacer_lora": _forge_en_settings_spacer(),
            "forge_en_lora_weight_button_size": shared.OptionInfo(
                "Medium",
                "Lora weight button size",
                gr.Radio,
                {"choices": ("Small", "Medium", "Big")},
            ),
            "forge_en_lora_lbw_enabled": shared.OptionInfo(
                True,
                "Lora tab: show LoRA Block Weight Neo preset selector on active cards",
            ).info("Requires lora-block-weight-neo extension; enable LoRA Block Weight in Scripts for generation"),
            # --- Tab order ---
            "forge_en_spacer_tabs": _forge_en_settings_spacer(),
            "forge_en_extra_networks_tab_order": shared.OptionInfo(
                "output browser,prompt,wildcard,lora,checkpoints,textual inversion",
                "Extra Networks tab order (comma-separated page names)",
            ).needs_reload_ui(),
            "forge_en_split_default_extra_tab": shared.OptionInfo(
                "output_browser",
                "Default Extra Networks tab on startup (single column only)",
                gr.Dropdown,
                _forge_en_tab_dropdown,
            ).needs_reload_ui(),
            # --- Multi-column layout ---
            "forge_en_spacer_columns": _forge_en_settings_spacer(),
            "forge_en_column_count": shared.OptionInfo(
                1,
                "Extra Networks horizontal columns (1–3)",
                gr.Slider,
                {"minimum": 1, "maximum": 3, "step": 1},
            ).needs_reload_ui(),
            "forge_en_column_default_width": shared.OptionInfo(
                520,
                "Default width per column (px, multi-column mode)",
                gr.Slider,
                {"minimum": 280, "maximum": 2000, "step": 10},
            ),
            "forge_en_column_1_tabs": shared.OptionInfo(
                "prompt,output browser",
                "Column 1: Extra Network tabs (comma-separated slugs)",
            ).needs_reload_ui(),
            "forge_en_column_2_tabs": shared.OptionInfo(
                "wildcard",
                "Column 2: Extra Network tabs (comma-separated slugs)",
            ).needs_reload_ui(),
            "forge_en_column_3_tabs": shared.OptionInfo(
                "lora,checkpoints,textual inversion",
                "Column 3: Extra Network tabs (comma-separated slugs)",
            ).needs_reload_ui(),
            "forge_en_column_1_default_tab": shared.OptionInfo(
                "output_browser",
                "Column 1: default tab on startup",
                gr.Dropdown,
                _forge_en_tab_dropdown,
            ).needs_reload_ui(),
            "forge_en_column_2_default_tab": shared.OptionInfo(
                "wildcard",
                "Column 2: default tab on startup",
                gr.Dropdown,
                _forge_en_tab_dropdown,
            ).needs_reload_ui(),
            "forge_en_column_3_default_tab": shared.OptionInfo(
                "lora",
                "Column 3: default tab on startup",
                gr.Dropdown,
                _forge_en_tab_dropdown,
            ).needs_reload_ui(),
        },
    )
)

# Internal-only: keep base_url in data_labels so opts setattr works (UI hidden).
shared.options_templates.update(
    shared.options_section(
        (None, "forge_en_internal", "forge_en_internal"),
        {
            "forge_en_local_ai_base_url": shared.OptionInfo(
                "http://127.0.0.1:11434/v1",
                "Local AI: API base URL (internal)",
                gr.Textbox,
            ),
        },
    )
)


def _apply_extra_networks_tab_order():
    order = (shared.opts.forge_en_extra_networks_tab_order or "").strip()
    if order:
        shared.opts.ui_extra_networks_tab_reorder = order


def _register_output_browser():
    if not shared.opts.forge_en_output_browser_enabled:
        return
    from ui_extra_networks_output_browser import ExtraNetworksPageOutputBrowser

    ui_extra_networks.register_page(ExtraNetworksPageOutputBrowser())


def _register_wildcard():
    if not shared.opts.forge_en_wildcard_enabled:
        return
    from ui_extra_networks_wildcard import ExtraNetworksPageWildcard

    ui_extra_networks.register_page(ExtraNetworksPageWildcard())


def _register_prompt():
    if not shared.opts.forge_en_prompt_tab_enabled:
        return
    from ui_extra_networks_prompt import ExtraNetworksPagePrompt

    ui_extra_networks.register_page(ExtraNetworksPagePrompt())


def _on_before_ui():
    try:
        from local_ai_api import migrate_local_ai_host_from_legacy_url

        migrate_local_ai_host_from_legacy_url()
    except Exception:
        pass
    _apply_extra_networks_tab_order()
    _register_output_browser()
    _register_wildcard()
    _register_prompt()


script_callbacks.on_before_ui(
    _on_before_ui,
    name="forge-split-extra-networks",
)


class SplitExtraNetworksLayout(scripts.Script):
    """Registers settings, Output Browser, Prompt, Wildcard EN pages; layout via javascript."""

    def title(self):
        return "Split Extra Networks layout"

    def show(self, is_img2img):
        return False


try:
    import output_browser_api  # noqa: F401 — registers on_app_started routes
except Exception:
    errors.report(
        "forge-split-extra-networks: output_browser_api load failed",
        exc_info=True,
    )

try:
    import wildcard_api  # noqa: F401 — registers on_app_started routes
except Exception:
    errors.report(
        "forge-split-extra-networks: wildcard_api load failed",
        exc_info=True,
    )

try:
    import lora_lbw_api  # noqa: F401 — registers on_app_started routes
except Exception:
    errors.report(
        "forge-split-extra-networks: lora_lbw_api load failed",
        exc_info=True,
    )

try:
    import local_ai_api  # noqa: F401 — registers on_app_started routes
except Exception:
    errors.report(
        "forge-split-extra-networks: local_ai_api load failed",
        exc_info=True,
    )

try:
    import local_ai_settings_ui  # noqa: F401 — settings detect button
except Exception:
    errors.report(
        "forge-split-extra-networks: local_ai_settings_ui load failed",
        exc_info=True,
    )
