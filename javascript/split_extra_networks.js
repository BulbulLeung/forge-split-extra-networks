/**
 * forge-split-extra-networks: Generation left, Extra Networks right.
 */
"use strict";

const FORGE_EN_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_DEFAULT_RIGHT_WIDTH = 520;
const FORGE_EN_MIN_RIGHT_WIDTH = 280;
const FORGE_EN_MAX_RIGHT_WIDTH = 1200;
const FORGE_EN_WIDTH_STORAGE_PREFIX = "forge_en_split_width_";
const FORGE_EN_DEFAULT_TAB_SUFFIX_FALLBACK = "_output_browser";

let forgeEnResizeListenersAttached = false;

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

const forgeEnSplitApplied = { txt2img: false, img2img: false };

function forgeEnSplitApplyLayout(tabname) {
    if (!forgeEnSplitIsEnabled()) return;

    const roots = forgeEnSplitGetSplitRoots(tabname);
    if (!roots) return;

    const outer = roots.outer;
    const splitRoot = roots.splitRoot;

    const genPanel = forgeEnSplitFindGenPanel(outer, splitRoot, tabname);
    if (!genPanel) return;

    if (
        forgeEnSplitApplied[tabname] &&
        outer.classList.contains("forge-en-split-outer")
    ) {
        forgeEnSplitRemoveGenerationTab(outer, splitRoot, tabname, genPanel);
        return;
    }

    const tabNav =
        outer.querySelector(":scope > div.tab-nav") ||
        splitRoot.querySelector(":scope > div.tab-nav") ||
        splitRoot.querySelector(".tab-nav") ||
        outer.querySelector("[role='tablist']");

    outer.classList.add("forge-en-split-outer");
    splitRoot.classList.add("forge-en-split");
    genPanel.classList.add("forge-en-left");
    genPanel.classList.remove("forge-en-right-panel", "forge-en-ghost-generation");
    forgeEnSplitMarkPanels(splitRoot, tabname, genPanel);
    forgeEnSplitRemoveGenerationTab(outer, splitRoot, tabname, genPanel);

    const stored = forgeEnSplitGetStoredWidth(tabname);
    forgeEnSplitSetRightWidth(
        splitRoot,
        tabname,
        stored !== null ? stored : forgeEnSplitDefaultWidth(),
    );
    forgeEnSplitEnsureResizeHandle(splitRoot, tabname);

    forgeEnSplitApplied[tabname] = true;

    if (outer.dataset.forgeEnDefaultTabDone !== "1") {
        if (typeof extraNetworksUnrelatedTabSelected === "function") {
            extraNetworksUnrelatedTabSelected(tabname);
        }
        if (tabNav) {
            forgeEnSplitSelectDefaultTab(splitRoot, tabname);
        }
        outer.dataset.forgeEnDefaultTabDone = "1";
    }
}

function forgeEnSplitWatchExtraTabs() {
    const obs = new MutationObserver(function () {
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
    obs.observe(gradioApp(), { childList: true, subtree: true });
}

function initForgeEnSplit() {
    if (!forgeEnSplitIsEnabled()) return;
    FORGE_EN_TABNAMES.forEach(forgeEnSplitApplyLayout);
}

function forgeEnSplitScheduleRetries() {
    setTimeout(initForgeEnSplit, 250);
    setTimeout(initForgeEnSplit, 800);
    setTimeout(initForgeEnSplit, 2000);
}

function forgeEnSplitRegisterCallbacks() {
    if (typeof uiAfterScriptsCallbacks !== "undefined") {
        uiAfterScriptsCallbacks.push(initForgeEnSplit);
    }

    initForgeEnSplit();
    forgeEnSplitScheduleRetries();

    if (!forgeEnResizeListenersAttached) {
        forgeEnResizeListenersAttached = true;
        onUiUpdate(initForgeEnSplit);
        if (typeof onAfterUiUpdate === "function") {
            onAfterUiUpdate(initForgeEnSplit);
        }
        if (typeof onUiTabChange === "function") {
            onUiTabChange(initForgeEnSplit);
        }
    }
}

onUiLoaded(function () {
    forgeEnSplitRegisterCallbacks();
    forgeEnSplitWatchExtraTabs();
});

try {
    if (gradioApp().querySelector("#txt2img_prompt")) {
        forgeEnSplitRegisterCallbacks();
        forgeEnSplitWatchExtraTabs();
    }
} catch (_) {
    /* gradio not ready */
}
