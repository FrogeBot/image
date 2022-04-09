let options = {
  imageMagick: false,
  maxImageSize: 2048,
  maxGifSize: 1024,
}

// Exports
module.exports = function(opts) {
  Object.assign(options, opts)

  var Jimp = require("jimp");
  var gm = require("gm");
  if (options.imageMagick.toString() == "true") {
    gm = gm.subClass({ imageMagick: true });
  }
  const request = require("request");

  function gmToBuffer(gm, useWebp = true, as) {
    return new Promise(async (resolve, reject) => {
      gm.format({ bufferStream: true }, function (err, format) {
        if (format == "WEBP" && !useWebp) format = "PNG";
        if (as != undefined) format = as;
        this.toBuffer(format, function (err, buffer) {
          if (!err) {
            resolve(buffer);
          } else reject(err);
        });
      });
    });
  }

  function getFormat(imgUrl) {
    return new Promise(async (resolve, reject) => {
      gm(request(imgUrl)).format({ bufferStream: true }, function (err, format) {
        resolve(format);
      });
    });
  }
  function getSize(imgUrl) {
    return new Promise(async (resolve, reject) => {
      let maxSize = Number(options.maxImageSize);
      gm(request(imgUrl)).size(
        { bufferStream: true },
        async function (err, size) {
          if (err) {
            //console.log(err)
            reject(err);
          } else {
            if(maxSize < size.width || maxSize < size.height) {
              await this.resize(
                maxSize > size.width ? size.width : maxSize,
                maxSize > size.height ? size.height : maxSize
              );
              this.size(
              { bufferStream: true },
              async function (err, size) {
                if (err) {
                  //console.log(err)
                  reject(err);
                } else {
                  resolve([size.width, size.height])
                }
              });
            } else {
              resolve([size.width, size.height])
            }
          }
        }
      );
    });
  }

  function readURL(imgUrl, useWebp = true, as = undefined) {
    return new Promise(async (resolve, reject) => {
      try {
        let maxSize = Number(options.maxImageSize);
        gm(request(imgUrl)).size(
          { bufferStream: true },
          async function (err, size) {
            if (err) {
              //console.log(err)
              reject(err);
            } else {
              if(maxSize < size.width || maxSize < size.height) {
                await this.resize(
                  maxSize > size.width ? size.width : maxSize,
                  maxSize > size.height ? size.height : maxSize
                );
              }
              resolve(await gmToBuffer(this, useWebp, as));
            }
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  }
  function jimpReadURL(imgUrl) {
    return new Promise(async (resolve, reject) => {
      try {
        let maxSize = Number(options.maxImageSize);
        Jimp.read(await readURL(imgUrl, false, undefined))
        .then(async (img) => {
          if(maxSize < img.bitmap.width || maxSize < img.bitmap.height)
            img.scaleToFit(maxSize, maxSize)
          resolve(img);
        })
        .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }
  function readBuffer(buffer) {
    return new Promise(async (resolve, reject) => {
      // Read image type supported by jimp (from buffer)
      Jimp.read(buffer)
        .then(async (img) => {
          resolve(img); // Resolve image
        })
        .catch(reject);
    });
  }

  function measureText(font, str) {
    return new Promise(async (resolve, reject) => {
      resolve(await Jimp.measureText(Jimp[font], str)); // Measure text using jimp text, obsolete due to canvas text rendering.
    });
  }
  function measureTextHeight(font, str, width) {
    return new Promise(async (resolve, reject) => {
      resolve(await Jimp.measureTextHeight(Jimp[font], str, width)); // Measure text height using jimp text, obsolete due to canvas text rendering.
    });
  }
  function loadFont(path) {
    return new Promise(async (resolve, reject) => {
      Jimp.loadFont(path).then((font) => {
        resolve(font); // Load and resolve font using jimp text, obsolete due to canvas text rendering.
      });
    });
  }
  return {
    readURL,
    jimpReadURL,
    readBuffer,
    measureText,
    measureTextHeight,
    gmToBuffer,
    getFormat,
    getSize,
    loadFont
  }
};
