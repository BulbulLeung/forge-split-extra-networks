"use strict";

const forgeEnSharedDebounceTimers = Object.create(null);

function forgeEnGetPromptTextarea(tabname) {
    if (
        typeof activePromptTextarea !== "undefined" &&
        activePromptTextarea[tabname]
    ) {
        return activePromptTextarea[tabname];
    }
    const app = gradioApp();
    if (!app) return null;
    return app.querySelector("#" + tabname + "_prompt > label > textarea");
}

function forgeEnDebounceByKey(key, delayMs, callback) {
    if (forgeEnSharedDebounceTimers[key]) {
        clearTimeout(forgeEnSharedDebounceTimers[key]);
    }
    forgeEnSharedDebounceTimers[key] = setTimeout(function () {
        delete forgeEnSharedDebounceTimers[key];
        callback();
    }, delayMs);
}
