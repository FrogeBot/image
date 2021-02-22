let options = {
  imageMagick: false,
  maxImageSize: 2048,
  maxGifSize: 1024,
}

// Exports
module.exports = function(opts) {
  Object.assign(options, opts)

  var Jimp = require("jimp");
  var sharp = require("sharp");
  var gm = require("gm");
  if (options.imageMagick.toString() == "true") {
    gm = gm.subClass({ imageMagick: true });
  }

  const { Worker } = require("worker_threads");

  const { gmToBuffer, getFormat, readBuffer } = require("./utils.js")(options);

  function createNewImage(w, h, bg) {
    return new Promise(async (resolve, reject) => {
      setImmediate(async () => {
        // Create image from specified parameters
        new Jimp(w, h, bg, async (err, img) => {
          if (err) {
            reject();
          } else {
            resolve(img); // Resolve image
          }
        });
      });
    });
  }

  function exec(imgUrl, list) {
    return new Promise(async (resolve, reject) => {
      if ((await getFormat(imgUrl)) == "GIF") {
        try {
          let worker = new Worker(__dirname + "/workers/gif.js");
          worker.postMessage({
            imgUrl,
            list,
            frameSkip: 1,
            speed: 1,
            jimp: true,
            options,
          });

          worker.on("message", async (img) => {
            if (img == null) reject("Null image");
            resolve(Buffer.from(img));
          });
        } catch (e) {
          //console.log(e)
          reject(e);
        }
      } else {
        let worker = new Worker(__dirname + "/workers/jimp.js");
        worker.postMessage({ imgUrl, list, allowBackgrounds: true, options });

        worker.on("message", (img) => {
          if (img == null) reject("Null image");
          else resolve(Buffer.from(img));
        });
      }
    });
  }

  function execGM(imgUrl, list) {
    return new Promise(async (resolve, reject) => {
      if ((await getFormat(imgUrl)) == "GIF") {
        try {
          let worker = new Worker(__dirname + "/workers/gif.js");
          worker.postMessage({
            imgUrl,
            list,
            frameSkip: 1,
            speed: 1,
            jimp: false,
            options,
          });

          worker.on("message", async (img) => {
            if (img == null) reject("Null image");
            resolve(Buffer.from(img));
          });
        } catch (e) {
          //console.log(e)
          reject(e);
        }
      } else {
        let worker = new Worker(__dirname + "/workers/magick.js");
        worker.postMessage({ imgUrl, list, allowBackgrounds: true, options });

        worker.on("message", (img) => {
          if (img == null) reject("Null image");
          else resolve(Buffer.from(img));
        });
      }
    });
  }

  function performMethod(img, method, params, allowBackgrounds) {
    return new Promise(async (resolve, reject) => {
      try {
        if (method != "composite" && img.bitmap) {
          for (let i = 0; i < params.length; i++) {
            if (typeof params[i] == "object") {
              try {
                params[i] = await readBuffer(Buffer.from(params[i]));
              } catch (e) {}
            }
          }
        }
        if (method != "composite" && img[method]) {
          // If native method
          img = await img[method](...params); // Run method function on image
        } else {
          // If custom method or undefined method
          img = await customMethod(img, method, params, allowBackgrounds); // Attempt to run method function on image
        }
        resolve(img); // Resolve image
      } catch (e) {
        //console.log(e)
        reject(e);
      }
    });
  }
  function customMethod(img, method, params, allowBackgrounds) {
    return new Promise(async (resolve, reject) => {
      try {
        let newImg = img;
        if (method == "canvasScale") {
          // Crops canvas by factor of existing size
          // canvasScale params - [0: Scale factor]
          let x = Math.round(((1 - params[0]) * img.bitmap.width) / 2);
          let y = Math.round(((1 - params[0]) * img.bitmap.height) / 2);
          let w = Math.round(params[0] * img.bitmap.width);
          let h = Math.round(params[0] * img.bitmap.height);
          newImg = await img.crop(x, y, w, h);
          resolve(newImg); // Resolve image
        }
        if (method == "addBackground") {
          // Adds colour background
          if (img.bitmap) {
            let bgImg = await createNewImage(
              params[0],
              params[1],
              allowBackgrounds ? params[2] : "transparent"
            );
            newImg = await bgImg.composite(img, params[3], params[4]);
          } else {
            newImg = img
              .extent(
                params[0],
                params[1],
                `${params[3] < 0 ? "+" : "-"}${params[3]}${
                  params[4] < 0 ? "+" : "-"
                }${params[4]}`
              )
              .background(allowBackgrounds ? params[2] : "transparent");
          }
          resolve(newImg); // Resolve image
        }
        if (method == "jpeg") {
          // JPEG-ifies image (magick only)
          let newImg = gm(await gmToBuffer(img, true, "JPEG")).quality(...params);
          resolve(newImg);
        }
        if (method == "square") {
          // Crops image to square (jimp only)
          let size =
            img.bitmap.height >= img.bitmap.width
              ? img.bitmap.width
              : img.bitmap.height;
          let newImg = img.crop(
            size,
            size,
            img.bitmap.width / 2 - size / 2,
            img.bitmap.height / 2 - size / 2
          );
          resolve(newImg);
        }
        if (method == "composite") {
          if (img.bitmap) {
            newImg = sharp(await img.getBufferAsync(Jimp.AUTO)).composite([
              {
                input: Buffer.from(params[0]),
                top: params[2],
                left: params[1],
              },
            ]);
            let newImgJimp = readBuffer(await newImg.toBuffer());
            resolve(newImgJimp);
          } else {
            newImg = sharp(await gmToBuffer(img)).composite([
              {
                input: Buffer.from(params[0]),
                top: params[2],
                left: params[1],
              },
            ]);
            let newImgMagick = gm(await newImg.toBuffer());
            resolve(newImgMagick);
          }
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  return {
    exec,
    execGM,
    performMethod,
    customMethod,
  }
};