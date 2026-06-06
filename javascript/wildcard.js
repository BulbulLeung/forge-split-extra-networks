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
    contextMenu: Object.create(null),
};

let forgeEnWildcardContextMenuEl = null;
let forgeEnWildcardContextMenuState = null;

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

function forgeEnWildcardGetCardFilepath(card) {
    const btn = card.querySelector(".copy-path-button");
    if (!btn) return null;
    return (
        btn.getAttribute("data-clipboard-text") ||
        btn.dataset.clipboardText ||
        null
    );
}

function forgeEnWildcardCloseContextMenu() {
    if (forgeEnWildcardContextMenuEl) {
        forgeEnWildcardContextMenuEl.style.display = "none";
    }
    forgeEnWildcardContextMenuState = null;
}

function forgeEnWildcardAddLineToPrompt(tabname, line) {
    const text = (line || "").trim();
    if (!text) return;

    const textarea = forgeEnWildcardGetPromptTextarea(tabname);
    if (!textarea) return;

    let lineWithSep = text;
    if (!forgeEnWildcardEndsWithComma(lineWithSep)) {
        lineWithSep += FORGE_EN_WILDCARD_PROMPT_SEPARATOR;
    }

    const current = (textarea.value || "").trimEnd();
    textarea.value = current ? current + "\n" + lineWithSep : lineWithSep;

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

function forgeEnWildcardRenderContextMenuBody(menu, titleText, lines, error) {
    menu.innerHTML = "";

    const title = document.createElement("div");
    title.className = "forge-en-wildcard-context-menu-title";
    title.textContent = titleText;
    menu.appendChild(title);

    if (error) {
        const msg = document.createElement("div");
        msg.className = "forge-en-wildcard-context-menu-message";
        msg.textContent = error;
        menu.appendChild(msg);
        return;
    }

    if (!lines || lines.length === 0) {
        const msg = document.createElement("div");
        msg.className = "forge-en-wildcard-context-menu-message";
        msg.textContent = "No lines available";
        menu.appendChild(msg);
        return;
    }

    lines.forEach(function (line) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.line = line;
        btn.textContent = line;
        btn.title = line;
        menu.appendChild(btn);
    });
}

function forgeEnWildcardPositionContextMenu(menu, clientX, clientY) {
    menu.style.display = "block";
    menu.style.left = clientX + "px";
    menu.style.top = clientY + "px";

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = Math.max(0, clientX - rect.width) + "px";
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = Math.max(0, clientY - rect.height) + "px";
    }
}

function forgeEnWildcardFetchLines(filepath) {
    const url =
        "/forge-en-wildcard/lines?filename=" +
        encodeURIComponent(filepath);
    return fetch(url).then(function (response) {
        return response.json();
    });
}

function forgeEnWildcardOpenFolder(event, tabname) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    fetch("/forge-en-wildcard/open-folder")
        .then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    const message =
                        data.error ||
                        (typeof data.detail === "string"
                            ? data.detail
                            : response.statusText);
                    throw new Error(message);
                }
                return data;
            });
        })
        .then(function (data) {
            if (!data.ok && data.error) {
                alert(data.error);
            }
        })
        .catch(function (err) {
            alert(err.message || "Failed to open folder");
        });
}

function forgeEnWildcardEnsureContextMenu() {
    if (forgeEnWildcardContextMenuEl) {
        return forgeEnWildcardContextMenuEl;
    }

    const menu = document.createElement("div");
    menu.id = "forgeEnWildcardContextMenu";
    menu.className =
        "forge-en-output-context-menu forge-en-wildcard-context-menu";
    menu.style.display = "none";

    function handleMenuAction(event) {
        const btn = event.target.closest("button[data-line]");
        if (!btn || !forgeEnWildcardContextMenuState) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const tabname = forgeEnWildcardContextMenuState.tabname;
        const line = btn.dataset.line || "";
        forgeEnWildcardCloseContextMenu();
        forgeEnWildcardAddLineToPrompt(tabname, line);
    }

    menu.addEventListener("mousedown", handleMenuAction, true);
    menu.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
    });

    if (!window._forgeEnWildcardContextMenuGlobalClose) {
        window._forgeEnWildcardContextMenuGlobalClose = true;
        document.addEventListener(
            "click",
            function (event) {
                if (
                    forgeEnWildcardContextMenuEl &&
                    forgeEnWildcardContextMenuEl.contains(event.target)
                ) {
                    return;
                }
                forgeEnWildcardCloseContextMenu();
            },
            true,
        );
        document.addEventListener(
            "contextmenu",
            function (event) {
                if (
                    forgeEnWildcardContextMenuEl &&
                    forgeEnWildcardContextMenuEl.style.display !== "none" &&
                    !forgeEnWildcardContextMenuEl.contains(event.target)
                ) {
                    forgeEnWildcardCloseContextMenu();
                }
            },
            true,
        );
    }

    gradioApp().appendChild(menu);
    forgeEnWildcardContextMenuEl = menu;
    return menu;
}

function forgeEnWildcardShowContextMenu(event, container, tabname) {
    if (event.target.closest(".button-row")) return;

    const card = event.target.closest(".card");
    if (!card || !container.contains(card)) return;

    event.preventDefault();
    event.stopPropagation();

    const filepath = forgeEnWildcardGetCardFilepath(card);
    const menu = forgeEnWildcardEnsureContextMenu();
    const wildcardName = card.getAttribute("data-name") || "Wildcard";

    forgeEnWildcardContextMenuState = { tabname: tabname };
    forgeEnWildcardRenderContextMenuBody(menu, wildcardName, null, "Loading...");
    forgeEnWildcardPositionContextMenu(menu, event.clientX, event.clientY);

    if (!filepath) {
        forgeEnWildcardRenderContextMenuBody(
            menu,
            wildcardName,
            null,
            "File path not found",
        );
        forgeEnWildcardPositionContextMenu(menu, event.clientX, event.clientY);
        return;
    }

    forgeEnWildcardFetchLines(filepath)
        .then(function (data) {
            if (
                !forgeEnWildcardContextMenuState ||
                forgeEnWildcardContextMenuState.tabname !== tabname
            ) {
                return;
            }
            const title = data.name || wildcardName;
            if (data.error) {
                forgeEnWildcardRenderContextMenuBody(
                    menu,
                    title,
                    null,
                    data.error,
                );
            } else {
                forgeEnWildcardRenderContextMenuBody(
                    menu,
                    title,
                    data.lines || [],
                    null,
                );
            }
            forgeEnWildcardPositionContextMenu(
                menu,
                event.clientX,
                event.clientY,
            );
        })
        .catch(function (err) {
            if (
                !forgeEnWildcardContextMenuState ||
                forgeEnWildcardContextMenuState.tabname !== tabname
            ) {
                return;
            }
            forgeEnWildcardRenderContextMenuBody(
                menu,
                wildcardName,
                null,
                err.message || "Failed to load lines",
            );
            forgeEnWildcardPositionContextMenu(
                menu,
                event.clientX,
                event.clientY,
            );
        });
}

function forgeEnWildcardBindContextMenu() {
    const app = gradioApp();
    if (!app) return;

    FORGE_EN_WILDCARD_TABNAMES.forEach(function (tabname) {
        const container = app.querySelector("#" + tabname + "_wildcard_cards");
        if (!container || forgeEnWildcardBound.contextMenu[tabname] === container) {
            return;
        }

        forgeEnWildcardBound.contextMenu[tabname] = container;
        container.addEventListener("contextmenu", function (event) {
            forgeEnWildcardShowContextMenu(event, container, tabname);
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
    forgeEnWildcardBindContextMenu();
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
