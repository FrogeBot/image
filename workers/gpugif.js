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

const { methodList } = require("./gpu.js");
let render
let framesProcessed = 0;
let frames = [];
parentPort.once("message", async (msg) => {
  if (!isMainThread) {
    var Jimp = require("jimp");
    const { GPU } = require('gpu.js');
    const { kernelFunc } = require("./gpu.js");
    const gpu = new GPU();
    render = gpu.createKernel(kernelFunc)
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
      let gif = await codec.decodeGif(await readURL(imgUrl));
      async function cb() {
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
      parentPort.postMessage(null);
      process.exit(1);
    }
  }
});

async function renderFrame(list, i, speed, frameData, frameSkip, lib, options, cb) {
  let frame = await frameData[i];
  render
  .setConstants({ w: frame.bitmap.width, h: frame.bitmap.height })
  .setGraphical(true)
  .setDynamicOutput(true)
  .setOutput([frame.bitmap.width, frame.bitmap.height]);

  for (let j = 0; j < list.length; j++) {
    // Loop through actions in list
    await render(
      new Uint8ClampedArray(toArrayBuffer(frame.bitmap.data)),
      methodList.indexOf(list[j][0]),
      list[j][1].length > 0 ? list[j][1] : [0]
    ); // Perform each in succecssion
  }
  let newFrame = new GifFrame({
    width: frame.bitmap.width,
    height: frame.bitmap.height,
    data: Buffer.from(render.getPixels())
  }, {
    disposalMethod: frame.disposalMethod,
    delayCentisecs: Math.max(2, Math.round(frame.delayCentisecs / speed)),
    interlaced: frame.interlaced,
  });
  GifUtil.quantizeDekker(newFrame);
  frames[i] = newFrame;
  framesProcessed += frameSkip;
  if (framesProcessed >= frameData.length) cb();
}