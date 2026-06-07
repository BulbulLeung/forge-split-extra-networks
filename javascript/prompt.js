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
const FORGE_EN_PROMPT_NEWLINE_MARKER = "\u0001";
const FORGE_EN_PROMPT_NEWLINE_LABEL = "\\n";
const FORGE_EN_PROMPT_TAG_CLASS_NEWLINE = "forge-en-prompt-tag--newline";
const FORGE_EN_PROMPT_DEFAULT_WILDCARD_WRAP = "__";
const FORGE_EN_PROMPT_LORA_RE = /^<lora:[^:>]+:[\d.]+>$/i;
const FORGE_EN_PROMPT_LORA_NEG_RE = /^\(lora:[^:)]+:[\d.]+\)$/i;
const FORGE_EN_PROMPT_DRAG_THRESHOLD_PX = 6;
const FORGE_EN_PROMPT_TAG_CLASS_DRAGGING = "forge-en-prompt-tag--dragging";
const FORGE_EN_PROMPT_DROP_LINE_CLASS = "forge-en-prompt-drop-line";
const FORGE_EN_PROMPT_TAGS_CLASS_DRAGGING = "forge-en-prompt-tags--dragging";
const FORGE_EN_PROMPT_HISTORY_LIMIT = 16;
const FORGE_EN_PROMPT_HISTORY_DELAY_MS = 600;
const FORGE_EN_LOCAL_AI_CONNECT_ERROR = "Local AI connect error";
const FORGE_EN_PROMPT_TOOLTIP_DEBOUNCE_MS = 150;

const forgeEnPromptBound = {
    prompt: Object.create(null),
    negPrompt: Object.create(null),
    tags: Object.create(null),
};

let forgeEnPromptInsertPopoverEl = null;
let forgeEnPromptInsertPopoverState = null;
let forgeEnPromptTagTooltipEl = null;
let forgeEnPromptTagTooltipHoverTimer = null;
let forgeEnPromptTagTooltipAnchor = null;
let forgeEnPromptTagTooltipActiveKey = null;
const forgeEnPromptTagTooltipCache = new Map();
const forgeEnPromptTagTooltipInflight = new Map();
let forgeEnPromptAfterUiUpdatePending = null;
let forgeEnPromptDragState = null;
let forgeEnPromptDragSuppressClick = false;
const forgeEnPromptHistoryByTextarea = new WeakMap();
const forgeEnPromptHistoryEditTimers = new WeakMap();

function forgeEnPromptHistoryEnabled() {
    return true;
}

function forgeEnPromptGetHistoryState(textarea) {
    let state = forgeEnPromptHistoryByTextarea.get(textarea);
    if (!state) {
        state = { undoStack: [], redoStack: [] };
        forgeEnPromptHistoryByTextarea.set(textarea, state);
    }
    return state;
}

function forgeEnPromptHistorySnapshot(textarea, reset) {
    if (!forgeEnPromptHistoryEnabled() || !textarea) return;
    if (reset === undefined) {
        reset = true;
    }

    const state = forgeEnPromptGetHistoryState(textarea);
    const current = textarea.value;
    if (current === state.undoStack.at(-1)) return;

    state.undoStack.push(current);
    if (state.undoStack.length > FORGE_EN_PROMPT_HISTORY_LIMIT) {
        state.undoStack.shift();
    }
    if (reset) {
        state.redoStack.length = 0;
    }
}

function forgeEnPromptHistoryEnsureInitial(textarea) {
    if (!forgeEnPromptHistoryEnabled() || !textarea) return;
    const state = forgeEnPromptGetHistoryState(textarea);
    if (state.undoStack.length === 0) {
        forgeEnPromptHistorySnapshot(textarea);
    }
}

function forgeEnPromptHistoryApplyValue(tabname, textarea, value) {
    textarea.value = value;
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

function forgeEnPromptHistoryUndo(tabname, textarea) {
    if (!forgeEnPromptHistoryEnabled() || !textarea) return;

    const state = forgeEnPromptGetHistoryState(textarea);
    forgeEnPromptHistorySnapshot(textarea, false);

    if (state.undoStack.length < 2) {
        return;
    }

    const current = state.undoStack.pop();
    state.redoStack.push(current);
    forgeEnPromptHistoryApplyValue(tabname, textarea, state.undoStack.at(-1));
}

function forgeEnPromptHistoryRedo(tabname, textarea) {
    if (!forgeEnPromptHistoryEnabled() || !textarea) return;

    const state = forgeEnPromptGetHistoryState(textarea);
    if (state.redoStack.length < 1) return;

    state.undoStack.push(textarea.value);
    forgeEnPromptHistoryApplyValue(
        tabname,
        textarea,
        state.redoStack.pop(),
    );
}

function forgeEnPromptHistoryScheduleSnapshot(textarea) {
    const prev = forgeEnPromptHistoryEditTimers.get(textarea);
    if (prev) clearTimeout(prev);
    forgeEnPromptHistoryEditTimers.set(
        textarea,
        setTimeout(function () {
            forgeEnPromptHistoryEditTimers.delete(textarea);
            forgeEnPromptHistorySnapshot(textarea);
        }, FORGE_EN_PROMPT_HISTORY_DELAY_MS),
    );
}

function forgeEnPromptHistoryHandleKeydown(event, tabname) {
    if (!(event.ctrlKey || event.metaKey)) return false;

    if (!forgeEnPromptHistoryEnabled()) {
        return false;
    }

    if (
        event.target &&
        event.target.closest &&
        event.target.closest(".forge-en-prompt-insert-popover")
    ) {
        return false;
    }

    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) {
        return false;
    }

    const prev = forgeEnPromptHistoryEditTimers.get(textarea);
    if (prev) clearTimeout(prev);

    if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        forgeEnPromptHistoryUndo(tabname, textarea);
        return true;
    }
    if (event.key === "Z" && event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        forgeEnPromptHistoryRedo(tabname, textarea);
        return true;
    }
    return false;
}

function forgeEnPromptIsPromptTabActive(tabname) {
    const app = gradioApp();
    if (!app) return false;

    const tabBtn = app.querySelector("#" + tabname + "_en_prompt");
    if (tabBtn && tabBtn.classList.contains("selected")) {
        return true;
    }

    const columns = app.querySelectorAll(
        "#" + tabname + "_extra_tabs .forge-en-column",
    );
    for (let i = 0; i < columns.length; i++) {
        if (columns[i].dataset.forgeEnActiveSlug === FORGE_EN_PROMPT_PAGE) {
            return true;
        }
    }
    return false;
}

function forgeEnPromptInstallGlobalUndoKeydown() {
    if (forgeEnPromptInstallGlobalUndoKeydown._installed) {
        return;
    }
    forgeEnPromptInstallGlobalUndoKeydown._installed = true;

    document.addEventListener(
        "keydown",
        function (event) {
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.key !== "z" && event.key !== "Z") return;

            for (let i = 0; i < FORGE_EN_PROMPT_TABNAMES.length; i++) {
                const tabname = FORGE_EN_PROMPT_TABNAMES[i];
                if (!forgeEnPromptIsPromptTabActive(tabname)) continue;
                if (forgeEnPromptHistoryHandleKeydown(event, tabname)) {
                    break;
                }
            }
        },
        true,
    );
}

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

function forgeEnPromptPrepareTagsContainer(container) {
    if (!container) return;
    if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
    }
}

function forgeEnPromptEnsureTagsContainer(tabname) {
    let container = forgeEnPromptGetTagsContainer(tabname);
    if (container) {
        forgeEnPromptPrepareTagsContainer(container);
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
    forgeEnPromptPrepareTagsContainer(container);
    cards.appendChild(container);

    if (forgeEnPromptBound.tags[tabname] !== container) {
        delete forgeEnPromptBound.tags[tabname];
        forgeEnPromptBindTagsContainers();
    }

    return container;
}

function forgeEnPromptRemoveLegacyToolbar(tabname) {
    const app = gradioApp();
    if (!app) return;

    const cards = app.querySelector("#" + forgeEnPromptTabnameFull(tabname) + "_cards");
    if (!cards) return;

    cards.querySelectorAll(".forge-en-prompt-toolbar").forEach(function (el) {
        el.remove();
    });
}

function forgeEnPromptIsNewlinePart(part) {
    return part === FORGE_EN_PROMPT_NEWLINE_MARKER;
}

function forgeEnPromptSplitParts(text) {
    if (!text) return [];
    const parts = [];
    text.split("\n").forEach(function (line, lineIndex) {
        if (lineIndex > 0) {
            parts.push(FORGE_EN_PROMPT_NEWLINE_MARKER);
        }
        line.split(",").forEach(function (part) {
            const trimmed = part.trim();
            if (trimmed.length > 0) {
                parts.push(trimmed);
            }
        });
    });
    return parts;
}

function forgeEnPromptJoinParts(parts) {
    const lines = [];
    let current = [];
    parts.forEach(function (part) {
        if (forgeEnPromptIsNewlinePart(part)) {
            if (current.length > 0) {
                lines.push(current.join(FORGE_EN_PROMPT_SEPARATOR) + ",");
            } else {
                lines.push("");
            }
            current = [];
        } else {
            current.push(part);
        }
    });
    lines.push(current.join(FORGE_EN_PROMPT_SEPARATOR));
    return lines.join("\n");
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

function forgeEnPromptTagTooltipNeedsTranslation(partText) {
    return (
        !forgeEnPromptIsLoraPart(partText) &&
        !forgeEnPromptIsWildcardPart(partText)
    );
}

function forgeEnPromptTagTypeClass(part) {
    if (forgeEnPromptIsNewlinePart(part)) {
        return FORGE_EN_PROMPT_TAG_CLASS_NEWLINE;
    }
    if (forgeEnPromptIsLoraPart(part)) {
        return FORGE_EN_PROMPT_TAG_CLASS_LORA;
    }
    if (forgeEnPromptIsWildcardPart(part)) {
        return FORGE_EN_PROMPT_TAG_CLASS_WILDCARD;
    }
    return "";
}

function forgeEnPromptApplyTextarea(tabname, textarea, text) {
    if (!textarea || textarea.value === text) return;
    forgeEnPromptHistorySnapshot(textarea);
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

function forgeEnPromptInsertNewlineAfter(tabname, index) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const parts = forgeEnPromptSplitParts(textarea.value || "");
    const insertAt = Math.min(Math.max(0, index + 1), parts.length);
    parts.splice(insertAt, 0, FORGE_EN_PROMPT_NEWLINE_MARKER);
    forgeEnPromptApplyTextarea(tabname, textarea, forgeEnPromptJoinParts(parts));
}

function forgeEnPromptInsertAfter(tabname, index, newText) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const trimmed = (newText || "").trim();
    if (!trimmed) return;

    if (trimmed === "\\n") {
        forgeEnPromptInsertNewlineAfter(tabname, index);
        return;
    }

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

function forgeEnPromptGetInsertAt(fromIndex, toIndex, insertBefore) {
    if (insertBefore) {
        return fromIndex < toIndex ? toIndex - 1 : toIndex;
    }
    return fromIndex < toIndex ? toIndex : toIndex + 1;
}

function forgeEnPromptMoveBefore(tabname, fromIndex, toIndex) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const parts = forgeEnPromptSplitParts(textarea.value || "");
    if (fromIndex < 0 || fromIndex >= parts.length) return;
    if (toIndex < 0 || toIndex >= parts.length) return;

    const insertAt = forgeEnPromptGetInsertAt(fromIndex, toIndex, true);
    if (insertAt === fromIndex) return;

    const item = parts.splice(fromIndex, 1)[0];
    parts.splice(insertAt, 0, item);
    forgeEnPromptApplyTextarea(tabname, textarea, forgeEnPromptJoinParts(parts));
}

function forgeEnPromptMoveAfter(tabname, fromIndex, toIndex) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const parts = forgeEnPromptSplitParts(textarea.value || "");
    if (fromIndex < 0 || fromIndex >= parts.length) return;
    if (toIndex < 0 || toIndex >= parts.length) return;

    const insertAt = forgeEnPromptGetInsertAt(fromIndex, toIndex, false);
    if (insertAt === fromIndex) return;

    const item = parts.splice(fromIndex, 1)[0];
    parts.splice(insertAt, 0, item);
    forgeEnPromptApplyTextarea(tabname, textarea, forgeEnPromptJoinParts(parts));
}

function forgeEnPromptClearDragVisuals(container) {
    if (!container) return;
    container.classList.remove(FORGE_EN_PROMPT_TAGS_CLASS_DRAGGING);
    container
        .querySelectorAll("." + FORGE_EN_PROMPT_TAG_CLASS_DRAGGING)
        .forEach(function (el) {
            el.classList.remove(FORGE_EN_PROMPT_TAG_CLASS_DRAGGING);
        });
    forgeEnPromptHideDropLine(container);
}

function forgeEnPromptEnsureDropLine(container) {
    let line = container.querySelector("." + FORGE_EN_PROMPT_DROP_LINE_CLASS);
    if (!line) {
        line = document.createElement("div");
        line.className = FORGE_EN_PROMPT_DROP_LINE_CLASS;
        line.style.display = "none";
        container.appendChild(line);
    }
    return line;
}

function forgeEnPromptHideDropLine(container) {
    if (!container) return;
    const line = container.querySelector("." + FORGE_EN_PROMPT_DROP_LINE_CLASS);
    if (line) {
        line.style.display = "none";
    }
}

function forgeEnPromptShowDropLine(container, targetButton, insertBefore) {
    const line = forgeEnPromptEnsureDropLine(container);
    const containerRect = container.getBoundingClientRect();
    const btnRect = targetButton.getBoundingClientRect();
    const gapRaw = getComputedStyle(container).columnGap || getComputedStyle(container).gap;
    const gapPx = parseFloat(gapRaw) || 5.6;
    const lineWidth = 2;
    let left;
    if (insertBefore) {
        left =
            btnRect.left -
            containerRect.left +
            container.scrollLeft -
            (gapPx + lineWidth) / 2;
    } else {
        left =
            btnRect.right -
            containerRect.left +
            container.scrollLeft +
            (gapPx - lineWidth) / 2;
    }
    const top = btnRect.top - containerRect.top + container.scrollTop;

    line.style.display = "block";
    line.style.left = Math.round(left) + "px";
    line.style.top = Math.round(top) + "px";
    line.style.height = Math.round(btnRect.height) + "px";
}

function forgeEnPromptResetDragState(container) {
    forgeEnPromptClearDragVisuals(container);
    forgeEnPromptDragState = null;
}

function forgeEnPromptFinishDrag(event, container) {
    if (!forgeEnPromptDragState || forgeEnPromptDragState.container !== container) {
        return;
    }

    const state = forgeEnPromptDragState;
    if (
        state.sourceButton &&
        state.sourceButton.hasPointerCapture &&
        state.sourceButton.hasPointerCapture(event.pointerId)
    ) {
        try {
            state.sourceButton.releasePointerCapture(event.pointerId);
        } catch (_err) {
            /* ignore */
        }
    }

    if (state.dragging) {
        event.preventDefault();
        event.stopPropagation();
        forgeEnPromptDragSuppressClick = true;
        if (
            state.dropIndex !== null &&
            !Number.isNaN(state.dropIndex) &&
            state.insertBefore !== null
        ) {
            const insertAt = forgeEnPromptGetInsertAt(
                state.fromIndex,
                state.dropIndex,
                state.insertBefore,
            );
            if (insertAt !== state.fromIndex) {
                if (state.insertBefore) {
                    forgeEnPromptMoveBefore(
                        state.tabname,
                        state.fromIndex,
                        state.dropIndex,
                    );
                } else {
                    forgeEnPromptMoveAfter(
                        state.tabname,
                        state.fromIndex,
                        state.dropIndex,
                    );
                }
            }
        }
    }

    forgeEnPromptResetDragState(container);
}

function forgeEnPromptLocalAiEnabled() {
    return (
        typeof opts !== "undefined" && opts.forge_en_local_ai_enabled === true
    );
}

function forgeEnPromptGetTranslateLang() {
    if (
        typeof opts !== "undefined" &&
        opts.forge_en_local_ai_translate_lang
    ) {
        return String(opts.forge_en_local_ai_translate_lang);
    }
    return "繁體中文";
}

function forgeEnPromptGetTagTooltipCacheKey(partText) {
    return partText + "\0" + forgeEnPromptGetTranslateLang();
}

function forgeEnPromptAnchorMatchesCacheKey(button, cacheKey) {
    if (!button) return false;
    return forgeEnPromptGetTagTooltipCacheKey(
        button.dataset.promptText || button.textContent || "",
    ) === cacheKey;
}

function forgeEnPromptApplyTagTooltipEntry(
    tooltip,
    button,
    cacheKey,
    entry,
) {
    if (
        !forgeEnPromptTagTooltipAnchor ||
        !forgeEnPromptAnchorMatchesCacheKey(
            forgeEnPromptTagTooltipAnchor,
            cacheKey,
        )
    ) {
        return;
    }

    const translationEl = tooltip.querySelector(
        ".forge-en-prompt-tag-tooltip__translation",
    );
    if (!translationEl) return;

    if (entry.error) {
        translationEl.textContent = entry.error;
        translationEl.classList.add("forge-en-prompt-tag-tooltip__error");
    } else {
        translationEl.textContent = entry.translation;
        translationEl.classList.remove("forge-en-prompt-tag-tooltip__error");
    }
    forgeEnPromptPositionTagTooltip(tooltip, forgeEnPromptTagTooltipAnchor);
}

function forgeEnPromptFetchTagTooltipTranslation(cacheKey, partText) {
    const cached = forgeEnPromptTagTooltipCache.get(cacheKey);
    if (cached) {
        return Promise.resolve(cached);
    }

    const inflight = forgeEnPromptTagTooltipInflight.get(cacheKey);
    if (inflight) {
        return inflight;
    }

    const promise = fetch("/forge-en-local-ai/translate-tooltip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: partText }),
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            const entry = data.error
                ? { translation: "", error: data.error }
                : { translation: data.translation || "", error: null };
            forgeEnPromptTagTooltipCache.set(cacheKey, entry);
            return entry;
        })
        .catch(function () {
            const entry = {
                translation: "",
                error: FORGE_EN_LOCAL_AI_CONNECT_ERROR,
            };
            forgeEnPromptTagTooltipCache.set(cacheKey, entry);
            return entry;
        })
        .finally(function () {
            forgeEnPromptTagTooltipInflight.delete(cacheKey);
        });

    forgeEnPromptTagTooltipInflight.set(cacheKey, promise);
    return promise;
}

function forgeEnPromptHideTagTooltip() {
    if (forgeEnPromptTagTooltipHoverTimer !== null) {
        clearTimeout(forgeEnPromptTagTooltipHoverTimer);
        forgeEnPromptTagTooltipHoverTimer = null;
    }
    if (forgeEnPromptTagTooltipEl) {
        forgeEnPromptTagTooltipEl.style.display = "none";
    }
    forgeEnPromptTagTooltipAnchor = null;
    forgeEnPromptTagTooltipActiveKey = null;
}

function forgeEnPromptEnsureTagTooltip() {
    if (forgeEnPromptTagTooltipEl) {
        return forgeEnPromptTagTooltipEl;
    }

    const app = gradioApp();
    if (!app) return null;

    const tooltip = document.createElement("div");
    tooltip.className = "forge-en-prompt-tag-tooltip";
    tooltip.style.display = "none";
    tooltip.innerHTML =
        '<div class="forge-en-prompt-tag-tooltip__original"></div>' +
        '<div class="forge-en-prompt-tag-tooltip__divider"></div>' +
        '<div class="forge-en-prompt-tag-tooltip__translation"></div>';

    app.appendChild(tooltip);
    forgeEnPromptTagTooltipEl = tooltip;
    return tooltip;
}

function forgeEnPromptPositionTagTooltip(tooltip, anchor) {
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    let top = rect.bottom + margin;

    tooltip.style.display = "block";
    tooltip.style.visibility = "hidden";

    const tipRect = tooltip.getBoundingClientRect();
    const maxLeft = window.innerWidth - tipRect.width - margin;
    const maxTop = window.innerHeight - tipRect.height - margin;

    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    tooltip.style.visibility = "visible";
}

function forgeEnPromptShowTagTooltip(button, partText, isNewline) {
    const tooltip = forgeEnPromptEnsureTagTooltip();
    if (!tooltip) return;

    forgeEnPromptTagTooltipAnchor = button;

    const originalEl = tooltip.querySelector(
        ".forge-en-prompt-tag-tooltip__original",
    );
    const dividerEl = tooltip.querySelector(
        ".forge-en-prompt-tag-tooltip__divider",
    );
    const translationEl = tooltip.querySelector(
        ".forge-en-prompt-tag-tooltip__translation",
    );

    if (isNewline) {
        originalEl.textContent = "Line break";
        dividerEl.style.display = "none";
        translationEl.textContent = "";
        translationEl.classList.remove("forge-en-prompt-tag-tooltip__error");
        forgeEnPromptPositionTagTooltip(tooltip, button);
        return;
    }

    originalEl.textContent = partText;

    if (!forgeEnPromptLocalAiEnabled()) {
        dividerEl.style.display = "none";
        translationEl.textContent = "";
        translationEl.classList.remove("forge-en-prompt-tag-tooltip__error");
        forgeEnPromptPositionTagTooltip(tooltip, button);
        return;
    }

    if (!forgeEnPromptTagTooltipNeedsTranslation(partText)) {
        dividerEl.style.display = "none";
        translationEl.textContent = "";
        translationEl.classList.remove("forge-en-prompt-tag-tooltip__error");
        forgeEnPromptPositionTagTooltip(tooltip, button);
        return;
    }

    const cacheKey = forgeEnPromptGetTagTooltipCacheKey(partText);
    forgeEnPromptTagTooltipActiveKey = cacheKey;
    const cached = forgeEnPromptTagTooltipCache.get(cacheKey);
    dividerEl.style.display = "block";

    if (cached) {
        if (cached.error) {
            translationEl.textContent = cached.error;
            translationEl.classList.add("forge-en-prompt-tag-tooltip__error");
        } else {
            translationEl.textContent = cached.translation;
            translationEl.classList.remove("forge-en-prompt-tag-tooltip__error");
        }
        forgeEnPromptPositionTagTooltip(tooltip, button);
        return;
    }

    translationEl.textContent = "...";
    translationEl.classList.remove("forge-en-prompt-tag-tooltip__error");
    forgeEnPromptPositionTagTooltip(tooltip, button);

    forgeEnPromptFetchTagTooltipTranslation(cacheKey, partText).then(
        function (entry) {
            forgeEnPromptApplyTagTooltipEntry(
                tooltip,
                button,
                cacheKey,
                entry,
            );
        },
    );
}

function forgeEnPromptOnTagMouseEnter(button) {
    const partText = button.dataset.promptText || button.textContent || "";
    const cacheKey = forgeEnPromptGetTagTooltipCacheKey(partText);
    if (
        forgeEnPromptTagTooltipAnchor === button &&
        forgeEnPromptTagTooltipActiveKey === cacheKey &&
        forgeEnPromptTagTooltipEl &&
        forgeEnPromptTagTooltipEl.style.display !== "none"
    ) {
        return;
    }

    if (forgeEnPromptTagTooltipHoverTimer !== null) {
        clearTimeout(forgeEnPromptTagTooltipHoverTimer);
    }
    forgeEnPromptTagTooltipHoverTimer = setTimeout(function () {
        forgeEnPromptTagTooltipHoverTimer = null;
        const isNewline = button.classList.contains(
            FORGE_EN_PROMPT_TAG_CLASS_NEWLINE,
        );
        const partText = button.dataset.promptText || button.textContent || "";
        forgeEnPromptShowTagTooltip(button, partText, isNewline);
    }, FORGE_EN_PROMPT_TOOLTIP_DEBOUNCE_MS);
}

function forgeEnPromptOnTagMouseLeave(button) {
    if (forgeEnPromptTagTooltipHoverTimer !== null) {
        clearTimeout(forgeEnPromptTagTooltipHoverTimer);
        forgeEnPromptTagTooltipHoverTimer = null;
    }
    if (forgeEnPromptTagTooltipAnchor === button) {
        forgeEnPromptHideTagTooltip();
    }
}

function forgeEnPromptBindTagTooltip(container) {
    if (container._forgeEnTooltipBound) return;
    container._forgeEnTooltipBound = true;

    container.addEventListener("mouseover", function (event) {
        const button = event.target.closest("." + FORGE_EN_PROMPT_TAG_CLASS);
        if (!button || !container.contains(button)) return;
        const related = event.relatedTarget;
        if (related && button.contains(related)) return;
        forgeEnPromptOnTagMouseEnter(button);
    });

    container.addEventListener("mouseout", function (event) {
        const button = event.target.closest("." + FORGE_EN_PROMPT_TAG_CLASS);
        if (!button || !container.contains(button)) return;
        const related = event.relatedTarget;
        if (related && button.contains(related)) return;
        forgeEnPromptOnTagMouseLeave(button);
    });
}

function forgeEnPromptSetInsertStatus(message, isError) {
    if (!forgeEnPromptInsertPopoverEl) return;
    const status = forgeEnPromptInsertPopoverEl.querySelector(
        ".forge-en-prompt-insert-status",
    );
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("forge-en-prompt-insert-status--error", !!isError);
    status.style.display = message ? "block" : "none";
}

function forgeEnPromptSetInsertLoading(loading) {
    if (!forgeEnPromptInsertPopoverEl) return;
    const input = forgeEnPromptInsertPopoverEl.querySelector(
        ".forge-en-prompt-insert-input",
    );
    const confirmBtn = forgeEnPromptInsertPopoverEl.querySelector(
        ".forge-en-prompt-insert-confirm",
    );
    const cancelBtn = forgeEnPromptInsertPopoverEl.querySelector(
        ".forge-en-prompt-insert-cancel",
    );
    if (input) input.disabled = loading;
    if (confirmBtn) {
        confirmBtn.disabled = loading;
        confirmBtn.textContent = loading ? "Processing..." : "Insert";
    }
    if (cancelBtn) cancelBtn.disabled = loading;
}

function forgeEnPromptInsertMultipleAfter(tabname, index, texts) {
    const textarea = forgeEnPromptGetTextarea(tabname);
    if (!textarea) return;

    const toInsert = (texts || [])
        .map(function (t) {
            return (t || "").trim();
        })
        .filter(function (t) {
            return t.length > 0;
        });
    if (toInsert.length === 0) return;

    const parts = forgeEnPromptSplitParts(textarea.value || "");
    const insertAt = Math.min(Math.max(0, index + 1), parts.length);
    parts.splice(insertAt, 0, ...toInsert);
    forgeEnPromptApplyTextarea(
        tabname,
        textarea,
        forgeEnPromptJoinParts(parts),
    );
}

function forgeEnPromptInsertNeedsLlm(rawText) {
    const trimmed = (rawText || "").trim();
    if (!trimmed || trimmed === "\\n") {
        return false;
    }
    if (trimmed.startsWith("#")) {
        return true;
    }
    return /[\u0400-\u04FF\u0600-\u06FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uAC00-\uD7AF]/.test(
        trimmed,
    );
}

async function forgeEnPromptProcessInsert(tabname, index, rawText) {
    const trimmed = (rawText || "").trim();
    if (!trimmed) return { ok: false };

    if (!forgeEnPromptLocalAiEnabled()) {
        if (trimmed === "\\n") {
            forgeEnPromptInsertNewlineAfter(tabname, index);
        } else {
            forgeEnPromptInsertAfter(tabname, index, trimmed);
        }
        return { ok: true };
    }

    if (trimmed === "\\n") {
        forgeEnPromptInsertNewlineAfter(tabname, index);
        return { ok: true };
    }

    if (!forgeEnPromptInsertNeedsLlm(trimmed)) {
        forgeEnPromptInsertAfter(tabname, index, trimmed);
        return { ok: true };
    }

    const response = await fetch("/forge-en-local-ai/process-insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
    });
    const data = await response.json();

    if (data.error) {
        return { ok: false, error: data.error };
    }

    if (data.parts && Array.isArray(data.parts)) {
        if (data.parts.length > 0) {
            forgeEnPromptInsertMultipleAfter(tabname, index, data.parts);
        }
        return { ok: true };
    }

    const text = (data.text || "").trim();
    if (!text) {
        return { ok: false, error: FORGE_EN_LOCAL_AI_CONNECT_ERROR };
    }
    forgeEnPromptInsertAfter(tabname, index, text);
    return { ok: true };
}

function forgeEnPromptHideInsertPopover() {
    if (forgeEnPromptInsertPopoverEl) {
        forgeEnPromptInsertPopoverEl.style.display = "none";
        forgeEnPromptSetInsertLoading(false);
        forgeEnPromptSetInsertStatus("", false);
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
        '<div class="forge-en-prompt-insert-status" style="display:none"></div>' +
        '<div class="forge-en-prompt-insert-actions">' +
        '<button type="button" class="forge-en-prompt-insert-confirm lg primary gradio-button custom-button">Insert</button>' +
        '<button type="button" class="forge-en-prompt-insert-cancel lg secondary gradio-button custom-button">Cancel</button>' +
        "</div>";

    const input = popover.querySelector(".forge-en-prompt-insert-input");
    const confirmBtn = popover.querySelector(".forge-en-prompt-insert-confirm");
    const cancelBtn = popover.querySelector(".forge-en-prompt-insert-cancel");

    confirmBtn.addEventListener("click", async function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!forgeEnPromptInsertPopoverState) return;
        const state = forgeEnPromptInsertPopoverState;

        forgeEnPromptSetInsertStatus("", false);
        forgeEnPromptSetInsertLoading(true);

        try {
            const result = await forgeEnPromptProcessInsert(
                state.tabname,
                state.index,
                input.value,
            );
            if (!result.ok) {
                forgeEnPromptSetInsertStatus(
                    result.error || FORGE_EN_LOCAL_AI_CONNECT_ERROR,
                    true,
                );
                forgeEnPromptSetInsertLoading(false);
                return;
            }
            forgeEnPromptHideInsertPopover();
        } catch (_err) {
            forgeEnPromptSetInsertStatus(
                FORGE_EN_LOCAL_AI_CONNECT_ERROR,
                true,
            );
            forgeEnPromptSetInsertLoading(false);
        }
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
    input.disabled = false;
    forgeEnPromptSetInsertStatus("", false);
    forgeEnPromptSetInsertLoading(false);
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
        if (forgeEnPromptIsNewlinePart(part)) {
            button.textContent = FORGE_EN_PROMPT_NEWLINE_LABEL;
        } else {
            button.dataset.promptText = part;
            button.textContent = part;
        }
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
    forgeEnPromptHistoryEnsureInitial(textarea);
    textarea.addEventListener("input", function () {
        forgeEnPromptOnPromptActivity(tabname);
    });
    textarea.addEventListener("keydown", function (event) {
        if (forgeEnPromptHistoryHandleKeydown(event, tabname)) {
            return;
        }
        if (["Control", "Meta", "Shift", "Alt"].includes(event.key)) return;
        forgeEnPromptHistoryScheduleSnapshot(textarea);
    }, true);
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
        forgeEnPromptPrepareTagsContainer(container);
        forgeEnPromptBindTagTooltip(container);

        container.addEventListener("pointerdown", function (event) {
            if (event.button !== 0) return;
            if (event.target === container) {
                container.focus();
            }
            const button = event.target.closest("." + FORGE_EN_PROMPT_TAG_CLASS);
            if (!button || !container.contains(button)) return;

            const index = parseInt(button.dataset.index, 10);
            if (Number.isNaN(index)) return;

            forgeEnPromptDragState = {
                tabname: tabname,
                container: container,
                fromIndex: index,
                sourceButton: button,
                startX: event.clientX,
                startY: event.clientY,
                dragging: false,
                dropIndex: null,
                insertBefore: null,
                pointerId: event.pointerId,
            };

            if (button.setPointerCapture) {
                button.setPointerCapture(event.pointerId);
            }
        });

        container.addEventListener("pointermove", function (event) {
            if (
                !forgeEnPromptDragState ||
                forgeEnPromptDragState.container !== container ||
                event.pointerId !== forgeEnPromptDragState.pointerId
            ) {
                return;
            }

            const state = forgeEnPromptDragState;
            if (!state.dragging) {
                const dx = event.clientX - state.startX;
                const dy = event.clientY - state.startY;
                if (
                    Math.hypot(dx, dy) <
                    FORGE_EN_PROMPT_DRAG_THRESHOLD_PX
                ) {
                    return;
                }
                state.dragging = true;
                container.classList.add(FORGE_EN_PROMPT_TAGS_CLASS_DRAGGING);
                state.sourceButton.classList.add(
                    FORGE_EN_PROMPT_TAG_CLASS_DRAGGING,
                );
                forgeEnPromptHideInsertPopover();
            }

            forgeEnPromptHideDropLine(container);

            const under = document.elementFromPoint(
                event.clientX,
                event.clientY,
            );
            const target =
                under &&
                under.closest("." + FORGE_EN_PROMPT_TAG_CLASS);
            if (
                target &&
                container.contains(target) &&
                target !== state.sourceButton
            ) {
                const rect = target.getBoundingClientRect();
                const insertBefore =
                    event.clientX < rect.left + rect.width / 2;
                forgeEnPromptShowDropLine(container, target, insertBefore);
                state.dropIndex = parseInt(target.dataset.index, 10);
                state.insertBefore = insertBefore;
            } else {
                state.dropIndex = null;
                state.insertBefore = null;
            }
        });

        container.addEventListener("pointerup", function (event) {
            forgeEnPromptFinishDrag(event, container);
        });

        container.addEventListener("pointercancel", function (event) {
            forgeEnPromptFinishDrag(event, container);
        });

        container.addEventListener("click", function (event) {
            if (!forgeEnPromptDragSuppressClick) return;
            event.preventDefault();
            event.stopPropagation();
            forgeEnPromptDragSuppressClick = false;
        });

        container.addEventListener("dblclick", function (event) {
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

        container.addEventListener("keydown", function (event) {
            forgeEnPromptHistoryHandleKeydown(event, tabname);
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

function forgeEnPromptHideToolbar(tabname) {
    const app = gradioApp();
    if (!app) return;

    const tabnameFull = forgeEnPromptTabnameFull(tabname);
    const controls = app.querySelector("#" + tabnameFull + "_controls");
    if (controls) {
        controls.style.display = "none";
    }
}

function forgeEnPromptRestoreColumnControls(tabname) {
    const app = gradioApp();
    if (!app) return;

    app.querySelectorAll(
        "#" + tabname + "_extra_tabs .forge-en-column",
    ).forEach(function (column) {
        if (column.dataset.forgeEnActiveSlug === FORGE_EN_PROMPT_PAGE) {
            return;
        }
        const columnControls = column.querySelector(".forge-en-column-controls");
        if (columnControls) {
            columnControls.style.removeProperty("display");
        }
    });
}

function forgeEnPromptHideAllToolbars() {
    FORGE_EN_PROMPT_TABNAMES.forEach(forgeEnPromptHideToolbar);
}

function forgeEnPromptRestoreAllColumnControls() {
    FORGE_EN_PROMPT_TABNAMES.forEach(forgeEnPromptRestoreColumnControls);
}

function forgeEnPromptInstallControlsHook() {
    if (
        typeof extraNetworksShowControlsForPage === "undefined" ||
        extraNetworksShowControlsForPage._forgeEnPromptHook
    ) {
        return;
    }

    const original = extraNetworksShowControlsForPage;
    extraNetworksShowControlsForPage = function (tabname, tabnameFull) {
        original.apply(this, arguments);
        if (tabnameFull === forgeEnPromptTabnameFull(tabname)) {
            forgeEnPromptHideToolbar(tabname);
        } else if (tabnameFull) {
            forgeEnPromptRestoreColumnControls(tabname);
        }
    };
    extraNetworksShowControlsForPage._forgeEnPromptHook = true;
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
        const result = original.apply(this, arguments);
        if (tabnameFull === forgeEnPromptTabnameFull(tabname)) {
            forgeEnPromptInstallSortGuard(tabname);
            forgeEnPromptHideToolbar(tabname);
        } else if (tabnameFull) {
            forgeEnPromptRestoreColumnControls(tabname);
        }
        return result;
    };
    extraNetworksTabSelected._forgeEnPromptHook = true;
}

function forgeEnPromptInit() {
    forgeEnPromptInstallGlobalUndoKeydown();
    forgeEnPromptBindPromptListeners();
    FORGE_EN_PROMPT_TABNAMES.forEach(forgeEnPromptRemoveLegacyToolbar);
    forgeEnPromptBindTagsContainers();
    forgeEnPromptInstallTabSelectHook();
    forgeEnPromptInstallControlsHook();
    forgeEnPromptInstallSortGuard("txt2img");
    forgeEnPromptInstallSortGuard("img2img");
    forgeEnPromptHideAllToolbars();
    forgeEnPromptRestoreAllColumnControls();
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
