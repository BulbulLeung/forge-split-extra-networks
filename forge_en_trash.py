import os
import platform
import shutil
import subprocess
import uuid
from pathlib import Path

_FO_DELETE = 0x0003
_FOF_ALLOWUNDO = 0x0040
_FOF_NOCONFIRMATION = 0x0010
_FOF_SILENT = 0x0004


def _windows_move_to_trash(path: Path) -> None:
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", wintypes.WORD),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", wintypes.LPVOID),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]

    from_buffer = str(path) + "\0\0"
    op = SHFILEOPSTRUCTW()
    op.hwnd = None
    op.wFunc = _FO_DELETE
    op.pFrom = from_buffer
    op.pTo = None
    op.fFlags = _FOF_ALLOWUNDO | _FOF_NOCONFIRMATION | _FOF_SILENT
    op.fAnyOperationsAborted = False
    op.hNameMappings = None
    op.lpszProgressTitle = None

    result = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    if result != 0:
        raise OSError(result, f"SHFileOperationW failed for {path}")
    if op.fAnyOperationsAborted:
        raise OSError(f"Trash operation aborted for {path}")


def _macos_move_to_trash(path: Path) -> None:
    script = f'tell application "Finder" to delete POSIX file {repr(str(path))}'
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise OSError(stderr or f"Failed to move {path} to Trash")


def _linux_gio_trash(path: Path) -> bool:
    try:
        result = subprocess.run(
            ["gio", "trash", str(path)],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return False

    if result.returncode == 0:
        return True

    stderr = (result.stderr or "").strip()
    if stderr:
        raise OSError(stderr)
    return False


def _linux_freedesktop_trash(path: Path) -> None:
    trash_files = Path.home() / ".local" / "share" / "Trash" / "files"
    trash_info = Path.home() / ".local" / "share" / "Trash" / "info"
    trash_files.mkdir(parents=True, exist_ok=True)
    trash_info.mkdir(parents=True, exist_ok=True)

    dest = trash_files / path.name
    if dest.exists():
        dest = trash_files / f"{path.name}.{uuid.uuid4().hex}"

    shutil.move(str(path), str(dest))

    info_path = trash_info / f"{dest.name}.trashinfo"
    info_path.write_text(
        "[Trash Info]\n"
        f"Path={path.as_posix()}\n"
        f"DeletionDate={_freedesktop_deletion_date()}\n",
        encoding="utf-8",
    )


def _freedesktop_deletion_date() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _linux_move_to_trash(path: Path) -> None:
    if _linux_gio_trash(path):
        return
    _linux_freedesktop_trash(path)


def move_to_trash(path: str | os.PathLike) -> None:
    """Move a file to the OS trash/recycle bin. Raises OSError on failure."""
    resolved = Path(os.path.abspath(str(path)))
    if not resolved.is_file():
        raise FileNotFoundError(f"File not found: {resolved}")

    system = platform.system()
    if system == "Windows":
        _windows_move_to_trash(resolved)
        return
    if system == "Darwin":
        _macos_move_to_trash(resolved)
        return
    _linux_move_to_trash(resolved)
