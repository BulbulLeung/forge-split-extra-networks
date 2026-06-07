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
};

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
    forgeEnLoraBindPromptListeners();
}

function forgeEnLoraOnAfterUiUpdate() {
    FORGE_EN_LORA_TABNAMES.forEach(forgeEnLoraInvalidateCardIndex);
    forgeEnLoraBindPromptListeners();
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
