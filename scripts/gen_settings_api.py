"""Save / Load Gen Setting presets for forge-split-extra-networks Prompt tab."""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import gradio as gr
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from modules import script_callbacks

_EXT_DIR = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_GEN_SETTINGS_ROOT = _EXT_DIR / "gen_settings"
_ALLOWED_TABNAMES = frozenset(("txt2img", "img2img"))
_NAME_RE = re.compile(r"^[\w .\-()[\]]{1,120}$", re.UNICODE)
_FORBIDDEN_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class SaveRequest(BaseModel):
    tabname: str
    name: str
    fields: List[Dict[str, Any]] = Field(default_factory=list)


class DeleteRequest(BaseModel):
    tabname: str
    name: str


# Ensure models are fully defined for FastAPI TypeAdapter (pydantic 2.x).
SaveRequest.model_rebuild()
DeleteRequest.model_rebuild()


def _validate_tabname(tabname: str) -> str:
    if tabname not in _ALLOWED_TABNAMES:
        raise HTTPException(status_code=400, detail="Invalid tabname")
    return tabname


def _sanitize_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Name required")
    if _FORBIDDEN_NAME_CHARS.search(cleaned) or ".." in cleaned:
        raise HTTPException(status_code=400, detail="Invalid name")
    if not _NAME_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid name")
    return cleaned


def _tab_dir(tabname: str) -> Path:
    path = (_GEN_SETTINGS_ROOT / tabname).resolve()
    root = _GEN_SETTINGS_ROOT.resolve()
    try:
        path.relative_to(root)
    except ValueError as ex:
        raise HTTPException(status_code=403, detail="Path not allowed") from ex
    return path


def _preset_path(tabname: str, name: str) -> Path:
    directory = _tab_dir(tabname)
    path = (directory / f"{name}.json").resolve()
    try:
        path.relative_to(directory.resolve())
    except ValueError as ex:
        raise HTTPException(status_code=403, detail="Path not allowed") from ex
    return path


def _list_names(tabname: str) -> list[str]:
    directory = _tab_dir(tabname)
    if not directory.is_dir():
        return []
    names = []
    for entry in directory.iterdir():
        if entry.is_file() and entry.suffix.lower() == ".json":
            names.append(entry.stem)
    names.sort(key=lambda s: s.lower())
    return names


def _read_preset(tabname: str, name: str) -> dict[str, Any]:
    path = _preset_path(tabname, name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Preset not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as ex:
        raise HTTPException(status_code=500, detail=f"Failed to read preset: {ex}") from ex
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="Invalid preset format")
    fields = data.get("fields", [])
    if not isinstance(fields, list):
        raise HTTPException(status_code=500, detail="Invalid preset fields")
    return {
        "tabname": tabname,
        "name": name,
        "fields": fields,
        "error": None,
    }


def _save_preset(tabname: str, name: str, fields: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(fields, list):
        raise HTTPException(status_code=400, detail="fields must be a list")

    safe_fields = []
    for item in fields:
        if not isinstance(item, dict):
            continue
        elem_id = item.get("id")
        if not isinstance(elem_id, str) or not elem_id.strip():
            continue
        if "value" not in item:
            continue
        safe_fields.append({"id": elem_id.strip(), "value": item["value"]})

    directory = _tab_dir(tabname)
    directory.mkdir(parents=True, exist_ok=True)
    path = _preset_path(tabname, name)
    payload = {
        "tabname": tabname,
        "name": name,
        "fields": safe_fields,
    }
    try:
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as ex:
        raise HTTPException(status_code=500, detail=f"Failed to save preset: {ex}") from ex

    return {"ok": True, "name": name, "count": len(safe_fields), "error": None}


def _delete_preset(tabname: str, name: str) -> dict[str, Any]:
    path = _preset_path(tabname, name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Preset not found")
    try:
        path.unlink()
    except OSError as ex:
        raise HTTPException(status_code=500, detail=f"Failed to delete preset: {ex}") from ex
    return {"ok": True, "name": name, "error": None}


def register_gen_settings_routes(_: gr.Blocks, app: FastAPI):
    @app.get("/forge-en-gen-settings/list")
    async def list_presets(tabname: str = "txt2img"):
        try:
            tab = _validate_tabname(tabname)
            return {"names": _list_names(tab), "error": None}
        except HTTPException as ex:
            return {"names": [], "error": ex.detail}

    @app.get("/forge-en-gen-settings/get")
    async def get_preset(tabname: str = "txt2img", name: str = ""):
        try:
            tab = _validate_tabname(tabname)
            cleaned = _sanitize_name(name)
            return _read_preset(tab, cleaned)
        except HTTPException as ex:
            return {
                "tabname": tabname,
                "name": name,
                "fields": [],
                "error": ex.detail,
            }

    @app.post("/forge-en-gen-settings/save")
    async def save_preset(req: SaveRequest):
        try:
            tab = _validate_tabname(req.tabname)
            cleaned = _sanitize_name(req.name)
            return _save_preset(tab, cleaned, req.fields)
        except HTTPException as ex:
            return {"ok": False, "name": req.name, "count": 0, "error": ex.detail}

    @app.post("/forge-en-gen-settings/delete")
    async def delete_preset(req: DeleteRequest):
        try:
            tab = _validate_tabname(req.tabname)
            cleaned = _sanitize_name(req.name)
            return _delete_preset(tab, cleaned)
        except HTTPException as ex:
            return {"ok": False, "name": req.name, "error": ex.detail}


script_callbacks.on_app_started(
    register_gen_settings_routes,
    name="forge-split-extra-networks-gen-settings-api",
)
