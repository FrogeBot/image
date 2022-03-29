// Exports
module.exports = function(options) {
    const { exec, execGM, execGPU, performMethod, customMethod } = require("./exec.js")(options);
    const { readURL, jimpReadURL, readBuffer, measureText, measureTextHeight, gmToBuffer, getFormat, loadFont } = require("./utils.js")(options);

    return {
        exec,
        execGM,
        execGPU,
        readURL,
        jimpReadURL,
        readBuffer,
        measureText,
        measureTextHeight,
        loadFont,
        performMethod,
        customMethod,
        gmToBuffer,
        getFormat,
    }
};