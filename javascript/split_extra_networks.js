/**
 * forge-split-extra-networks: Generation left, Extra Networks right.
 */
"use strict";

const FORGE_EN_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_DEFAULT_RIGHT_WIDTH = 520;
const FORGE_EN_MIN_RIGHT_WIDTH = 280;
const FORGE_EN_MAX_RIGHT_WIDTH = 2000;
const FORGE_EN_WIDTH_STORAGE_PREFIX = "forge_en_split_width_";
const FORGE_EN_DEFAULT_TAB_SUFFIX_FALLBACK = "_output_browser";
const FORGE_EN_DEFAULT_PANE_VIEWPORT_OFFSET_PX = 320;
const FORGE_EN_MIN_PANE_OFFSET_PX = 80;
const FORGE_EN_MAX_PANE_OFFSET_PX = 600;

let forgeEnResizeListenersAttached = false;
let forgeEnAfterScriptsCallbackRegistered = false;
let forgeEnSplitMutationWatchAttached = false;
let forgeEnSplitUiRefreshPending = null;
let forgeEnShowControlsHookInstalled = false;

function forgeEnSplitIsEnabled() {
    return (
        typeof opts === "undefined" || opts.forge_en_split_enabled !== false
    );
}

function forgeEnSplitDefaultWidth() {
    if (typeof opts !== "undefined" && opts.forge_en_split_default_width) {
        return Math.max(
            FORGE_EN_MIN_RIGHT_WIDTH,
            Math.min(
                FORGE_EN_MAX_RIGHT_WIDTH,
                opts.forge_en_split_default_width,
            ),
        );
    }
    return FORGE_EN_DEFAULT_RIGHT_WIDTH;
}

function forgeEnSplitGetStoredWidth(tabname) {
    const raw = localStorage.getItem(FORGE_EN_WIDTH_STORAGE_PREFIX + tabname);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(
        FORGE_EN_MIN_RIGHT_WIDTH,
        Math.min(FORGE_EN_MAX_RIGHT_WIDTH, n),
    );
}

function forgeEnSplitClampPaneOffsetPx(value, fallback) {
    const n =
        typeof value === "number"
            ? value
            : parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(
        FORGE_EN_MIN_PANE_OFFSET_PX,
        Math.min(FORGE_EN_MAX_PANE_OFFSET_PX, Math.round(n)),
    );
}

function forgeEnSplitPaneViewportOffsetPx() {
    if (
        typeof opts !== "undefined" &&
        opts.forge_en_split_pane_viewport_offset_px != null
    ) {
        return forgeEnSplitClampPaneOffsetPx(
            opts.forge_en_split_pane_viewport_offset_px,
            FORGE_EN_DEFAULT_PANE_VIEWPORT_OFFSET_PX,
        );
    }
    return FORGE_EN_DEFAULT_PANE_VIEWPORT_OFFSET_PX;
}

function forgeEnSplitApplyPaneOffsets(splitRoot) {
    if (!splitRoot) return;
    splitRoot.style.setProperty(
        "--forge-en-pane-offset-px",
        forgeEnSplitPaneViewportOffsetPx() + "px",
    );
}

function forgeEnSplitSetRightWidth(splitRoot, tabname, widthPx) {
    const w = Math.max(
        FORGE_EN_MIN_RIGHT_WIDTH,
        Math.min(FORGE_EN_MAX_RIGHT_WIDTH, Math.round(widthPx)),
    );
    splitRoot.style.setProperty("--forge-en-right-width", w + "px");
    if (
        typeof opts === "undefined" ||
        opts.forge_en_split_remember_width !== false
    ) {
        localStorage.setItem(
            FORGE_EN_WIDTH_STORAGE_PREFIX + tabname,
            String(w),
        );
    }
}

function forgeEnSplitQuery(selector) {
    const app = gradioApp();
    return (
        (app && app.querySelector(selector)) ||
        document.querySelector(selector)
    );
}

function forgeEnSplitGetSplitRoots(tabname) {
    const outer = forgeEnSplitQuery("#" + tabname + "_extra_tabs");
    if (!outer) return null;
    const inner = outer.querySelector(":scope > .tabs");
    const splitRoot = inner || outer;
    return { outer: outer, splitRoot: splitRoot, usesInnerTabs: !!inner };
}

function forgeEnSplitFindGenPanel(outer, splitRoot, tabname) {
    const byId =
        forgeEnSplitQuery("#" + tabname + "_generation") ||
        splitRoot.querySelector("#" + tabname + "_generation");
    if (byId) return byId;

    const settings = forgeEnSplitQuery("#" + tabname + "_settings");
    if (settings) {
        const panel =
            settings.closest(".tabitem") ||
            settings.closest('[role="tabpanel"]') ||
            settings.closest('[id^="' + tabname + '_"]');
        if (panel) return panel;
    }

    const tabNav =
        outer.querySelector(":scope > div.tab-nav") ||
        outer.querySelector(".tab-nav") ||
        outer.querySelector("[role='tablist']");
    if (tabNav) {
        let genBtn = tabNav.querySelector(
            'button[aria-controls="' + tabname + '_generation"]',
        );
        if (!genBtn) {
            tabNav.querySelectorAll("button").forEach(function (b) {
                if (b.textContent.trim() === "Generation") genBtn = b;
            });
        }
        if (genBtn) {
            const panelId = genBtn.getAttribute("aria-controls");
            if (panelId) {
                const panel = forgeEnSplitQuery("#" + panelId);
                if (panel) return panel;
            }
        }
    }

    const enKeys = ["lora", "checkpoint", "textual", "embed"];
    const tabitems = splitRoot.querySelectorAll(".tabitem, [role='tabpanel']");
    for (let i = 0; i < tabitems.length; i++) {
        const el = tabitems[i];
        if (el.classList.contains("extra-page")) continue;
        const id = el.id || "";
        if (enKeys.some(function (k) { return id.indexOf(k) >= 0; })) continue;
        return el;
    }

    for (let i = 0; i < outer.children.length; i++) {
        const child = outer.children[i];
        if (child.classList.contains("tab-nav")) continue;
        if (child.classList.contains("forge-en-resize-handle")) continue;
        if (child.classList.contains("extra-page")) continue;
        const id = child.id || "";
        if (enKeys.some(function (k) { return id.indexOf(k) >= 0; })) continue;
        return child;
    }

    return null;
}

function forgeEnSplitRemoveGenerationTab(outer, splitRoot, tabname, genPanel) {
    const generationId = tabname + "_generation";
    const navRoots = [splitRoot, outer];

    navRoots.forEach(function (root) {
        if (!root) return;
        root.querySelectorAll(
            'button[role="tab"], .tab-nav button, [role="tablist"] button',
        ).forEach(function (btn) {
            const controls = btn.getAttribute("aria-controls");
            const label = (btn.textContent || "").trim();
            if (controls === generationId || label === "Generation") {
                btn.remove();
            }
        });
    });

    const ghostPanels = [];
    navRoots.forEach(function (root) {
        if (!root) return;
        root.querySelectorAll(
            "#" + generationId + ', [id="' + generationId + '"]',
        ).forEach(function (el) {
            ghostPanels.push(el);
        });
    });

    ghostPanels.forEach(function (el) {
        if (el === genPanel || genPanel.contains(el)) return;
        el.classList.add("forge-en-ghost-generation");
        el.classList.remove("forge-en-right-panel");
    });
}

function forgeEnSplitMarkPanels(splitRoot, tabname, genPanel) {
    splitRoot
        .querySelectorAll(".tabitem, .extra-page, [role='tabpanel']")
        .forEach(function (el) {
            if (el === genPanel) return;
            if (el.contains(genPanel)) return;
            el.classList.add("forge-en-right-panel");
        });
}

function forgeEnSplitEnsureResizeHandle(splitRoot, tabname) {
    let handle = splitRoot.querySelector(":scope > .forge-en-resize-handle");
    if (!handle) {
        handle = document.createElement("div");
        handle.className = "forge-en-resize-handle";
        handle.title =
            "Drag to resize Extra Networks panel (double-click to reset)";
        splitRoot.appendChild(handle);
    }
    if (handle.dataset.forgeEnResizeBound === tabname) return;
    handle.dataset.forgeEnResizeBound = tabname;

    handle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX;
        const startWidth =
            parseInt(
                getComputedStyle(splitRoot).getPropertyValue(
                    "--forge-en-right-width",
                ),
                10,
            ) || forgeEnSplitDefaultWidth();
        handle.setPointerCapture(e.pointerId);

        function onMove(ev) {
            forgeEnSplitSetRightWidth(
                splitRoot,
                tabname,
                startWidth + (startX - ev.clientX),
            );
        }

        function onUp() {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            try {
                handle.releasePointerCapture(e.pointerId);
            } catch (_) {
                /* ignore */
            }
        }

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    });

    handle.addEventListener("dblclick", function () {
        forgeEnSplitSetRightWidth(
            splitRoot,
            tabname,
            forgeEnSplitDefaultWidth(),
        );
    });
}

function forgeEnSplitDefaultTabSuffix() {
    const slug =
        typeof opts !== "undefined" && opts.forge_en_split_default_extra_tab
            ? String(opts.forge_en_split_default_extra_tab).trim()
            : "output_browser";
    return "_" + slug.replace(/\s+/g, "_");
}

function forgeEnSplitSelectDefaultTab(splitRoot, tabname) {
    const preferredId = tabname + forgeEnSplitDefaultTabSuffix();
    let btn = splitRoot.querySelector(
        '.tab-nav button[aria-controls="' + preferredId + '"]',
    );
    if (!btn) {
        btn = splitRoot.querySelector(
            '.tab-nav button[aria-controls]:not([aria-controls="' +
                tabname +
                '_generation"])',
        );
    }
    if (btn && !btn.classList.contains("selected")) btn.click();
}

const FORGE_EN_KNOWN_TAB_META = {
    output_browser: { allowPrompt: false, allowNegative: false },
    wildcard: { allowPrompt: false, allowNegative: false },
    lora: { allowPrompt: true, allowNegative: false },
    checkpoints: { allowPrompt: true, allowNegative: false },
    textual_inversion: { allowPrompt: true, allowNegative: false },
};

function forgeEnSplitGetColumnCount() {
    if (typeof opts === "undefined" || opts.forge_en_column_count == null) {
        return 1;
    }
    const n = parseInt(opts.forge_en_column_count, 10);
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(3, n));
}

function forgeEnSplitParseTabSlugs(text) {
    if (!text || !String(text).trim()) return [];
    return String(text)
        .split(",")
        .map(function (s) {
            return s.trim().toLowerCase().replace(/\s+/g, "_");
        })
        .filter(Boolean);
}

function forgeEnSplitGetColumnConfig() {
    const count = forgeEnSplitGetColumnCount();
    const columns = [];
    for (let i = 1; i <= count; i++) {
        const tabsOpt = opts && opts["forge_en_column_" + i + "_tabs"];
        const defaultOpt = opts && opts["forge_en_column_" + i + "_default_tab"];
        columns.push({
            index: i,
            tabs: forgeEnSplitParseTabSlugs(tabsOpt),
            defaultTab: defaultOpt
                ? String(defaultOpt).trim().replace(/\s+/g, "_")
                : "",
        });
    }
    return columns;
}

function forgeEnSplitDiscoverEnSlugs(splitRoot, tabname) {
    const slugs = [];
    splitRoot
        .querySelectorAll('.extra-page[id^="' + tabname + '_"]')
        .forEach(function (el) {
            if (el.id) slugs.push(el.id.slice(tabname.length + 1));
        });
    return slugs;
}

function forgeEnSplitMatchSlug(requested, available) {
    const norm = requested.toLowerCase().replace(/\s+/g, "_");
    if (available.indexOf(norm) >= 0) return norm;
    for (let i = 0; i < available.length; i++) {
        const s = available[i];
        if (s.indexOf(norm) >= 0 || norm.indexOf(s) >= 0) return s;
    }
    return null;
}

function forgeEnSplitColumnDefaultWidth() {
    if (
        typeof opts !== "undefined" &&
        opts.forge_en_column_default_width != null
    ) {
        return Math.max(
            FORGE_EN_MIN_RIGHT_WIDTH,
            Math.min(
                FORGE_EN_MAX_RIGHT_WIDTH,
                opts.forge_en_column_default_width,
            ),
        );
    }
    return FORGE_EN_DEFAULT_RIGHT_WIDTH;
}

function forgeEnSplitGetStoredColumnWidth(tabname, colIndex) {
    const raw = localStorage.getItem(
        FORGE_EN_WIDTH_STORAGE_PREFIX + tabname + "_col" + colIndex,
    );
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(
        FORGE_EN_MIN_RIGHT_WIDTH,
        Math.min(FORGE_EN_MAX_RIGHT_WIDTH, n),
    );
}

function forgeEnSplitSetColumnWidth(splitRoot, tabname, colIndex, widthPx) {
    const w = Math.max(
        FORGE_EN_MIN_RIGHT_WIDTH,
        Math.min(FORGE_EN_MAX_RIGHT_WIDTH, Math.round(widthPx)),
    );
    splitRoot.style.setProperty(
        "--forge-en-col" + colIndex + "-width",
        w + "px",
    );
    if (
        typeof opts === "undefined" ||
        opts.forge_en_split_remember_width !== false
    ) {
        localStorage.setItem(
            FORGE_EN_WIDTH_STORAGE_PREFIX + tabname + "_col" + colIndex,
            String(w),
        );
    }
    forgeEnSplitUpdateColumnsTotalWidth(splitRoot);
}

function forgeEnSplitGetColumnWidthPx(splitRoot, colIndex) {
    const raw = getComputedStyle(splitRoot).getPropertyValue(
        "--forge-en-col" + colIndex + "-width",
    );
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return forgeEnSplitColumnDefaultWidth();
    return Math.max(
        FORGE_EN_MIN_RIGHT_WIDTH,
        Math.min(FORGE_EN_MAX_RIGHT_WIDTH, n),
    );
}

function forgeEnSplitUpdateColumnsTotalWidth(splitRoot) {
    if (!splitRoot || !splitRoot.classList.contains("forge-en-multi-column")) {
        return;
    }
    const columnCount = forgeEnSplitGetColumnCount();
    let total = 0;
    for (let i = 1; i <= columnCount; i++) {
        total += forgeEnSplitGetColumnWidthPx(splitRoot, i);
    }
    if (columnCount > 1) {
        total += (columnCount - 1) * 6;
    }
    splitRoot.style.setProperty(
        "--forge-en-columns-total-width",
        total + "px",
    );
}

function forgeEnSplitInstallMultiColumnFilterHooks() {
    if (forgeEnShowControlsHookInstalled) return;
    forgeEnShowControlsHookInstalled = true;
    if (typeof extraNetworksShowControlsForPage !== "function") return;
    const origShow = extraNetworksShowControlsForPage;
    extraNetworksShowControlsForPage = function (tabname, tabname_full) {
        if (forgeEnSplitGetColumnCount() >= 2) {
            const roots = forgeEnSplitGetSplitRoots(tabname);
            if (
                roots &&
                roots.splitRoot.classList.contains("forge-en-multi-column")
            ) {
                forgeEnSplitSyncMultiColumnControlsVisibility(tabname);
                return;
            }
        }
        origShow(tabname, tabname_full);
    };
}

function forgeEnSplitSyncMultiColumnControlsVisibility(tabname) {
    const roots = forgeEnSplitGetSplitRoots(tabname);
    if (!roots) return;
    roots.splitRoot.querySelectorAll(".forge-en-column").forEach(function (col) {
        const slug = col.dataset.forgeEnActiveSlug;
        if (!slug) return;
        const wantId = tabname + "_" + slug + "_controls";
        const target = col.querySelector(".forge-en-column-controls");
        if (!target) return;
        target.querySelectorAll(":scope > .extra-network-control").forEach(
            function (el) {
                el.style.display = el.id === wantId ? "" : "none";
            },
        );
    });
    gradioApp()
        .querySelectorAll(
            "#" +
                tabname +
                "_extra_tabs .tab-nav .extra-networks-controls-div > div",
        )
        .forEach(function (el) {
            el.style.display = "none";
        });
}

function forgeEnSplitRunScopedCardFilter(tabname, tabnameFull, force, searchEl) {
    const search =
        searchEl ||
        gradioApp().querySelector("#" + tabnameFull + "_extra_search");
    if (!search) return;

    const columnEl = search.closest(".forge-en-column");
    const searchTerm = search.value.toLowerCase();
    let uiresult = 3;
    const radioUI = gradioApp().querySelector("#forge_ui_preset");
    if (radioUI) {
        const radioButtons = radioUI.getElementsByTagName("input");
        for (let i = 0; i < radioButtons.length; i++) {
            if (radioButtons[i].checked) uiresult = i;
        }
    }

    let cardNodes;
    if (columnEl) {
        cardNodes = columnEl.querySelectorAll(
            ".forge-en-column-body div.card",
        );
    } else {
        cardNodes = gradioApp().querySelectorAll(
            "#" + tabnameFull + " div.card",
        );
    }

    cardNodes.forEach(function (elem) {
        const searchOnly = elem.querySelector(".search_only");
        const text = Array.prototype.map
            .call(
                elem.querySelectorAll(".search_terms, .description"),
                function (t) {
                    return t.textContent.toLowerCase();
                },
            )
            .join(" ");

        let visible = true;
        if (searchOnly && searchTerm.length < 4) visible = false;

        searchTerm.split(" ").forEach(function (partial) {
            if (partial && text.indexOf(partial) === -1) visible = false;
        });

        const sdversion = elem.getAttribute("data-sort-sdversion");
        if (sdversion == null);
        else if (sdversion == "SdVersion.Unknown");
        else if (typeof opts !== "undefined" && opts.lora_filter_disabled);
        else if (uiresult == 3);
        else if (uiresult == 0) {
            if (sdversion != "SdVersion.SD1") visible = false;
        } else if (uiresult == 1) {
            if (sdversion != "SdVersion.SDXL") visible = false;
        } else if (uiresult == 2) {
            if (sdversion != "SdVersion.Flux") visible = false;
        }

        if (visible) {
            elem.classList.remove("hidden");
        } else {
            elem.classList.add("hidden");
        }
    });

    if (
        typeof extraNetworksApplySort !== "undefined" &&
        extraNetworksApplySort[tabnameFull]
    ) {
        extraNetworksApplySort[tabnameFull](force);
    }

    if (
        tabnameFull.indexOf("_output_browser") >= 0 &&
        typeof forgeEnOutputBrowserSyncSelectionToFilter === "function"
    ) {
        let container = null;
        if (columnEl) {
            container = columnEl.querySelector('[id$="_output_browser_cards"]');
        }
        if (!container) {
            container = gradioApp().querySelector(
                "#" +
                    (tabname === "txt2img"
                        ? "txt2img_output_browser_cards"
                        : "img2img_output_browser_cards"),
            );
        }
        if (container) {
            forgeEnOutputBrowserSyncSelectionToFilter(container);
        }
    }
}

function forgeEnSplitRewireSearchInput(tabname, slug) {
    const tabnameFull = tabname + "_" + slug;
    let search = gradioApp().querySelector(
        "#" + tabnameFull + "_extra_search",
    );
    if (!search) return null;

    if (search.dataset.forgeEnMultiColFilter !== "2") {
        const value = search.value;
        const fresh = search.cloneNode(true);
        fresh.value = value;
        delete fresh.dataset.forgeEnFilterSync;
        search.parentNode.replaceChild(fresh, search);
        search = fresh;
        search.dataset.forgeEnMultiColFilter = "2";
    }

    if (search.dataset.forgeEnFilterBound !== "1") {
        search.dataset.forgeEnFilterBound = "1";
        search.addEventListener("input", function () {
            forgeEnSplitRunScopedCardFilter(
                tabname,
                tabnameFull,
                false,
                search,
            );
        });
    }
    return search;
}

function forgeEnSplitEnsureSearchFilterBinding(tabname, slug) {
    forgeEnSplitRewireSearchInput(tabname, slug);
}

function forgeEnSplitPatchMultiColumnSearchFilters(tabname) {
    if (forgeEnSplitGetColumnCount() < 2) return;
    const roots = forgeEnSplitGetSplitRoots(tabname);
    if (!roots || !roots.splitRoot.classList.contains("forge-en-multi-column")) {
        return;
    }
    forgeEnSplitDiscoverEnSlugs(roots.splitRoot, tabname).forEach(function (slug) {
        const tabnameFull = tabname + "_" + slug;
        forgeEnSplitRewireSearchInput(tabname, slug);
        if (typeof extraNetworksApplyFilter !== "undefined") {
            extraNetworksApplyFilter[tabnameFull] = function (force) {
                const search = gradioApp().querySelector(
                    "#" + tabnameFull + "_extra_search",
                );
                forgeEnSplitRunScopedCardFilter(
                    tabname,
                    tabnameFull,
                    force,
                    search || undefined,
                );
            };
        }
    });
}

function forgeEnSplitGetTabMeta(slug) {
    const key = slug.toLowerCase().replace(/\s+/g, "_");
    if (FORGE_EN_KNOWN_TAB_META[key]) {
        return FORGE_EN_KNOWN_TAB_META[key];
    }
    return { allowPrompt: true, allowNegative: false };
}

function forgeEnSplitFindOriginalTabNav(splitRoot, outer) {
    const candidates = [
        splitRoot && splitRoot.querySelector(":scope > div.tab-nav"),
        outer && outer.querySelector(":scope > div.tab-nav"),
    ];
    for (let i = 0; i < candidates.length; i++) {
        const nav = candidates[i];
        if (!nav) continue;
        if (nav.classList.contains("forge-en-column-nav")) continue;
        return nav;
    }
    return null;
}

function forgeEnSplitResolveColumnTabs(cfg, availableSlugs) {
    const resolvedTabs = [];
    cfg.tabs.forEach(function (requested) {
        const slug = forgeEnSplitMatchSlug(requested, availableSlugs);
        if (slug && resolvedTabs.indexOf(slug) < 0) {
            resolvedTabs.push(slug);
        }
    });
    return resolvedTabs;
}

function forgeEnSplitFindTabButton(tabNav, tabname, slug) {
    if (!tabNav) return null;
    const panelId = tabname + "_" + slug;
    let btn = tabNav.querySelector(
        'button[aria-controls="' + panelId + '"]',
    );
    if (btn) return btn;
    btn = tabNav.querySelector(
        'button[aria-controls$="' + slug + '"]',
    );
    if (btn) return btn;
    const buttons = tabNav.querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
        const candidate = buttons[i];
        const controls = candidate.getAttribute("aria-controls") || "";
        if (controls === panelId || controls.indexOf(slug) >= 0) {
            return candidate;
        }
    }
    return null;
}

function forgeEnSplitRestorePanelsToSplitRoot(splitRoot) {
    if (!splitRoot) return;
    splitRoot
        .querySelectorAll(".forge-en-column-body .extra-page")
        .forEach(function (panel) {
            splitRoot.appendChild(panel);
            panel.style.display = "";
            panel.classList.remove("hidden");
        });
}

function forgeEnSplitMultiColumnReady(splitRoot, tabname, tabNav, columnConfig) {
    if (!splitRoot || !tabNav) return false;
    if (tabNav.classList.contains("forge-en-column-nav")) return false;

    const availableSlugs = forgeEnSplitDiscoverEnSlugs(splitRoot, tabname);
    if (availableSlugs.length < 2) return false;

    for (let i = 0; i < columnConfig.length; i++) {
        const resolvedTabs = forgeEnSplitResolveColumnTabs(
            columnConfig[i],
            availableSlugs,
        );
        for (let j = 0; j < resolvedTabs.length; j++) {
            if (
                !forgeEnSplitFindTabButton(
                    tabNav,
                    tabname,
                    resolvedTabs[j],
                )
            ) {
                return false;
            }
        }
    }
    return true;
}

function forgeEnSplitMultiColumnBuildSucceeded(
    splitRoot,
    tabname,
    columnConfig,
) {
    const columnsWrap = splitRoot.querySelector(":scope > .forge-en-columns");
    if (!columnsWrap) return false;

    if (forgeEnSplitDiscoverEnSlugs(splitRoot, tabname).length < 2) {
        return false;
    }

    let totalNavButtons = 0;
    for (let i = 0; i < columnConfig.length; i++) {
        const cfg = columnConfig[i];
        const resolvedTabs = forgeEnSplitResolveColumnTabs(
            cfg,
            forgeEnSplitDiscoverEnSlugs(splitRoot, tabname),
        );
        if (resolvedTabs.length === 0) continue;

        const columnEl = columnsWrap.querySelector(
            ':scope > .forge-en-column[data-col="' + cfg.index + '"]',
        );
        if (!columnEl) return false;

        const navButtons = columnEl.querySelectorAll(
            ".forge-en-column-nav button[data-forge-en-slug]",
        );
        if (navButtons.length === 0) return false;
        totalNavButtons += navButtons.length;
    }

    return totalNavButtons > 0;
}

function forgeEnSplitValidateMultiColumnDom(splitRoot, tabname, columnCount) {
    const columnsWrap = splitRoot.querySelector(":scope > .forge-en-columns");
    if (!columnsWrap) return false;

    const columns = columnsWrap.querySelectorAll(":scope > .forge-en-column");
    if (columns.length !== columnCount) return false;

    const columnConfig = forgeEnSplitGetColumnConfig();
    const availableSlugs = forgeEnSplitDiscoverEnSlugs(splitRoot, tabname);

    for (let i = 0; i < columns.length; i++) {
        const columnEl = columns[i];
        const cfg = columnConfig[i];
        if (!cfg) return false;

        const resolvedTabs = forgeEnSplitResolveColumnTabs(cfg, availableSlugs);
        const navButtons = columnEl.querySelectorAll(
            ".forge-en-column-nav button[data-forge-en-slug]",
        );
        if (resolvedTabs.length > 0 && navButtons.length === 0) {
            return false;
        }

        const activeSlug = columnEl.dataset.forgeEnActiveSlug;
        if (activeSlug) {
            const panel = forgeEnSplitQuery(
                "#" + tabname + "_" + activeSlug,
            );
            const body = columnEl.querySelector(".forge-en-column-body");
            if (!panel || !body || !body.contains(panel)) {
                return false;
            }
        }
    }

    const orphanPanels = splitRoot.querySelectorAll(
        ":scope > .forge-en-right-panel",
    );
    for (let i = 0; i < orphanPanels.length; i++) {
        const panel = orphanPanels[i];
        if (panel.style.display === "none") continue;
        if (panel.classList.contains("hidden")) continue;
        const cs = getComputedStyle(panel);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (!columnsWrap.contains(panel)) return false;
    }

    return true;
}

function forgeEnSplitTeardownMultiColumn(splitRoot) {
    forgeEnSplitRestorePanelsToSplitRoot(splitRoot);
    const columnsWrap = splitRoot.querySelector(":scope > .forge-en-columns");
    if (columnsWrap) columnsWrap.remove();
    splitRoot.querySelectorAll(".forge-en-col-resize-handle").forEach(function (el) {
        el.remove();
    });
    const tabNav =
        splitRoot.querySelector(":scope > .tab-nav") ||
        splitRoot.parentElement &&
            splitRoot.parentElement.querySelector(":scope > .tab-nav");
    if (tabNav && !tabNav.classList.contains("forge-en-column-nav")) {
        tabNav.classList.remove("forge-en-original-tab-nav-hidden");
    }
    splitRoot.classList.remove(
        "forge-en-multi-column",
        "forge-en-split-cols-2",
        "forge-en-split-cols-3",
    );
    delete splitRoot.dataset.forgeEnColumnsBuilt;
}

function forgeEnSplitRefreshColumnControls(splitRoot, tabname) {
    if (!splitRoot) return;
    splitRoot.querySelectorAll(".forge-en-column").forEach(function (col) {
        const slug = col.dataset.forgeEnActiveSlug;
        if (!slug) return;
        const controls = forgeEnSplitQuery(
            "#" + tabname + "_" + slug + "_controls",
        );
        const target = col.querySelector(".forge-en-column-controls");
        if (controls && target) {
            target.appendChild(controls);
            controls.style.display = "";
        }
    });
    if (splitRoot.classList.contains("forge-en-multi-column")) {
        forgeEnSplitSyncMultiColumnControlsVisibility(tabname);
        forgeEnSplitPatchMultiColumnSearchFilters(tabname);
    }
}

function forgeEnColumnSelectTab(columnEl, tabname, slug) {
    const tabnameFull = tabname + "_" + slug;
    const panel = forgeEnSplitQuery("#" + tabnameFull);
    if (!panel || !columnEl) return;

    const splitRoot = columnEl.closest(".forge-en-split");
    const body = columnEl.querySelector(".forge-en-column-body");
    if (!body || !splitRoot) return;

    splitRoot
        .querySelectorAll(
            '.forge-en-column-nav button[data-forge-en-slug="' + slug + '"]',
        )
        .forEach(function (btn) {
            btn.classList.add("selected");
        });

    columnEl
        .querySelectorAll(".forge-en-column-nav button")
        .forEach(function (btn) {
            if (btn.dataset.forgeEnSlug !== slug) {
                btn.classList.remove("selected");
            }
        });

    columnEl
        .querySelectorAll(".forge-en-column-body .forge-en-right-panel")
        .forEach(function (p) {
            if (p !== panel) p.style.display = "none";
        });

    panel.style.display = "";
    panel.classList.remove("hidden");
    body.appendChild(panel);

    const controls = forgeEnSplitQuery("#" + tabnameFull + "_controls");
    const controlsTarget = columnEl.querySelector(
        ".forge-en-column-controls",
    );
    if (controls && controlsTarget) {
        controlsTarget.appendChild(controls);
        controls.style.display = "";
    }

    columnEl.dataset.forgeEnActiveSlug = slug;

    const meta = forgeEnSplitGetTabMeta(slug);
    if (typeof extraNetworksTabSelected === "function") {
        extraNetworksTabSelected(
            tabname,
            tabnameFull + "_prompts",
            meta.allowPrompt,
            meta.allowNegative,
            tabnameFull,
        );
    }
    if (typeof applyExtraNetworkFilter === "function") {
        applyExtraNetworkFilter(tabnameFull);
    }
    forgeEnSplitRefreshColumnControls(splitRoot, tabname);
    if (splitRoot.classList.contains("forge-en-multi-column")) {
        const search = columnEl.querySelector(
            "#" + tabnameFull + "_extra_search",
        );
        forgeEnSplitRunScopedCardFilter(
            tabname,
            tabnameFull,
            true,
            search || undefined,
        );
    }
}

function forgeEnSplitEnsureColumnResizeHandle(
    splitRoot,
    tabname,
    colIndex,
    handleEl,
    pairedColIndex,
) {
    const boundKey =
        tabname + "_" + colIndex + (pairedColIndex ? "_p" + pairedColIndex : "");
    if (handleEl.dataset.forgeEnColResizeBound === boundKey) {
        return handleEl;
    }
    if (
        handleEl.dataset.forgeEnColResizeBound ||
        handleEl.dataset.forgeEnResizeBound
    ) {
        const fresh = handleEl.cloneNode(false);
        handleEl.replaceWith(fresh);
        handleEl = fresh;
    }
    handleEl.dataset.forgeEnColResizeBound = boundKey;
    handleEl.dataset.forgeEnCol = String(colIndex);
    handleEl.title =
        "Drag to resize column " +
        colIndex +
        (pairedColIndex ? " / " + pairedColIndex : "") +
        " (double-click to reset)";

    handleEl.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = forgeEnSplitGetColumnWidthPx(splitRoot, colIndex);
        const pairedStartWidth =
            pairedColIndex != null
                ? forgeEnSplitGetColumnWidthPx(splitRoot, pairedColIndex)
                : null;
        handleEl.setPointerCapture(e.pointerId);

        function onMove(ev) {
            const delta = startX - ev.clientX;
            if (pairedColIndex != null) {
                forgeEnSplitSetColumnWidth(
                    splitRoot,
                    tabname,
                    pairedColIndex,
                    pairedStartWidth - delta,
                );
                forgeEnSplitSetColumnWidth(
                    splitRoot,
                    tabname,
                    colIndex,
                    startWidth + delta,
                );
                return;
            }
            forgeEnSplitSetColumnWidth(
                splitRoot,
                tabname,
                colIndex,
                startWidth + delta,
            );
        }

        function onUp() {
            handleEl.removeEventListener("pointermove", onMove);
            handleEl.removeEventListener("pointerup", onUp);
            handleEl.removeEventListener("pointercancel", onUp);
            try {
                handleEl.releasePointerCapture(e.pointerId);
            } catch (_) {
                /* ignore */
            }
        }

        handleEl.addEventListener("pointermove", onMove);
        handleEl.addEventListener("pointerup", onUp);
        handleEl.addEventListener("pointercancel", onUp);
    });

    handleEl.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        forgeEnSplitSetColumnWidth(
            splitRoot,
            tabname,
            colIndex,
            forgeEnSplitColumnDefaultWidth(),
        );
    });
    return handleEl;
}

function forgeEnSplitEnsureMultiColumnResizeHandles(splitRoot, tabname) {
    let outerHandle = splitRoot.querySelector(
        ":scope > .forge-en-resize-handle:not(.forge-en-col-resize-handle)",
    );
    if (!outerHandle) {
        outerHandle = document.createElement("div");
        outerHandle.className = "forge-en-resize-handle";
        outerHandle.title =
            "Drag to resize column 1 (double-click to reset)";
        splitRoot.insertBefore(
            outerHandle,
            splitRoot.querySelector(":scope > .forge-en-columns"),
        );
    }
    outerHandle.dataset.forgeEnCol = "1";
    if (outerHandle.dataset.forgeEnResizeBound) {
        delete outerHandle.dataset.forgeEnResizeBound;
    }
    forgeEnSplitEnsureColumnResizeHandle(
        splitRoot,
        tabname,
        1,
        outerHandle,
    );
}

function forgeEnSplitRollbackMultiColumn(splitRoot, outer, tabname) {
    forgeEnSplitTeardownMultiColumn(splitRoot);
    const tabNav = forgeEnSplitFindOriginalTabNav(splitRoot, outer);
    if (tabNav) {
        tabNav.classList.remove("forge-en-original-tab-nav-hidden");
    }
}

function forgeEnSplitApplyMultiColumnLayout(splitRoot, outer, tabname, tabNav) {
    const columnCount = forgeEnSplitGetColumnCount();
    if (columnCount < 2) return false;

    if (!tabNav) {
        tabNav = forgeEnSplitFindOriginalTabNav(splitRoot, outer);
    }

    const columnConfig = forgeEnSplitGetColumnConfig();
    const ready = forgeEnSplitMultiColumnReady(
        splitRoot,
        tabname,
        tabNav,
        columnConfig,
    );
    if (!ready) {
        delete splitRoot.dataset.forgeEnColumnsBuilt;
        return false;
    }

    if (
        splitRoot.dataset.forgeEnColumnsBuilt === String(columnCount) &&
        forgeEnSplitValidateMultiColumnDom(splitRoot, tabname, columnCount)
    ) {
        for (let i = 1; i <= columnCount; i++) {
            const stored = forgeEnSplitGetStoredColumnWidth(tabname, i);
            forgeEnSplitSetColumnWidth(
                splitRoot,
                tabname,
                i,
                stored !== null ? stored : forgeEnSplitColumnDefaultWidth(),
            );
        }
        forgeEnSplitEnsureMultiColumnResizeHandles(splitRoot, tabname);
        forgeEnSplitRefreshColumnControls(splitRoot, tabname);
        return true;
    }

    delete splitRoot.dataset.forgeEnColumnsBuilt;
    forgeEnSplitTeardownMultiColumn(splitRoot);

    if (
        !forgeEnSplitMultiColumnReady(
            splitRoot,
            tabname,
            tabNav,
            columnConfig,
        )
    ) {
        return false;
    }

    splitRoot.classList.add("forge-en-multi-column");
    splitRoot.classList.add("forge-en-split-cols-" + columnCount);

    if (tabNav) {
        tabNav.classList.add("forge-en-original-tab-nav-hidden");
    }

    const availableSlugs = forgeEnSplitDiscoverEnSlugs(splitRoot, tabname);
    if (availableSlugs.length < 2) {
        forgeEnSplitRollbackMultiColumn(splitRoot, outer, tabname);
        return false;
    }
    const assignedSlugs = new Set();
    const defaultTabSelections = [];

    const columnsWrap = document.createElement("div");
    columnsWrap.className = "forge-en-columns";

    for (let c = 0; c < columnCount; c++) {
        const cfg = columnConfig[c];
        const colIndex = cfg.index;
        const resolvedTabs = forgeEnSplitResolveColumnTabs(cfg, availableSlugs);

        const stored = forgeEnSplitGetStoredColumnWidth(tabname, colIndex);
        forgeEnSplitSetColumnWidth(
            splitRoot,
            tabname,
            colIndex,
            stored !== null ? stored : forgeEnSplitColumnDefaultWidth(),
        );

        const columnEl = document.createElement("div");
        columnEl.className = "forge-en-column";
        columnEl.dataset.col = String(colIndex);

        const colNav = document.createElement("div");
        colNav.className = "forge-en-column-nav tab-nav";
        colNav.setAttribute("role", "tablist");

        const colControls = document.createElement("div");
        colControls.className =
            "forge-en-column-controls extra-networks-controls-div";

        const colBody = document.createElement("div");
        colBody.className = "forge-en-column-body";

        resolvedTabs.forEach(function (slug) {
            assignedSlugs.add(slug);
            const origBtn = forgeEnSplitFindTabButton(tabNav, tabname, slug);
            if (!origBtn) return;

            const btn = origBtn.cloneNode(true);
            btn.classList.remove("selected");
            btn.dataset.forgeEnSlug = slug;
            btn.removeAttribute("id");
            btn.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                forgeEnColumnSelectTab(columnEl, tabname, slug);
            });
            colNav.appendChild(btn);
        });

        columnEl.appendChild(colNav);
        columnEl.appendChild(colControls);
        columnEl.appendChild(colBody);
        columnsWrap.appendChild(columnEl);

        if (c < columnCount - 1) {
            const innerHandle = document.createElement("div");
            innerHandle.className =
                "forge-en-col-resize-handle forge-en-resize-handle";
            innerHandle.dataset.forgeEnCol = String(colIndex + 1);
            forgeEnSplitEnsureColumnResizeHandle(
                splitRoot,
                tabname,
                colIndex + 1,
                innerHandle,
                colIndex,
            );
            columnsWrap.appendChild(innerHandle);
        }

        let defaultSlug = cfg.defaultTab
            ? forgeEnSplitMatchSlug(cfg.defaultTab, resolvedTabs)
            : null;
        if (!defaultSlug && resolvedTabs.length) {
            defaultSlug = resolvedTabs[0];
        }
        if (defaultSlug) {
            defaultTabSelections.push({
                columnEl: columnEl,
                slug: defaultSlug,
            });
        }
    }

    splitRoot.appendChild(columnsWrap);

    defaultTabSelections.forEach(function (sel) {
        forgeEnColumnSelectTab(sel.columnEl, tabname, sel.slug);
    });

    availableSlugs.forEach(function (slug) {
        if (assignedSlugs.has(slug)) return;
        const panel = forgeEnSplitQuery("#" + tabname + "_" + slug);
        if (panel) panel.style.display = "none";
    });

    if (
        !forgeEnSplitMultiColumnBuildSucceeded(
            splitRoot,
            tabname,
            columnConfig,
        )
    ) {
        forgeEnSplitRollbackMultiColumn(splitRoot, outer, tabname);
        return false;
    }

    forgeEnSplitEnsureMultiColumnResizeHandles(splitRoot, tabname);
    splitRoot.dataset.forgeEnColumnsBuilt = String(columnCount);
    forgeEnSplitRefreshColumnControls(splitRoot, tabname);
    return true;
}

const forgeEnSplitApplied = { txt2img: false, img2img: false };

function forgeEnSplitIsMultiColumnStable(tabname) {
    const columnCount = forgeEnSplitGetColumnCount();
    if (columnCount < 2) return false;
    const roots = forgeEnSplitGetSplitRoots(tabname);
    if (!roots || !roots.splitRoot.classList.contains("forge-en-split")) {
        return false;
    }
    const splitRoot = roots.splitRoot;
    return (
        splitRoot.dataset.forgeEnColumnsBuilt === String(columnCount) &&
        forgeEnSplitValidateMultiColumnDom(splitRoot, tabname, columnCount)
    );
}

function forgeEnSplitIsLayoutStable() {
    return FORGE_EN_TABNAMES.every(function (tabname) {
        if (!forgeEnSplitApplied[tabname]) return false;
        const roots = forgeEnSplitGetSplitRoots(tabname);
        if (!roots || !roots.outer.classList.contains("forge-en-split-outer")) {
            return false;
        }
        if (forgeEnSplitGetColumnCount() >= 2) {
            return forgeEnSplitIsMultiColumnStable(tabname);
        }
        return roots.splitRoot.classList.contains("forge-en-split");
    });
}

function forgeEnSplitApplyLayout(tabname) {
    if (!forgeEnSplitIsEnabled()) return;

    const roots = forgeEnSplitGetSplitRoots(tabname);
    if (!roots) return;

    const outer = roots.outer;
    const splitRoot = roots.splitRoot;
    const columnCount = forgeEnSplitGetColumnCount();

    const genPanel = forgeEnSplitFindGenPanel(outer, splitRoot, tabname);
    if (!genPanel) return;

    const tabNav = forgeEnSplitFindOriginalTabNav(splitRoot, outer);

    if (
        forgeEnSplitApplied[tabname] &&
        outer.classList.contains("forge-en-split-outer")
    ) {
        if (
            columnCount >= 2 &&
            forgeEnSplitIsMultiColumnStable(tabname)
        ) {
            return;
        }
        forgeEnSplitRemoveGenerationTab(outer, splitRoot, tabname, genPanel);
        forgeEnSplitApplyPaneOffsets(splitRoot);
        if (columnCount >= 2) {
            forgeEnSplitApplyMultiColumnLayout(
                splitRoot,
                outer,
                tabname,
                tabNav,
            );
        }
        return;
    }

    outer.classList.add("forge-en-split-outer");
    splitRoot.classList.add("forge-en-split");
    genPanel.classList.add("forge-en-left");
    genPanel.classList.remove("forge-en-right-panel", "forge-en-ghost-generation");
    forgeEnSplitMarkPanels(splitRoot, tabname, genPanel);
    forgeEnSplitRemoveGenerationTab(outer, splitRoot, tabname, genPanel);
    forgeEnSplitApplyPaneOffsets(splitRoot);

    if (columnCount >= 2) {
        forgeEnSplitApplyMultiColumnLayout(
            splitRoot,
            outer,
            tabname,
            tabNav,
        );
    } else {
        forgeEnSplitTeardownMultiColumn(splitRoot);
        const stored = forgeEnSplitGetStoredWidth(tabname);
        forgeEnSplitSetRightWidth(
            splitRoot,
            tabname,
            stored !== null ? stored : forgeEnSplitDefaultWidth(),
        );
        forgeEnSplitEnsureResizeHandle(splitRoot, tabname);
    }

    forgeEnSplitApplied[tabname] = true;

    if (outer.dataset.forgeEnDefaultTabDone !== "1") {
        if (typeof extraNetworksUnrelatedTabSelected === "function") {
            extraNetworksUnrelatedTabSelected(tabname);
        }
        if (columnCount < 2 && tabNav) {
            forgeEnSplitSelectDefaultTab(splitRoot, tabname);
        }
        outer.dataset.forgeEnDefaultTabDone = "1";
    }
}

function forgeEnSplitWatchExtraTabs() {
    if (forgeEnSplitMutationWatchAttached) return;
    forgeEnSplitMutationWatchAttached = true;

    let mutationPending = null;
    const obs = new MutationObserver(function () {
        if (forgeEnSplitIsLayoutStable()) return;
        if (mutationPending !== null) return;
        mutationPending = requestAnimationFrame(function () {
            mutationPending = null;
            if (forgeEnSplitIsLayoutStable()) return;
            const ready = FORGE_EN_TABNAMES.some(function (tabname) {
                const outer = forgeEnSplitQuery("#" + tabname + "_extra_tabs");
                if (!outer) return false;
                return !!(
                    forgeEnSplitQuery("#" + tabname + "_settings") ||
                    outer.querySelector(".tab-nav") ||
                    outer.querySelector(":scope > div.tab-nav")
                );
            });
            if (ready) initForgeEnSplit();
        });
    });
    obs.observe(gradioApp(), { childList: true, subtree: true });
}

function forgeEnSplitRebuildMultiColumns(force) {
    if (forgeEnSplitGetColumnCount() < 2) return;
    const columnCount = forgeEnSplitGetColumnCount();
    FORGE_EN_TABNAMES.forEach(function (tabname) {
        const roots = forgeEnSplitGetSplitRoots(tabname);
        if (!roots || !roots.splitRoot.classList.contains("forge-en-split")) {
            return;
        }
        const splitRoot = roots.splitRoot;
        const valid =
            !force &&
            splitRoot.dataset.forgeEnColumnsBuilt === String(columnCount) &&
            forgeEnSplitValidateMultiColumnDom(
                splitRoot,
                tabname,
                columnCount,
            );
        if (valid) {
            for (let i = 1; i <= columnCount; i++) {
                const stored = forgeEnSplitGetStoredColumnWidth(tabname, i);
                forgeEnSplitSetColumnWidth(
                    splitRoot,
                    tabname,
                    i,
                    stored !== null
                        ? stored
                        : forgeEnSplitColumnDefaultWidth(),
                );
            }
            forgeEnSplitEnsureMultiColumnResizeHandles(splitRoot, tabname);
            forgeEnSplitRefreshColumnControls(splitRoot, tabname);
            return;
        }
        const tabNav = forgeEnSplitFindOriginalTabNav(
            roots.splitRoot,
            roots.outer,
        );
        forgeEnSplitApplyMultiColumnLayout(
            roots.splitRoot,
            roots.outer,
            tabname,
            tabNav,
        );
    });
}

function forgeEnSplitOnUiRefresh() {
    if (!forgeEnSplitIsEnabled()) return;
    if (forgeEnSplitUiRefreshPending !== null) return;
    forgeEnSplitUiRefreshPending = requestAnimationFrame(function () {
        forgeEnSplitUiRefreshPending = null;
        if (forgeEnSplitGetColumnCount() >= 2) {
            const needsWork = !forgeEnSplitIsLayoutStable();
            if (needsWork) {
                FORGE_EN_TABNAMES.forEach(forgeEnSplitApplyLayout);
                forgeEnSplitRebuildMultiColumns(false);
            }
            FORGE_EN_TABNAMES.forEach(forgeEnSplitPatchMultiColumnSearchFilters);
            return;
        }
        initForgeEnSplit();
    });
}

function initForgeEnSplit() {
    if (!forgeEnSplitIsEnabled()) return;
    FORGE_EN_TABNAMES.forEach(forgeEnSplitApplyLayout);
}

function forgeEnSplitInitAfterExtraNetworksReady() {
    if (!forgeEnSplitIsEnabled()) return;
    forgeEnSplitInstallMultiColumnFilterHooks();
    FORGE_EN_TABNAMES.forEach(forgeEnSplitApplyLayout);
    forgeEnSplitRebuildMultiColumns(true);
    FORGE_EN_TABNAMES.forEach(forgeEnSplitPatchMultiColumnSearchFilters);
}

function forgeEnSplitScheduleRetries() {
    function retryOnce() {
        if (forgeEnSplitIsLayoutStable()) return;
        initForgeEnSplit();
        forgeEnSplitRebuildMultiColumns(true);
    }
    setTimeout(retryOnce, 250);
    setTimeout(retryOnce, 800);
    setTimeout(retryOnce, 2000);
}

function forgeEnSplitRegisterCallbacks() {
    forgeEnSplitInstallMultiColumnFilterHooks();
    if (
        typeof uiAfterScriptsCallbacks !== "undefined" &&
        !forgeEnAfterScriptsCallbackRegistered
    ) {
        forgeEnAfterScriptsCallbackRegistered = true;
        uiAfterScriptsCallbacks.push(forgeEnSplitInitAfterExtraNetworksReady);
    }

    if (forgeEnSplitGetColumnCount() < 2) {
        initForgeEnSplit();
    }
    forgeEnSplitScheduleRetries();

    if (!forgeEnResizeListenersAttached) {
        forgeEnResizeListenersAttached = true;
        onUiUpdate(forgeEnSplitOnUiRefresh);
        if (typeof onUiTabChange === "function") {
            onUiTabChange(forgeEnSplitOnUiRefresh);
        }
    }
}

onUiLoaded(function () {
    forgeEnSplitRegisterCallbacks();
    if (!forgeEnSplitMutationWatchAttached) {
        forgeEnSplitWatchExtraTabs();
    }
});

try {
    if (gradioApp().querySelector("#txt2img_prompt")) {
        forgeEnSplitRegisterCallbacks();
        if (!forgeEnSplitMutationWatchAttached) {
            forgeEnSplitWatchExtraTabs();
        }
    }
} catch (_) {
    /* gradio not ready */
}
