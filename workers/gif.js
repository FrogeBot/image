const { GifFrame, GifUtil, GifCodec } = require("gifwrap");
const { isMainThread, parentPort, Worker } = require("worker_threads");
var Jimp = require("jimp");

const os = require("os");
const cpuCount = os.cpus().length;
let concurrent = 0;
let framesProcessed = 0;
let frames = [];

let readBuffer, readURL

parentPort.once("message", async (msg) => {
  if (!isMainThread) {
    let { imgUrl, list, frameSkip, speed, jimp, options } = msg;
    if(Number.isNaN(options.maxGifSize)) options.maxGifSize = Infinity

    let frogeImage = require("../utils.js")(options);
    readBuffer = frogeImage.readBuffer;
    readURL = frogeImage.readURL;

    var gm = require("gm");
    if (options.imageMagick.toString() == "true") {
      gm = gm.subClass({ imageMagick: true });
    }
  
    try {
      const codec = new GifCodec();
      let gif = await codec.decodeGif(await readURL(imgUrl));
      async function cb() {
        codec
          .encodeGif(frames.filter((f) => f != undefined))
          .then((gif) => {
            parentPort.postMessage(gif.buffer);
            clearInterval(workerInterval);
          })
          .catch((e) => {
            console.log(e);
            parentPort.postMessage(null);
            clearInterval(workerInterval);
          });
      }
      framesProcessed = 0;
      for (let i = 0; i < gif.frames.length; i++) {
        if (i % frameSkip == 0) {
          if (
            gif.frames[i].disposalMethod != 2 &&
            frameSkip > 1 &&
            i >= frameSkip
          ) {
            let frameImg = await GifUtil.copyAsJimp(
              Jimp,
              gif.frames[i + 1 - frameSkip]
            );
            for (let j = 1; j <= frameSkip; j++) {
              let newFrameImg = await GifUtil.copyAsJimp(
                Jimp,
                gif.frames[i + j - frameSkip]
              );
              frameImg.composite(newFrameImg, 0, 0);
            }
            gif.frames[i].bitmap = frameImg.bitmap;
          }
          queueWorker(list, i, speed, gif.frames, frameSkip, jimp, options, cb);
        }
      }
    } catch (e) {
      console.log(e);
      parentPort.postMessage(null);
    }
  }
});

let workers = [];

async function queueWorker(list, i, speed, frameData, frameSkip, jimp, options, cb) {
  workers.push({ list, i, speed, frameData, frameSkip, jimp, options, cb });
}

async function workerQueuer() {
  if (concurrent < cpuCount && workers.length > 0) {
    let startConcurrent = concurrent;
    for (let i = 0; i < cpuCount - startConcurrent; i++) {
      if (workers.length == 0) return;
      let { list, i, speed, frameData, frameSkip, jimp, options, cb } = workers.shift();
      concurrent++;
      setImmediate(() => {
        spawnWorker(list, i, speed, frameData, frameSkip, jimp, options, cb);
      });
    }
  }
}
let workerInterval = setInterval(workerQueuer, 500);

async function spawnWorker(list, i, speed, frameData, frameSkip, jimp, options, cb) {
  let { width, height } = frameData[0].bitmap;
  let frame = await frameData[i];
  if (list == null) {
    let newImg = new Jimp(width, height, "transparent").composite(
      await GifUtil.copyAsJimp(Jimp, frame),
      frame.xOffset,
      frame.yOffset
    );
    if (newImg.bitmap.width > options.maxGifSize || newImg.bitmap.height > options.maxGifSize) {
      await newImg.scaleToFit(options.maxGifSize, options.maxGifSize);
    }
    let newFrame = new GifFrame(newImg.bitmap, {
      disposalMethod: frame.disposalMethod,
      delayCentisecs: Math.max(2, Math.round(frame.delayCentisecs / speed)),
      interlaced: frame.interlaced,
    });
    GifUtil.quantizeDekker(newFrame);
    frames[i] = newFrame;
    framesProcessed += frameSkip;
    if (framesProcessed >= frameData.length) cb();
    concurrent--;
  } else {
    let newImg = await new Jimp(width, height).composite(
      await GifUtil.copyAsJimp(Jimp, frame),
      frame.xOffset,
      frame.yOffset
    );
    if (newImg.bitmap.width > options.maxGifSize || newImg.bitmap.height > options.maxGifSize) {
      await newImg.scaleToFit(options.maxGifSize, options.maxGifSize);
    }
    let worker = new Worker(
      __dirname + `/${jimp ? "jimp" : "magick"}.js`
    );
    worker.postMessage({
      buffer: await newImg.getBufferAsync(Jimp.AUTO),
      list,
      allowBackgrounds: i == 0 || frameData[i].disposalMethod == 2,
      options,
    });

    worker.on("message", async (img) => {
      if (img == null) return;
      let newImg = await readBuffer(Buffer.from(img));
      let newFrame = new GifFrame(newImg.bitmap, {
        disposalMethod: frame.disposalMethod,
        delayCentisecs: Math.max(2, Math.round(frame.delayCentisecs / speed)),
        interlaced: frame.interlaced,
      });

      GifUtil.quantizeDekker(newFrame);
      frames[i] = newFrame;
      framesProcessed += frameSkip;
      if (framesProcessed >= frameData.length) cb();
      concurrent--;
    });
  }
}
