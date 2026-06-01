import gradio as gr
import os

from modules import script_callbacks, scripts, shared

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_EXT_JS = os.path.normpath(
    os.path.join(_EXT_DIR, "javascript", "split_extra_networks.js")
)

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
                {"minimum": 280, "maximum": 1200, "step": 10},
            ),
            "forge_en_split_remember_width": shared.OptionInfo(
                True,
                "Remember panel width after resize (localStorage)",
            ),
        },
    )
)


def _ensure_js_in_javascript_html():
    """Ensure extension JS is included in the page head."""
    import modules.ui_gradio_extensions as uge

    if getattr(uge, "_forge_split_js_patched", False):
        return

    uge._forge_split_js_patched = True
    original = uge.javascript_html

    def wrapped_javascript_html():
        html = original()
        if "split_extra_networks.js" in html:
            return html
        if os.path.isfile(_EXT_JS):
            html += (
                f'<script type="text/javascript" src="{uge.webpath(_EXT_JS)}"></script>\n'
            )
        return html

    uge.javascript_html = wrapped_javascript_html


script_callbacks.on_before_ui(
    _ensure_js_in_javascript_html,
    name="forge-split-extra-networks-js-patch",
)


class SplitExtraNetworksLayout(scripts.Script):
    """Registers settings only; layout is applied via javascript/split_extra_networks.js."""

    def title(self):
        return "Split Extra Networks layout"

    def show(self, is_img2img):
        return False
