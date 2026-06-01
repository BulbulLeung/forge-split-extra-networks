import os
import sys
from pathlib import Path
from typing import List, Optional

import gradio as gr
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from modules import images, infotext_utils, script_callbacks

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _EXT_DIR not in sys.path:
    sys.path.insert(0, _EXT_DIR)

from ui_extra_networks_output_browser import ExtraNetworksPageOutputBrowser


def _allowed_roots() -> list[Path]:
    roots = []
    for tab in ("txt2img", "img2img"):
        outdir = ExtraNetworksPageOutputBrowser._resolve_outdir(tab)
        if outdir and os.path.isdir(outdir):
            roots.append(Path(outdir).resolve())
    return roots


def validate_output_file(filepath: str) -> Path:
    path = Path(os.path.abspath(filepath))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    allowed = False
    for root in _allowed_roots():
        try:
            path.resolve().relative_to(root)
            allowed = True
            break
        except ValueError:
            continue

    if not allowed:
        raise HTTPException(status_code=403, detail="Path not allowed")

    return path.resolve()


class DeleteRequest(BaseModel):
    paths: List[str]


class ApplyRequest(BaseModel):
    filename: str
    tabname: str


def _field_update_from_params(component, key, params: dict) -> Optional[dict]:
    """Build UI updates without reading component.value (unsafe outside Gradio requests)."""
    elem_id = getattr(component, "elem_id", None)
    if not elem_id:
        return None

    if callable(key):
        try:
            result = key(params)
        except Exception:
            return None
        if result is None or isinstance(result, infotext_utils.type_of_gr_update):
            return None
        if isinstance(result, dict):
            payload = {k: v for k, v in result.items() if k != "__type__" and v is not None}
            if payload:
                return {"id": elem_id, **payload}
        return None

    value = params.get(key, None)
    if value is None:
        return None
    return {"id": elem_id, "value": value}


def build_field_updates(tabname: str, filepath: str) -> tuple[Optional[str], list[dict], Optional[str]]:
    if tabname not in ("txt2img", "img2img"):
        return None, [], "Invalid tab"

    page = infotext_utils.paste_fields.get(tabname)
    if not page:
        return None, [], "Tab not ready"

    image = images.read(filepath)
    info, _ = images.read_info_from_image(image)
    if not info:
        return None, [], "No PNG info in image"

    params = infotext_utils.parse_generation_parameters(info)
    script_callbacks.infotext_pasted_callback(info, params)

    updates = []
    for paste_field in page.get("fields", []):
        if isinstance(paste_field, infotext_utils.PasteField):
            component = paste_field.component
            key = paste_field.label if paste_field.label is not None else paste_field.function
        else:
            component, key = paste_field[0], paste_field[1]

        item = _field_update_from_params(component, key, params)
        if item is not None:
            updates.append(item)

    return info, updates, None


def register_output_browser_routes(_: gr.Blocks, app: FastAPI):
    @app.get("/forge-en-output-browser/infotext")
    async def get_infotext(filename: str = ""):
        if not filename:
            raise HTTPException(status_code=400, detail="filename required")

        path = validate_output_file(filename)

        try:
            image = images.read(str(path))
            info, _ = images.read_info_from_image(image)
        except Exception as e:
            return {"info": None, "error": str(e)}

        if not info:
            return {"info": None, "error": "No PNG info in image"}

        return {"info": info, "error": None}

    @app.post("/forge-en-output-browser/delete")
    async def delete_files(req: DeleteRequest):
        deleted = []
        failed = []

        for raw_path in req.paths or []:
            try:
                path = validate_output_file(raw_path)
                os.remove(path)
                deleted.append(str(path))
            except HTTPException as ex:
                failed.append({"path": raw_path, "error": ex.detail})
            except OSError as ex:
                failed.append({"path": raw_path, "error": str(ex)})

        return {"deleted": deleted, "failed": failed}

    @app.post("/forge-en-output-browser/apply")
    async def apply_to_tab(req: ApplyRequest):
        if not req.filename:
            raise HTTPException(status_code=400, detail="filename required")

        path = validate_output_file(req.filename)
        info, updates, error = build_field_updates(req.tabname, str(path))

        if error:
            return {"info": info, "updates": [], "error": error}

        return {"info": info, "updates": updates, "error": None}


script_callbacks.on_app_started(
    register_output_browser_routes,
    name="forge-split-extra-networks-output-browser-api",
)
