/**
 * forge-split-extra-networks: Save / Load Gen Setting on Prompt tab.
 */
"use strict";

const FORGE_EN_GEN_SETTINGS_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_GEN_SETTINGS_BAR_CLASS = "forge-en-gen-settings-bar";
const FORGE_EN_GEN_SETTINGS_SKIP_IDS = new Set([
    "txt2img_gallery",
    "img2img_gallery",
    "txt2img_gallery_container",
    "img2img_gallery_container",
]);

const forgeEnGenSettingsBound = Object.create(null);

function forgeEnGenSettingsFindInput(root) {
    if (!root) {
        return null;
    }
    // Prefer safe controls; never return file/button (setting file.value throws InvalidStateError).
    const candidates = root.querySelectorAll(
        "textarea, input[type='number'], input[type='text'], input[type='search'], input[type='range'], input[type='checkbox'], input[type='radio'], input:not([type]), select",
    );
    for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        const t = (el.type || "").toLowerCase();
        if (t === "file" || t === "button" || t === "submit" || t === "reset" || t === "image") {
            continue;
        }
        if (el.tagName === "INPUT" && el.disabled && t === "file") {
            continue;
        }
        return el;
    }
    return null;
}

function forgeEnGenSettingsIsGradioDropdown(root, input) {
    return (
        !!input &&
        input.tagName === "INPUT" &&
        input.type !== "checkbox" &&
        input.type !== "number" &&
        input.type !== "range" &&
        input.type !== "radio" &&
        (input.getAttribute("role") === "listbox" ||
            !!root.querySelector(".wrap .secondary-wrap input"))
    );
}

function forgeEnGenSettingsAfterSvelteFlush(fn) {
    // Svelte schedules reactive updates on a microtask; wait two ticks so
    // dropdown options / active_index settle before we commit.
    return new Promise(function (resolve) {
        queueMicrotask(function () {
            queueMicrotask(function () {
                resolve(fn());
            });
        });
    });
}

function forgeEnGenSettingsCommitGradioDropdown(root, input, wantValue) {
    const text = String(wantValue == null ? "" : wantValue);
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    return forgeEnGenSettingsAfterSvelteFlush(function () {
        let clicked = false;
        const items = root.querySelectorAll("ul.options li[data-index]");
        for (let i = 0; i < items.length; i++) {
            const li = items[i];
            const label = String(li.getAttribute("aria-label") || "").trim();
            const content = String(li.textContent || "")
                .replace(/^\s*✓\s*/, "")
                .trim();
            if (label === text || content === text) {
                li.dispatchEvent(
                    new MouseEvent("mousedown", {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                clicked = true;
                break;
            }
        }
        if (!clicked) {
            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
        return true;
    });
}

async function forgeEnGenSettingsApplyUpdate(update) {
    const root = gradioApp().getElementById(update.id);
    if (!root) {
        return false;
    }
    if (update.value === undefined) {
        return false;
    }

    // Skip upload / media roots entirely.
    if (
        root.querySelector(
            "input[type='file'], .image-container, .upload-container, canvas, video, .gallery",
        )
    ) {
        return false;
    }

    const radios = root.querySelectorAll("input[type='radio']");
    if (radios.length > 0) {
        const want = String(update.value);
        let matched = false;
        radios.forEach(function (radio) {
            const on = radio.value === want || radio.nextSibling && String(radio.nextSibling.textContent || "").trim() === want;
            radio.checked = on;
            if (on) {
                matched = true;
            }
        });
        if (matched) {
            const checked = root.querySelector("input[type='radio']:checked") || radios[0];
            if (typeof updateInput === "function") {
                updateInput(checked);
            } else {
                checked.dispatchEvent(new Event("input", { bubbles: true }));
                checked.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return true;
        }
    }

    const input = forgeEnGenSettingsFindInput(root);
    if (!input) {
        return false;
    }
    if (input.type === "file") {
        return false;
    }

    // Gradio Dropdown: setting input.value only updates display text; commit
    // via option click / Enter so internal `value` reaches Python.
    if (
        forgeEnGenSettingsIsGradioDropdown(root, input) &&
        !Array.isArray(update.value)
    ) {
        await forgeEnGenSettingsCommitGradioDropdown(root, input, update.value);
        return true;
    }

    try {
        if (input.type === "checkbox") {
            input.checked = !!update.value;
        } else if (Array.isArray(update.value)) {
            if (input.tagName === "SELECT" && input.multiple) {
                const want = new Set(update.value.map(String));
                Array.from(input.options).forEach(function (opt) {
                    opt.selected = want.has(opt.value);
                });
            } else {
                input.value = update.value.join(",");
            }
        } else {
            input.value = String(update.value);
        }
    } catch (err) {
        return false;
    }

    const isPromptTextarea =
        input.tagName === "TEXTAREA" &&
        /_(prompt|neg_prompt)$/.test(String(update.id || root.id || ""));
    const api = window.genLayoutPromptCaret;
    if (isPromptTextarea && api) {
        api.applyEdit(input, {
            value: input.value,
            caret: input.value.length,
            caretEnd: input.value.length,
            scroll: "none",
        });
        return true;
    }

    if (typeof updateInput === "function") {
        updateInput(input);
    } else {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
}

function forgeEnGenSettingsShouldSkipRoot(root) {
    if (!root || !root.id) {
        return true;
    }
    if (FORGE_EN_GEN_SETTINGS_SKIP_IDS.has(root.id)) {
        return true;
    }
    if (root.querySelector("button.lg-button, button[class*='lg']")) {
        // Keep checkbox / accordion roots that also contain buttons.
        const input = forgeEnGenSettingsFindInput(root);
        if (!input) {
            return true;
        }
    }
    if (
        root.querySelector(
            "input[type='file'], .image-container, .upload-container, canvas, video, .gallery",
        )
    ) {
        return true;
    }
    if (root.matches("button") || root.tagName === "BUTTON") {
        return true;
    }
    return false;
}

function forgeEnGenSettingsReadValue(input, root) {
    if (!input) {
        return undefined;
    }
    if (root) {
        const radios = root.querySelectorAll("input[type='radio']");
        if (radios.length > 0) {
            const checked = root.querySelector("input[type='radio']:checked");
            return checked ? checked.value : radios[0].value;
        }
    }
    if (input.type === "checkbox") {
        return !!input.checked;
    }
    if (input.tagName === "SELECT" && input.multiple) {
        return Array.from(input.selectedOptions).map(function (opt) {
            return opt.value;
        });
    }
    if (input.type === "number") {
        const num = input.valueAsNumber;
        if (!Number.isNaN(num)) {
            return num;
        }
    }
    return input.value;
}

function forgeEnGenSettingsCollectFromRoot(root, seen, fields) {
    if (!root || !root.id || seen.has(root.id)) {
        return;
    }
    if (forgeEnGenSettingsShouldSkipRoot(root)) {
        return;
    }

    const input = forgeEnGenSettingsFindInput(root);
    if (!input) {
        return;
    }

    // Only collect when this node is the nearest id ancestor of the input
    // (avoids treating #tab_settings / rows as a single field).
    const owner = input.closest("[id]");
    if (!owner || owner !== root) {
        return;
    }

    const value = forgeEnGenSettingsReadValue(input, root);
    if (value === undefined) {
        return;
    }

    seen.add(root.id);
    fields.push({ id: root.id, value: value });
}

function forgeEnGenSettingsCollect(tabname) {
    const app = gradioApp();
    if (!app) {
        return [];
    }

    const fields = [];
    const seen = new Set();
    const directIds = [tabname + "_prompt", tabname + "_neg_prompt"];

    directIds.forEach(function (id) {
        const root = app.getElementById(id);
        if (root) {
            forgeEnGenSettingsCollectFromRoot(root, seen, fields);
        }
    });

    const settings = app.getElementById(tabname + "_settings");
    if (settings) {
        settings.querySelectorAll("[id]").forEach(function (el) {
            forgeEnGenSettingsCollectFromRoot(el, seen, fields);
        });
    }

    return fields;
}

function forgeEnGenSettingsSyncPromptTags(tabname) {
    if (typeof forgeEnPromptSyncTags === "function") {
        forgeEnPromptSyncTags(tabname, true);
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

async function forgeEnGenSettingsApplyFields(tabname, fields) {
    if (!Array.isArray(fields)) {
        return 0;
    }
    let applied = 0;
    for (let i = 0; i < fields.length; i++) {
        const update = fields[i];
        if (!update || !update.id) {
            continue;
        }
        if (await forgeEnGenSettingsApplyUpdate(update)) {
            applied += 1;
        }
    }
    forgeEnGenSettingsSyncPromptTags(tabname);
    return applied;
}

async function forgeEnGenSettingsApiList(tabname) {
    const res = await fetch(
        "/forge-en-gen-settings/list?tabname=" + encodeURIComponent(tabname),
    );
    return res.json();
}

async function forgeEnGenSettingsApiGet(tabname, name) {
    const res = await fetch(
        "/forge-en-gen-settings/get?tabname=" +
            encodeURIComponent(tabname) +
            "&name=" +
            encodeURIComponent(name),
    );
    return res.json();
}

async function forgeEnGenSettingsApiSave(tabname, name, fields) {
    const res = await fetch("/forge-en-gen-settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabname: tabname, name: name, fields: fields }),
    });
    return res.json();
}

async function forgeEnGenSettingsApiDelete(tabname, name) {
    const res = await fetch("/forge-en-gen-settings/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabname: tabname, name: name }),
    });
    return res.json();
}

function forgeEnGenSettingsSetStatus(bar, message, isError) {
    if (!bar) {
        return;
    }
    const status = bar.querySelector(".forge-en-gen-settings-status");
    if (!status) {
        return;
    }
    status.textContent = message || "";
    status.classList.toggle("forge-en-gen-settings-status--error", !!isError);
}

function forgeEnGenSettingsGetCombo(bar) {
    return bar ? bar.querySelector(".forge-en-gen-settings-combo") : null;
}

function forgeEnGenSettingsGetComboName(bar) {
    const combo = forgeEnGenSettingsGetCombo(bar);
    return combo && combo.value ? String(combo.value).trim() : "";
}

function forgeEnGenSettingsFillDatalist(datalist, names) {
    if (!datalist) {
        return;
    }
    datalist.innerHTML = "";
    (names || []).forEach(function (name) {
        const opt = document.createElement("option");
        opt.value = name;
        datalist.appendChild(opt);
    });
}

async function forgeEnGenSettingsRefreshList(tabname, preferName) {
    const bar = forgeEnGenSettingsBound[tabname];
    if (!bar) {
        return [];
    }
    const combo = forgeEnGenSettingsGetCombo(bar);
    const datalist = bar.querySelector(".forge-en-gen-settings-datalist");
    try {
        const data = await forgeEnGenSettingsApiList(tabname);
        if (data.error) {
            forgeEnGenSettingsSetStatus(bar, String(data.error), true);
            return [];
        }
        const names = data.names || [];
        forgeEnGenSettingsFillDatalist(datalist, names);
        if (combo && preferName != null && preferName !== "") {
            combo.value = preferName;
        }
        return names;
    } catch (err) {
        forgeEnGenSettingsSetStatus(bar, String(err), true);
        return [];
    }
}

function forgeEnGenSettingsFormatValue(value) {
    if (value === undefined) {
        return "(missing)";
    }
    if (value === null) {
        return "null";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    return String(value);
}

function forgeEnGenSettingsTruncate(text, maxLen) {
    const s = forgeEnGenSettingsFormatValue(text);
    if (s.length <= maxLen) {
        return s;
    }
    return s.slice(0, maxLen) + "…";
}

function forgeEnGenSettingsFieldsToMap(fields) {
    const map = Object.create(null);
    (fields || []).forEach(function (item) {
        if (item && item.id) {
            map[item.id] = item.value;
        }
    });
    return map;
}

function forgeEnGenSettingsValuesEqual(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            JSON.stringify(a === undefined ? null : a) ===
            JSON.stringify(b === undefined ? null : b)
        );
    }
    return forgeEnGenSettingsFormatValue(a) === forgeEnGenSettingsFormatValue(b);
}

function forgeEnGenSettingsBuildDiffRows(oldFields, newFields) {
    const oldMap = forgeEnGenSettingsFieldsToMap(oldFields);
    const newMap = forgeEnGenSettingsFieldsToMap(newFields);
    const ids = Array.from(
        new Set(Object.keys(oldMap).concat(Object.keys(newMap))),
    );

    function priority(id) {
        if (/_prompt$/.test(id) && !/_neg_prompt$/.test(id)) {
            return 0;
        }
        if (/_neg_prompt$/.test(id)) {
            return 1;
        }
        return 2;
    }

    ids.sort(function (a, b) {
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) {
            return pa - pb;
        }
        return a.localeCompare(b);
    });

    const rows = [];
    ids.forEach(function (id) {
        const hasOld = Object.prototype.hasOwnProperty.call(oldMap, id);
        const hasNew = Object.prototype.hasOwnProperty.call(newMap, id);
        if (hasOld && hasNew && forgeEnGenSettingsValuesEqual(oldMap[id], newMap[id])) {
            return;
        }
        let maxLen = 120;
        if (/_neg_prompt$/.test(id)) {
            maxLen = 200;
        } else if (/_prompt$/.test(id)) {
            maxLen = 400;
        }
        rows.push({
            id: id,
            oldText: hasOld
                ? forgeEnGenSettingsTruncate(oldMap[id], maxLen)
                : "(missing)",
            newText: hasNew
                ? forgeEnGenSettingsTruncate(newMap[id], maxLen)
                : "(missing)",
        });
    });
    return rows;
}

let forgeEnGenSettingsOverwriteEl = null;
let forgeEnGenSettingsOverwriteResolver = null;

function forgeEnGenSettingsCloseOverwriteModal(confirmed) {
    if (forgeEnGenSettingsOverwriteEl) {
        forgeEnGenSettingsOverwriteEl.style.display = "none";
    }
    const resolve = forgeEnGenSettingsOverwriteResolver;
    forgeEnGenSettingsOverwriteResolver = null;
    if (resolve) {
        resolve(!!confirmed);
    }
}

function forgeEnGenSettingsEnsureOverwriteModal() {
    if (forgeEnGenSettingsOverwriteEl) {
        return forgeEnGenSettingsOverwriteEl;
    }
    const app = gradioApp();
    if (!app) {
        return null;
    }

    const overlay = document.createElement("div");
    overlay.className = "forge-en-gen-settings-overwrite";
    overlay.style.display = "none";
    overlay.innerHTML =
        '<div class="forge-en-gen-settings-overwrite__dialog" role="dialog" aria-modal="true">' +
        '<div class="forge-en-gen-settings-overwrite__title"></div>' +
        '<div class="forge-en-gen-settings-overwrite__hint">Review differences before overwriting.</div>' +
        '<div class="forge-en-gen-settings-overwrite__cols">' +
        '<div class="forge-en-gen-settings-overwrite__col">' +
        '<div class="forge-en-gen-settings-overwrite__col-title">Old</div>' +
        '<pre class="forge-en-gen-settings-overwrite__body forge-en-gen-settings-overwrite__body--old"></pre>' +
        "</div>" +
        '<div class="forge-en-gen-settings-overwrite__col">' +
        '<div class="forge-en-gen-settings-overwrite__col-title">New</div>' +
        '<pre class="forge-en-gen-settings-overwrite__body forge-en-gen-settings-overwrite__body--new"></pre>' +
        "</div>" +
        "</div>" +
        '<div class="forge-en-gen-settings-overwrite__actions">' +
        '<button type="button" class="forge-en-gen-settings-overwrite__confirm lg primary gradio-button custom-button">Overwrite</button>' +
        '<button type="button" class="forge-en-gen-settings-overwrite__cancel lg secondary gradio-button custom-button">Cancel</button>' +
        "</div>" +
        "</div>";

    overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
            forgeEnGenSettingsCloseOverwriteModal(false);
        }
    });
    document.addEventListener(
        "keydown",
        function (event) {
            if (
                event.key === "Escape" &&
                forgeEnGenSettingsOverwriteEl &&
                forgeEnGenSettingsOverwriteEl.style.display !== "none"
            ) {
                forgeEnGenSettingsCloseOverwriteModal(false);
            }
        },
        true,
    );
    overlay
        .querySelector(".forge-en-gen-settings-overwrite__confirm")
        .addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            forgeEnGenSettingsCloseOverwriteModal(true);
        });
    overlay
        .querySelector(".forge-en-gen-settings-overwrite__cancel")
        .addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            forgeEnGenSettingsCloseOverwriteModal(false);
        });

    app.appendChild(overlay);
    forgeEnGenSettingsOverwriteEl = overlay;
    return overlay;
}

function forgeEnGenSettingsShowOverwriteModal(name, oldFields, newFields) {
    const overlay = forgeEnGenSettingsEnsureOverwriteModal();
    if (!overlay) {
        return Promise.resolve(false);
    }

    const rows = forgeEnGenSettingsBuildDiffRows(oldFields, newFields);
    const maxRows = 40;
    const shown = rows.slice(0, maxRows);
    const more = rows.length - shown.length;

    function renderSide(side) {
        if (!shown.length) {
            return "(no differences)";
        }
        const lines = shown.map(function (row) {
            const text = side === "old" ? row.oldText : row.newText;
            return row.id + ":\n  " + text;
        });
        if (more > 0) {
            lines.push("…and " + more + " more");
        }
        return lines.join("\n\n");
    }

    overlay.querySelector(".forge-en-gen-settings-overwrite__title").textContent =
        'Overwrite "' + name + '"?';
    overlay.querySelector(
        ".forge-en-gen-settings-overwrite__body--old",
    ).textContent = renderSide("old");
    overlay.querySelector(
        ".forge-en-gen-settings-overwrite__body--new",
    ).textContent = renderSide("new");
    overlay.style.display = "flex";

    return new Promise(function (resolve) {
        forgeEnGenSettingsOverwriteResolver = resolve;
    });
}

async function forgeEnGenSettingsDoSave(tabname, name, fields) {
    const bar = forgeEnGenSettingsBound[tabname];
    forgeEnGenSettingsSetStatus(bar, "Saving…", false);
    try {
        const data = await forgeEnGenSettingsApiSave(tabname, name, fields);
        if (!data.ok || data.error) {
            forgeEnGenSettingsSetStatus(
                bar,
                String(data.error || "Save failed"),
                true,
            );
            return false;
        }
        await forgeEnGenSettingsRefreshList(tabname, name);
        forgeEnGenSettingsSetStatus(
            bar,
            'Saved "' + name + '" (' + data.count + " fields)",
            false,
        );
        return true;
    } catch (err) {
        forgeEnGenSettingsSetStatus(bar, String(err), true);
        return false;
    }
}

async function forgeEnGenSettingsOnSave(tabname) {
    const bar = forgeEnGenSettingsBound[tabname];
    if (!bar) {
        return;
    }
    const combo = forgeEnGenSettingsGetCombo(bar);
    const name = forgeEnGenSettingsGetComboName(bar);
    if (!name) {
        forgeEnGenSettingsSetStatus(bar, "Enter a name to save", true);
        if (combo) {
            combo.focus();
        }
        return;
    }

    const fields = forgeEnGenSettingsCollect(tabname);
    if (!fields.length) {
        forgeEnGenSettingsSetStatus(bar, "No settings found to save", true);
        return;
    }

    try {
        const names = await forgeEnGenSettingsRefreshList(tabname, name);
        const exists = names.indexOf(name) !== -1;
        if (exists) {
            forgeEnGenSettingsSetStatus(bar, "Comparing with saved preset…", false);
            const oldData = await forgeEnGenSettingsApiGet(tabname, name);
            if (oldData.error) {
                forgeEnGenSettingsSetStatus(bar, String(oldData.error), true);
                return;
            }
            const confirmed = await forgeEnGenSettingsShowOverwriteModal(
                name,
                oldData.fields || [],
                fields,
            );
            if (!confirmed) {
                forgeEnGenSettingsSetStatus(bar, "Save cancelled", false);
                return;
            }
        }
        await forgeEnGenSettingsDoSave(tabname, name, fields);
    } catch (err) {
        forgeEnGenSettingsSetStatus(bar, String(err), true);
    }
}

async function forgeEnGenSettingsOnLoad(tabname) {
    const bar = forgeEnGenSettingsBound[tabname];
    if (!bar) {
        return;
    }
    const combo = forgeEnGenSettingsGetCombo(bar);
    const name = forgeEnGenSettingsGetComboName(bar);
    if (!name) {
        forgeEnGenSettingsSetStatus(bar, "Enter or select a saved name", true);
        if (combo) {
            combo.focus();
        }
        return;
    }

    forgeEnGenSettingsSetStatus(bar, "Loading…", false);
    try {
        const data = await forgeEnGenSettingsApiGet(tabname, name);
        if (data.error) {
            forgeEnGenSettingsSetStatus(bar, String(data.error), true);
            return;
        }
        const applied = await forgeEnGenSettingsApplyFields(
            tabname,
            data.fields || [],
        );
        if (combo) {
            combo.value = name;
        }
        forgeEnGenSettingsSetStatus(
            bar,
            'Loaded "' + name + '" (' + applied + " fields)",
            false,
        );
    } catch (err) {
        forgeEnGenSettingsSetStatus(bar, String(err), true);
    }
}

async function forgeEnGenSettingsOnDelete(tabname) {
    const bar = forgeEnGenSettingsBound[tabname];
    if (!bar) {
        return;
    }
    const combo = forgeEnGenSettingsGetCombo(bar);
    const name = forgeEnGenSettingsGetComboName(bar);
    if (!name) {
        forgeEnGenSettingsSetStatus(bar, "Enter or select a saved name", true);
        if (combo) {
            combo.focus();
        }
        return;
    }
    if (!window.confirm('Delete gen setting "' + name + '"?')) {
        return;
    }

    forgeEnGenSettingsSetStatus(bar, "Deleting…", false);
    try {
        const data = await forgeEnGenSettingsApiDelete(tabname, name);
        if (!data.ok || data.error) {
            forgeEnGenSettingsSetStatus(
                bar,
                String(data.error || "Delete failed"),
                true,
            );
            return;
        }
        if (combo) {
            combo.value = "";
        }
        await forgeEnGenSettingsRefreshList(tabname, "");
        forgeEnGenSettingsSetStatus(bar, 'Deleted "' + name + '"', false);
    } catch (err) {
        forgeEnGenSettingsSetStatus(bar, String(err), true);
    }
}

function forgeEnGenSettingsGetMountParent(tabname) {
    const app = gradioApp();
    if (!app) {
        return null;
    }

    // Mount OUTSIDE #*_en_prompt_cards — applySort clears cards via innerHTML.
    // Gradio wraps elem_id nodes, so cards_html is often NOT a direct child of the tab panel.
    // Always insert as a sibling of cards_html under cards_html.parentElement.
    const tabPanel = app.querySelector("#" + tabname + "_en_prompt");
    const cardsHtml = app.querySelector("#" + tabname + "_en_prompt_cards_html");
    const pane = app.querySelector("#" + tabname + "_en_prompt_pane");

    if (cardsHtml && cardsHtml.parentElement) {
        return {
            parent: cardsHtml.parentElement,
            before: cardsHtml,
            strategy: "sibling_of_cards_html",
        };
    }
    if (pane && pane.parentElement) {
        return {
            parent: pane.parentElement,
            before: pane,
            strategy: "sibling_of_pane",
        };
    }
    if (tabPanel) {
        return {
            parent: tabPanel,
            before: tabPanel.firstChild,
            strategy: "tab_panel_prepend",
        };
    }
    return null;
}

function forgeEnGenSettingsBuildBar(tabname) {
    const bar = document.createElement("div");
    bar.className = FORGE_EN_GEN_SETTINGS_BAR_CLASS;
    bar.dataset.tabname = tabname;
    bar.id = tabname + "_en_gen_settings_bar";

    const datalistId = tabname + "_en_gen_settings_datalist";

    const combo = document.createElement("input");
    combo.type = "text";
    combo.className = "forge-en-gen-settings-combo";
    combo.setAttribute("list", datalistId);
    combo.placeholder = "preset name";
    combo.autocomplete = "off";
    combo.spellcheck = false;

    const datalist = document.createElement("datalist");
    datalist.id = datalistId;
    datalist.className = "forge-en-gen-settings-datalist";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "forge-en-gen-settings-btn forge-en-gen-settings-save";
    saveBtn.textContent = "SAVE";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "forge-en-gen-settings-btn forge-en-gen-settings-load";
    loadBtn.textContent = "LOAD";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className =
        "forge-en-gen-settings-btn forge-en-gen-settings-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.title = "Delete selected gen setting";

    const status = document.createElement("span");
    status.className = "forge-en-gen-settings-status";

    saveBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        forgeEnGenSettingsOnSave(tabname);
    });
    loadBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        forgeEnGenSettingsOnLoad(tabname);
    });
    deleteBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        forgeEnGenSettingsOnDelete(tabname);
    });
    combo.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            forgeEnGenSettingsOnSave(tabname);
        }
    });

    bar.appendChild(combo);
    bar.appendChild(datalist);
    bar.appendChild(saveBtn);
    bar.appendChild(loadBtn);
    bar.appendChild(deleteBtn);
    bar.appendChild(status);
    return bar;
}

function forgeEnGenSettingsEnsureBar(tabname) {
    const mount = forgeEnGenSettingsGetMountParent(tabname);
    if (!mount) {
        return null;
    }

    let bar = forgeEnGenSettingsBound[tabname];
    if (bar && mount.parent.contains(bar)) {
        if (!bar.querySelector(".forge-en-gen-settings-combo")) {
            bar.remove();
            delete forgeEnGenSettingsBound[tabname];
            bar = null;
        } else {
            if (bar.nextSibling !== mount.before) {
                mount.parent.insertBefore(bar, mount.before);
            }
            return bar;
        }
    }

    const existing = mount.parent.querySelector(
        "#" + tabname + "_en_gen_settings_bar",
    );
    if (existing) {
        existing.remove();
    }

    try {
        bar = forgeEnGenSettingsBuildBar(tabname);
        mount.parent.insertBefore(bar, mount.before);
        forgeEnGenSettingsBound[tabname] = bar;
        forgeEnGenSettingsRefreshList(tabname);
        return bar;
    } catch (err) {
        return null;
    }
}

function forgeEnGenSettingsInstallTabHook() {
    if (
        typeof extraNetworksTabSelected === "undefined" ||
        extraNetworksTabSelected._forgeEnGenSettingsHook
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
        if (
            tabnameFull === tabname + "_en_prompt" &&
            FORGE_EN_GEN_SETTINGS_TABNAMES.indexOf(tabname) !== -1
        ) {
            forgeEnGenSettingsEnsureBar(tabname);
        }
        return result;
    };
    extraNetworksTabSelected._forgeEnGenSettingsHook = true;
}

function forgeEnGenSettingsInit() {
    forgeEnGenSettingsInstallTabHook();
    FORGE_EN_GEN_SETTINGS_TABNAMES.forEach(forgeEnGenSettingsEnsureBar);
}

let forgeEnGenSettingsAfterUiUpdatePending = null;

function forgeEnGenSettingsScheduleAfterUiUpdate() {
    if (forgeEnGenSettingsAfterUiUpdatePending !== null) {
        clearTimeout(forgeEnGenSettingsAfterUiUpdatePending);
    }
    forgeEnGenSettingsAfterUiUpdatePending = setTimeout(function () {
        forgeEnGenSettingsAfterUiUpdatePending = null;
        forgeEnGenSettingsInit();
    }, 220);
}

if (typeof onUiLoaded === "function") {
    onUiLoaded(forgeEnGenSettingsInit);
} else {
    forgeEnGenSettingsInit();
}

if (typeof onUiUpdate === "function") {
    onUiUpdate(forgeEnGenSettingsScheduleAfterUiUpdate);
}
