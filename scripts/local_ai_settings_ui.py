import os
import sys

import gradio as gr

from modules import script_callbacks, shared

_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from local_ai_api import discover_local_ai, set_cached_model_choices

_STATUS_PENDING = (
    '<p class="forge-en-local-ai-status forge-en-local-ai-status--pending">'
    "Not detected yet. Enter host / IP and click <b>Detect Local AI</b>."
    "</p>"
)

_detect_status_el = None
_detect_button_el = None
_detect_wired = False


def _status_html_ok(backend: str, base_url: str, model_count: int) -> str:
    return (
        '<p class="forge-en-local-ai-status forge-en-local-ai-status--ok">'
        f"Connected to <b>{backend}</b> at <code>{base_url}</code> "
        f"({model_count} model{'s' if model_count != 1 else ''})."
        "</p>"
    )


def _status_html_error(message: str) -> str:
    safe = (
        (message or "Local AI connect error")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return (
        '<p class="forge-en-local-ai-status forge-en-local-ai-status--error">'
        f"{safe}"
        "</p>"
    )


def _run_detect(host_value: str):
    host = (host_value or "").strip()
    try:
        result = discover_local_ai(host)
        if not result.ok:
            return (
                gr.update(value=host),
                gr.update(),
                gr.update(),
                _status_html_error(result.error or "Local AI connect error"),
            )

        models = result.models or []
        set_cached_model_choices(models)

        shared.opts.forge_en_local_ai_host = host
        shared.opts.forge_en_local_ai_backend = result.backend
        shared.opts.forge_en_local_ai_base_url = result.base_url

        current_model = (
            getattr(shared.opts, "forge_en_local_ai_model", None) or ""
        ).strip()
        if current_model not in models:
            current_model = models[0] if models else ""
        shared.opts.forge_en_local_ai_model = current_model

        return (
            gr.update(value=host),
            gr.update(value=result.backend),
            gr.update(choices=models if models else [""], value=current_model),
            _status_html_ok(
                result.backend or "", result.base_url or "", len(models)
            ),
        )
    except Exception as ex:
        return (
            gr.update(),
            gr.update(),
            gr.update(),
            _status_html_error(str(ex) or "Local AI connect error"),
        )


def _wire_detect_button(model_component):
    global _detect_wired
    if _detect_wired or _detect_button_el is None or _detect_status_el is None:
        return

    host_component = shared.settings_components.get("forge_en_local_ai_host")
    backend_component = shared.settings_components.get("forge_en_local_ai_backend")
    if host_component is None or backend_component is None:
        return

    _detect_button_el.click(
        fn=_run_detect,
        inputs=[host_component],
        outputs=[host_component, backend_component, model_component, _detect_status_el],
    )
    _detect_wired = True


def on_after_component(component, **_kwargs):
    global _detect_status_el, _detect_button_el

    elem_id = getattr(component, "elem_id", None)
    if elem_id == "setting_forge_en_local_ai_host" and _detect_status_el is None:
        _detect_status_el = gr.HTML(
            value=_STATUS_PENDING,
            elem_id="forge_en_local_ai_status",
        )
        _detect_button_el = gr.Button(
            value="Detect Local AI",
            elem_id="forge_en_local_ai_detect",
            variant="secondary",
        )
        return

    if elem_id == "setting_forge_en_local_ai_model":
        _wire_detect_button(component)


script_callbacks.on_after_component(
    on_after_component,
    name="forge-split-extra-networks-local-ai-settings",
)
