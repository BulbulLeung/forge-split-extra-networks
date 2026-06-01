/**
 * forge-split-extra-networks: Output Browser selection, preview, context menu.
 */
"use strict";

const FORGE_EN_OUTPUT_BROWSER_CARD_IDS = [
    "txt2img_output_browser_cards",
    "img2img_output_browser_cards",
];

const FORGE_EN_OUTPUT_SELECTED_CLASS = "forge-en-output-selected";

const FORGE_EN_OUTPUT_BROWSER_TAB_BY_CONTAINER = {
    txt2img_output_browser_cards: "txt2img",
    img2img_output_browser_cards: "img2img",
};

let forgeEnContextMenuEl = null;
let forgeEnContextMenuState = null;

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

        const overlay = gradioApp().querySelector("#forgeEnOutputLightbox");
        if (overlay && overlay.style.display !== "none") {
            forgeEnOutputBrowserCloseLightbox();
            event.preventDefault();
            event.stopPropagation();
        }
        return;
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

function forgeEnOutputBrowserOpenPreview(previewUrl) {
    const overlay = forgeEnOutputBrowserEnsureLightbox();
    const img = overlay.querySelector(".forge-en-output-lightbox-img");
    img.src = previewUrl;
    overlay.style.display = "flex";
    return false;
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
    forgeEnOutputBrowserOpenPreview(preview.src);
}

function forgeEnOutputBrowserRefreshPane(tabname) {
    const btn = gradioApp().getElementById(
        tabname + "_output_browser_extra_refresh_internal",
    );
    if (btn) {
        btn.dispatchEvent(new Event("click"));
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

function forgeEnOutputBrowserDeletePaths(paths, tabname) {
    if (!paths.length) {
        return;
    }

    const message =
        "確定要刪除 " +
        paths.length +
        " 張圖片嗎？\n此操作無法復原。";
    if (!confirm(message)) {
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

            forgeEnOutputBrowserRefreshPane(tabname);

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

function forgeEnOutputBrowserBindCardInteractions() {
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
    }
}

if (typeof onUiUpdate === "function") {
    onUiUpdate(forgeEnOutputBrowserBindCardInteractions);
}
if (typeof onUiLoaded === "function") {
    onUiLoaded(forgeEnOutputBrowserBindCardInteractions);
} else {
    forgeEnOutputBrowserBindCardInteractions();
}
