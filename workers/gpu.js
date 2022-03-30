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

const methodList = [
  'invert',
  'greyscale',
  'sepia'
]

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
        const render = gpu.createKernel(function(bitmap, method, data) {
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
          }
          this.color(r/256, g/256, b/256, a/256);
        })
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
        }
        img.bitmap.data = Buffer.from(render.getPixels())
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
        }
        img.bitmap.data = Buffer.from(render.getPixels())
        parentPort.postMessage(await img.getBufferAsync(Jimp.AUTO)); // Resolve image
      }

    } catch (e) {
      console.log(e);
      parentPort.postMessage(null);
    }
  }
});

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
  }
  this.color(r/256, g/256, b/256, a/256);
}

module.exports = {
  kernelFunc,
  methodList
}