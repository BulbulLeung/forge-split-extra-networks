/**
 * forge-split-extra-networks: Output Browser selection, preview, context menu.
 */
"use strict";

const FORGE_EN_OUTPUT_BROWSER_CARD_IDS = [
    "txt2img_output_browser_cards",
    "img2img_output_browser_cards",
];

const FORGE_EN_OUTPUT_SELECTED_CLASS = "forge-en-output-selected";
const FORGE_EN_OUTPUT_SELECTION_OUTLINE_DEFAULT_PX = 5;
const FORGE_EN_OUTPUT_SELECTION_OUTLINE_MIN_PX = 1;
const FORGE_EN_OUTPUT_SELECTION_OUTLINE_MAX_PX = 12;

function forgeEnOutputBrowserSelectionOutlinePx() {
    if (
        typeof opts !== "undefined" &&
        opts.forge_en_output_browser_selection_outline_px != null
    ) {
        const n = parseInt(opts.forge_en_output_browser_selection_outline_px, 10);
        if (!Number.isNaN(n)) {
            return Math.max(
                FORGE_EN_OUTPUT_SELECTION_OUTLINE_MIN_PX,
                Math.min(FORGE_EN_OUTPUT_SELECTION_OUTLINE_MAX_PX, n),
            );
        }
    }
    return FORGE_EN_OUTPUT_SELECTION_OUTLINE_DEFAULT_PX;
}

function forgeEnOutputBrowserApplySelectionStyle() {
    const root = gradioApp();
    if (!root) return;
    root.style.setProperty(
        "--forge-en-output-selection-outline-width",
        forgeEnOutputBrowserSelectionOutlinePx() + "px",
    );
}

const FORGE_EN_OUTPUT_BROWSER_TAB_BY_CONTAINER = {
    txt2img_output_browser_cards: "txt2img",
    img2img_output_browser_cards: "img2img",
};

const FORGE_EN_OUTPUT_PATH_MIME = "application/x-forge-en-output-path";
const FORGE_EN_OUTPUT_PREVIEW_URL_MIME =
    "application/x-forge-en-output-preview-url";

const FORGE_EN_OUTPUT_IMG2IMG_CANVAS_SELECTORS = [
    "#img2img_image",
    "#img2img_sketch",
    "#img2maskimg",
    "#inpaint_sketch",
];

const FORGE_EN_OUTPUT_DROP_TARGETS = {
    txt2img: [
        "#txt2img_generation",
        "#txt2img_prompt",
        "#txt2img_neg_prompt",
        "#txt2img_prompt_container",
        "#txt2img_gallery_container",
        "#txt2img_gallery",
    ],
    img2img: [
        "#img2img_generation",
        "#img2img_prompt",
        "#img2img_neg_prompt",
        "#img2img_prompt_container",
        "#img2img_gallery_container",
        "#img2img_gallery",
    ],
};

let forgeEnActiveDropTarget = null;

let forgeEnContextMenuEl = null;
let forgeEnContextMenuState = null;

const forgeEnOutputScrollRestore = Object.create(null);
let forgeEnLightboxState = null;

function forgeEnOutputBrowserEnsureLightbox() {
    let overlay = gradioApp().querySelector("#forgeEnOutputLightbox");
    if (overlay) {
        return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = "forgeEnOutputLightbox";
    overlay.className = "forge-en-output-lightbox";
    overlay.innerHTML =
        '<button type="button" class="forge-en-output-lightbox-close" title="Close">&times;</button>' +
        '<img class="forge-en-output-lightbox-img" alt="">';

    overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
            forgeEnOutputBrowserCloseLightbox();
        }
    });

    const closeBtn = overlay.querySelector(".forge-en-output-lightbox-close");
    closeBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        forgeEnOutputBrowserCloseLightbox();
    });

    const img = overlay.querySelector(".forge-en-output-lightbox-img");
    img.addEventListener("click", function (event) {
        event.stopPropagation();
    });

    forgeEnOutputBrowserEnsureKeyListener();

    gradioApp().appendChild(overlay);
    return overlay;
}

function forgeEnOutputBrowserCloseLightbox() {
    const overlay = gradioApp().querySelector("#forgeEnOutputLightbox");
    if (overlay) {
        overlay.style.display = "none";
    }
    forgeEnLightboxState = null;
}

function forgeEnOutputBrowserIsLightboxOpen() {
    const overlay = gradioApp().querySelector("#forgeEnOutputLightbox");
    return !!(overlay && overlay.style.display !== "none");
}

function forgeEnOutputBrowserCloseContextMenu() {
    if (forgeEnContextMenuEl) {
        forgeEnContextMenuEl.style.display = "none";
    }
    forgeEnContextMenuState = null;
}

function forgeEnOutputBrowserEnsureKeyListener() {
    if (window._forgeEnOutputBrowserKeyListener) {
        return;
    }
    window._forgeEnOutputBrowserKeyListener = true;
    document.addEventListener("keydown", forgeEnOutputBrowserKeyHandler, true);
}

function forgeEnOutputBrowserIsEditableTarget(target) {
    if (!target) {
        return false;
    }
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
    }
    return !!target.isContentEditable;
}

function forgeEnOutputBrowserGetVisibleMainTab() {
    const tabTxt2img = gradioApp().getElementById("tab_txt2img");
    const tabImg2img = gradioApp().getElementById("tab_img2img");
    if (tabTxt2img && tabTxt2img.style.display !== "none") {
        return "txt2img";
    }
    if (tabImg2img && tabImg2img.style.display !== "none") {
        return "img2img";
    }
    return "txt2img";
}

function forgeEnOutputBrowserDeleteSelectedFromKeyboard() {
    const mainTab = forgeEnOutputBrowserGetVisibleMainTab();
    const container = gradioApp().querySelector(
        "#" + mainTab + "_output_browser_cards",
    );
    if (!container) {
        return false;
    }

    const paths = forgeEnOutputBrowserGetDeletePaths(container, null);
    if (paths.length === 0) {
        return false;
    }

    forgeEnOutputBrowserCloseContextMenu();
    forgeEnOutputBrowserDeletePaths(paths, mainTab);
    return true;
}

function forgeEnOutputBrowserKeyHandler(event) {
    if (event.key === "Escape") {
        if (forgeEnContextMenuEl && forgeEnContextMenuEl.style.display !== "none") {
            forgeEnOutputBrowserCloseContextMenu();
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (forgeEnOutputBrowserIsLightboxOpen()) {
            forgeEnOutputBrowserCloseLightbox();
            event.preventDefault();
            event.stopPropagation();
        }
        return;
    }

    if (forgeEnOutputBrowserIsLightboxOpen()) {
        if (forgeEnOutputBrowserIsEditableTarget(event.target)) {
            return;
        }

        if (event.key === "ArrowLeft") {
            forgeEnOutputBrowserNavigateLightbox(-1);
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event.key === "ArrowRight") {
            forgeEnOutputBrowserNavigateLightbox(1);
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event.key === "Delete" || event.key === "Del") {
            forgeEnOutputBrowserDeleteFromLightbox();
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

    if (event.key === "Delete" || event.key === "Del") {
        if (forgeEnOutputBrowserIsEditableTarget(event.target)) {
            return;
        }
        if (forgeEnOutputBrowserDeleteSelectedFromKeyboard()) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}

function forgeEnOutputBrowserGetCardPath(card) {
    const btn = card.querySelector(".copy-path-button");
    if (!btn) {
        return null;
    }
    return (
        btn.getAttribute("data-clipboard-text") ||
        btn.dataset.clipboardText ||
        null
    );
}

function forgeEnOutputBrowserApiUrl(path) {
    const base = window.location.href.split("#")[0].replace(/\/?$/, "/");
    return base + path.replace(/^\//, "");
}

function forgeEnOutputBrowserParseJsonResponse(response) {
    return response.json().then(function (data) {
        if (!response.ok) {
            const detail = data.detail;
            const message =
                typeof detail === "string"
                    ? detail
                    : Array.isArray(detail)
                      ? detail.map(function (d) {
                            return d.msg || JSON.stringify(d);
                        }).join(", ")
                      : data.error || response.statusText;
            throw new Error(message);
        }
        return data;
    });
}

function forgeEnOutputBrowserGetCards(container) {
    return Array.from(container.querySelectorAll(".card"));
}

function forgeEnOutputBrowserContainerIdForTab(tabname) {
    return tabname + "_output_browser_cards";
}

function forgeEnOutputBrowserGetCardsScrollElement(container) {
    return container || null;
}

function forgeEnOutputBrowserSaveScroll(containerId) {
    const container = gradioApp().querySelector("#" + containerId);
    const scrollEl = forgeEnOutputBrowserGetCardsScrollElement(container);
    if (scrollEl) {
        forgeEnOutputScrollRestore[containerId] = scrollEl.scrollTop;
    }
}

function forgeEnOutputBrowserApplyScroll(containerId) {
    const saved = forgeEnOutputScrollRestore[containerId];
    if (saved == null) {
        return false;
    }

    const container = gradioApp().querySelector("#" + containerId);
    const scrollEl = forgeEnOutputBrowserGetCardsScrollElement(container);
    if (!scrollEl || !container.querySelector(".card")) {
        return false;
    }

    scrollEl.scrollTop = saved;
    return true;
}

function forgeEnOutputBrowserScheduleScrollRestore(containerId) {
    if (forgeEnOutputScrollRestore[containerId] == null) {
        return;
    }

    let observer = null;
    let finished = false;
    const restoreDelaysMs = [0, 50, 100, 200, 400, 800, 1200, 2000];

    function cleanup() {
        if (finished) {
            return;
        }
        finished = true;
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        delete forgeEnOutputScrollRestore[containerId];
    }

    function tryApply() {
        if (finished) {
            return;
        }
        forgeEnOutputBrowserApplyScroll(containerId);
    }

    const container = gradioApp().querySelector("#" + containerId);
    if (container) {
        observer = new MutationObserver(function () {
            tryApply();
        });
        observer.observe(container, { childList: true, subtree: true });
    }

    restoreDelaysMs.forEach(function (delayMs) {
        setTimeout(tryApply, delayMs);
    });
    setTimeout(cleanup, 2500);
}

function forgeEnOutputBrowserScheduleAfterRefresh(containerId, callback) {
    let attempts = 0;

    function tryCallback() {
        const container = gradioApp().querySelector("#" + containerId);
        if (!container) {
            return;
        }
        if (!container.querySelector(".card")) {
            if (attempts++ < 40) {
                requestAnimationFrame(tryCallback);
            } else {
                callback(container);
            }
            return;
        }
        callback(container);
    }

    requestAnimationFrame(tryCallback);
    setTimeout(tryCallback, 100);
    setTimeout(tryCallback, 500);
}

function forgeEnOutputBrowserBuildLightboxEntries(container) {
    const entries = [];
    forgeEnOutputBrowserGetCards(container).forEach(function (card) {
        const preview = card.querySelector("img.preview");
        if (!preview || !preview.src) {
            return;
        }
        entries.push({
            previewUrl: preview.src,
            path: forgeEnOutputBrowserGetCardPath(card),
        });
    });
    return entries;
}

function forgeEnOutputBrowserOpenPreviewAtIndex(container, index) {
    if (!container) {
        return;
    }

    const entries = forgeEnOutputBrowserBuildLightboxEntries(container);
    if (!entries.length) {
        forgeEnOutputBrowserCloseLightbox();
        return;
    }

    const i = Math.max(0, Math.min(index, entries.length - 1));
    forgeEnLightboxState = {
        containerId: container.id,
        index: i,
        entries: entries,
    };

    const overlay = forgeEnOutputBrowserEnsureLightbox();
    const img = overlay.querySelector(".forge-en-output-lightbox-img");
    img.src = entries[i].previewUrl;
    overlay.style.display = "flex";
}

function forgeEnOutputBrowserNavigateLightbox(delta) {
    if (!forgeEnLightboxState || !forgeEnLightboxState.entries) {
        return;
    }

    const container = gradioApp().querySelector(
        "#" + forgeEnLightboxState.containerId,
    );
    if (!container) {
        return;
    }

    const newIndex = forgeEnLightboxState.index + delta;
    if (newIndex < 0 || newIndex >= forgeEnLightboxState.entries.length) {
        return;
    }

    forgeEnOutputBrowserOpenPreviewAtIndex(container, newIndex);
}

function forgeEnOutputBrowserDeleteFromLightbox() {
    if (!forgeEnLightboxState || !forgeEnLightboxState.entries) {
        return;
    }

    const state = forgeEnLightboxState;
    const entry = state.entries[state.index];
    if (!entry || !entry.path) {
        return;
    }

    const tabname =
        FORGE_EN_OUTPUT_BROWSER_TAB_BY_CONTAINER[state.containerId] ||
        forgeEnOutputBrowserGetVisibleMainTab();
    const resumeIndex = state.index;

    forgeEnOutputBrowserPerformDelete([entry.path], tabname, function (container) {
        const entries = forgeEnOutputBrowserBuildLightboxEntries(container);
        if (!entries.length) {
            forgeEnOutputBrowserCloseLightbox();
            return;
        }
        forgeEnOutputBrowserOpenPreviewAtIndex(
            container,
            Math.min(resumeIndex, entries.length - 1),
        );
    });
}

function forgeEnOutputBrowserClearSelection(container) {
    container
        .querySelectorAll("." + FORGE_EN_OUTPUT_SELECTED_CLASS)
        .forEach(function (card) {
            card.classList.remove(FORGE_EN_OUTPUT_SELECTED_CLASS);
        });
}

function forgeEnOutputBrowserSelectRange(container, cards, fromIndex, toIndex) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    for (let i = start; i <= end; i++) {
        cards[i].classList.add(FORGE_EN_OUTPUT_SELECTED_CLASS);
    }
}

function forgeEnOutputBrowserGetAnchorIndex(container, cards, fallbackIndex) {
    const raw = container.dataset.forgeEnAnchorIndex;
    if (raw === undefined || raw === "") {
        return fallbackIndex;
    }
    const anchor = parseInt(raw, 10);
    if (Number.isNaN(anchor) || anchor < 0 || anchor >= cards.length) {
        return fallbackIndex;
    }
    return anchor;
}

function forgeEnOutputBrowserSetAnchor(container, index) {
    container.dataset.forgeEnAnchorIndex = String(index);
}

function forgeEnOutputBrowserHandleCardClick(event, container) {
    if (event.target.closest(".button-row")) {
        return;
    }

    const card = event.target.closest(".card");
    if (!card || !container.contains(card)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const cards = forgeEnOutputBrowserGetCards(container);
    const index = cards.indexOf(card);
    if (index < 0) {
        return;
    }

    const extend = event.ctrlKey || event.metaKey;

    if (event.shiftKey) {
        const anchor = forgeEnOutputBrowserGetAnchorIndex(container, cards, index);
        if (!extend) {
            forgeEnOutputBrowserClearSelection(container);
        }
        forgeEnOutputBrowserSelectRange(container, cards, anchor, index);
        return;
    }

    if (extend) {
        card.classList.toggle(FORGE_EN_OUTPUT_SELECTED_CLASS);
        forgeEnOutputBrowserSetAnchor(container, index);
        return;
    }

    forgeEnOutputBrowserClearSelection(container);
    card.classList.add(FORGE_EN_OUTPUT_SELECTED_CLASS);
    forgeEnOutputBrowserSetAnchor(container, index);
}

function forgeEnOutputBrowserHandleCardDoubleClick(event, container) {
    if (event.target.closest(".button-row")) {
        return;
    }

    const card = event.target.closest(".card");
    if (!card || !container.contains(card)) {
        return;
    }

    const preview = card.querySelector("img.preview");
    if (!preview || !preview.src) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const cards = forgeEnOutputBrowserGetCards(container);
    const index = cards.indexOf(card);
    if (index < 0) {
        return;
    }
    forgeEnOutputBrowserOpenPreviewAtIndex(container, index);
}

function forgeEnOutputBrowserRefreshPane(tabname, onAfterRefresh) {
    const containerId = forgeEnOutputBrowserContainerIdForTab(tabname);
    forgeEnOutputBrowserSaveScroll(containerId);

    const btn = gradioApp().getElementById(
        tabname + "_output_browser_extra_refresh_internal",
    );
    if (btn) {
        btn.dispatchEvent(new Event("click"));
    }

    forgeEnOutputBrowserScheduleScrollRestore(containerId);

    if (typeof onAfterRefresh === "function") {
        forgeEnOutputBrowserScheduleAfterRefresh(containerId, onAfterRefresh);
    }
}

function forgeEnOutputBrowserFindInput(root) {
    if (!root) {
        return null;
    }
    return (
        root.querySelector("textarea") ||
        root.querySelector("input[type='number']") ||
        root.querySelector("input:not([type='hidden'])") ||
        root.querySelector("select")
    );
}

function forgeEnOutputBrowserApplyGradioUpdate(update) {
    const root = gradioApp().getElementById(update.id);
    if (!root) {
        return false;
    }

    if (update.visible === false) {
        root.style.display = "none";
    } else if (update.visible === true) {
        root.style.display = "";
    }

    if (update.value === undefined) {
        return update.visible !== undefined;
    }

    const input = forgeEnOutputBrowserFindInput(root);
    if (!input) {
        return false;
    }

    if (input.type === "checkbox") {
        input.checked = !!update.value;
    } else if (Array.isArray(update.value)) {
        input.value = update.value.join(",");
    } else {
        input.value = String(update.value);
    }

    if (typeof updateInput === "function") {
        updateInput(input);
    } else {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
}

function forgeEnOutputBrowserSwitchToTab(targetTab) {
    if (targetTab === "txt2img" && typeof switch_to_txt2img === "function") {
        switch_to_txt2img();
    } else if (targetTab === "img2img" && typeof switch_to_img2img === "function") {
        switch_to_img2img();
    }
}

function forgeEnOutputBrowserRecalculatePrompts(targetTab) {
    if (targetTab === "txt2img" && typeof recalculate_prompts_txt2img === "function") {
        recalculate_prompts_txt2img();
    } else if (
        targetTab === "img2img" &&
        typeof recalculate_prompts_img2img === "function"
    ) {
        recalculate_prompts_img2img();
    }
}

function forgeEnOutputBrowserSendToTab(targetTab, filepath) {
    if (!filepath) {
        alert("無法取得圖片路徑。");
        return;
    }

    fetch(forgeEnOutputBrowserApiUrl("/forge-en-output-browser/apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: filepath, tabname: targetTab }),
    })
        .then(forgeEnOutputBrowserParseJsonResponse)
        .then(function (data) {
            if (data.error) {
                alert(data.error);
                return;
            }
            if (!data.updates || data.updates.length === 0) {
                alert("此圖片沒有可套用的參數。");
                return;
            }

            let applied = 0;
            for (const update of data.updates) {
                if (forgeEnOutputBrowserApplyGradioUpdate(update)) {
                    applied++;
                }
            }

            if (applied === 0) {
                alert("無法寫入 UI 欄位，請確認 WebUI 已完全載入。");
                return;
            }

            forgeEnOutputBrowserSwitchToTab(targetTab);
            forgeEnOutputBrowserRecalculatePrompts(targetTab);
        })
        .catch(function (err) {
            alert("套用 PNG info 失敗：" + err.message);
        });
}

function forgeEnOutputBrowserPerformDelete(paths, tabname, onAfterRefresh) {
    if (!paths.length) {
        return;
    }

    const containerId = forgeEnOutputBrowserContainerIdForTab(tabname);
    forgeEnOutputBrowserSaveScroll(containerId);

    const message =
        "確定要刪除 " +
        paths.length +
        " 張圖片嗎？\n此操作無法復原。";
    if (!confirm(message)) {
        delete forgeEnOutputScrollRestore[containerId];
        return;
    }

    fetch(forgeEnOutputBrowserApiUrl("/forge-en-output-browser/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: paths }),
    })
        .then(forgeEnOutputBrowserParseJsonResponse)
        .then(function (data) {
            for (const containerId of FORGE_EN_OUTPUT_BROWSER_CARD_IDS) {
                const container = gradioApp().querySelector("#" + containerId);
                if (container) {
                    forgeEnOutputBrowserClearSelection(container);
                }
            }

            forgeEnOutputBrowserRefreshPane(tabname, onAfterRefresh);

            if (data.failed && data.failed.length > 0) {
                const lines = data.failed
                    .map(function (f) {
                        return f.path + ": " + f.error;
                    })
                    .join("\n");
                alert(
                    "已刪除 " +
                        (data.deleted ? data.deleted.length : 0) +
                        " 張，失敗 " +
                        data.failed.length +
                        " 張：\n" +
                        lines,
                );
            }
        })
        .catch(function (err) {
            alert("刪除失敗：" + err.message);
        });
}

function forgeEnOutputBrowserDeletePaths(paths, tabname) {
    forgeEnOutputBrowserPerformDelete(paths, tabname, null);
}

function forgeEnOutputBrowserGetDeletePaths(container, contextCard) {
    const selected = container.querySelectorAll(
        ".card." + FORGE_EN_OUTPUT_SELECTED_CLASS,
    );
    const cards =
        selected.length > 0 ? Array.from(selected) : contextCard ? [contextCard] : [];

    const paths = [];
    const seen = new Set();
    for (const card of cards) {
        const path = forgeEnOutputBrowserGetCardPath(card);
        if (path && !seen.has(path)) {
            seen.add(path);
            paths.push(path);
        }
    }
    return paths;
}

function forgeEnOutputBrowserEnsureContextMenu() {
    if (forgeEnContextMenuEl) {
        return forgeEnContextMenuEl;
    }

    const menu = document.createElement("div");
    menu.id = "forgeEnOutputContextMenu";
    menu.className = "forge-en-output-context-menu";
    menu.style.display = "none";
    menu.innerHTML =
        '<button type="button" data-action="send-txt2img">Send to txt2img</button>' +
        '<button type="button" data-action="send-img2img">Send to img2img</button>' +
        '<button type="button" data-action="delete" class="forge-en-output-context-menu-danger">Delete</button>';

    function forgeEnOutputBrowserHandleMenuAction(event) {
        const btn = event.target.closest("button[data-action]");
        if (!btn || !forgeEnContextMenuState) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const state = {
            tabname: forgeEnContextMenuState.tabname,
            sendPath: forgeEnContextMenuState.sendPath,
            deletePaths: forgeEnContextMenuState.deletePaths.slice(),
        };
        forgeEnOutputBrowserCloseContextMenu();

        if (btn.disabled) {
            return;
        }

        const action = btn.dataset.action;
        if (action === "send-txt2img") {
            forgeEnOutputBrowserSendToTab("txt2img", state.sendPath);
        } else if (action === "send-img2img") {
            forgeEnOutputBrowserSendToTab("img2img", state.sendPath);
        } else if (action === "delete") {
            forgeEnOutputBrowserDeletePaths(state.deletePaths, state.tabname);
        }
    }

    menu.addEventListener("mousedown", forgeEnOutputBrowserHandleMenuAction, true);
    menu.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
    });

    if (!window._forgeEnContextMenuGlobalClose) {
        window._forgeEnContextMenuGlobalClose = true;
        document.addEventListener(
            "click",
            function (event) {
                if (
                    forgeEnContextMenuEl &&
                    forgeEnContextMenuEl.contains(event.target)
                ) {
                    return;
                }
                forgeEnOutputBrowserCloseContextMenu();
            },
            true,
        );
        document.addEventListener(
            "contextmenu",
            function (event) {
                if (
                    forgeEnContextMenuEl &&
                    forgeEnContextMenuEl.style.display !== "none" &&
                    !forgeEnContextMenuEl.contains(event.target)
                ) {
                    forgeEnOutputBrowserCloseContextMenu();
                }
            },
            true,
        );
    }

    gradioApp().appendChild(menu);
    forgeEnContextMenuEl = menu;
    return menu;
}

function forgeEnOutputBrowserShowContextMenu(event, container, containerId) {
    if (event.target.closest(".button-row")) {
        return;
    }

    const card = event.target.closest(".card");
    if (!card || !container.contains(card)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const tabname = FORGE_EN_OUTPUT_BROWSER_TAB_BY_CONTAINER[containerId] || "txt2img";
    const sendPath = forgeEnOutputBrowserGetCardPath(card);
    const deletePaths = forgeEnOutputBrowserGetDeletePaths(container, card);

    const menu = forgeEnOutputBrowserEnsureContextMenu();
    const sendTxt2img = menu.querySelector('[data-action="send-txt2img"]');
    const sendImg2img = menu.querySelector('[data-action="send-img2img"]');
    const deleteBtn = menu.querySelector('[data-action="delete"]');

    sendTxt2img.disabled = !sendPath;
    sendImg2img.disabled = !sendPath;
    deleteBtn.disabled = deletePaths.length === 0;

    forgeEnContextMenuState = {
        tabname: tabname,
        sendPath: sendPath,
        deletePaths: deletePaths,
    };

    menu.style.display = "block";
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = Math.max(0, event.clientX - rect.width) + "px";
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = Math.max(0, event.clientY - rect.height) + "px";
    }
}

function forgeEnOutputBrowserHasOutputPathDrag(dataTransfer) {
    if (!dataTransfer || !dataTransfer.types) {
        return false;
    }
    return Array.from(dataTransfer.types).indexOf(FORGE_EN_OUTPUT_PATH_MIME) >= 0;
}

function forgeEnOutputBrowserGetDragPath(dataTransfer) {
    if (!dataTransfer) {
        return "";
    }
    return (
        dataTransfer.getData(FORGE_EN_OUTPUT_PATH_MIME) ||
        dataTransfer.getData("text/plain") ||
        ""
    );
}

function forgeEnOutputBrowserIsOutputBrowserContainer(element) {
    if (!element) {
        return false;
    }
    return FORGE_EN_OUTPUT_BROWSER_CARD_IDS.some(function (containerId) {
        return !!element.closest("#" + containerId);
    });
}

function forgeEnOutputBrowserIsElementVisible(element) {
    if (!element) {
        return false;
    }
    if (typeof uiElementIsVisible === "function") {
        return uiElementIsVisible(element);
    }
    return element.offsetParent !== null;
}

function forgeEnOutputBrowserGetImg2imgCanvasBlock(element) {
    if (!element || forgeEnOutputBrowserGetVisibleMainTab() !== "img2img") {
        return null;
    }

    for (let i = 0; i < FORGE_EN_OUTPUT_IMG2IMG_CANVAS_SELECTORS.length; i++) {
        const block = element.closest(FORGE_EN_OUTPUT_IMG2IMG_CANVAS_SELECTORS[i]);
        if (!block) {
            continue;
        }
        if (!forgeEnOutputBrowserIsElementVisible(block)) {
            continue;
        }
        if (!block.querySelector(".forge-container input[type='file']")) {
            continue;
        }
        return block;
    }
    return null;
}

function forgeEnOutputBrowserGetPngInfoDropTarget(element) {
    if (!element || forgeEnOutputBrowserIsOutputBrowserContainer(element)) {
        return null;
    }

    const mainTab = forgeEnOutputBrowserGetVisibleMainTab();
    const selectors = FORGE_EN_OUTPUT_DROP_TARGETS[mainTab] || [];
    for (let i = 0; i < selectors.length; i++) {
        const match = element.closest(selectors[i]);
        if (match) {
            return match;
        }
    }
    return null;
}

function forgeEnOutputBrowserResolveDropAction(element) {
    const canvasBlock = forgeEnOutputBrowserGetImg2imgCanvasBlock(element);
    if (canvasBlock) {
        return { kind: "loadImage", block: canvasBlock };
    }

    const target = forgeEnOutputBrowserGetPngInfoDropTarget(element);
    if (target) {
        return { kind: "applyPngInfo", target: target };
    }
    return null;
}

function forgeEnOutputBrowserGetDropHighlightElement(action) {
    if (!action) {
        return null;
    }
    if (action.kind === "loadImage") {
        return action.block;
    }
    return action.target;
}

function forgeEnOutputBrowserGetDragPreviewUrl(dataTransfer) {
    if (!dataTransfer) {
        return "";
    }
    return dataTransfer.getData(FORGE_EN_OUTPUT_PREVIEW_URL_MIME) || "";
}

function forgeEnOutputBrowserLoadImageToCanvas(block, previewUrl, filepath) {
    const fileInput = block.querySelector(
        ".forge-container input[type='file']",
    );
    if (!fileInput) {
        alert("無法找到 image input。");
        return;
    }
    if (!previewUrl) {
        alert("無法取得圖片預覽 URL。");
        return;
    }

    fetch(previewUrl)
        .then(function (response) {
            if (!response.ok) {
                throw new Error(response.statusText || String(response.status));
            }
            return response.blob();
        })
        .then(function (blob) {
            const basename =
                filepath.replace(/\\/g, "/").split("/").pop() || "image.png";
            const file = new File([blob], basename, {
                type: blob.type || "image/png",
            });
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        })
        .catch(function (err) {
            alert("載入圖片失敗：" + err.message);
        });
}

function forgeEnOutputBrowserSetActiveDropTarget(element) {
    if (forgeEnActiveDropTarget === element) {
        return;
    }
    if (forgeEnActiveDropTarget) {
        forgeEnActiveDropTarget.classList.remove(
            "forge-en-output-drop-target-active",
        );
    }
    forgeEnActiveDropTarget = element;
    if (element) {
        element.classList.add("forge-en-output-drop-target-active");
    }
}

function forgeEnOutputBrowserClearActiveDropTarget() {
    forgeEnOutputBrowserSetActiveDropTarget(null);
}

function forgeEnOutputBrowserHandleDragOver(event) {
    if (!forgeEnOutputBrowserHasOutputPathDrag(event.dataTransfer)) {
        return;
    }

    const action = forgeEnOutputBrowserResolveDropAction(event.target);
    const highlight = forgeEnOutputBrowserGetDropHighlightElement(action);
    if (!highlight) {
        forgeEnOutputBrowserClearActiveDropTarget();
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    forgeEnOutputBrowserSetActiveDropTarget(highlight);
}

function forgeEnOutputBrowserHandleDrop(event) {
    if (!forgeEnOutputBrowserHasOutputPathDrag(event.dataTransfer)) {
        return;
    }

    const action = forgeEnOutputBrowserResolveDropAction(event.target);
    if (!action) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    forgeEnOutputBrowserClearActiveDropTarget();

    const filepath = forgeEnOutputBrowserGetDragPath(event.dataTransfer);
    if (!filepath) {
        return;
    }

    if (action.kind === "loadImage") {
        const previewUrl = forgeEnOutputBrowserGetDragPreviewUrl(
            event.dataTransfer,
        );
        forgeEnOutputBrowserLoadImageToCanvas(
            action.block,
            previewUrl,
            filepath,
        );
        return;
    }

    forgeEnOutputBrowserSendToTab(
        forgeEnOutputBrowserGetVisibleMainTab(),
        filepath,
    );
}

function forgeEnOutputBrowserHandleDragEnd() {
    forgeEnOutputBrowserClearActiveDropTarget();
    FORGE_EN_OUTPUT_BROWSER_CARD_IDS.forEach(function (containerId) {
        const container = gradioApp().querySelector("#" + containerId);
        if (!container) {
            return;
        }
        container.querySelectorAll(".card.forge-en-output-dragging").forEach(
            function (card) {
                card.classList.remove("forge-en-output-dragging");
            },
        );
    });
}

function forgeEnOutputBrowserEnsureDropHandlers() {
    if (window._forgeEnOutputDropBound) {
        return;
    }
    window._forgeEnOutputDropBound = true;

    const root = gradioApp();
    root.addEventListener("dragover", forgeEnOutputBrowserHandleDragOver, true);
    root.addEventListener("drop", forgeEnOutputBrowserHandleDrop, true);
    root.addEventListener("dragend", forgeEnOutputBrowserHandleDragEnd, true);
}

function forgeEnOutputBrowserHandleCardDragStart(event, container) {
    if (event.target.closest(".button-row")) {
        event.preventDefault();
        return;
    }

    const card = event.target.closest(".card");
    if (!card || !container.contains(card)) {
        return;
    }

    const filepath = forgeEnOutputBrowserGetCardPath(card);
    if (!filepath) {
        event.preventDefault();
        return;
    }

    event.dataTransfer.setData(FORGE_EN_OUTPUT_PATH_MIME, filepath);
    event.dataTransfer.setData("text/plain", filepath);
    const previewImg = card.querySelector("img.preview");
    if (previewImg && previewImg.src) {
        event.dataTransfer.setData(
            FORGE_EN_OUTPUT_PREVIEW_URL_MIME,
            previewImg.src,
        );
    }
    event.dataTransfer.effectAllowed = "copy";
    card.classList.add("forge-en-output-dragging");
}

function forgeEnOutputBrowserHandleCardDragEnd(event, container) {
    const card = event.target.closest(".card");
    if (card && container.contains(card)) {
        card.classList.remove("forge-en-output-dragging");
    }
    forgeEnOutputBrowserClearActiveDropTarget();
}

function forgeEnOutputBrowserSetupCardDraggable() {
    for (const containerId of FORGE_EN_OUTPUT_BROWSER_CARD_IDS) {
        const container = gradioApp().querySelector("#" + containerId);
        if (!container) {
            continue;
        }
        container.querySelectorAll(".card").forEach(function (card) {
            card.draggable = true;
        });
    }
}

function forgeEnOutputBrowserBindCardInteractions() {
    forgeEnOutputBrowserApplySelectionStyle();
    forgeEnOutputBrowserEnsureKeyListener();

    for (const containerId of FORGE_EN_OUTPUT_BROWSER_CARD_IDS) {
        const container = gradioApp().querySelector("#" + containerId);
        if (!container || container.dataset.forgeEnCardsBound === "1") {
            continue;
        }
        container.dataset.forgeEnCardsBound = "1";

        container.addEventListener(
            "click",
            function (event) {
                forgeEnOutputBrowserHandleCardClick(event, container);
            },
            true,
        );

        container.addEventListener(
            "dblclick",
            function (event) {
                forgeEnOutputBrowserHandleCardDoubleClick(event, container);
            },
            true,
        );

        container.addEventListener(
            "contextmenu",
            function (event) {
                forgeEnOutputBrowserShowContextMenu(event, container, containerId);
            },
            true,
        );

        container.addEventListener(
            "dragstart",
            function (event) {
                forgeEnOutputBrowserHandleCardDragStart(event, container);
            },
            true,
        );

        container.addEventListener(
            "dragend",
            function (event) {
                forgeEnOutputBrowserHandleCardDragEnd(event, container);
            },
            true,
        );
    }
}

function forgeEnOutputBrowserBindRefreshScrollPreserve() {
    for (const containerId of FORGE_EN_OUTPUT_BROWSER_CARD_IDS) {
        const tabname = FORGE_EN_OUTPUT_BROWSER_TAB_BY_CONTAINER[containerId];
        const refreshBtn = gradioApp().getElementById(
            tabname + "_output_browser_extra_refresh",
        );
        if (!refreshBtn || refreshBtn.dataset.forgeEnScrollPreserve === "1") {
            continue;
        }
        refreshBtn.dataset.forgeEnScrollPreserve = "1";
        refreshBtn.addEventListener(
            "click",
            function () {
                forgeEnOutputBrowserSaveScroll(containerId);
                forgeEnOutputBrowserScheduleScrollRestore(containerId);
            },
            true,
        );
    }
}

function forgeEnOutputBrowserIsAutoRefreshEnabled() {
    if (typeof opts === "undefined") {
        return true;
    }
    if (opts.forge_en_output_browser_enabled === false) {
        return false;
    }
    return opts.forge_en_output_browser_auto_refresh !== false;
}

function forgeEnOutputBrowserGalleryTabname(gallery) {
    if (!gallery) {
        return null;
    }
    const id = gallery.id || "";
    if (id === "txt2img_gallery") {
        return "txt2img";
    }
    if (id === "img2img_gallery") {
        return "img2img";
    }
    return null;
}

function forgeEnOutputBrowserOnGenerationComplete(gallery) {
    if (!forgeEnOutputBrowserIsAutoRefreshEnabled()) {
        return;
    }
    const tabname = forgeEnOutputBrowserGalleryTabname(gallery);
    if (!tabname) {
        return;
    }
    setTimeout(function () {
        forgeEnOutputBrowserRefreshPane(tabname);
    }, 150);
}

function forgeEnOutputBrowserWrapRequestProgress() {
    if (window._forgeEnRequestProgressWrapped) {
        return;
    }
    if (typeof requestProgress !== "function") {
        return;
    }
    window._forgeEnRequestProgressWrapped = true;
    const origRequestProgress = requestProgress;
    requestProgress = function (
        id_task,
        progressbarContainer,
        gallery,
        atEnd,
        onProgress,
        inactivityTimeout,
    ) {
        const tabname = forgeEnOutputBrowserGalleryTabname(gallery);
        const wrappedAtEnd = function () {
            if (typeof atEnd === "function") {
                atEnd();
            }
            if (tabname) {
                forgeEnOutputBrowserOnGenerationComplete(gallery);
            }
        };
        return origRequestProgress(
            id_task,
            progressbarContainer,
            gallery,
            wrappedAtEnd,
            onProgress,
            inactivityTimeout,
        );
    };
}

function forgeEnOutputBrowserInit() {
    forgeEnOutputBrowserBindCardInteractions();
    forgeEnOutputBrowserSetupCardDraggable();
    forgeEnOutputBrowserEnsureDropHandlers();
    forgeEnOutputBrowserBindRefreshScrollPreserve();
}

function forgeEnOutputBrowserRegister() {
    forgeEnOutputBrowserWrapRequestProgress();
    forgeEnOutputBrowserInit();
}

if (typeof onUiUpdate === "function") {
    onUiUpdate(forgeEnOutputBrowserInit);
}
if (typeof onUiLoaded === "function") {
    onUiLoaded(forgeEnOutputBrowserRegister);
} else {
    forgeEnOutputBrowserRegister();
}
