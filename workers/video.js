const { isMainThread, parentPort } = require("worker_threads");
var Jimp = require("jimp");
var fs = require("fs");
const cluster = require("cluster");

const os = require("os");
const getFramerate = require("../video/framerate.js");
const cpuCount = os.cpus().length;
let concurrent = 0;
let framesProcessed = 0;
let frames = [];

let readBuffer, readURL

parentPort.once("message", async (msg) => {
  if (!isMainThread) {
    let { vidUrl, list, frameSkip, speed, lib, options } = msg;
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

    var gm = require("gm");
    if (options.imageMagick.toString() == "true") {
      gm = gm.subClass({ imageMagick: true });
    }
  
    const readVideo = require('../video/toFrames.js')

    try {
      let framerate = await getFramerate(vidUrl);
      let frameData = await readVideo(vidUrl)
      if(options.maxGifFrames && frameData.length > options.maxGifFrames) {
        parentPort.postMessage({ error: `Too many frames. Max: ${options.maxGifFrames}` });
        process.exit(1);
      }
      async function cb() {
        let startTime = Date.now();
        fs.mkdirSync(__dirname+`/tmp/${startTime}`, { recursive: true });
        let frameIdx = 0;
        for (let i = 0; i < frames.length; i++) {
          if(frames[i] != undefined) {
            fs.writeFileSync(__dirname+`/tmp/${startTime}/${frameIdx}.jpg`, frames[i])
            frameIdx++
          }
        }
        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg(vidUrl).output(__dirname+`/tmp/${startTime}/audio.mp3`)
        .noVideo()
        .format('mp3')
        .outputOptions('-ab','192k')
        .on('end', function(stdout, stderr) {
          ffmpeg()
          .addInput(__dirname+`/tmp/${startTime}/%d.jpg`)
          .addInput(__dirname+`/tmp/${startTime}/audio.mp3`)
          .output(__dirname+`/tmp/${startTime}/video.mp4`)
          .outputFPS(framerate)
          .videoFilters(`fps=${framerate},format=yuv420p`)
          .on('end', function(stdout, stderr) {
            fs.readFile(__dirname+`/tmp/${startTime}/video.mp4`, function (err, data) {
              if (err) throw err;
              parentPort.postMessage(data);
              fs.unlinkSync(__dirname+`/tmp/${startTime}`)
              process.exit(0);
            });
          })
          .run();
        })
        .run();
      }
      framesProcessed = 0;
      for (let i = 0; i < frameData.length; i++) {
        if (i % frameSkip == 0) {
          queueWorker(list, i, speed, frameData, frameSkip, lib, options, cb);
        }
      }
    } catch(e) {
      console.log(e);
      parentPort.postMessage({ error: e });
      process.exit(1);
    }
  }
})

let workers = [];

async function queueWorker(list, i, speed, frameData, frameSkip, lib, options, cb) {
  workers.push({ list, i, speed, frameData, frameSkip, lib, options, cb });
}

async function workerQueuer() {
  if (concurrent < cpuCount && workers.length > 0) {
    let startConcurrent = concurrent;
    for (let i = 0; i < cpuCount - startConcurrent; i++) {
      if (workers.length == 0) return;
      let { list, i, speed, frameData, frameSkip, lib, options, cb } = workers.shift();
      concurrent++;
      setImmediate(() => {
        spawnWorker(list, i, speed, frameData, frameSkip, lib, options, cb);
      });
    }
  }
}
let workerInterval = setInterval(workerQueuer, 500);

async function spawnWorker(list, i, speed, frameData, frameSkip, lib, options, cb) {
  let frame = await readBuffer(frameData[i])
  if (list == null) {
    if (frame.bitmap.width > options.maxGifSize || frame.bitmap.height > options.maxGifSize) {
      await frame.scaleToFit(options.maxGifSize, options.maxGifSize);
    }
    frames[i] = frame;
    if (framesProcessed >= frameData.length) cb();
    concurrent--;
  } else {
    if (frame.bitmap.width > options.maxGifSize || frame.bitmap.height > options.maxGifSize) {
      await frame.scaleToFit(options.maxGifSize, options.maxGifSize);
    }

    let buffer = await frame.getBufferAsync(Jimp.AUTO)
    let worker
    if(lib == 'gpu') {
      cluster.setupPrimary({
        exec: __dirname + `/${lib}.js`,
        args: [],
        silent: false
      });
      worker = cluster.fork();
      worker.send({
        buffer,
        list,
        allowBackgrounds: true,
        options,
      });
    } else {
      worker = new Worker(
        __dirname + `/${lib}.js`
      );
      worker.postMessage({
        buffer,
        list,
        allowBackgrounds: true,
        options,
      });
    }

    worker.on("message", async (img) => {
      if (img == null) return;
      let newFrame = Buffer.from(img);

      frames[i] = newFrame;
      framesProcessed += frameSkip;
      if (framesProcessed >= frameData.length) cb();
      concurrent--;
    });
  }
}
