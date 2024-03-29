let options = {
  imageMagick: false,
  maxImageSize: 2048,
  maxGifSize: 1024,
}

// Exports
module.exports = function(opts) {
  Object.assign(options, opts)

  var Jimp = require("jimp");
  // var sharp = require("sharp");
  var gm = require("gm");
  if (options.imageMagick.toString() == "true") {
    gm = gm.subClass({ imageMagick: true });
  }

  const { Worker } = require("worker_threads");

  const { gmToBuffer, getFormat, readBuffer, readURL } = require("./utils.js")(options);

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

  const Queue = require("./queue.js");
  const cpuQueue = new Queue();
  async function exec(imgUrl, list, interaction) {
    return cpuQueue.enqueue(() => runJimpOperation(imgUrl, list), (index, size) => {
      if(index == 0) {
        interaction.editReply({
          content: process.env.MSG_PROCESSING,
          embeds: [],
        });
      } else {
        interaction.editReply({
          content: process.env.MSG_WAITING,
          embeds: [{
            title: "Waiting in the queue...",
            description: `<@${interaction.member.id}> - ${process.env.MSG_IN_QUEUE} ${index}/${size}`,
            color: Number(process.env.EMBED_COLOUR),
            timestamp: new Date(),
            author: {
              name: process.env.BOT_NAME,
              icon_url: interaction.client.user.displayAvatarURL(),
            },
          }],
        });
      }
    });
  }

  async function execGM(imgUrl, list, interaction) {
    return cpuQueue.enqueue(() => runMagickOperation(imgUrl, list), (index, size) => {
      if(index == 0) {
        interaction.editReply({
          content: process.env.MSG_PROCESSING,
          embeds: [],
        });
      } else {
        interaction.editReply({
          content: process.env.MSG_WAITING,
          embeds: [{
            title: "Waiting in the queue...",
            description: `<@${interaction.member.id}> - ${process.env.MSG_IN_QUEUE} ${index}/${size}`,
            color: Number(process.env.EMBED_COLOUR),
            timestamp: new Date(),
            author: {
              name: process.env.BOT_NAME,
              icon_url: interaction.client.user.displayAvatarURL(),
            },
          }],
        });
      }
    });
  }

  function runJimpOperation(imgUrl, list) {
    return new Promise(async (resolve, reject) => {
      if ((await getFormat(imgUrl)) == "GIF") {
        try {
          let worker = new Worker(__dirname + "/workers/gif.js");
          worker.postMessage({
            imgUrl,
            list,
            frameSkip: 1,
            speed: 1,
            lib: 'jimp',
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

  function runMagickOperation(imgUrl, list) {
    return new Promise(async (resolve, reject) => {
      if ((await getFormat(imgUrl)) == "GIF") {
        try {
          let worker = new Worker(__dirname + "/workers/gif.js");
          worker.postMessage({
            imgUrl,
            list,
            frameSkip: 1,
            speed: 1,
            lib: 'magick',
            options,
          });

          worker.on("message", async (img) => {
            worker.terminate();
            if (img == null) reject("Null image");
            else resolve(Buffer.from(img));
          });
        } catch (e) {
          //console.log(e)
          reject(e);
        }
      } else {
        let worker = new Worker(__dirname + "/workers/magick.js");
        worker.postMessage({ imgUrl, list, allowBackgrounds: true, options });

        worker.on("message", (img) => {
          worker.terminate();
          if (img == null) reject("Null image");
          else resolve(Buffer.from(img));
        });
      }
    });
  }

  const gpuQueue = new Queue();
  async function execGPU(imgUrl, list, interaction) {
    return gpuQueue.enqueue(() => runGpuOperation(imgUrl, list), (index, size) => {
      if(index == 0) {
        interaction.editReply({
          content: process.env.MSG_PROCESSING,
          embeds: [],
        });
      } else {
        interaction.editReply({
          content: process.env.MSG_WAITING,
          embeds: [{
            title: "Waiting in the queue...",
            description: `<@${interaction.member.id}> - ${process.env.MSG_IN_QUEUE} ${index}/${size}`,
            color: Number(process.env.EMBED_COLOUR),
            timestamp: new Date(),
            author: {
              name: process.env.BOT_NAME,
              icon_url: interaction.client.user.displayAvatarURL(),
            },
          }],
        });
      }
    });
  }

  const cluster = require("cluster");

  function runGpuOperation(imgUrl, list) {
    return new Promise(async (resolve, reject) => {
      if ((await getFormat(imgUrl)) == "GIF") {
        try {
          let imgBuffer = await readURL(imgUrl)
          cluster.setupPrimary({
            exec: __dirname + "/workers/gpugif.js",
            args: [],
            silent: false
          });
          let worker = cluster.fork();
          worker.send({
            imgUrl,
            list,
            frameSkip: 1,
            speed: 1,
            lib: 'gpu',
            options,
          });

          worker.on("message", async (img) => {
            worker.kill();
            if (img == null) return reject("Null image");
            if (typeof img === "object" && img.error) return reject(img.error);
            if(imgBuffer.length/2 > img.length) reject("GIF failed to render. Try again later")
            resolve(Buffer.from(img));
          });
          worker.on("error", err => {
            console.log(err)
            worker.kill();
            reject("Process error")
          })
          worker.on("exit", () => {
            reject("Process exited unexpectedly")
          })
        } catch (e) {
          //console.log(e)
          reject(e);
        }
      } else {
        cluster.setupPrimary({
          exec: __dirname + "/workers/gpu.js",
          args: [],
          silent: false
        });
        let worker = cluster.fork();
        worker.send({ imgUrl, list, allowBackgrounds: true, options });

        worker.on("message", (img) => {
          worker.kill();
          if (img == null) return reject("Null image");
          if (typeof img === "object" && img.error) return reject(img.error);
          else resolve(Buffer.from(img));
        });
        worker.on("error", err => {
          console.log(err)
          worker.kill();
          reject("Process error")
        })
        worker.on("exit", () => {
          reject("Process exited unexpectedly")
        })
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
        // console.log(params)
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
        // if (method == "composite") {
        //   if (img.bitmap) {
        //     newImg = sharp(await img.getBufferAsync(Jimp.AUTO)).composite([
        //       {
        //         input: Buffer.from(params[0]),
        //         top: params[2],
        //         left: params[1],
        //       },
        //     ]);
        //     let newImgJimp = readBuffer(await newImg.toBuffer());
        //     resolve(newImgJimp);
        //   } else {
        //     newImg = sharp(await gmToBuffer(img)).composite([
        //       {
        //         input: Buffer.from(params[0]),
        //         top: params[2],
        //         left: params[1],
        //       },
        //     ]);
        //     let newImgMagick = gm(await newImg.toBuffer());
        //     resolve(newImgMagick);
        //   }
        // }
        if (method == "composite") {
          if (img.bitmap) {
            img.composite( await readBuffer(Buffer.from(params[0])), params[1], params[2])
            resolve(img);
          } else {
            let newImg = await Jimp.read(await gmToBuffer(img))
            newImg.composite( await Jimp.read(Buffer.from(params[0])), params[1], params[2])
            let newImgMagick = gm(await newImg.getBufferAsync(Jimp.AUTO));
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
    execGPU,
    performMethod,
    customMethod,
  }
};