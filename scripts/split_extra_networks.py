import gradio as gr
import os
import sys

from modules import errors, script_callbacks, scripts, shared, ui_extra_networks

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
for _path in (_EXT_DIR, _SCRIPTS_DIR):
    if _path not in sys.path:
        sys.path.insert(0, _path)

_EXT_JS_DIR = os.path.join(_EXT_DIR, "javascript")
_EXT_JS_FILES = ("split_extra_networks.js", "output_browser.js", "wildcard.js")

shared.options_templates.update(
    shared.options_section(
        ("forge_en_split", "Split Extra Networks layout", "ui"),
        {
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
                320,
                "Extra Networks preview pane: viewport offset (px)",
                gr.Slider,
                {"minimum": 80, "maximum": 600, "step": 8},
            ),
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
            "forge_en_wildcard_enabled": shared.OptionInfo(
                True,
                "Show Wildcard tab in Extra Networks",
            ).needs_reload_ui(),
            "forge_en_extra_networks_tab_order": shared.OptionInfo(
                "output browser,wildcard,lora,checkpoints,textual inversion",
                "Extra Networks tab order (comma-separated page names)",
            ).needs_reload_ui(),
            "forge_en_split_default_extra_tab": shared.OptionInfo(
                "output_browser",
                "Default Extra Networks tab on startup",
                gr.Dropdown,
                lambda: {
                    "choices": [
                        "output_browser",
                        "wildcard",
                        "lora",
                        "checkpoints",
                        "textual_inversion",
                    ]
                },
            ).needs_reload_ui(),
        },
    )
)


def _apply_extra_networks_tab_order():
    order = (shared.opts.forge_en_extra_networks_tab_order or "").strip()
    if order:
        shared.opts.ui_extra_networks_tab_reorder = order


def _ensure_js_in_javascript_html():
    """Ensure extension JS is included in the page head."""
    import modules.ui_gradio_extensions as uge

    if getattr(uge, "_forge_split_js_patched", False):
        return

    uge._forge_split_js_patched = True
    original = uge.javascript_html

    def wrapped_javascript_html():
        html = original()
        for js_name in _EXT_JS_FILES:
            if js_name in html:
                continue
            js_path = os.path.normpath(os.path.join(_EXT_JS_DIR, js_name))
            if os.path.isfile(js_path):
                html += (
                    f'<script type="text/javascript" src="{uge.webpath(js_path)}"></script>\n'
                )
        return html

    uge.javascript_html = wrapped_javascript_html


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


def _on_before_ui():
    _ensure_js_in_javascript_html()
    _apply_extra_networks_tab_order()
    _register_output_browser()
    _register_wildcard()


script_callbacks.on_before_ui(
    _on_before_ui,
    name="forge-split-extra-networks",
)


class SplitExtraNetworksLayout(scripts.Script):
    """Registers settings, Output Browser and Wildcard EN pages; layout via javascript."""

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
