const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfprobePath(ffprobePath);

const getFramerate =async(path)=>{
    return new Promise((resolve , reject)=>{
        ffmpeg.ffprobe(path,(err,data)=>{
            if (!err){
                let i = 0
                while(true){
                    
                    if(data.streams[i].r_frame_rate && data.streams[i].r_frame_rate != '0/0'){
                        break;
                    }
                    i++
                }
                let frSplit = data.streams[i].r_frame_rate.split('/')
                let framerate = frSplit[0]/frSplit[1]
                resolve(framerate)
            }
            else {
                reject(err)
            }
        })
    })
}
  
module.exports = getFramerate