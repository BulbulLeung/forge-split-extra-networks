import os
import sys
from pathlib import Path

import gradio as gr
from fastapi import FastAPI, HTTPException

from modules import script_callbacks

_EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _EXT_DIR not in sys.path:
    sys.path.insert(0, _EXT_DIR)

from ui_extra_networks_wildcard import get_wildcard_directory

_MAX_LINES = 1000


def _wildcard_root() -> Path:
    return Path(get_wildcard_directory()).resolve()


def validate_wildcard_file(filepath: str) -> Path:
    path = Path(os.path.abspath(filepath))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if path.suffix.lower() != ".txt":
        raise HTTPException(status_code=400, detail="Not a wildcard text file")

    root = _wildcard_root()
    try:
        path.resolve().relative_to(root)
    except ValueError as ex:
        raise HTTPException(status_code=403, detail="Path not allowed") from ex

    return path.resolve()


def parse_wildcard_lines(path: Path) -> list[str]:
    lines = []
    text = path.read_text(encoding="utf-8", errors="replace")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
        if len(lines) >= _MAX_LINES:
            break
    return lines


def register_wildcard_routes(_: gr.Blocks, app: FastAPI):
    @app.get("/forge-en-wildcard/lines")
    async def get_wildcard_lines(filename: str = ""):
        if not filename:
            return {"lines": [], "name": "", "error": "filename required"}

        try:
            path = validate_wildcard_file(filename)
            root = _wildcard_root()
            name = str(path.relative_to(root)).replace("\\", "/")
            if name.lower().endswith(".txt"):
                name = name[:-4]
            lines = parse_wildcard_lines(path)
            return {"lines": lines, "name": name, "error": None}
        except HTTPException as ex:
            return {"lines": [], "name": "", "error": ex.detail}
        except OSError as ex:
            return {"lines": [], "name": "", "error": str(ex)}


script_callbacks.on_app_started(
    register_wildcard_routes,
    name="forge-split-extra-networks-wildcard-api",
)
