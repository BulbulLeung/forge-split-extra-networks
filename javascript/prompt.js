/**
 * forge-split-extra-networks: Prompt tab — comma-split tags, insert / delete.
 */
"use strict";

const FORGE_EN_PROMPT_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_PROMPT_PAGE = "en_prompt";
const FORGE_EN_PROMPT_SEPARATOR = ", ";
const FORGE_EN_PROMPT_TAG_CLASS = "forge-en-prompt-tag";
const FORGE_EN_PROMPT_TAG_CLASS_WILDCARD = "forge-en-prompt-tag--wildcard";
const FORGE_EN_PROMPT_TAG_CLASS_LORA = "forge-en-prompt-tag--lora";
const FORGE_EN_PROMPT_DEFAULT_WILDCARD_WRAP = "__";
const FORGE_EN_PROMPT_LORA_RE = /^<lora:[^:>]+:[\d.]+>$/i;
const FORGE_EN_PROMPT_LORA_NEG_RE = /^\(lora:[^:)]+:[\d.]+\)$/i;

const forgeEnPromptBound = {
    prompt: Object.create(null),
    negPrompt: Object.create(null),
    tags: Object.create(null),
};

let forgeEnPromptInsertPopoverEl = null;
let forgeEnPromptInsertPopoverState = null;
let forgeEnPromptAfterUiUpdatePending = null;

function forgeEnPromptTabnameFull(tabname) {
    return tabname + "_" + FORGE_EN_PROMPT_PAGE;
}

function forgeEnPromptGetTextarea(tabname) {
    if (
        typeof activePromptTextarea !== "undefined" &&
        activePromptTextarea[tabname]
    ) {
        return activePromptTextarea[tabname];
    }
    const app = gradioApp();
    if (!app) return null;
    return app.querySelector(
        "#" + tabname + "_prompt_row #" + tabname + "_prompt textarea",
    );
}

function forgeEnPromptGetTagsContainer(tabname) {
    const app = gradioApp();
    if (!app) return null;
    return app.querySelector("#" + tabname + "_en_prompt_tags");
}

function forgeEnPromptEnsureTagsContainer(tabname) {
    let container = forgeEnPromptGetTagsContainer(tabname);
    if (container) {
        return container;
    }

    const app = gradioApp();
    if (!app) return null;

    const cards = app.querySelector("#" + forgeEnPromptTabnameFull(tabname) + "_cards");
    if (!cards) return null;

    container = document.createElement("div");
    container.className = "forge-en-prompt-tags extra-network-dirs";
    container.id = tabname + "_en_prompt_tags";
    container.dataset.tabname = tabname;
    cards.appendChild(container);

    if (forgeEnPromptBound.tags[tabname] !== container) {
        delete forgeEnPromptBound.tags[tabname];
        forgeEnPromptBindTagsContainers();
    }

    return container;
}

function forgeEnPromptSplitParts(text) {
    if (!text) return [];
    return text
        .split(",")
        .map(function (part) {
            return part.trim();
        })
        .filter(function (part) {
            return part.length > 0;
        });
}

function forgeEnPromptJoinParts(parts) {
    return parts.join(FORGE_EN_PROMPT_SEPARATOR);
}

function forgeEnPromptGetWildcardWrap() {
    if (typeof forgeEnWildcardWrap === "function") {
        return forgeEnWildcardWrap();
    }
    if (
        typeof opts !== "undefined" &&
        opts.dp_parser_wildcard_wrap != null &&
        String(opts.dp_parser_wildcard_wrap).length > 0
    ) {
        return String(opts.dp_parser_wildcard_wrap);
    }
    return FORGE_EN_PROMPT_DEFAULT_WILDCARD_WRAP;
}

function forgeEnPromptIsWildcardPart(part) {
    const wrap = forgeEnPromptGetWildcardWrap();
    if (!wrap || part.length <= wrap.length * 2) {
        return false;
    }
    return part.startsWith(wrap) && part.endsWith(wrap);
}

function forgeEnPromptIsLoraPart(part) {
    return (
        FORGE_EN_PROMPT_LORA_RE.test(part) ||
        FORGE_EN_PROMPT_LORA_NEG_RE.test(part)
    );
}

function forgeEnPromptTagTypeClass(part) {
    if (forgeEnPromptIsLoraPart(part)) {
        return FORGE_EN_PROMPT_TAG_CLASS_LORA;
    }
    if (forgeEnPromptIsWildcardPart(part)) {
        return FORGE_EN_PROMPT_TAG_CLASS_WILDCARD;
    }
    return "";
}

function forgeEnPromptApplyTextarea(tabname, textarea, text) {
    if (!textarea) return;
    textarea.value = text;
    if (typeof updateInput === "function") {
        updateInput(textarea);
    }
    if (
        tabname === "txt2img" &&
        typeof recalculate_prompts_txt2img === "function"
    ) {
        recalculate_prompts_txt2img();
    } else if (
        tabname === "img2img" &&
        typeof recalculate_prompts_img2img === "function"
    ) {
        recalculate_prompts_img2img();
    }
    forgeEnPromptSyncTags(tabname);
}

function forgeEnPromptInsertAfter(tabname, index, newText) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const trimmed = (newText || "").trim();
    if (!trimmed) return;

    const parts = forgeEnPromptSplitParts(textarea.value || "");
    const insertAt = Math.min(Math.max(0, index + 1), parts.length);
    parts.splice(insertAt, 0, trimmed);
    forgeEnPromptApplyTextarea(tabname, textarea, forgeEnPromptJoinParts(parts));
}

function forgeEnPromptRemoveAt(tabname, index) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const parts = forgeEnPromptSplitParts(textarea.value || "");
    if (index < 0 || index >= parts.length) return;

    parts.splice(index, 1);
    forgeEnPromptApplyTextarea(tabname, textarea, forgeEnPromptJoinParts(parts));
}

function forgeEnPromptHideInsertPopover() {
    if (forgeEnPromptInsertPopoverEl) {
        forgeEnPromptInsertPopoverEl.style.display = "none";
    }
    forgeEnPromptInsertPopoverState = null;
}

function forgeEnPromptEnsureInsertPopover() {
    if (forgeEnPromptInsertPopoverEl) {
        return forgeEnPromptInsertPopoverEl;
    }

    const app = gradioApp();
    if (!app) return null;

    const popover = document.createElement("div");
    popover.className = "forge-en-prompt-insert-popover";
    popover.style.display = "none";
    popover.innerHTML =
        '<input type="text" class="forge-en-prompt-insert-input" autocomplete="off" spellcheck="false" />' +
        '<div class="forge-en-prompt-insert-actions">' +
        '<button type="button" class="forge-en-prompt-insert-confirm lg primary gradio-button custom-button">Insert</button>' +
        '<button type="button" class="forge-en-prompt-insert-cancel lg secondary gradio-button custom-button">Cancel</button>' +
        "</div>";

    const input = popover.querySelector(".forge-en-prompt-insert-input");
    const confirmBtn = popover.querySelector(".forge-en-prompt-insert-confirm");
    const cancelBtn = popover.querySelector(".forge-en-prompt-insert-cancel");

    confirmBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!forgeEnPromptInsertPopoverState) return;
        const state = forgeEnPromptInsertPopoverState;
        forgeEnPromptInsertAfter(state.tabname, state.index, input.value);
        forgeEnPromptHideInsertPopover();
    });

    cancelBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        forgeEnPromptHideInsertPopover();
    });

    input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            confirmBtn.click();
        } else if (event.key === "Escape") {
            event.preventDefault();
            forgeEnPromptHideInsertPopover();
        }
    });

    document.addEventListener("mousedown", function (event) {
        if (
            !forgeEnPromptInsertPopoverState ||
            !forgeEnPromptInsertPopoverEl ||
            forgeEnPromptInsertPopoverEl.style.display === "none"
        ) {
            return;
        }
        if (forgeEnPromptInsertPopoverEl.contains(event.target)) {
            return;
        }
        forgeEnPromptHideInsertPopover();
    });

    app.appendChild(popover);
    forgeEnPromptInsertPopoverEl = popover;
    return popover;
}

function forgeEnPromptPositionInsertPopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    let top = rect.bottom + margin;

    popover.style.display = "flex";
    popover.style.visibility = "hidden";

    const popRect = popover.getBoundingClientRect();
    const maxLeft = window.innerWidth - popRect.width - margin;
    const maxTop = window.innerHeight - popRect.height - margin;

    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));

    popover.style.left = left + "px";
    popover.style.top = top + "px";
    popover.style.visibility = "visible";
}

function forgeEnPromptShowInsertPopover(button, tabname, index) {
    const popover = forgeEnPromptEnsureInsertPopover();
    if (!popover) return;

    forgeEnPromptInsertPopoverState = { tabname: tabname, index: index };

    const input = popover.querySelector(".forge-en-prompt-insert-input");
    input.value = "";
    forgeEnPromptPositionInsertPopover(popover, button);
    input.focus();
}

function forgeEnPromptSyncTags(tabname) {
    const container = forgeEnPromptEnsureTagsContainer(tabname);
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!container) return;

    const parts = forgeEnPromptSplitParts(textarea ? textarea.value || "" : "");
    const fragment = document.createDocumentFragment();

    parts.forEach(function (part, index) {
        const button = document.createElement("button");
        button.type = "button";
        const typeClass = forgeEnPromptTagTypeClass(part);
        button.className =
            "lg secondary gradio-button custom-button " +
            FORGE_EN_PROMPT_TAG_CLASS +
            (typeClass ? " " + typeClass : "");
        button.dataset.index = String(index);
        button.title = part;
        button.textContent = part;
        fragment.appendChild(button);
    });

    container.replaceChildren(fragment);
}

function forgeEnPromptSyncAllTags() {
    FORGE_EN_PROMPT_TABNAMES.forEach(forgeEnPromptSyncTags);
}

function forgeEnPromptOnPromptActivity(tabname) {
    forgeEnPromptSyncTags(tabname);
}

function forgeEnPromptBindTextarea(tabname, id, boundKey) {
    const app = gradioApp();
    if (!app) return;

    const textarea = app.querySelector("#" + id + " > label > textarea");
    if (!textarea || forgeEnPromptBound[boundKey][tabname] === textarea) {
        return;
    }

    forgeEnPromptBound[boundKey][tabname] = textarea;
    textarea.addEventListener("input", function () {
        forgeEnPromptOnPromptActivity(tabname);
    });
    textarea.addEventListener("focus", function () {
        if (typeof activePromptTextarea !== "undefined") {
            activePromptTextarea[tabname] = textarea;
        }
        forgeEnPromptOnPromptActivity(tabname);
    });
}

function forgeEnPromptBindPromptListeners() {
    FORGE_EN_PROMPT_TABNAMES.forEach(function (tabname) {
        forgeEnPromptBindTextarea(tabname, tabname + "_prompt", "prompt");
        forgeEnPromptBindTextarea(tabname, tabname + "_neg_prompt", "negPrompt");
    });
}

function forgeEnPromptBindTagsContainers() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_PROMPT_TABNAMES.forEach(function (tabname) {
        const container = forgeEnPromptGetTagsContainer(tabname);
        if (!container || forgeEnPromptBound.tags[tabname] === container) {
            return;
        }

        forgeEnPromptBound.tags[tabname] = container;

        container.addEventListener("click", function (event) {
            const button = event.target.closest("." + FORGE_EN_PROMPT_TAG_CLASS);
            if (!button || !container.contains(button)) return;

            event.preventDefault();
            event.stopPropagation();

            const index = parseInt(button.dataset.index, 10);
            if (Number.isNaN(index)) return;

            forgeEnPromptShowInsertPopover(button, tabname, index);
        });

        container.addEventListener("contextmenu", function (event) {
            const button = event.target.closest("." + FORGE_EN_PROMPT_TAG_CLASS);
            if (!button || !container.contains(button)) return;

            event.preventDefault();
            event.stopPropagation();

            const index = parseInt(button.dataset.index, 10);
            if (Number.isNaN(index)) return;

            forgeEnPromptRemoveAt(tabname, index);
        });
    });
}

function forgeEnPromptInstallSortGuard(tabname) {
    if (typeof extraNetworksApplySort === "undefined") {
        return;
    }

    const tabnameFull = forgeEnPromptTabnameFull(tabname);
    if (
        extraNetworksApplySort[tabnameFull] &&
        extraNetworksApplySort[tabnameFull]._forgeEnPromptGuard
    ) {
        return;
    }

    extraNetworksApplySort[tabnameFull] = function () {
        forgeEnPromptSyncTags(tabname);
    };
    extraNetworksApplySort[tabnameFull]._forgeEnPromptGuard = true;
    extraNetworksApplyFilter[tabnameFull] = function () {
        forgeEnPromptSyncTags(tabname);
    };
}

function forgeEnPromptInstallTabSelectHook() {
    if (
        typeof extraNetworksTabSelected === "undefined" ||
        extraNetworksTabSelected._forgeEnPromptHook
    ) {
        return;
    }

    const original = extraNetworksTabSelected;
    extraNetworksTabSelected = function (
        tabname,
        id,
        showPrompt,
        showNegativePrompt,
        tabnameFull,
    ) {
        if (
            tabnameFull === forgeEnPromptTabnameFull("txt2img") ||
            tabnameFull === forgeEnPromptTabnameFull("img2img")
        ) {
            forgeEnPromptInstallSortGuard(
                tabnameFull.indexOf("txt2img") === 0 ? "txt2img" : "img2img",
            );
        }
        return original.apply(this, arguments);
    };
    extraNetworksTabSelected._forgeEnPromptHook = true;
}

function forgeEnPromptInit() {
    forgeEnPromptBindPromptListeners();
    forgeEnPromptBindTagsContainers();
    forgeEnPromptInstallTabSelectHook();
    forgeEnPromptInstallSortGuard("txt2img");
    forgeEnPromptInstallSortGuard("img2img");
    forgeEnPromptSyncAllTags();
}

function forgeEnPromptScheduleAfterUiUpdate() {
    if (forgeEnPromptAfterUiUpdatePending !== null) {
        clearTimeout(forgeEnPromptAfterUiUpdatePending);
    }
    forgeEnPromptAfterUiUpdatePending = setTimeout(function () {
        forgeEnPromptAfterUiUpdatePending = null;
        forgeEnPromptInit();
    }, 200);
}

if (typeof onUiLoaded === "function") {
    onUiLoaded(forgeEnPromptInit);
} else {
    forgeEnPromptInit();
}

if (typeof onAfterUiUpdate === "function") {
    onAfterUiUpdate(forgeEnPromptScheduleAfterUiUpdate);
}
