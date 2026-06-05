import html
import os
from typing import Optional

from modules import shared, ui_extra_networks


def _fallback_wildcard_dir() -> str:
    webui_root = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    return os.path.join(
        webui_root, "extensions", "sd-dynamic-prompts", "wildcards"
    )


def get_wildcard_directory() -> str:
    try:
        from sd_dynamic_prompts.paths import get_wildcard_dir

        return os.path.abspath(str(get_wildcard_dir()))
    except Exception:
        return os.path.abspath(_fallback_wildcard_dir())


def _wildcard_wrap() -> str:
    wrap = getattr(shared.opts, "dp_parser_wildcard_wrap", None)
    if wrap:
        return str(wrap)
    return "__"


def _is_hidden_path(path: str, root: str) -> bool:
    relpath = os.path.relpath(path, root)
    parts = relpath.replace("\\", "/").split("/")
    return any(part.startswith(".") for part in parts if part)


class ExtraNetworksPageWildcard(ui_extra_networks.ExtraNetworksPage):
    def __init__(self):
        super().__init__("Wildcard")
        self.allow_prompt = False

    def refresh(self):
        self.lister.reset()

    def _wildcard_dir(self) -> str:
        return get_wildcard_directory()

    def allowed_directories_for_previews(self):
        wildcard_dir = self._wildcard_dir()
        if os.path.isdir(wildcard_dir):
            return [wildcard_dir]
        return []

    def create_dirs_view_html(self, tabname: str) -> str:
        """Folder filter buttons use forward slashes to match card paths."""
        parentdir = os.path.abspath(self._wildcard_dir())
        if not os.path.isdir(parentdir):
            return ""

        subdirs: dict[str, int] = {}
        for root, dirs, _ in sorted(
            os.walk(parentdir, followlinks=True),
            key=lambda x: shared.natural_sort_key(x[0]),
        ):
            for dirname in sorted(dirs, key=shared.natural_sort_key):
                path = os.path.join(root, dirname)
                if not os.path.isdir(path):
                    continue
                if len(os.listdir(path)) == 0:
                    continue

                rel = os.path.relpath(path, parentdir).replace("\\", "/")
                if not rel.endswith("/"):
                    rel = rel + "/"

                if (
                    "/." in rel or rel.startswith(".")
                ) and not shared.opts.extra_networks_show_hidden_directories:
                    continue

                subdirs[rel] = 1

        if subdirs:
            subdirs = {"": 1, **subdirs}

        return "".join([f"""
        <button class='lg secondary gradio-button custom-button{" search-all" if subdir == "" else ""}' onclick='extraNetworksSearchButton("{tabname}", "{self.extra_networks_tabname}", event)'>
        {html.escape(subdir if subdir != "" else "all")}
        </button>
        """ for subdir in subdirs])

    def list_items(self):
        wildcard_dir = self._wildcard_dir()
        if not os.path.isdir(wildcard_dir):
            return

        paths = list(
            shared.walk_files(wildcard_dir, allowed_extensions=(".txt",))
        )
        paths.sort(key=lambda p: os.path.relpath(p, wildcard_dir).lower())

        for index, filepath in enumerate(paths):
            if _is_hidden_path(filepath, wildcard_dir):
                continue
            item = self.create_item(filepath, index)
            if item is not None:
                yield item

    def create_item(self, filepath, index=None):
        wildcard_dir = self._wildcard_dir()
        abspath = os.path.abspath(filepath)
        relpath = os.path.relpath(abspath, wildcard_dir).replace("\\", "/")
        if not relpath.lower().endswith(".txt"):
            return None

        qualified = relpath[:-4]
        wrap = _wildcard_wrap()
        token = f"{wrap}{qualified}{wrap}"
        base = os.path.splitext(abspath)[0]
        preview = self.find_preview(base)

        return {
            "name": qualified,
            "filename": abspath,
            "preview": preview,
            "local_preview": f"{base}.png",
            "search_terms": [qualified, token, os.path.basename(abspath)],
            "onclick": html.escape(
                "return forgeEnWildcardCardClicked(this, event);"
            ),
            "sort_keys": {"default": index, **self.get_sort_keys(abspath)},
        }
