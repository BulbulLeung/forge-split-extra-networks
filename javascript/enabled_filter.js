/**
 * forge-split-extra-networks: "enabled" filter for Wildcard / Lora dirs buttons.
 */
"use strict";

const FORGE_EN_ENABLED_FILTER_TABNAMES = ["txt2img", "img2img"];
const FORGE_EN_ENABLED_FILTER_PAGES = [
    { page: "wildcard", activeClass: "forge-en-wildcard-active" },
    { page: "lora", activeClass: "forge-en-lora-active" },
];

const forgeEnEnabledFilterMode = Object.create(null);
const forgeEnEnabledFilterSearchBound = Object.create(null);
const forgeEnEnabledFilterSuppressSearchClear = Object.create(null);
const forgeEnEnabledFilterActiveClassByTab = Object.create(null);

let forgeEnEnabledFilterHooksInstalled = false;
let forgeEnEnabledFilterAfterUiUpdatePending = null;

function forgeEnEnabledFilterTabnameFull(tabname, page) {
    return tabname + "_" + page;
}

function forgeEnEnabledFilterGetButton(tabnameFull) {
    const app = gradioApp();
    if (!app) return null;
    return app.querySelector(
        "#" + tabnameFull + "_dirs .forge-en-filter-enabled",
    );
}

function forgeEnEnabledFilterSetButtonActive(tabnameFull, active) {
    const button = forgeEnEnabledFilterGetButton(tabnameFull);
    if (!button) return;
    button.classList.toggle("forge-en-filter-enabled-active", !!active);
}

function forgeEnEnabledFilterClear(tabnameFull) {
    if (!forgeEnEnabledFilterMode[tabnameFull]) {
        return;
    }
    forgeEnEnabledFilterMode[tabnameFull] = false;
    forgeEnEnabledFilterSetButtonActive(tabnameFull, false);
}

function forgeEnEnabledFilterApplyEnabledOnly(tabnameFull, activeClass) {
    if (!forgeEnEnabledFilterMode[tabnameFull]) {
        return;
    }

    const app = gradioApp();
    if (!app) return;

    const cardsContainer = app.querySelector("#" + tabnameFull + "_cards");
    if (!cardsContainer) return;

    cardsContainer.querySelectorAll(".card").forEach(function (card) {
        const shouldShow = card.classList.contains(activeClass);
        const isHidden = card.classList.contains("hidden");
        if (shouldShow && isHidden) {
            card.classList.remove("hidden");
        } else if (!shouldShow && !isHidden) {
            card.classList.add("hidden");
        }
    });
}

function forgeEnEnabledFilterEnsureButton(tabname, page) {
    const tabnameFull = forgeEnEnabledFilterTabnameFull(tabname, page);
    const app = gradioApp();
    if (!app) return;

    const dirs = app.querySelector("#" + tabnameFull + "_dirs");
    if (!dirs) return;

    if (dirs.querySelector(".forge-en-filter-enabled")) {
        return;
    }

    const allButton = dirs.querySelector("button.search-all");
    if (!allButton) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className =
        "lg secondary gradio-button custom-button forge-en-filter-enabled";
    button.textContent = "\u2713";
    button.title = "enabled";
    button.addEventListener("click", function (event) {
        forgeEnEnabledFilterButton(tabname, page, event);
    });

    allButton.insertAdjacentElement("afterend", button);
}

function forgeEnEnabledFilterBindSearchInput(tabname, page, activeClass) {
    const tabnameFull = forgeEnEnabledFilterTabnameFull(tabname, page);
    forgeEnEnabledFilterActiveClassByTab[tabnameFull] = activeClass;
    const app = gradioApp();
    if (!app) return;

    const search = app.querySelector("#" + tabnameFull + "_extra_search");
    if (!search || forgeEnEnabledFilterSearchBound[tabnameFull] === search) {
        return;
    }

    forgeEnEnabledFilterSearchBound[tabnameFull] = search;
    search.addEventListener("input", function () {
        if (forgeEnEnabledFilterSuppressSearchClear[tabnameFull]) {
            return;
        }
        if (forgeEnEnabledFilterMode[tabnameFull]) {
            forgeEnEnabledFilterClear(tabnameFull);
        }
    });
}

function forgeEnEnabledFilterInstallHooks() {
    if (forgeEnEnabledFilterHooksInstalled) {
        return;
    }
    forgeEnEnabledFilterHooksInstalled = true;

    if (typeof extraNetworksSearchButton === "function") {
        const originalSearchButton = extraNetworksSearchButton;
        extraNetworksSearchButton = function (
            tabname,
            extra_networks_tabname,
            event,
        ) {
            const tabnameFull = tabname + "_" + extra_networks_tabname;
            forgeEnEnabledFilterClear(tabnameFull);
            originalSearchButton(tabname, extra_networks_tabname, event);
        };
    }
}

function forgeEnEnabledFilterButton(tabname, page, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const tabnameFull = forgeEnEnabledFilterTabnameFull(tabname, page);
    const activeClass =
        forgeEnEnabledFilterActiveClassByTab[tabnameFull] ||
        (page === "wildcard"
            ? "forge-en-wildcard-active"
            : "forge-en-lora-active");
    const app = gradioApp();
    if (!app) return;

    forgeEnEnabledFilterMode[tabnameFull] = true;
    forgeEnEnabledFilterSetButtonActive(tabnameFull, true);

    const search = app.querySelector("#" + tabnameFull + "_extra_search");
    if (search && search.value !== "") {
        forgeEnEnabledFilterSuppressSearchClear[tabnameFull] = true;
        search.value = "";
        requestAnimationFrame(function () {
            forgeEnEnabledFilterSuppressSearchClear[tabnameFull] = false;
        });
    }

    forgeEnEnabledFilterApplyEnabledOnly(tabnameFull, activeClass);
}

function forgeEnEnabledFilterReapply(tabname, page) {
    const tabnameFull = forgeEnEnabledFilterTabnameFull(tabname, page);
    if (!forgeEnEnabledFilterMode[tabnameFull]) {
        return;
    }

    const activeClass = forgeEnEnabledFilterActiveClassByTab[tabnameFull];
    if (!activeClass) {
        return;
    }

    forgeEnEnabledFilterApplyEnabledOnly(tabnameFull, activeClass);
}

function forgeEnEnabledFilterInit(reapplyEnabled) {
    forgeEnEnabledFilterInstallHooks();

    FORGE_EN_ENABLED_FILTER_TABNAMES.forEach(function (tabname) {
        FORGE_EN_ENABLED_FILTER_PAGES.forEach(function (config) {
            const tabnameFull = forgeEnEnabledFilterTabnameFull(
                tabname,
                config.page,
            );
            forgeEnEnabledFilterEnsureButton(tabname, config.page);
            forgeEnEnabledFilterBindSearchInput(
                tabname,
                config.page,
                config.activeClass,
            );

            if (forgeEnEnabledFilterMode[tabnameFull]) {
                forgeEnEnabledFilterSetButtonActive(tabnameFull, true);
                if (reapplyEnabled) {
                    forgeEnEnabledFilterApplyEnabledOnly(
                        tabnameFull,
                        config.activeClass,
                    );
                }
            }
        });
    });
}

function forgeEnEnabledFilterScheduleAfterUiUpdate() {
    if (forgeEnEnabledFilterAfterUiUpdatePending !== null) {
        clearTimeout(forgeEnEnabledFilterAfterUiUpdatePending);
    }
    forgeEnEnabledFilterAfterUiUpdatePending = setTimeout(function () {
        forgeEnEnabledFilterAfterUiUpdatePending = null;
        forgeEnEnabledFilterInit(true);
    }, 200);
}

if (typeof onUiLoaded === "function") {
    onUiLoaded(function () {
        forgeEnEnabledFilterInit(false);
    });
} else {
    forgeEnEnabledFilterInit(false);
}

if (typeof onAfterUiUpdate === "function") {
    onAfterUiUpdate(forgeEnEnabledFilterScheduleAfterUiUpdate);
}
