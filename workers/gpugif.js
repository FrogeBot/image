const { GifFrame, GifUtil, GifCodec } = require("gifwrap");
const cluster = require("cluster");

let readBuffer, readURL

const { doGPUExecution } = require("../gpuUtil.js");
        

let framesProcessed = 0;
let frames = [];
process.once("message", async (msg) => {
  if(cluster.isWorker) {
    var Jimp = require("jimp");
    let { imgUrl, list, frameSkip, speed, lib, options } = msg;
    if(!options) {
      options = {
        imageMagick: false,
        maxImageSize: 2048,
        maxGifSize: 1024,
      }
    }
    
    if(Number.isNaN(options.maxGifSize)) options.maxGifSize = Infinity

    let frogeImage = require("../utils.js")(options);
    readBuffer = frogeImage.readBuffer;
    readURL = frogeImage.readURL;
  
    try {
      const codec = new GifCodec();

      let img;
      if (imgUrl) {
        img = await readURL(imgUrl);
      } else if (msg.buffer) {
        img = await readBuffer(Buffer.from(msg.buffer));
      }

      let gif = await codec.decodeGif(img);
      if(options.maxGifFrames && gif.frames.length > options.maxGifFrames) {
        return process.send({ error: `Too many GIF frames. Max: ${options.maxGifFrames}` })
      }
      async function cb() {
        if(framesProcessed < gif.frames.length) return
        codec
          .encodeGif(frames.filter((f) => f != undefined))
          .then((gif) => {
            process.send(gif.buffer)
          })
          .catch((e) => {
            process.send(null)
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
          await renderFrame(list, i, speed, gif.frames, frameSkip, lib, options, cb);
        }
      }
    } catch (e) {
      console.log(e)
      process.send(null)
    }
  }
});

async function renderFrame(list, i, speed, frameData, frameSkip, lib, options, cb) {
  let frame = await frameData[i];
  let newFrameData = await doGPUExecution(frame, list);
  framesProcessed += frameSkip;
  let newFrame = new GifFrame(newFrameData, {
    disposalMethod: frame.disposalMethod,
    delayCentisecs: Math.max(2, Math.round(frame.delayCentisecs / speed)),
    interlaced: frame.interlaced,
  });
  GifUtil.quantizeDekker(newFrame);
  frames[i] = newFrame;
  if (framesProcessed >= frameData.length) cb();
}