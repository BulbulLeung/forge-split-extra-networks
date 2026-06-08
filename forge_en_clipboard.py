import ctypes
import os
import platform
import struct
from ctypes import wintypes

CF_HDROP = 15
GMEM_MOVEABLE = 0x0002
GMEM_ZEROINIT = 0x0040
DROPEFFECT_COPY = 1
DROPEFFECT_MOVE = 2
_DROPFILES_HEADER_SIZE = 20

_win32_configured = False


def _configure_win32() -> None:
    global _win32_configured
    if _win32_configured:
        return

    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32

    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalUnlock.restype = wintypes.BOOL
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalFree.restype = wintypes.HGLOBAL
    kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]

    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.CloseClipboard.restype = wintypes.BOOL
    user32.EmptyClipboard.restype = wintypes.BOOL
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.RegisterClipboardFormatW.restype = wintypes.UINT
    user32.RegisterClipboardFormatW.argtypes = [wintypes.LPCWSTR]

    _win32_configured = True


def _pack_hdrop_data(paths: list[str]) -> bytes:
    normalized = [os.path.normpath(os.path.abspath(p)) for p in paths]
    header = struct.pack(
        "<IiiII",
        _DROPFILES_HEADER_SIZE,
        0,
        0,
        0,
        1,
    )
    file_list = b"".join(
        path.encode("utf-16-le") + b"\0\0" for path in normalized
    ) + b"\0\0"
    return header + file_list


def _global_alloc_copy(data: bytes) -> wintypes.HGLOBAL:
    kernel32 = ctypes.windll.kernel32
    size = len(data)

    h_global = kernel32.GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, size)
    if not h_global:
        raise OSError("GlobalAlloc failed")

    locked = kernel32.GlobalLock(h_global)
    if not locked:
        kernel32.GlobalFree(h_global)
        raise OSError("GlobalLock failed")

    try:
        dest = (ctypes.c_char * size).from_address(locked)
        dest[:] = data
    finally:
        kernel32.GlobalUnlock(h_global)

    return h_global


def _set_clipboard_files_windows(paths: list[str], cut: bool) -> None:
    _configure_win32()

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    hdrop_data = _pack_hdrop_data(paths)
    h_hdrop = _global_alloc_copy(hdrop_data)

    effect = DROPEFFECT_MOVE if cut else DROPEFFECT_COPY
    h_effect = _global_alloc_copy(struct.pack("<I", effect))

    if not user32.OpenClipboard(None):
        kernel32.GlobalFree(h_hdrop)
        kernel32.GlobalFree(h_effect)
        raise OSError("OpenClipboard failed")

    h_hdrop_freed = False
    h_effect_freed = False
    try:
        if not user32.EmptyClipboard():
            raise OSError("EmptyClipboard failed")

        if not user32.SetClipboardData(CF_HDROP, h_hdrop):
            raise OSError("SetClipboardData failed")
        h_hdrop_freed = True

        preferred_fmt = user32.RegisterClipboardFormatW("Preferred DropEffect")
        if not user32.SetClipboardData(preferred_fmt, h_effect):
            raise OSError("SetClipboardData Preferred DropEffect failed")
        h_effect_freed = True
    finally:
        user32.CloseClipboard()
        if not h_hdrop_freed:
            kernel32.GlobalFree(h_hdrop)
        if not h_effect_freed:
            kernel32.GlobalFree(h_effect)


def set_clipboard_files(paths: list[str], cut: bool = False) -> dict:
    """Put absolute file paths on the OS clipboard (Windows CF_HDROP)."""
    if platform.system() != "Windows":
        return {
            "ok": False,
            "error": "Copy/Cut files is supported on Windows only.",
        }

    if not paths:
        return {"ok": False, "error": "No files selected."}

    try:
        _set_clipboard_files_windows(paths, cut)
        return {"ok": True}
    except OSError as ex:
        return {"ok": False, "error": str(ex)}
    except Exception as ex:
        return {"ok": False, "error": str(ex)}
