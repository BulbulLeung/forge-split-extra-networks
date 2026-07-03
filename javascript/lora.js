/**
 * forge-split-extra-networks: Lora tab — prompt sync, highlight, weight overlay.
 */
"use strict";

const FORGE_EN_LORA_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_LORA_ACTIVE_CLASS = "forge-en-lora-active";
const FORGE_EN_LORA_WEIGHT_STEP = 0.1;
const FORGE_EN_LORA_SYNC_DEBOUNCE_MS = 80;
const FORGE_EN_LORA_TAG_RE = /<lora:([^>]+)>/g;

const forgeEnLoraBound = {
    prompt: Object.create(null),
    cardIndex: Object.create(null),
    cards: Object.create(null),
};
const forgeEnLoraSyncTimers = Object.create(null);
const forgeEnLoraLastPrompt = Object.create(null);
const forgeEnLoraLbwState = {
    available: false,
    lbw_supported: false,
    presets: [],
    loadPromise: null,
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
    if (typeof forgeEnGetPromptTextarea === "function") {
        return forgeEnGetPromptTextarea(tabname);
    }
    return null;
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

function forgeEnLoraLbwEnabled() {
    if (typeof opts === "undefined" || opts.forge_en_lora_lbw_enabled == null) {
        return true;
    }
    return !!opts.forge_en_lora_lbw_enabled;
}

function forgeEnLoraLooksLikeBlockWeight(value) {
    if (!value) return false;
    const text = String(value).trim();
    if (!text) return false;
    if (text.includes(",")) return true;
    if (/^lbw=/i.test(text)) return true;
    const upper = text.toUpperCase();
    if (forgeEnLoraLbwState.presets.some(function (preset) {
        return preset.name.toUpperCase() === upper;
    })) {
        return true;
    }
    return false;
}

function forgeEnLoraParseTagContent(content) {
    const parts = String(content || "").split(":");
    if (parts.length < 2) {
        return null;
    }

    const name = parts[0];
    const weight = parseFloat(parts[1]);
    if (!name || Number.isNaN(weight)) {
        return null;
    }

    let lbw = null;
    for (let i = 2; i < parts.length; i++) {
        const part = parts[i];
        if (/^lbw=/i.test(part)) {
            lbw = part.slice(4);
            continue;
        }
        if (forgeEnLoraLooksLikeBlockWeight(part)) {
            lbw = part;
        }
    }

    return { name: name, weight: weight, lbw: lbw };
}

function forgeEnLoraParseEntries(prompt) {
    const map = new Map();
    if (!prompt) return map;

    const re = new RegExp(FORGE_EN_LORA_TAG_RE.source, "g");
    let match;
    while ((match = re.exec(prompt)) !== null) {
        const entry = forgeEnLoraParseTagContent(match[1]);
        if (entry) {
            map.set(entry.name, entry);
        }
    }
    return map;
}

function forgeEnLoraBuildTokenPattern(loraKey) {
    const escaped = forgeEnLoraEscapeRegex(loraKey);
    return "<lora:" + escaped + ":[\\d.]+(?::[^>]+)?>";
}

function forgeEnLoraPromptContainsLora(prompt, loraKey) {
    return new RegExp(forgeEnLoraBuildTokenPattern(loraKey)).test(prompt || "");
}

function forgeEnLoraLineContainsLora(line, loraKey) {
    return new RegExp(forgeEnLoraBuildTokenPattern(loraKey)).test(line || "");
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

function forgeEnLoraRemoveLoraFromPromptWithCaret(
    prompt,
    loraKey,
    selectionStart,
    selectionEnd,
    activationText,
) {
    const api = window.genLayoutPromptCaret;
    if (api) {
        return api.removeLinesWithCaret(prompt, selectionStart, selectionEnd, {
            promptContains: function (text) {
                return forgeEnLoraPromptContainsLora(text, loraKey);
            },
            lineContains: function (line) {
                return forgeEnLoraLineContainsLora(line, loraKey);
            },
            removeFromLine: function (line) {
                return forgeEnLoraRemoveFromLine(
                    line,
                    loraKey,
                    activationText || "",
                );
            },
        });
    }

    if (!forgeEnLoraPromptContainsLora(prompt, loraKey)) {
        return {
            text: prompt,
            caret: selectionStart,
            caretEnd: selectionEnd,
        };
    }

    const processed = (prompt || "").split("\n").map(function (line) {
        return forgeEnLoraRemoveFromLine(line, loraKey, activationText || "");
    });
    const text = processed
        .map(function (entry) {
            return entry.line;
        })
        .join("\n");

    return {
        text: text,
        caret: selectionStart,
        caretEnd: selectionEnd,
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

    const api = window.genLayoutPromptCaret;
    if (api) {
        api.applyEdit(textarea, {
            value: result.text,
            caret: result.caret,
            caretEnd: result.caretEnd,
            scroll: "none",
        });
    } else {
        textarea.value = result.text;
        textarea.focus();
        textarea.selectionStart = result.caret;
        textarea.selectionEnd = result.caretEnd;
        if (typeof updateInput === "function") {
            updateInput(textarea);
        }
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
    forgeEnLoraParseEntries(prompt).forEach(function (entry, key) {
        map.set(key, entry.weight);
    });
    return map;
}

function forgeEnLoraLbwUiEnabled() {
    return (
        forgeEnLoraLbwEnabled() &&
        forgeEnLoraLbwState.available &&
        forgeEnLoraLbwState.lbw_supported &&
        forgeEnLoraLbwState.presets.length > 0
    );
}

function forgeEnLoraFindPresetNameByLbw(lbwValue) {
    if (!lbwValue) return "";
    const upper = String(lbwValue).trim().toUpperCase();
    const found = forgeEnLoraLbwState.presets.find(function (preset) {
        return preset.name.toUpperCase() === upper;
    });
    return found ? found.name : "";
}

function forgeEnLoraLbwSelectValueFromEntry(entry) {
    if (!entry || !entry.lbw) {
        return "";
    }
    const lbw = String(entry.lbw).trim();
    if (!lbw || lbw.includes(",")) {
        return "";
    }
    return forgeEnLoraFindPresetNameByLbw(lbw);
}

function forgeEnLoraFormatLbwDisplay(lbw) {
    if (!lbw) return "";
    const text = String(lbw).trim();
    if (!text) return "";
    if (!text.includes(",")) {
        return text;
    }
    if (text.length <= 12) {
        return text;
    }
    return text.slice(0, 10) + "\u2026";
}

function forgeEnLoraApplyPromptEdit(tabname, textarea, newPrompt) {
    textarea.value = newPrompt;
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

function forgeEnLoraSetLbw(tabname, loraKey, presetChoice) {
    const textarea = forgeEnLoraGetPromptTextarea(tabname);
    if (!textarea || !loraKey) return false;

    const prompt = textarea.value || "";
    const escaped = forgeEnLoraEscapeRegex(loraKey);
    const re = new RegExp(
        "<lora:" + escaped + ":([\\d.]+)(?::([^>]+))?>",
        "g",
    );

    let found = false;
    const newPrompt = prompt.replace(
        re,
        function (_match, weightStr, tail) {
            found = true;
            const weight = forgeEnLoraFormatWeight(parseFloat(weightStr));
            if (!presetChoice) {
                return "<lora:" + loraKey + ":" + weight + ">";
            }

            const presetName = String(presetChoice).trim();
            if (!presetName) {
                return "<lora:" + loraKey + ":" + weight + ">";
            }

            return (
                "<lora:" +
                loraKey +
                ":" +
                weight +
                ":lbw=" +
                presetName +
                ">"
            );
        },
    );

    if (!found) return false;

    forgeEnLoraApplyPromptEdit(tabname, textarea, newPrompt);
    return true;
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
        "(<lora:" + escaped + ":)([\\d.]+)((?::[^>]+)?>)",
        "g",
    );

    let found = false;
    const newPrompt = prompt.replace(
        re,
        function (_match, prefix, weightStr, suffix) {
            found = true;
            const oldWeight = parseFloat(weightStr);
            const newWeight = oldWeight + delta;
            return prefix + forgeEnLoraFormatWeight(newWeight) + (suffix || ">");
        },
    );

    if (!found) return false;

    textarea.value = newPrompt;
    if (typeof updateInput === "function") {
        updateInput(textarea);
    }
    return true;
}

function forgeEnLoraLoadLbwPresets() {
    if (!forgeEnLoraLbwEnabled()) {
        forgeEnLoraLbwState.available = false;
        forgeEnLoraLbwState.lbw_supported = false;
        forgeEnLoraLbwState.presets = [];
        return Promise.resolve(forgeEnLoraLbwState);
    }
    if (forgeEnLoraLbwState.loadPromise) {
        return forgeEnLoraLbwState.loadPromise;
    }

    forgeEnLoraLbwState.loadPromise = fetch("/forge-en-lora/lbw/presets")
        .then(function (response) {
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
            return response.json();
        })
        .then(function (data) {
            forgeEnLoraLbwState.available = !!(data && data.available);
            forgeEnLoraLbwState.lbw_supported = !!(data && data.lbw_supported);
            forgeEnLoraLbwState.presets = Array.isArray(data.presets)
                ? data.presets
                : [];
            if (!forgeEnLoraLbwState.lbw_supported) {
                forgeEnLoraLbwState.presets = [];
            }
            return forgeEnLoraLbwState;
        })
        .catch(function () {
            forgeEnLoraLbwState.available = false;
            forgeEnLoraLbwState.lbw_supported = false;
            forgeEnLoraLbwState.presets = [];
            return forgeEnLoraLbwState;
        });

    return forgeEnLoraLbwState.loadPromise;
}

function forgeEnLoraInvalidateLbwSelects() {
    forgeEnLoraLbwState.loadPromise = null;
    const app = gradioApp();
    if (!app) return;
    app.querySelectorAll(".forge-en-lora-lbw-select").forEach(function (select) {
        delete select.dataset.forgeEnLoraLbwPopulated;
    });
}

function forgeEnLoraPopulateLbwSelect(select, force) {
    if (!select) return;
    if (!force && select.dataset.forgeEnLoraLbwPopulated === "1") {
        return;
    }

    const preserved = select.value || "";
    select.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "\u2014 none \u2014";
    select.appendChild(noneOption);

    forgeEnLoraLbwState.presets.forEach(function (preset) {
        const option = document.createElement("option");
        option.value = preset.name;
        option.textContent = preset.name;
        select.appendChild(option);
    });

    if (
        preserved &&
        Array.from(select.options).some(function (option) {
            return option.value === preserved;
        })
    ) {
        select.value = preserved;
    }

    select.dataset.forgeEnLoraLbwPopulated = "1";
}

function forgeEnLoraSyncAllLbwSelectsFromPrompt() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_LORA_TABNAMES.forEach(function (tabname) {
        const textarea = forgeEnLoraGetPromptTextarea(tabname);
        const prompt = textarea ? textarea.value || "" : "";
        const entries = forgeEnLoraParseEntries(prompt);
        const container = app.querySelector("#" + tabname + "_lora_cards");
        if (!container) return;

        container
            .querySelectorAll(".card." + FORGE_EN_LORA_ACTIVE_CLASS)
            .forEach(function (card) {
                const loraKey = forgeEnLoraKeyFromCard(card);
                if (!loraKey) return;
                forgeEnLoraSyncLbwSelect(card, entries.get(loraKey) || null);
            });
    });
}

function forgeEnLoraRefreshAllLbwSelects() {
    const app = gradioApp();
    if (!app) return;

    const showLbw = forgeEnLoraLbwUiEnabled();
    app.querySelectorAll(".forge-en-lora-lbw-row").forEach(function (row) {
        const select = row.querySelector(".forge-en-lora-lbw-select");
        if (!showLbw) {
            row.style.display = "none";
            if (select) {
                select.value = "";
            }
            return;
        }

        row.style.display = "";
        if (select) {
            forgeEnLoraPopulateLbwSelect(select, true);
        }
    });
    forgeEnLoraSyncAllLbwSelectsFromPrompt();
}

function forgeEnLoraOnCheckpointContextChange() {
    forgeEnLoraInvalidateLbwSelects();
    forgeEnLoraLoadLbwPresets().then(function () {
        forgeEnLoraRefreshAllLbwSelects();
        forgeEnLoraSyncAllHighlights();
    });
}

function forgeEnLoraBindCheckpointListeners() {
    const app = gradioApp();
    if (!app) return;

    const checkpointEl = app.querySelector("#setting_sd_model_checkpoint");
    if (checkpointEl && checkpointEl.dataset.forgeEnLoraLbwBound !== "1") {
        checkpointEl.dataset.forgeEnLoraLbwBound = "1";
        checkpointEl.addEventListener("change", forgeEnLoraOnCheckpointContextChange);
        checkpointEl.addEventListener("input", forgeEnLoraOnCheckpointContextChange);
    }

    const presetEl = app.querySelector("#forge_ui_preset");
    if (presetEl && presetEl.dataset.forgeEnLoraLbwBound !== "1") {
        presetEl.dataset.forgeEnLoraLbwBound = "1";
        presetEl.addEventListener("change", forgeEnLoraOnCheckpointContextChange);
    }
}

function forgeEnLoraEnsureLbwRow(overlay, card, tabname) {
    if (!forgeEnLoraLbwUiEnabled()) {
        const existing = overlay.querySelector(".forge-en-lora-lbw-row");
        if (existing) {
            existing.style.display = "none";
        }
        return null;
    }

    let row = overlay.querySelector(".forge-en-lora-lbw-row");
    if (row) {
        row.style.display = "";
        return row;
    }

    row = document.createElement("div");
    row.className = "forge-en-lora-lbw-row";

    const select = document.createElement("select");
    select.className = "forge-en-lora-lbw-select";
    select.title =
        "LoRA Block Weight preset (enable LoRA Block Weight in Scripts panel)";
    forgeEnLoraPopulateLbwSelect(select);

    select.addEventListener("mousedown", function (event) {
        event.stopPropagation();
    });
    select.addEventListener("click", function (event) {
        event.stopPropagation();
    });
    select.addEventListener("change", function (event) {
        event.stopPropagation();

        const container = card.closest('[id$="_lora_cards"]');
        const resolvedTabname =
            tabname || forgeEnLoraTabnameFromContainer(container);
        const loraKey = forgeEnLoraKeyFromCard(card);
        if (!resolvedTabname || !loraKey) return;

        if (forgeEnLoraSetLbw(resolvedTabname, loraKey, select.value)) {
            forgeEnLoraSyncHighlights(resolvedTabname);
        }
    });

    row.appendChild(select);
    overlay.appendChild(row);
    return row;
}

function forgeEnLoraSyncLbwSelect(card, entry) {
    const select = card.querySelector(".forge-en-lora-lbw-select");
    if (!select) return;

    const value = forgeEnLoraLbwSelectValueFromEntry(entry);
    if (select.value !== value) {
        select.value = value;
    }

    if (entry && entry.lbw && entry.lbw.includes(",")) {
        select.title =
            "Custom block weights: " +
            forgeEnLoraFormatLbwDisplay(entry.lbw) +
            " (edit in prompt)";
    } else {
        select.title =
            "LoRA Block Weight preset (enable LoRA Block Weight in Scripts panel)";
    }
}

function forgeEnLoraEnsureWeightOverlay(card, tabname) {
    if (card.dataset.forgeEnLoraOverlayBound === "1") {
        const overlay = card.querySelector(".forge-en-lora-weight-overlay");
        if (overlay && forgeEnLoraLbwUiEnabled()) {
            forgeEnLoraEnsureLbwRow(overlay, card, tabname);
        }
        return overlay;
    }

    const overlay = document.createElement("div");
    overlay.className = "forge-en-lora-weight-overlay";

    const weightRow = document.createElement("div");
    weightRow.className = "forge-en-lora-weight-row";

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

    weightRow.appendChild(minusBtn);
    weightRow.appendChild(valueEl);
    weightRow.appendChild(plusBtn);
    overlay.appendChild(weightRow);
    card.appendChild(overlay);
    forgeEnLoraBindOverlayScale(card);

    if (forgeEnLoraLbwUiEnabled()) {
        forgeEnLoraEnsureLbwRow(overlay, card, tabname);
    }

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

function forgeEnLoraSetCardActive(card, tabname, entry) {
    const weight =
        typeof entry === "number"
            ? entry
            : entry && typeof entry.weight === "number"
              ? entry.weight
              : 1.0;
    const lbwEntry =
        entry && typeof entry === "object" && "weight" in entry ? entry : null;

    card.classList.add(FORGE_EN_LORA_ACTIVE_CLASS);
    forgeEnLoraApplyOverlayScale(card);
    const overlay = forgeEnLoraEnsureWeightOverlay(card, tabname);
    const valueEl = overlay
        ? overlay.querySelector(".forge-en-lora-weight-value")
        : null;
    if (valueEl) {
        valueEl.textContent = forgeEnLoraFormatWeight(weight);
    }
    forgeEnLoraSyncLbwSelect(card, lbwEntry);
}

function forgeEnLoraSetCardInactive(card) {
    card.classList.remove(FORGE_EN_LORA_ACTIVE_CLASS);
    const valueEl = card.querySelector(".forge-en-lora-weight-value");
    if (valueEl) {
        valueEl.textContent = "";
    }
    const select = card.querySelector(".forge-en-lora-lbw-select");
    if (select) {
        select.value = "";
    }
}

function forgeEnLoraSyncHighlights(tabname) {
    const app = gradioApp();
    if (!app) return;

    const container = app.querySelector("#" + tabname + "_lora_cards");
    if (!container) return;

    const textarea = forgeEnLoraGetPromptTextarea(tabname);
    const prompt = textarea ? textarea.value || "" : "";
    if (forgeEnLoraLastPrompt[tabname] === prompt) {
        if (prompt.indexOf("<lora:") !== -1) {
            forgeEnLoraSyncAllLbwSelectsFromPrompt();
        }
        return;
    }
    forgeEnLoraLastPrompt[tabname] = prompt;
    const loraEntries = forgeEnLoraParseEntries(prompt);
    const cardIndex = forgeEnLoraGetCardIndex(container, tabname);

    container
        .querySelectorAll(".card." + FORGE_EN_LORA_ACTIVE_CLASS)
        .forEach(function (card) {
            const loraKey = forgeEnLoraKeyFromCard(card);
            if (!loraKey || loraEntries.has(loraKey)) {
                return;
            }
            forgeEnLoraSetCardInactive(card);
        });

    loraEntries.forEach(function (entry, loraKey) {
        const card = cardIndex.get(loraKey);
        if (!card) return;
        forgeEnLoraSetCardActive(card, tabname, entry);
    });

    if (typeof forgeEnEnabledFilterReapply === "function") {
        forgeEnEnabledFilterReapply(tabname, "lora");
    }
}

function forgeEnLoraSyncAllHighlights() {
    FORGE_EN_LORA_TABNAMES.forEach(forgeEnLoraSyncHighlights);
}

function forgeEnLoraOnPromptInput(tabname) {
    if (typeof forgeEnDebounceByKey === "function") {
        forgeEnDebounceByKey(
            "lora_sync_" + tabname,
            FORGE_EN_LORA_SYNC_DEBOUNCE_MS,
            function () {
                forgeEnLoraSyncHighlights(tabname);
            },
        );
        return;
    }
    if (forgeEnLoraSyncTimers[tabname]) {
        clearTimeout(forgeEnLoraSyncTimers[tabname]);
    }
    forgeEnLoraSyncTimers[tabname] = setTimeout(function () {
        delete forgeEnLoraSyncTimers[tabname];
        forgeEnLoraSyncHighlights(tabname);
    }, FORGE_EN_LORA_SYNC_DEBOUNCE_MS);
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
    forgeEnLoraBindCheckpointListeners();
    forgeEnLoraLoadLbwPresets().then(function () {
        forgeEnLoraRefreshAllLbwSelects();
        forgeEnLoraSyncAllHighlights();
    });
}

function forgeEnLoraOnAfterUiUpdate() {
    FORGE_EN_LORA_TABNAMES.forEach(forgeEnLoraInvalidateCardIndex);
    forgeEnLoraBindPromptListeners();
    forgeEnLoraBindCardContainers();
    forgeEnLoraBindCheckpointListeners();
    forgeEnLoraLoadLbwPresets().then(function () {
        forgeEnLoraRefreshAllLbwSelects();
        forgeEnLoraSyncAllHighlights();
    });
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
    onOptionsChanged(function () {
        forgeEnLoraApplyWeightButtonSize();
        forgeEnLoraOnCheckpointContextChange();
    });
}
