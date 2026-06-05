import html
import os
from typing import Optional

from modules import shared, ui_extra_networks
from modules.ui_extra_networks import allowed_preview_extensions, quote_js

_OUTPUT_TABS = ("txt2img", "img2img")


class ExtraNetworksPageOutputBrowser(ui_extra_networks.ExtraNetworksPage):
    def __init__(self):
        super().__init__("Output Browser")
        self.allow_prompt = False
        self._current_tabname = "txt2img"

    @staticmethod
    def _folder_label(tabname: str) -> str:
        return tabname

    @staticmethod
    def _resolve_outdir(tabname: str) -> Optional[str]:
        """Per-mode samples folder from Settings (not global outdir_samples)."""
        opts = shared.opts
        if tabname == "txt2img":
            path = opts.outdir_txt2img_samples
        elif tabname == "img2img":
            path = opts.outdir_img2img_samples
        else:
            path = opts.outdir_samples
        if not path:
            return None
        return os.path.abspath(path)

    @staticmethod
    def _walk_extensions():
        exts = allowed_preview_extensions()
        return tuple(
            f".{e.lower().lstrip('.')}" for e in exts
        )

    def create_html(self, tabname, *, empty=False):
        self._current_tabname = tabname
        return super().create_html(tabname, empty=empty)

    def _folder_buttons_html(self, tabname: str) -> str:
        subdirs = {}
        for mode_tab in _OUTPUT_TABS:
            outdir = self._resolve_outdir(mode_tab)
            if not outdir or not os.path.isdir(outdir):
                continue
            subdirs[self._folder_label(mode_tab)] = 1

        if not subdirs:
            return ""

        subdirs = {"": 1, **subdirs}

        return "".join([f"""
        <button class='lg secondary gradio-button custom-button{" search-all" if subdir == "" else ""}' onclick='extraNetworksSearchButton("{tabname}", "{self.extra_networks_tabname}", event)'>
        {html.escape(subdir if subdir != "" else "all")}
        </button>
        """ for subdir in subdirs])

    def create_dirs_view_html(self, tabname: str) -> str:
        return self._folder_buttons_html(tabname)

    def create_tree_view_html(self, tabname: str) -> str:
        inner = self._folder_buttons_html(tabname)
        if not inner:
            return ""
        return f"<ul class='tree-list tree-list--tree'><li>{inner}</li></ul>"

    def refresh(self):
        self.lister.reset()

    def allowed_directories_for_previews(self):
        seen = set()
        dirs = []
        for mode_tab in _OUTPUT_TABS:
            outdir = self._resolve_outdir(mode_tab)
            if outdir and os.path.isdir(outdir) and outdir not in seen:
                seen.add(outdir)
                dirs.append(outdir)
        return dirs

    def _outdir_search_labels(self) -> dict[str, list[str]]:
        """Map absolute outdir -> folder filter labels (txt2img / img2img)."""
        by_dir: dict[str, list[str]] = {}
        for mode_tab in _OUTPUT_TABS:
            outdir = self._resolve_outdir(mode_tab)
            if not outdir or not os.path.isdir(outdir):
                continue
            by_dir.setdefault(outdir, []).append(self._folder_label(mode_tab))
        return by_dir

    def create_item(
        self,
        filepath,
        index=None,
        outdir=None,
        folder_tag=None,
        search_labels=None,
        relpath=None,
    ):
        if outdir is None:
            outdir = self._resolve_outdir(self._current_tabname)
        if not outdir:
            return None

        abspath = os.path.abspath(filepath)
        basename = os.path.basename(abspath)
        if folder_tag is None:
            folder_tag = self._folder_label(self._current_tabname)
        if search_labels is None:
            search_labels = [folder_tag]
        if relpath is None:
            relpath = os.path.relpath(abspath, outdir).replace("\\", "/")

        unique_name = f"{folder_tag}/{relpath}"
        preview = self.link_preview(abspath)
        search_terms = list(
            dict.fromkeys(search_labels + [relpath, basename, unique_name])
        )

        return {
            "name": unique_name,
            "filename": abspath,
            "preview": preview,
            "search_terms": search_terms,
            "onclick": html.escape("return false;"),
            "local_preview": abspath,
            "sort_keys": {"default": index, **self.get_sort_keys(abspath)},
        }

    def _collect_image_files_for_outdir(self, outdir: str, labels: list[str], max_items: int):
        exts = self._walk_extensions()
        primary_tag = labels[0]
        paths = list(shared.walk_files(outdir, allowed_extensions=exts))
        paths.sort(
            key=lambda p: self.lister.mctime(p)[0] or 0,
            reverse=True,
        )
        paths = paths[:max_items]
        for path in paths:
            abspath = os.path.abspath(path)
            relpath = os.path.relpath(abspath, outdir).replace("\\", "/")
            yield abspath, outdir, primary_tag, labels, relpath

    def list_items(self):
        max_items = int(
            getattr(shared.opts, "forge_en_output_browser_max_items", 500) or 500
        )
        max_items = max(1, min(max_items, 5000))

        seen_files: set[str] = set()
        entries = []
        for outdir, labels in self._outdir_search_labels().items():
            for entry in self._collect_image_files_for_outdir(outdir, labels, max_items):
                if entry[0] in seen_files:
                    continue
                seen_files.add(entry[0])
                entries.append(entry)

        entries.sort(
            key=lambda e: self.lister.mctime(e[0])[0] or 0,
            reverse=True,
        )

        for index, (filepath, outdir, folder_tag, search_labels, relpath) in enumerate(
            entries
        ):
            item = self.create_item(
                filepath,
                index,
                outdir,
                folder_tag,
                search_labels=search_labels,
                relpath=relpath,
            )
            if item is not None:
                yield item
