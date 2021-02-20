// Exports
module.exports = function(imageMagick) {
    const { exec, execGM, performMethod, customMethod } = require("./exec.js")(imageMagick);
    const { readURL, jimpReadURL, readBuffer, measureText, measureTextHeight, gmToBuffer, getFormat, loadFont } = require("./utils.js")(imageMagick);

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