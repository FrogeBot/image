const { isMainThread, parentPort } = require("worker_threads");

const { GPU } = require('gpu.js');

function toArrayBuffer(buf) {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
  }
  return ab;
}

parentPort.once("message", async (msg) => {
  if(!msg.options) {
    msg.options = {
      imageMagick: false,
      maxImageSize: 2048,
      maxGifSize: 1024,
    }
  }
  
  if (!isMainThread) {
    try {
      var Jimp = require("jimp");
      let { jimpReadURL } = require("../utils.js")(msg.options);

      let list = msg.list;
      if (msg.imgUrl) {
        let imgUrl = msg.imgUrl;
        let img = await jimpReadURL(imgUrl);
        
        const gpu = new GPU();
        const render = gpu.createKernel(kernelFunc)
        .setConstants({ w: img.bitmap.width, h: img.bitmap.height })
        .setGraphical(true)
        .setDynamicArguments(true)
        .setOutput([img.bitmap.width, img.bitmap.height]);
      
        for (let i = 0; i < list.length; i++) {
          // Loop through actions in list
          await render(
            new Uint8ClampedArray(toArrayBuffer(img.bitmap.data)),
            methodList.indexOf(list[i][0]),
            list[i][1].length > 0 ? list[i][1] : [0]
          ); // Perform each in succecssion
          img.bitmap.data = Buffer.from(render.getPixels())
        }
        parentPort.postMessage(await img.getBufferAsync(Jimp.AUTO)); // Resolve image
      } else if (msg.buffer) {
        let img = Buffer.from(msg.buffer);
        const gpu = new GPU();
        const render = gpu.createKernel(kernelFunc)
        .setConstants({ w: img.bitmap.width, h: img.bitmap.height })
        .setGraphical(true)
        .setDynamicArguments(true)
        .setOutput([img.bitmap.width, img.bitmap.height]);
      
        for (let i = 0; i < list.length; i++) {
          // Loop through actions in list
          await render(
            new Uint8ClampedArray(toArrayBuffer(img.bitmap.data)),
            methodList.indexOf(list[i][0]),
            list[i][1].length > 0 ? list[i][1] : [0]
          ); // Perform each in succecssion
          img.bitmap.data = Buffer.from(render.getPixels())
        }
        parentPort.postMessage(await img.getBufferAsync(Jimp.AUTO)); // Resolve image
        process.exit(0);
      }

    } catch (e) {
      parentPort.postMessage(null);
      process.exit(1);
    }
  }
});

const methodList = [
  'invert',
  'greyscale',
  'sepia',
  'flip',
  'flop',
  'pixelate',
  'posterize'
]

function kernelFunc(bitmap, method, data) {
  var x = this.thread.x,
      y = this.thread.y;
  let n = 4 * ( x + this.constants.w * (this.constants.h - y) );
  let r = bitmap[n]
  let g = bitmap[n + 1]
  let b = bitmap[n + 2]
  let a = bitmap[n + 3]
  switch(method) {
    case 0: // invert
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    case 1: // greyscale
      let avg = (r+g+b)/3;
      r = avg;
      g = avg
      b = avg
    case 2: // sepia
      r = (r * .393) + (g *.769) + (b * .189)
      g = (r * .349) + (g *.686) + (b * .168)
      b = (r * .272) + (g *.534) + (b * .131)
    case 3: // flip
      n = 4 * ( x + this.constants.w * y );
      r = bitmap[n]
      g = bitmap[n + 1]
      b = bitmap[n + 2]
      a = bitmap[n + 3]
    case 4: // flop
      n = 4 * ( this.constants.w - x + this.constants.w * (this.constants.h - y) );
      r = bitmap[n]
      g = bitmap[n + 1]
      b = bitmap[n + 2]
      a = bitmap[n + 3]
    case 5: // pixelate
      x = Math.round(Math.round(x / data[0]) * data[0] - data[0]/2)
      x = Math.max(0, Math.min(x, this.constants.w-1))
      y = Math.round(Math.round(y / data[0]) * data[0] - data[0]/2)
      y = Math.max(0, Math.min(y, this.constants.h-1))
      n = 4 * ( x + this.constants.w * (this.constants.h - y) );
      r = bitmap[n]
      g = bitmap[n + 1]
      b = bitmap[n + 2]
      a = bitmap[n + 3]
    case 6: // posterize
    r = Math.round( r / 255 * data[0] ) * 255 / data[0]
    g = Math.round( g / 255 * data[0] ) * 255 / data[0]
    b = Math.round( b / 255 * data[0] ) * 255 / data[0]
  }
  this.color(r/255, g/255, b/255, a/255);
}

module.exports = {
  kernelFunc,
  methodList
}