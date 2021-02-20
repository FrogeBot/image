# @frogebot/image
Image processing module, designed for FrogeBot

----

## Installation
Using GraphicsMagick:
```js
let frogeImage = require("@frogebot/image")();
```
Using ImageMagick:
```js
let frogeImage = require("@frogebot/image")(true);
```

## Manipulating images
The `exec` and `execGM` functions return image buffers.
```js
// Using Jimp
await frogeImage.exec(imageUrl, list)

// Using GraphicsMagick / ImageMagick
await frogeImage.execGM(imageUrl, list)
```
#### Custom Methods
These functions can access any methods in their respective libraries and also certain custom methods.
addBackground: Adds a coloured background and applies size change and image offset.
jpeg: JPEG-ifies image (GraphicsMagick/ImageMagick only)
square: Crops image to square (jimp only)
composite: Uses sharp for compositing images, works both in Jimp and GraphicsMagick/ImageMagick 

Example implementation
```js
let imageUrl = https://github.com/FrogeBot/frogeBot/blob/master/assets/icon.png?raw=true
let list = [
  ["explode", [1.5]],
  ["jpeg", [10]]
]
fs.write("out.png", await frogeImage.execGM(imageUrl, list), (err) => {
  if (err) console.log(err)
  else console.log("Wrote to out.png")
})
```

## Other functions
```js
performMethod, customMethod // Exposes the functions used by exec and execGM to for individual methods on image data.
readURL // Reads a URL and returns a parsed gm image.
jimpReadURL // Reads a URL and returns a parsed jimp image.
readBuffer // Reads an image buffer and returns a parsed jimp image.
measureText // Measure text using jimp text.
measureTextHeight // Measure text height using jimp text.
gmToBuffer // Promisified gm.toBuffer() using url in.
getFormat // Promisified gm.format() using url in.
loadFont // Load and resolve font using jimp text.
```
