# GIF Image Processor
<a href="https://www.buymeacoffee.com/thelastoutpostworkshop" target="_blank">
    <img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee">
</a>

[<img src="https://github.com/thelastoutpostworkshop/images/blob/main/Curved%20Screen%202.png" width="300">](https://youtu.be/d49A0miFdqo)

## Installation
This is a nodejs web server application.<br>
Requirements:
- [Nodejs](https://nodejs.org/en)
- [FFmpeg](https://www.ffmpeg.org/)

Run this command to install the packages required by the application:
`npm install` 

## Running the GIF image processor
Run this command to launch the creation of GIF files based on an MP4 video.  This will create the GIF files and wait for the ESP32 requests:
`node gif_image_generator.js ..\movie\Mila_960x480.mp4`
> The MP4 video must have the same size as your screens layout.