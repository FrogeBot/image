const { GifFrame, GifUtil, GifCodec } = require("gifwrap");
const { isMainThread, parentPort } = require("worker_threads");

let readBuffer, readURL

function toArrayBuffer(buf) {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
  }
  return ab;
}

const { GPU } = require('gpu.js');
const { createCanvas } = require('canvas')
const { kernelFunc, doGPUExecution } = require("./gpu.js");
        
const canvas = createCanvas(512,512)
const gpu = new GPU({ canvas });
const render = gpu.createKernel(kernelFunc)

render
.setGraphical(true)
.setDynamicArguments(true)
.setPipeline(true)

const { methodList } = require("./gpu.js");
let framesProcessed = 0;
let frames = [];
parentPort.once("message", async (msg) => {
  if (!isMainThread) {
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
      if (msg.imgUrl) {
        img = await readURL(msg.imgUrl);
      } else if (msg.buffer) {
        img = await readBuffer(Buffer.from(msg.buffer));
      }

      let gif = await codec.decodeGif(img);
      if(options.maxGifFrames && gif.frames.length > options.maxGifFrames) {
        parentPort.postMessage({ error: `Too many GIF frames. Max: ${options.maxGifFrames}` });
        process.exit(1);
      }
      async function cb() {
        // console.log(framesProcessed) // putting this here fixes the problem with only the first frame of a gif rendering
        if(framesProcessed < gif.frames.length) return
        codec
          .encodeGif(frames.filter((f) => f != undefined))
          .then((gif) => {
            parentPort.postMessage(gif.buffer);
            process.exit(0);
          })
          .catch((e) => {
            parentPort.postMessage(null);
            process.exit(1);
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
      parentPort.postMessage(null);
      process.exit(1);
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
  i = i; // this for some reason makes the check on the following line function correctly more often
  // note: thanks v8
  if (framesProcessed >= frameData.length) cb();
}