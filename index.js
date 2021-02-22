// Exports
module.exports = function(options) {
    const { exec, execGM, performMethod, customMethod } = require("./exec.js")(options);
    const { readURL, jimpReadURL, readBuffer, measureText, measureTextHeight, gmToBuffer, getFormat, loadFont } = require("./utils.js")(options);

    return {
        exec,
        execGM,
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