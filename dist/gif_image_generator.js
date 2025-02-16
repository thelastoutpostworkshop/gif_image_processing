"use strict";const m=require("fastify")({logger:!1,connectionTimeout:1e3}),y=require("fluent-ffmpeg"),u=require("fs"),g=require("path"),p="output",w="screen_",P=24,N=8080,n={totalScreens:8,screensPerRow:4,screenWidth:240,screenHeight:240,screens:[{id:"84024946623796",screenDetails:[{num:0,x:0,y:0,rotation:0},{num:1,x:240,y:0,rotation:0}]},{id:"88204176352640",screenDetails:[{num:0,x:480,y:0,rotation:0},{num:1,x:720,y:0,rotation:0}]},{id:"207775839323444",screenDetails:[{num:0,x:480,y:240,rotation:0},{num:1,x:720,y:240,rotation:0}]},{id:"206947137185152",screenDetails:[{num:0,x:0,y:240,rotation:0},{num:1,x:240,y:240,rotation:0}]}]},[,,f]=process.argv;f||(console.log("Usage: node gif_image_generator.js <videoPath>"),process.exit(1));u.existsSync(f)||(console.log("Video file does not exist."),process.exit(1));const l=g.join(__dirname,p);u.existsSync(l)&&u.rmSync(l,{recursive:!0});u.mkdirSync(l);function D(){let e=0,t=0;n.screens.forEach(c=>{c.screenDetails.forEach(i=>{const a=i.x+n.screenWidth,d=i.y+n.screenHeight;e=Math.max(e,a),t=Math.max(t,d)})});const r=n.screensPerRow*n.screenWidth,s=n.totalScreens/n.screensPerRow*n.screenHeight;return e===r&&t===s?!0:(console.log(`Mismatch in layout resolution. Expected: ${r}x${s}, Found: ${e}x${t}`),!1)}async function E(){return new Promise((e,t)=>{y.ffprobe(f,async(r,o)=>{if(r){console.error("Error reading video metadata:",r),t(r);return}const s=o.streams[0].width,c=o.streams[0].height;if(s%n.screenWidth!==0||c%n.screenHeight!==0){console.error("Error: The video dimensions must be divisible by the screen dimensions."),t(new Error("Invalid video dimensions"));return}try{for(const i of n.screens)for(const a of i.screenDetails){const d=`screen_${i.id}_${a.num}.gif`,b=g.join(__dirname,p,d);await new Promise((S,v)=>{const h=[`crop=${n.screenWidth}:${n.screenHeight}:${a.x}:${a.y}`,`fps=${P}`];a.rotation&&h.push(`rotate=${a.rotation*Math.PI/180}:ow=iw:oh=ih`),y(f).videoFilters(h).outputOptions(["-pix_fmt","rgb24","-loop","0"]).output(b).on("end",()=>{console.log(`${d} has been saved.`),S()}).on("error",x=>{console.error(`An error occurred: ${x.message}`),v(x)}).run()})}e()}catch(i){t(i)}})})}function F(e){try{return u.readFileSync(e)}catch{console.error(`Gif part does not exist, verifiy screen arrangement on the ESP32 ${e}`),process.exit(1)}}function _(e,t){n.screens.find(s=>s.id===e)||(console.error(`Error: ESP id '${e}' not found in layout configuration.`),process.exit(1));const o=g.join(__dirname,p,w+e+`_${t}.gif`);return F(o)}function $(e){let t=e.headers["x-forwarded-for"]||e.socket.remoteAddress;return t.startsWith("::ffff:")&&(t=t.split("::ffff:")[1]),t}(async()=>(D()||process.exit(1),await E(),m.get("/api/gif/:espid/:screenNumber",(e,t)=>{try{const r=parseInt(e.params.screenNumber,10),o=e.params.espid;if(isNaN(r)){t.status(400).send("Screen number and frame number must be valid integers");return}const s=_(o,r),i=new Date().toISOString();console.log(`[${i}] Sending gif for screen #${r} to ESPID=${o} ip=${$(e)}`),t.send(s).then(()=>{console.log("sent")})}catch(r){console.error(r),t.status(500).send("Error retrieving gif data")}}),m.get("/api/framejpg/:espid/:screenNumber/:frameNumber",(e,t)=>{try{const r=parseInt(e.params.screenNumber,10),o=parseInt(e.params.frameNumber,10),s=e.params.espid;if(isNaN(r)||isNaN(o)){t.status(400).send("Screen number and frame number must be valid integers");return}const c=getFrameJPGData(s,r,o);console.log(`Sending frame #${o} for screen #${r} to ESPID=${s} ip=${$(e)}`),t.send(c)}catch(r){console.error(r),t.status(500).send("Error retrieving frame data")}}),m.listen({port:N,host:"192.168.1.90"},(e,t)=>{e?(fastify.log.error(e),process.exit(1)):console.log(`Image Server listening at ${t}`)})))();
