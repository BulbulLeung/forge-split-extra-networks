import asyncio
import os
import sys
from pathlib import Path
from typing import Any, List, Optional

import gradio as gr
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

from modules import images, infotext_utils, script_callbacks, ui_extra_networks

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _EXT_DIR not in sys.path:
    sys.path.insert(0, _EXT_DIR)

from forge_en_clipboard import set_clipboard_files
from forge_en_folder import try_open_folder
from forge_en_trash import move_to_trash
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


class ClipboardRequest(BaseModel):
    paths: List[str]
    cut: bool = False


class ApplyRequest(BaseModel):
    filename: str
    tabname: str


class ApplyInfotextRequest(BaseModel):
    info: str
    tabname: str


def _json_safe_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_json_safe_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _json_safe_value(v) for k, v in value.items()}
    return str(value)


def _json_safe_update(item: dict) -> dict:
    safe = {"id": item["id"]}
    for key, value in item.items():
        if key == "id":
            continue
        safe[key] = _json_safe_value(value)
    return safe


def _gr_update_to_payload(result) -> Optional[dict]:
    if result is None or isinstance(result, infotext_utils.type_of_gr_update):
        return None
    if isinstance(result, dict):
        payload = {
            k: v for k, v in result.items() if k != "__type__" and v is not None
        }
        return payload or None
    payload = {}
    for key in ("value", "visible", "choices", "maximum", "minimum", "interactive"):
        val = getattr(result, key, None)
        if val is not None:
            payload[key] = val
    return payload or None


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
        payload = _gr_update_to_payload(result)
        if payload:
            return _json_safe_update({"id": elem_id, **payload})
        return None

    value = params.get(key, None)
    if value is None:
        return None
    return _json_safe_update({"id": elem_id, "value": value})


def _collect_field_updates(tabname: str, info: str) -> tuple[Optional[str], list[dict], Optional[str]]:
    if tabname not in ("txt2img", "img2img"):
        return None, [], "Invalid tab"

    if not info:
        return None, [], "No PNG info in image"

    page = infotext_utils.paste_fields.get(tabname)
    if not page:
        return None, [], "Tab not ready"

    params = infotext_utils.parse_generation_parameters(info)
    try:
        script_callbacks.infotext_pasted_callback(info, params)
    except Exception:
        pass

    updates = []
    for paste_field in page.get("fields", []):
        if isinstance(paste_field, infotext_utils.PasteField):
            component = paste_field.component
            key = (
                paste_field.label
                if paste_field.label is not None
                else paste_field.function
            )
        else:
            component, key = paste_field[0], paste_field[1]

        item = _field_update_from_params(component, key, params)
        if item is not None:
            updates.append(item)

    return info, updates, None


def build_field_updates_from_info(
    tabname: str, info: str
) -> tuple[Optional[str], list[dict], Optional[str]]:
    return _collect_field_updates(tabname, info)


def build_field_updates(
    tabname: str, filepath: str
) -> tuple[Optional[str], list[dict], Optional[str]]:
    info, _ = read_png_info(filepath)
    if not info:
        return None, [], "No PNG info in image"
    return _collect_field_updates(tabname, info)


def read_png_info(filepath: str) -> tuple[Optional[str], Any]:
    with Image.open(filepath) as image:
        return images.read_info_from_image(image)


def _apply_response(
    info: Optional[str], updates: list[dict], error: Optional[str]
) -> dict:
    if error:
        return {"info_present": False, "updates": [], "error": error}
    return {
        "info_present": bool(info),
        "updates": updates,
        "error": None,
    }


def _get_output_browser_page():
    return next(
        (p for p in ui_extra_networks.extra_pages if p.name == "output browser"),
        None,
    )


def register_output_browser_routes(_: gr.Blocks, app: FastAPI):
    @app.get("/forge-en-output-browser/infotext")
    async def get_infotext(filename: str = ""):
        if not filename:
            raise HTTPException(status_code=400, detail="filename required")

        path = validate_output_file(filename)

        try:
            info, _ = await asyncio.to_thread(read_png_info, str(path))
        except Exception as e:
            return {"info": None, "error": str(e)}

        if not info:
            return {"info": None, "error": "No PNG info in image"}

        return {"info": info, "error": None}

    @app.get("/forge-en-output-browser/exists")
    async def output_file_exists(filename: str = ""):
        if not filename:
            raise HTTPException(status_code=400, detail="filename required")
        try:
            validate_output_file(filename)
            return {"exists": True, "error": None}
        except HTTPException as ex:
            if ex.status_code == 404:
                return {"exists": False, "error": None}
            raise

    @app.post("/forge-en-output-browser/delete")
    async def delete_files(req: DeleteRequest):
        deleted = []
        failed = []

        for raw_path in req.paths or []:
            try:
                path = validate_output_file(raw_path)
                await asyncio.to_thread(move_to_trash, path)
                deleted.append(str(path))
            except HTTPException as ex:
                failed.append({"path": raw_path, "error": ex.detail})
            except OSError as ex:
                failed.append({"path": raw_path, "error": str(ex)})

        return {"deleted": deleted, "failed": failed}

    @app.post("/forge-en-output-browser/clipboard")
    async def clipboard_files(req: ClipboardRequest):
        if not req.paths:
            raise HTTPException(status_code=400, detail="paths required")

        validated = []
        for raw_path in req.paths:
            validated.append(str(validate_output_file(raw_path)))

        return await asyncio.to_thread(set_clipboard_files, validated, req.cut)

    @app.post("/forge-en-output-browser/apply")
    async def apply_to_tab(req: ApplyRequest):
        try:
            if not req.filename:
                raise HTTPException(status_code=400, detail="filename required")

            path = validate_output_file(req.filename)
            info, updates, error = await asyncio.to_thread(
                build_field_updates, req.tabname, str(path)
            )
            return _apply_response(info, updates, error)
        except HTTPException:
            raise
        except Exception as e:
            return _apply_response(None, [], str(e))

    @app.get("/forge-en-output-browser/open-folder")
    async def open_output_folder(tabname: str = "txt2img"):
        if tabname not in ("txt2img", "img2img"):
            return {"ok": False, "error": "invalid tabname"}

        outdir = ExtraNetworksPageOutputBrowser._resolve_outdir(tabname)
        result = await asyncio.to_thread(try_open_folder, outdir)
        if result.get("ok"):
            return result
        return {"ok": False, "error": result.get("error") or "Failed to open folder"}

    @app.get("/forge-en-output-browser/pane-html")
    async def get_pane_html(tabname: str = "txt2img"):
        if tabname not in ("txt2img", "img2img"):
            return {"html": "", "error": "invalid tabname"}

        page = _get_output_browser_page()
        if page is None:
            return {"html": "", "error": "Output Browser not registered"}

        try:
            page.refresh()
            html = page.create_html(tabname)
            return {"html": html, "error": None}
        except Exception as e:
            return {"html": "", "error": str(e)}

    @app.post("/forge-en-output-browser/apply-infotext")
    async def apply_infotext_to_tab(req: ApplyInfotextRequest):
        try:
            if not req.info:
                raise HTTPException(status_code=400, detail="info required")

            info, updates, error = await asyncio.to_thread(
                build_field_updates_from_info, req.tabname, req.info
            )
            return _apply_response(info, updates, error)
        except HTTPException:
            raise
        except Exception as e:
            return _apply_response(None, [], str(e))


script_callbacks.on_app_started(
    register_output_browser_routes,
    name="forge-split-extra-networks-output-browser-api",
)
