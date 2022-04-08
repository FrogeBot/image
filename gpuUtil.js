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

const canvas = createCanvas(512,512)
const gpu = new GPU({ canvas, mode: process.env.NATIVE_MODE || 'gpu' });
const render = gpu.createKernel(kernelFunc)

render
.setGraphical(true)
.setDynamicArguments(true)
.setDynamicOutput(true)
.setPipeline(true)

async function doGPUExecution(img, list) {
  render
  .setConstants({ w: img.bitmap.width, h: img.bitmap.height })
  .setOutput([img.bitmap.width, img.bitmap.height]);

  for (let i = 0; i < list.length; i++) {
    // Convert data formats
    if(list[i][0] == 'composite') {
      // Composite: Jimp to Uint8ClampedArray
      console.log(list[i][1][0]) // why did this fix a crash?
      if(list[i][1][0].data) {
        if(list[i][1][0].data.type == 'Buffer') list[i][2] = new Uint8ClampedArray(list[i][1][0].data.data);
        else list[i][2] = new Uint8ClampedArray(toArrayBuffer(list[i][1][0].data));
      }
      list[i][1] = [list[i][1][1], list[i][1][2], list[i][1][0].width, list[i][1][0].height];
    }

    // Loop through actions in list
    await render(
      new Uint8ClampedArray(toArrayBuffer(img.bitmap.data)),
      methodList.indexOf(list[i][0]),
      list[i][1].length > 0 ? list[i][1] : [0],
      (list[i][2] && list[i][2].length) > 0 ? list[i][2] : [0]
    ); // Perform each in succecssion
    img.bitmap.data = Buffer.from(render.getPixels())
  }
  return img
}

const methodList = [
  'invert',
  'greyscale',
  'sepia',
  'flip',
  'flop',
  'pixelate',
  'posterize',
  'blur',
  'composite'
]

function kernelFunc(bitmap, method, data, data2) {
  var x = this.thread.x,
      y = this.thread.y;
  let n = 4 * ( x + this.constants.w * (this.constants.h - y) );
  let r = bitmap[n]     / 255
  let g = bitmap[n + 1] / 255
  let b = bitmap[n + 2] / 255
  let a = bitmap[n + 3] / 255
  switch(method) {
    case 0: // invert
      r = 1 - r;
      g = 1 - g;
      b = 1 - b;
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
      r = bitmap[n]     / 255
      g = bitmap[n + 1] / 255
      b = bitmap[n + 2] / 255
      a = bitmap[n + 3] / 255
    case 4: // flop
      n = 4 * ( this.constants.w - x + this.constants.w * (this.constants.h - y) );
      r = bitmap[n]     / 255
      g = bitmap[n + 1] / 255
      b = bitmap[n + 2] / 255
      a = bitmap[n + 3] / 255
    case 5: // pixelate
      x = Math.round(Math.round(x / data[0]) * data[0] - data[0]/2)
      x = Math.max(0, Math.min(x, this.constants.w-1))
      y = Math.round(Math.round(y / data[0]) * data[0] - data[0]/2)
      y = Math.max(0, Math.min(y, this.constants.h-1))
      n = 4 * ( x + this.constants.w * (this.constants.h - y) );
      r = bitmap[n]     / 255
      g = bitmap[n + 1] / 255
      b = bitmap[n + 2] / 255
      a = bitmap[n + 3] / 255
    case 6: // posterize
      r = Math.round( r * data[0] ) / data[0]
      g = Math.round( g * data[0] ) / data[0]
      b = Math.round( b * data[0] ) / data[0]
    case 7: // blur (box blur not gaussian, i am lazy)
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0
      for(let dx = -data[0]; dx < data[0]; dx++) {
        for(let dy = -data[0]; dy < data[0]; dy++) {
          let newX = Math.abs(x + dx)
          let newY = Math.abs(y + dy)
          if(newX >= this.constants.w) newX = (this.constants.w - 1) * 2 - newX
          if(newY >= this.constants.h) newY = (this.constants.h - 1) * 2 - newY
          n = 4 * ( newX + this.constants.w * (this.constants.h - newY ) );
          rSum += bitmap[n]     / 255
          gSum += bitmap[n + 1] / 255
          bSum += bitmap[n + 2] / 255
          aSum += bitmap[n + 3] / 255
        }
      }
      let pixelCount = (2*data[0] + 1) ** 2
      r = rSum / pixelCount
      g = gSum / pixelCount
      b = bSum / pixelCount
      a = aSum / pixelCount
    case 8: // composite
      let xC = x - data[0]
      let yC = y + data[1] - (this.constants.h - data[3])
      if(xC >= 0 && xC < data[2]) {
        if(yC >= 0 && yC < data[3]) {
          let nC = 4 * ( xC + data[2] * (data[3] - yC) )
          let rC = data2[nC]     / 255
          let gC = data2[nC + 1] / 255
          let bC = data2[nC + 2] / 255
          let aC = data2[nC + 3] / 255

          let aO = aC + a * (1 - aC)
          r = ( rC * aC + r * a * (1 - aC) ) / aO
          g = ( gC * aC + g * a * (1 - aC) ) / aO
          b = ( bC * aC + b * a * (1 - aC) ) / aO
          a = aO
        }
      }
  }
  this.color(r, g, b, a);
}

module.exports = {
  kernelFunc,
  doGPUExecution,
  methodList
}