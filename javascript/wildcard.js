/**
 * forge-split-extra-networks: Wildcard tab — prompt sync, highlight, toggle.
 */
"use strict";

const FORGE_EN_WILDCARD_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_WILDCARD_ACTIVE_CLASS = "forge-en-wildcard-active";
const FORGE_EN_WILDCARD_DEFAULT_WRAP = "__";
const FORGE_EN_WILDCARD_PROMPT_SEPARATOR = ", ";

const forgeEnWildcardBound = {
    prompt: Object.create(null),
    cards: Object.create(null),
};

function forgeEnWildcardWrap() {
    if (
        typeof opts !== "undefined" &&
        opts.dp_parser_wildcard_wrap != null &&
        String(opts.dp_parser_wildcard_wrap).length > 0
    ) {
        return String(opts.dp_parser_wildcard_wrap);
    }
    return FORGE_EN_WILDCARD_DEFAULT_WRAP;
}

function forgeEnWildcardTokenFromName(name) {
    const wrap = forgeEnWildcardWrap();
    return wrap + name + wrap;
}

function forgeEnWildcardTokenFromCard(card) {
    const name = card.getAttribute("data-name");
    if (!name) return "";
    return forgeEnWildcardTokenFromName(name);
}

function forgeEnWildcardTabnameFromContainer(container) {
    if (!container || !container.id) return null;
    const match = container.id.match(/^(txt2img|img2img)_wildcard_cards$/);
    return match ? match[1] : null;
}

function forgeEnWildcardGetPromptTextarea(tabname) {
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

function forgeEnWildcardEscapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function forgeEnWildcardEndsWithComma(text) {
    return /,\s*$/.test(text);
}

function forgeEnWildcardPromptContainsToken(prompt, token) {
    return prompt.indexOf(token) >= 0;
}

function forgeEnWildcardRemoveTokenFromPrompt(prompt, token) {
    if (!forgeEnWildcardPromptContainsToken(prompt, token)) {
        return prompt;
    }

    const escaped = forgeEnWildcardEscapeRegex(token);
    const patterns = [
        new RegExp(escaped + "\\s*,\\s*", "g"),
        new RegExp(escaped, "g"),
    ];

    let result = prompt;
    for (let i = 0; i < patterns.length; i++) {
        const next = result.replace(patterns[i], "");
        if (next !== result) {
            result = next;
            break;
        }
    }

    return result.replace(/\s{2,}/g, " ").trim();
}

function forgeEnWildcardAddTokenToPrompt(prompt, token) {
    const trimmed = (prompt || "").trim();
    if (forgeEnWildcardPromptContainsToken(trimmed, token)) {
        return trimmed;
    }

    if (!trimmed) {
        return token + FORGE_EN_WILDCARD_PROMPT_SEPARATOR;
    }

    let result = trimmed;
    if (!forgeEnWildcardEndsWithComma(result)) {
        result += FORGE_EN_WILDCARD_PROMPT_SEPARATOR;
    } else if (!result.endsWith(" ")) {
        result += " ";
    }

    result += token;
    if (!forgeEnWildcardEndsWithComma(result)) {
        result += FORGE_EN_WILDCARD_PROMPT_SEPARATOR;
    }

    return result;
}

function forgeEnWildcardToggleToken(tabname, token) {
    const textarea = forgeEnWildcardGetPromptTextarea(tabname);
    if (!textarea || !token) return;

    const current = textarea.value || "";
    if (forgeEnWildcardPromptContainsToken(current, token)) {
        textarea.value = forgeEnWildcardRemoveTokenFromPrompt(current, token);
    } else {
        textarea.value = forgeEnWildcardAddTokenToPrompt(current, token);
    }

    if (typeof updateInput === "function") {
        updateInput(textarea);
    }
    if (tabname === "txt2img" && typeof recalculate_prompts_txt2img === "function") {
        recalculate_prompts_txt2img();
    } else if (
        tabname === "img2img" &&
        typeof recalculate_prompts_img2img === "function"
    ) {
        recalculate_prompts_img2img();
    }
}

function forgeEnWildcardSyncHighlights(tabname) {
    const app = gradioApp();
    if (!app) return;

    const container = app.querySelector("#" + tabname + "_wildcard_cards");
    if (!container) return;

    const textarea = forgeEnWildcardGetPromptTextarea(tabname);
    const prompt = textarea ? textarea.value || "" : "";

    container.querySelectorAll(".card").forEach(function (card) {
        const token = forgeEnWildcardTokenFromCard(card);
        if (!token) return;
        if (forgeEnWildcardPromptContainsToken(prompt, token)) {
            card.classList.add(FORGE_EN_WILDCARD_ACTIVE_CLASS);
        } else {
            card.classList.remove(FORGE_EN_WILDCARD_ACTIVE_CLASS);
        }
    });
}

function forgeEnWildcardSyncAllHighlights() {
    FORGE_EN_WILDCARD_TABNAMES.forEach(forgeEnWildcardSyncHighlights);
}

function forgeEnWildcardOnPromptInput(tabname) {
    forgeEnWildcardSyncHighlights(tabname);
}

function forgeEnWildcardBindPromptListeners() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_WILDCARD_TABNAMES.forEach(function (tabname) {
        const textarea = app.querySelector(
            "#" + tabname + "_prompt > label > textarea",
        );
        if (!textarea || forgeEnWildcardBound.prompt[tabname] === textarea) {
            return;
        }

        forgeEnWildcardBound.prompt[tabname] = textarea;
        textarea.addEventListener("input", function () {
            forgeEnWildcardOnPromptInput(tabname);
        });
        textarea.addEventListener("focus", function () {
            if (typeof activePromptTextarea !== "undefined") {
                activePromptTextarea[tabname] = textarea;
            }
            forgeEnWildcardOnPromptInput(tabname);
        });
    });
}

function forgeEnWildcardBindCardContainers() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_WILDCARD_TABNAMES.forEach(function (tabname) {
        const container = app.querySelector("#" + tabname + "_wildcard_cards");
        if (!container || forgeEnWildcardBound.cards[tabname] === container) {
            return;
        }

        forgeEnWildcardBound.cards[tabname] = container;
        container.addEventListener("click", function (event) {
            const card = event.target.closest(".card");
            if (!card || !container.contains(card)) return;
            if (event.target.closest(".button-row")) return;
            forgeEnWildcardCardClicked(card, event);
        });
    });
}

function forgeEnWildcardCardClicked(card, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const container = card.closest('[id$="_wildcard_cards"]');
    const tabname = forgeEnWildcardTabnameFromContainer(container);
    const token = forgeEnWildcardTokenFromCard(card);
    if (!tabname || !token) return false;

    forgeEnWildcardToggleToken(tabname, token);
    forgeEnWildcardSyncHighlights(tabname);
    return false;
}

function forgeEnWildcardInit() {
    if (typeof forgeEnOutputBrowserApplySelectionStyle === "function") {
        forgeEnOutputBrowserApplySelectionStyle();
    }
    forgeEnWildcardBindPromptListeners();
    forgeEnWildcardBindCardContainers();
    forgeEnWildcardSyncAllHighlights();
}

if (typeof onUiUpdate === "function") {
    onUiUpdate(forgeEnWildcardInit);
}
if (typeof onUiLoaded === "function") {
    onUiLoaded(forgeEnWildcardInit);
} else {
    forgeEnWildcardInit();
}
