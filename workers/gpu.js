const cluster = require("cluster");

const { doGPUExecution } = require("../gpuUtil.js");

process.once("message", async (msg) => {
  if(!msg.options) {
    msg.options = {
      imageMagick: false,
      maxImageSize: 2048,
      maxGifSize: 1024,
    }
  }
  
  if(cluster.isWorker) {
    try {
      var Jimp = require("jimp");
      let { jimpReadURL, readBuffer } = require("../utils.js")(msg.options);

      let list = msg.list;
      let img;
      if (msg.imgUrl) {
        img = await jimpReadURL(msg.imgUrl);
      } else if (msg.buffer) {
        img = await readBuffer(Buffer.from(msg.buffer));
      }

      img = await doGPUExecution(img, list);
      
      process.send(await img.getBufferAsync(Jimp.AUTO)); // Resolve image
    } catch (e) {
      console.log(e)
      process.send(null);
    }
  }
});
