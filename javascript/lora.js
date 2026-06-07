/**
 * forge-split-extra-networks: Lora tab — prompt sync, highlight, weight overlay.
 */
"use strict";

const FORGE_EN_LORA_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_LORA_ACTIVE_CLASS = "forge-en-lora-active";
const FORGE_EN_LORA_WEIGHT_STEP = 0.1;
const FORGE_EN_LORA_PROMPT_RE = /<lora:([^:>]+):([\d.]+)>/g;

const forgeEnLoraBound = {
    prompt: Object.create(null),
    cardIndex: Object.create(null),
    cards: Object.create(null),
};

const FORGE_EN_LORA_WEIGHT_SIZE_PRESETS = {
    small: {
        fontScale: 0.055,
        fontMax: "12px",
        maxRatio: 0.72,
    },
    medium: {
        fontScale: 0.085,
        fontMax: "16px",
        maxRatio: 0.92,
    },
    big: {
        fontScale: 0.13,
        fontMax: "28px",
        maxRatio: 0.98,
    },
};

function forgeEnLoraWeightButtonSize() {
    if (
        typeof opts !== "undefined" &&
        opts.forge_en_lora_weight_button_size != null
    ) {
        const normalized = String(opts.forge_en_lora_weight_button_size)
            .trim()
            .toLowerCase();
        if (normalized in FORGE_EN_LORA_WEIGHT_SIZE_PRESETS) {
            return normalized;
        }
    }
    return "medium";
}

function forgeEnLoraApplyWeightButtonSize() {
    const root = gradioApp();
    if (!root) return;

    const preset =
        FORGE_EN_LORA_WEIGHT_SIZE_PRESETS[forgeEnLoraWeightButtonSize()] ||
        FORGE_EN_LORA_WEIGHT_SIZE_PRESETS.medium;

    root.style.setProperty(
        "--forge-en-lora-weight-font-scale",
        String(preset.fontScale),
    );
    root.style.setProperty(
        "--forge-en-lora-weight-font-max",
        preset.fontMax,
    );
    root.style.setProperty(
        "--forge-en-lora-weight-max-ratio",
        String(preset.maxRatio),
    );
}

function forgeEnLoraGetPromptTextarea(tabname) {
    if (
        typeof activePromptTextarea !== "undefined" &&
        activePromptTextarea[tabname]
    ) {
        return activePromptTextarea[tabname];
    }
    const app = gradioApp();
    if (!app) return null;
    return app.querySelector(
        "#" + tabname + "_prompt > label > textarea",
    );
}

function forgeEnLoraTabnameFromContainer(container) {
    if (!container || !container.id) return null;
    const match = container.id.match(/^(txt2img|img2img)_lora_cards$/);
    return match ? match[1] : null;
}

function forgeEnLoraEscapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function forgeEnLoraKeyFromCard(card) {
    if (card.dataset.forgeEnLoraKey) {
        return card.dataset.forgeEnLoraKey;
    }

    const onclick = card.getAttribute("onclick") || "";
    const match = onclick.match(/<lora:([^:'"+\\]+):/);
    if (match) {
        card.dataset.forgeEnLoraKey = match[1];
        return match[1];
    }

    return card.getAttribute("data-name") || "";
}

function forgeEnLoraUnescapeJsString(text) {
    return text.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

function forgeEnLoraDecodeJsonStringContent(text) {
    try {
        return JSON.parse(
            '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"',
        );
    } catch (_err) {
        return text;
    }
}

function forgeEnLoraActivationTextFromCard(card) {
    if (card.dataset.forgeEnLoraActivationParsed === "1") {
        return card.dataset.forgeEnLoraActivationText || "";
    }

    const onclick = card.getAttribute("onclick") || "";
    let activationText = "";

    const dqMatch = onclick.match(
        /\+\s*">"\s*(?:\+\s*"((?:\\.|[^"\\])*)")?/,
    );
    if (dqMatch) {
        if (dqMatch[1]) {
            activationText = forgeEnLoraDecodeJsonStringContent(dqMatch[1]);
        }
    } else {
        const sqMatch = onclick.match(
            /\+\s*'>'\s*(?:\+\s*'((?:\\'|[^'\\])*)')?/,
        );
        if (sqMatch && sqMatch[1]) {
            activationText = forgeEnLoraUnescapeJsString(sqMatch[1]);
        }
    }

    card.dataset.forgeEnLoraActivationText = activationText;
    card.dataset.forgeEnLoraActivationParsed = "1";

    return activationText;
}

function forgeEnLoraActivationSuffixCandidates(activationText) {
    if (!activationText) {
        return [];
    }
    const raw = [
        activationText,
        activationText.trimStart(),
        activationText.replace(/^[\s,]+/, ""),
        activationText.trim(),
    ];
    const seen = Object.create(null);
    const out = [];
    raw.forEach(function (item) {
        if (!item || seen[item]) {
            return;
        }
        seen[item] = true;
        out.push(item);
    });
    out.sort(function (a, b) {
        return b.length - a.length;
    });
    return out;
}

function forgeEnLoraMatchActivationSuffix(afterToken, activationText) {
    const candidates = forgeEnLoraActivationSuffixCandidates(activationText);
    for (let i = 0; i < candidates.length; i++) {
        const suffix = candidates[i];
        if (afterToken.startsWith(suffix)) {
            return suffix;
        }
        const leadSpace = afterToken.length - afterToken.trimStart().length;
        const trimmedAfter = afterToken.trimStart();
        const trimmedSuffix = suffix.trimStart();
        if (trimmedSuffix && trimmedAfter.startsWith(trimmedSuffix)) {
            let end = leadSpace + trimmedSuffix.length;
            if (afterToken[end] === " ") {
                end += 1;
            }
            return afterToken.slice(0, end);
        }
    }
    return null;
}

function forgeEnLoraGetAddSeparator() {
    if (
        typeof opts !== "undefined" &&
        opts.extra_networks_add_text_separator != null
    ) {
        return String(opts.extra_networks_add_text_separator);
    }
    return " ";
}

function forgeEnLoraBuildTokenPattern(loraKey) {
    const escaped = forgeEnLoraEscapeRegex(loraKey);
    return "<lora:" + escaped + ":[\\d.]+>";
}

function forgeEnLoraPromptContainsLora(prompt, loraKey) {
    return new RegExp(forgeEnLoraBuildTokenPattern(loraKey)).test(prompt || "");
}

function forgeEnLoraLineContainsLora(line, loraKey) {
    return new RegExp(forgeEnLoraBuildTokenPattern(loraKey)).test(line || "");
}

function forgeEnLoraGetLineIndexForPos(text, pos) {
    if (pos <= 0) {
        return 0;
    }
    return text.slice(0, pos).split("\n").length - 1;
}

function forgeEnLoraRemoveFromLine(line, loraKey, activationText) {
    if (!forgeEnLoraLineContainsLora(line, loraKey)) {
        return {
            line: line,
            removedStart: -1,
            removedEnd: -1,
        };
    }

    const tokenPart = forgeEnLoraBuildTokenPattern(loraKey);
    const sep = forgeEnLoraGetAddSeparator();
    const patterns = [];
    if (sep.length > 0) {
        patterns.push(new RegExp(forgeEnLoraEscapeRegex(sep) + tokenPart));
    }
    patterns.push(new RegExp(tokenPart + "[ \\t]*,[ \\t]*"));
    patterns.push(new RegExp(tokenPart));

    let result = line;
    let removedStart = -1;
    let removedEnd = -1;

    for (let i = 0; i < patterns.length; i++) {
        const match = patterns[i].exec(line);
        if (match) {
            removedStart = match.index;
            removedEnd = match.index + match[0].length;
            const afterToken = line.slice(removedEnd);
            const matchedSuffix = forgeEnLoraMatchActivationSuffix(
                afterToken,
                activationText,
            );
            if (matchedSuffix) {
                removedEnd += matchedSuffix.length;
            }
            result = line.slice(0, removedStart) + line.slice(removedEnd);
            break;
        }
    }

    result = result.replace(/[ \t]{2,}/g, " ").trimEnd();
    if (result.length > 0 && !result.endsWith(",")) {
        result += ",";
    }

    return {
        line: result,
        removedStart: removedStart,
        removedEnd: removedEnd,
    };
}

function forgeEnLoraMapCaretInLine(
    oldLine,
    newLine,
    posInLine,
    removedStart,
    removedEnd,
) {
    if (removedStart < 0) {
        return Math.min(Math.max(0, posInLine), newLine.length);
    }

    if (posInLine >= oldLine.length) {
        return newLine.length;
    }

    let pos = posInLine;
    if (pos <= removedStart) {
        pos = posInLine;
    } else if (pos >= removedEnd) {
        pos -= removedEnd - removedStart;
    } else {
        pos = removedStart;
    }

    return Math.max(0, Math.min(pos, newLine.length));
}

function forgeEnLoraFindLoraLine(lines, loraKey, cursorLine) {
    let fallbackLine = -1;

    for (let i = 0; i < lines.length; i++) {
        if (!forgeEnLoraLineContainsLora(lines[i], loraKey)) {
            continue;
        }
        if (i === cursorLine) {
            return i;
        }
        if (fallbackLine < 0) {
            fallbackLine = i;
        }
    }

    return fallbackLine;
}

function forgeEnLoraMapSelectionAfterRemove(
    lines,
    processed,
    selectionPos,
    tokenLine,
    cursorLine,
) {
    let oldPos = 0;
    let newPos = 0;

    for (let i = 0; i < lines.length; i++) {
        const oldLine = lines[i];
        const entry = processed[i];
        const newLine = entry.line;

        if (i === tokenLine) {
            const posInLine =
                cursorLine === tokenLine
                    ? selectionPos - oldPos
                    : entry.removedStart >= 0
                      ? entry.removedStart
                      : 0;
            return (
                newPos +
                forgeEnLoraMapCaretInLine(
                    oldLine,
                    newLine,
                    posInLine,
                    entry.removedStart,
                    entry.removedEnd,
                )
            );
        }

        oldPos += oldLine.length + (i < lines.length - 1 ? 1 : 0);
        newPos += newLine.length + (i < processed.length - 1 ? 1 : 0);
    }

    return newPos;
}

function forgeEnLoraRemoveLoraFromPromptWithCaret(
    prompt,
    loraKey,
    selectionStart,
    selectionEnd,
    activationText,
) {
    if (!forgeEnLoraPromptContainsLora(prompt, loraKey)) {
        return {
            text: prompt,
            caret: selectionStart,
            caretEnd: selectionEnd,
        };
    }

    const normalized = prompt.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    const cursorLine = forgeEnLoraGetLineIndexForPos(
        normalized,
        selectionStart,
    );
    const tokenLine = forgeEnLoraFindLoraLine(lines, loraKey, cursorLine);
    const suffix = activationText || "";

    const processed = lines.map(function (line) {
        return forgeEnLoraRemoveFromLine(line, loraKey, suffix);
    });
    const text = processed
        .map(function (entry) {
            return entry.line;
        })
        .join("\n");

    let caret = forgeEnLoraMapSelectionAfterRemove(
        lines,
        processed,
        selectionStart,
        tokenLine,
        cursorLine,
    );
    let caretEnd = forgeEnLoraMapSelectionAfterRemove(
        lines,
        processed,
        selectionEnd,
        tokenLine,
        cursorLine,
    );

    caret = Math.max(0, Math.min(caret, text.length));
    caretEnd = Math.max(0, Math.min(caretEnd, text.length));
    if (caretEnd < caret) {
        caretEnd = caret;
    }

    return {
        text: text,
        caret: caret,
        caretEnd: caretEnd,
    };
}

function forgeEnLoraRemoveWithCaret(tabname, loraKey, card) {
    const textarea = forgeEnLoraGetPromptTextarea(tabname);
    if (!textarea || !loraKey) return;

    const current = textarea.value || "";
    if (!forgeEnLoraPromptContainsLora(current, loraKey)) return;

    const selStart =
        typeof textarea.selectionStart === "number"
            ? textarea.selectionStart
            : current.length;
    const selEnd =
        typeof textarea.selectionEnd === "number"
            ? textarea.selectionEnd
            : selStart;
    const activationText = card
        ? forgeEnLoraActivationTextFromCard(card)
        : "";

    const result = forgeEnLoraRemoveLoraFromPromptWithCaret(
        current,
        loraKey,
        selStart,
        selEnd,
        activationText,
    );

    textarea.value = result.text;
    textarea.focus();
    textarea.selectionStart = result.caret;
    textarea.selectionEnd = result.caretEnd;

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
}

function forgeEnLoraCardClickCapture(event, tabname, container) {
    if (event.target.closest(".button-row")) return;
    if (event.target.closest(".forge-en-lora-weight-overlay")) return;

    const card = event.target.closest(".card");
    if (!card || !container.contains(card)) return;

    const loraKey = forgeEnLoraKeyFromCard(card);
    if (!loraKey) return;

    const textarea = forgeEnLoraGetPromptTextarea(tabname);
    const prompt = textarea ? textarea.value || "" : "";
    if (!forgeEnLoraPromptContainsLora(prompt, loraKey)) return;

    event.preventDefault();
    event.stopPropagation();

    forgeEnLoraRemoveWithCaret(tabname, loraKey, card);
    forgeEnLoraSyncHighlights(tabname);
}

function forgeEnLoraBindCardContainers() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_LORA_TABNAMES.forEach(function (tabname) {
        const container = app.querySelector("#" + tabname + "_lora_cards");
        if (!container || forgeEnLoraBound.cards[tabname] === container) {
            return;
        }

        forgeEnLoraBound.cards[tabname] = container;
        container.addEventListener(
            "click",
            function (event) {
                forgeEnLoraCardClickCapture(event, tabname, container);
            },
            true,
        );
    });
}

function forgeEnLoraInvalidateCardIndex(tabname) {
    delete forgeEnLoraBound.cardIndex[tabname];
}

function forgeEnLoraGetCardIndex(container, tabname) {
    const cards = container.querySelectorAll(".card");
    const cached = forgeEnLoraBound.cardIndex[tabname];
    if (
        cached &&
        cached.container === container &&
        cached.cardCount === cards.length
    ) {
        return cached.map;
    }

    const map = new Map();
    cards.forEach(function (card) {
        const key = forgeEnLoraKeyFromCard(card);
        if (key) {
            map.set(key, card);
        }
    });
    forgeEnLoraBound.cardIndex[tabname] = {
        container: container,
        map: map,
        cardCount: cards.length,
    };
    return map;
}

function forgeEnLoraParsePrompt(prompt) {
    const map = new Map();
    if (!prompt) return map;

    const re = new RegExp(FORGE_EN_LORA_PROMPT_RE.source, "g");
    let m;
    while ((m = re.exec(prompt)) !== null) {
        map.set(m[1], parseFloat(m[2]));
    }
    return map;
}

function forgeEnLoraFormatWeight(weight) {
    const rounded = Math.round(weight * 10) / 10;
    const normalized = parseFloat(rounded.toPrecision(12));
    if (Number.isInteger(normalized)) {
        return normalized + ".0";
    }
    return String(normalized);
}

function forgeEnLoraApplyOverlayScale(card) {
    const width = card.offsetWidth;
    if (width > 0) {
        card.style.setProperty("--forge-en-lora-card-width", width + "px");
    }
}

function forgeEnLoraBindOverlayScale(card) {
    forgeEnLoraApplyOverlayScale(card);
    if (card.dataset.forgeEnLoraScaleBound === "1") {
        return;
    }
    card.dataset.forgeEnLoraScaleBound = "1";
    if (typeof ResizeObserver === "undefined") {
        return;
    }
    const observer = new ResizeObserver(function () {
        forgeEnLoraApplyOverlayScale(card);
    });
    observer.observe(card);
}

function forgeEnLoraAdjustWeight(tabname, loraKey, delta) {
    const textarea = forgeEnLoraGetPromptTextarea(tabname);
    if (!textarea || !loraKey) return false;

    const prompt = textarea.value || "";
    const escaped = forgeEnLoraEscapeRegex(loraKey);
    const re = new RegExp(
        "(<lora:" + escaped + ":)([\\d.]+)(>)",
        "g",
    );

    let found = false;
    const newPrompt = prompt.replace(re, function (_match, prefix, weightStr, suffix) {
        found = true;
        const oldWeight = parseFloat(weightStr);
        const newWeight = oldWeight + delta;
        return prefix + forgeEnLoraFormatWeight(newWeight) + suffix;
    });

    if (!found) return false;

    textarea.value = newPrompt;
    if (typeof updateInput === "function") {
        updateInput(textarea);
    }
    return true;
}

function forgeEnLoraEnsureWeightOverlay(card, tabname) {
    if (card.dataset.forgeEnLoraOverlayBound === "1") {
        return card.querySelector(".forge-en-lora-weight-overlay");
    }

    const overlay = document.createElement("div");
    overlay.className = "forge-en-lora-weight-overlay";

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className =
        "forge-en-lora-weight-btn forge-en-lora-weight-minus";
    minusBtn.textContent = "\u2212";
    minusBtn.title = "Decrease weight by " + FORGE_EN_LORA_WEIGHT_STEP;

    const valueEl = document.createElement("span");
    valueEl.className = "forge-en-lora-weight-value";

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "forge-en-lora-weight-btn forge-en-lora-weight-plus";
    plusBtn.textContent = "+";
    plusBtn.title = "Increase weight by " + FORGE_EN_LORA_WEIGHT_STEP;

    overlay.appendChild(minusBtn);
    overlay.appendChild(valueEl);
    overlay.appendChild(plusBtn);
    card.appendChild(overlay);
    forgeEnLoraBindOverlayScale(card);

    function onWeightButtonClick(event, delta) {
        event.preventDefault();
        event.stopPropagation();

        const container = card.closest('[id$="_lora_cards"]');
        const resolvedTabname =
            tabname || forgeEnLoraTabnameFromContainer(container);
        const loraKey = forgeEnLoraKeyFromCard(card);
        if (!resolvedTabname || !loraKey) return;

        if (forgeEnLoraAdjustWeight(resolvedTabname, loraKey, delta)) {
            forgeEnLoraSyncHighlights(resolvedTabname);
        }
    }

    minusBtn.addEventListener("click", function (event) {
        onWeightButtonClick(event, -FORGE_EN_LORA_WEIGHT_STEP);
    });
    plusBtn.addEventListener("click", function (event) {
        onWeightButtonClick(event, FORGE_EN_LORA_WEIGHT_STEP);
    });

    card.dataset.forgeEnLoraOverlayBound = "1";
    return overlay;
}

function forgeEnLoraSetCardActive(card, tabname, weight) {
    card.classList.add(FORGE_EN_LORA_ACTIVE_CLASS);
    forgeEnLoraApplyOverlayScale(card);
    const overlay = forgeEnLoraEnsureWeightOverlay(card, tabname);
    const valueEl = overlay
        ? overlay.querySelector(".forge-en-lora-weight-value")
        : null;
    if (valueEl) {
        valueEl.textContent = forgeEnLoraFormatWeight(weight);
    }
}

function forgeEnLoraSetCardInactive(card) {
    card.classList.remove(FORGE_EN_LORA_ACTIVE_CLASS);
    const valueEl = card.querySelector(".forge-en-lora-weight-value");
    if (valueEl) {
        valueEl.textContent = "";
    }
}

function forgeEnLoraSyncHighlights(tabname) {
    const app = gradioApp();
    if (!app) return;

    const container = app.querySelector("#" + tabname + "_lora_cards");
    if (!container) return;

    const textarea = forgeEnLoraGetPromptTextarea(tabname);
    const prompt = textarea ? textarea.value || "" : "";
    const loraWeights = forgeEnLoraParsePrompt(prompt);
    const cardIndex = forgeEnLoraGetCardIndex(container, tabname);

    container
        .querySelectorAll(".card." + FORGE_EN_LORA_ACTIVE_CLASS)
        .forEach(function (card) {
            const loraKey = forgeEnLoraKeyFromCard(card);
            if (!loraKey || loraWeights.has(loraKey)) {
                return;
            }
            forgeEnLoraSetCardInactive(card);
        });

    loraWeights.forEach(function (weight, loraKey) {
        const card = cardIndex.get(loraKey);
        if (!card) return;
        forgeEnLoraSetCardActive(card, tabname, weight);
    });
}

function forgeEnLoraSyncAllHighlights() {
    FORGE_EN_LORA_TABNAMES.forEach(forgeEnLoraSyncHighlights);
}

function forgeEnLoraOnPromptInput(tabname) {
    forgeEnLoraSyncHighlights(tabname);
}

function forgeEnLoraBindPromptListeners() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_LORA_TABNAMES.forEach(function (tabname) {
        const textarea = app.querySelector(
            "#" + tabname + "_prompt > label > textarea",
        );
        if (!textarea || forgeEnLoraBound.prompt[tabname] === textarea) {
            return;
        }

        forgeEnLoraBound.prompt[tabname] = textarea;
        textarea.addEventListener("input", function () {
            forgeEnLoraOnPromptInput(tabname);
        });
        textarea.addEventListener("focus", function () {
            if (typeof activePromptTextarea !== "undefined") {
                activePromptTextarea[tabname] = textarea;
            }
            forgeEnLoraOnPromptInput(tabname);
        });
    });
}

function forgeEnLoraSetup() {
    if (typeof forgeEnOutputBrowserApplySelectionStyle === "function") {
        forgeEnOutputBrowserApplySelectionStyle();
    }
    forgeEnLoraApplyWeightButtonSize();
    forgeEnLoraBindPromptListeners();
    forgeEnLoraBindCardContainers();
}

function forgeEnLoraOnAfterUiUpdate() {
    FORGE_EN_LORA_TABNAMES.forEach(forgeEnLoraInvalidateCardIndex);
    forgeEnLoraBindPromptListeners();
    forgeEnLoraBindCardContainers();
    forgeEnLoraSyncAllHighlights();
}

if (typeof onUiLoaded === "function") {
    onUiLoaded(function () {
        forgeEnLoraSetup();
        forgeEnLoraSyncAllHighlights();
    });
} else {
    forgeEnLoraSetup();
    forgeEnLoraSyncAllHighlights();
}

if (typeof onAfterUiUpdate === "function") {
    onAfterUiUpdate(forgeEnLoraOnAfterUiUpdate);
}

if (typeof onOptionsChanged === "function") {
    onOptionsChanged(forgeEnLoraApplyWeightButtonSize);
}
