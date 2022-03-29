const { isMainThread, parentPort } = require("worker_threads");

const { GPU } = require('gpu.js');
const gpu = new GPU();
const render = gpu.createKernel(function(bitmap, width, height, method, data, allowBackgrounds) {
  let r = bitmap[( this.thread.y * width + this.thread.x ) * 4];
  let g = bitmap[( this.thread.y * width + this.thread.x ) * 4 + 1];
  let b = bitmap[( this.thread.y * width + this.thread.x ) * 4 + 2];
  let a = bitmap[( this.thread.y * width + this.thread.x ) * 4 + 3];
  switch (method) {
    case "invert": 
      r = 255 - r; 
      g = 255 - g; 
      b = 255 - b;
      break;
  }
  console.log(r, g, b, a)
  this.color(r, g, b, a);
})

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
      let { jimpReadURL } = require("../utils.js")(msg.options);

      let list = msg.list;
      if (msg.imgUrl) {
        let imgUrl = msg.imgUrl;
        let img = await jimpReadURL(imgUrl);
        
        render.setOutput([img.bitmap.width, img.bitmap.height]).setGraphical(true);
      
        console.log(img.bitmap.data)
        for (let i = 0; i < list.length; i++) {
          // Loop through actions in list
          await render(
            img.bitmap.data,
            img.bitmap.width,
            img.bitmap.height,
            list[i][0],
            list[i][1],
            msg.allowBackgrounds
          ); // Perform each in succecssion
        }
        console.log(render.getPixels())
        img.bitmap.data = Buffer.from(render.getPixels());
        img.quality(60);
        img.format({ bufferStream: true }, function (err, format) {
          this.toBuffer(format, function (err, buffer) {
            if (!err) {
              parentPort.postMessage(buffer); // Resolve image
            } else console.log(err);
          });
        });
      } else if (msg.buffer) {
        let buffer = Buffer.from(msg.buffer);
        // Get image from buffer
        let img = await gm(buffer);
        for (let i = 0; i < list.length; i++) {
          // Loop through actions in list
          img = await performMethod(
            img,
            list[i][0],
            list[i][1],
            msg.allowBackgrounds
          ); // Perform each in succecssion
        }
        img.quality(60);
        img.format({ bufferStream: true }, function (err, format) {
          this.toBuffer(format, function (err, buffer) {
            if (!err) {
              parentPort.postMessage(buffer); // Resolve image
            } else console.log(err);
          });
        });
      }

    } catch (e) {
      console.log(e);
      parentPort.postMessage(null);
    }
  }
});
