/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import * as posenet from '@tensorflow-models/posenet';
import p5 from 'p5';
import dat from 'dat.gui';
import Stats from 'stats.js';
import {drawBoundingBox, drawKeypoints, drawSkeleton} from './demo_util';

const videoWidth = 600;
const videoHeight = 500;
const stats = new Stats();
var img;
var textArray = ("We're changing the world of work, so you have a better chance of changing the world.").split('');
var posX = 0;
var posY = 0;

let div = $("#myCanvas");
for (var i = 0; i < textArray.length; i++) {
  let ww = document.createElement('span');
  ww.textContent = textArray[i];
  let id = 'txt' + i;
  ww.setAttribute('id', id);
  ww.style.fontFamily = "Taub_Kerning";
  ww.style.fontSize = "69px";
  // ww.style.backgroundColor = "red";
  // ww.style.borderStyle = "solid";
  ww.style.color = '#EFDFD1';
  ww.style.fontVariationSettings = " 'wght' " + 0;
  $("#textDiv").append(ww);
}



function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isiOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isMobile() {
  return isAndroid() || isiOS();
}

/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const video = document.getElementById('video');
  video.width = videoWidth;
  video.height = videoHeight;

  const mobile = isMobile();
  const stream = await navigator.mediaDevices.getUserMedia({
    'audio': false,
    'video': {
      facingMode: 'user',
      width: mobile ? undefined : videoWidth,
      height: mobile ? undefined : videoHeight,
    },
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();

  return video;
}

const guiState = {
  algorithm: 'single-pose',
  input: {
    mobileNetArchitecture: isMobile() ? '0.50' : '0.75',
    outputStride: 16,
    imageScaleFactor: 0.5,
  },
  singlePoseDetection: {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.5,
  },
  multiPoseDetection: {
    maxPoseDetections: 5,
    minPoseConfidence: 0.15,
    minPartConfidence: 0.1,
    nmsRadius: 30.0,
  },
  output: {
    showVideo: true,
    showSkeleton: true,
    showPoints: true,
    showBoundingBox: false,
  },
  net: null,
};

/**
 * Sets up dat.gui controller on the top-right of the window
 */
function setupGui(cameras, net) {
  guiState.net = net;

  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }

  const gui = new dat.GUI({width: 300});

  // The single-pose algorithm is faster and simpler but requires only one
  // person to be in the frame or results will be innaccurate. Multi-pose works
  // for more than 1 person
  const algorithmController =
      gui.add(guiState, 'algorithm', ['single-pose', 'multi-pose']);

  // The input parameters have the most effect on accuracy and speed of the
  // network
  let input = gui.addFolder('Input');
  // Architecture: there are a few PoseNet models varying in size and
  // accuracy. 1.01 is the largest, but will be the slowest. 0.50 is the
  // fastest, but least accurate.
  const architectureController = input.add(
      guiState.input, 'mobileNetArchitecture',
      ['1.01', '1.00', '0.75', '0.50']);
  // Output stride:  Internally, this parameter affects the height and width of
  // the layers in the neural network. The lower the value of the output stride
  // the higher the accuracy but slower the speed, the higher the value the
  // faster the speed but lower the accuracy.
  input.add(guiState.input, 'outputStride', [8, 16, 32]);
  // Image scale factor: What to scale the image by before feeding it through
  // the network.
  input.add(guiState.input, 'imageScaleFactor').min(0.2).max(1.0);
  input.open();

  // Pose confidence: the overall confidence in the estimation of a person's
  // pose (i.e. a person detected in a frame)
  // Min part confidence: the confidence that a particular estimated keypoint
  // position is accurate (i.e. the elbow's position)
  let single = gui.addFolder('Single Pose Detection');
  single.add(guiState.singlePoseDetection, 'minPoseConfidence', 0.0, 1.0);
  single.add(guiState.singlePoseDetection, 'minPartConfidence', 0.0, 1.0);

  let multi = gui.addFolder('Multi Pose Detection');
  multi.add(guiState.multiPoseDetection, 'maxPoseDetections')
      .min(1)
      .max(20)
      .step(1);
  multi.add(guiState.multiPoseDetection, 'minPoseConfidence', 0.0, 1.0);
  multi.add(guiState.multiPoseDetection, 'minPartConfidence', 0.0, 1.0);
  // nms Radius: controls the minimum distance between poses that are returned
  // defaults to 20, which is probably fine for most use cases
  multi.add(guiState.multiPoseDetection, 'nmsRadius').min(0.0).max(40.0);
  multi.open();

  let output = gui.addFolder('Output');
  output.add(guiState.output, 'showVideo');
  output.add(guiState.output, 'showSkeleton');
  output.add(guiState.output, 'showPoints');
  output.add(guiState.output, 'showBoundingBox');
  output.open();


  architectureController.onChange(function(architecture) {
    guiState.changeToArchitecture = architecture;
  });

  algorithmController.onChange(function(value) {
    switch (guiState.algorithm) {
      case 'single-pose':
        multi.close();
        single.open();
        break;
      case 'multi-pose':
        single.close();
        multi.open();
        break;
    }
  });
}

/**
 * Sets up a frames per second panel on the top-left of the window
 */
function setupFPS() {
  stats.showPanel(0);  // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);
}

/**
 * Feeds an image to posenet to estimate poses - this is where the magic
 * happens. This function loops with a requestAnimationFrame method.
 */
function detectPoseInRealTime(video, net) {
  //const canvas = document.getElementById('output');
  //const ctx = canvas.getContext('2d');

  const canvas = document.getElementById('output2');
  const ctx = canvas.getContext('2d');
  // since images are being fed from a webcam
  const flipHorizontal = true;

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  async function poseDetectionFrame() {
    if (guiState.changeToArchitecture) {
      // Important to purge variables and free up GPU memory
      guiState.net.dispose();

      // Load the PoseNet model weights for either the 0.50, 0.75, 1.00, or 1.01
      // version
      guiState.net = await posenet.load(+guiState.changeToArchitecture);

      guiState.changeToArchitecture = null;
    }

    // Begin monitoring code for frames per second
    stats.begin();

    // Scale an image down to a certain factor. Too large of an image will slow
    // down the GPU
    const imageScaleFactor = guiState.input.imageScaleFactor;
    const outputStride = +guiState.input.outputStride;

    let poses = [];
    let minPoseConfidence;
    let minPartConfidence;
    switch (guiState.algorithm) {
      case 'single-pose':
        const pose = await guiState.net.estimateSinglePose(
            video, imageScaleFactor, flipHorizontal, outputStride);
        poses.push(pose);

        minPoseConfidence = +guiState.singlePoseDetection.minPoseConfidence;
        minPartConfidence = +guiState.singlePoseDetection.minPartConfidence;
        break;
      case 'multi-pose':
        poses = await guiState.net.estimateMultiplePoses(
            video, imageScaleFactor, flipHorizontal, outputStride,
            guiState.multiPoseDetection.maxPoseDetections,
            guiState.multiPoseDetection.minPartConfidence,
            guiState.multiPoseDetection.nmsRadius);

        minPoseConfidence = +guiState.multiPoseDetection.minPoseConfidence;
        minPartConfidence = +guiState.multiPoseDetection.minPartConfidence;
        break;
    }

    ctx.clearRect(0, 0, videoWidth, videoHeight);
    guiState.output.showVideo = true;
    let vid = document.getElementById("video");
    vid.style.display = "block";
    //console.log(poses[0]);


    // if (guiState.output.showVideo) {
    //   ctx.save();
    //   ctx.scale(-1, 1);
    //   ctx.translate(-videoWidth, 0);
    //   ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    //   ctx.restore();
    // }

    // For each pose (i.e. person) detected in an image, loop through the poses
    // and draw the resulting skeleton and keypoints if over certain confidence
    // scores
    poses.forEach(({score, keypoints}) => {
      if (score >= minPoseConfidence) {
        if (guiState.output.showPoints) {
          drawKeypoints(keypoints, minPartConfidence, ctx);
        }
        if (guiState.output.showSkeleton) {
          drawSkeleton(keypoints, minPartConfidence, ctx);
          //console.log(keypoints);
        }
        if (guiState.output.showBoundingBox) {
          drawBoundingBox(keypoints, ctx);
        }
      }
    });

    var ptList = {};
    // distance formula
    function diff (num1, num2) {
      if (num1 > num2) {
        return (num1 - num2);
      } else {
        return (num2 - num1);
      }
    };

    function dist (x1, y1, x2, y2) {
      var deltaX = diff(x1, x2);
      var deltaY = diff(y1, y2);
      var dist = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));
      return (dist);
    };

    // finding center of each letter
    for(let i=0;i<84;i++) {
      if (i != 5 && i != 14 && i != 18 && i != 24 && i != 27 && i != 33 && i != 36 && i != 40 && i != 45 && i != 47 && i != 54 && i != 61 && i != 64 && i != 73 && i != 77 ) {
        let letterDiv = $("#txt" + i);
        let boardDiv = $("#myCanvas");
        let c = document.getElementById("output2");
        let ctx2 = c.getContext("2d");
        let xCorner = letterDiv.offset().left - boardDiv.offset().left;
        let yCorner = letterDiv.offset().top - boardDiv.offset().top;
        var w = letterDiv.width() / 2;
        var h = letterDiv.height() / 2;
        // console.log('xCorner: '+ xCorner + ", yCorner: " + yCorner + ", width: " + w + ", height: " + h);
        // letterDiv.css("border-style", "solid");
        // letterDiv.css("border-width", "2px");

        // Corner Point
        // ctx2.beginPath();
        // ctx2.arc(xCorner, yCorner, 5, 0, 2 * Math.PI);
        // ctx2.fillStyle = '#1B204B';
        // ctx2.fill();
        // ctx2.lineWidth = 1;

        // Center
        ctx2.beginPath();
        ctx2.arc(xCorner+w,yCorner+h, 5, 0, 2 * Math.PI);
        ctx2.fillStyle = '#1B204B';
        ctx2.fill();
        ctx2.lineWidth = 1;
        ptList[i] = {'x':xCorner+w,'y':yCorner+h};
      }
    }

    function map (num, in_min, in_max, out_min, out_max) {
      return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }
    Array.min = function( array ){
      return Math.min.apply( Math, array );
    };

    var distances = {};
    var bodyParts = poses[0].keypoints;

    for(let b=0;b<17;b++)
    {
      console.log("bodypart: " + b);
      // start with bodypart
      let bodyPart = bodyParts[b];
      // get distance of bodypart to all letters on board
      for (let l=0;l<84;l++)
      {
        let letter = ptList[l];
        if (letter != undefined) {
          //console.log("letter: " + l);
          let distance = dist(letter.x,letter.y,bodyPart.position['x'],bodyPart.position['y']);
          distances[l] = distance;
        }
      }
      // get the smallest distance from that bodypart to a letter
      distances = Object.keys(distances).sort(function(a,b){return distances[a]-distances[b]});
      let word = ptList[distances[0]];
      console.log(word);

      let finalDistance = dist(word.x,word.y,bodyPart.position['x'],bodyPart.position['y']);

      if (finalDistance < 20) {
        let letterDiv = document.getElementById("txt" + distances[0]);
        let n = map(finalDistance,20,0,0,150);
        letterDiv.style.fontVariationSettings = " 'wght' " + n;
      }
      distances = [];
    }

    // let distances = [];
    // let bodyParts = poses[0].keypoints;
    // for (let z=0;z<bodyParts.length;z++) {
    //   let distance = dist(ptList[0].x,ptList[0].y,bodyParts[z].position['x'],bodyParts[z].position['y']);
		// 	distances.push(distance);
    // }
    // var minimum = Array.min(distances);
    // var bodyPart;
    // for (let z=0;z<bodyParts.length;z++){
		// 	let distance = dist(ptList[0].x,ptList[0].y,bodyParts[z].position['x'],bodyParts[z].position['y']);
		// 	if (distance == minimum){
		// 		bodyPart = bodyParts[z];
    //     console.log(bodyPart);
		// 	}
    // }
    // let finalDistance = dist(ptList[0].x,ptList[0].y,bodyPart.position['x'],bodyPart.position['y']);
    // if (finalDistance < 20) {
    //   let letterDiv = document.getElementById("txt0");
    //   let n = map(finalDistance,20,0,0,150);
    //   letterDiv.style.fontVariationSettings = " 'wght' " + n;
    // }


    // let distances = [];
		// let circle;
    //
		// // for (var i=0;i<targets.length;i++){
		// // 	distances[i] = dist(new_element.translation.x,new_element.translation.y,targets[i].x,targets[i].y);
		// // }
		// for (var i=0;i<targets.length;i++){
		// 	distance = dist(new_element.translation.x,new_element.translation.y,targets[i].x,targets[i].y);
		// 	distances.push(distance);
		// 	// if (distance < 100){
		// 	// 	circle = targets[i];
		// 	// }
		// }
    //
		// var minimum = Array.min(distances);
    //
		// for (var i=0;i<targets.length;i++){
		// 	distance = dist(new_element.translation.x,new_element.translation.y,targets[i].x,targets[i].y);
		// 	if (distance == minimum){
		// 		circle = targets[i];
		// 		index = i;
		// 	}
		// }
		// return circle



    // for(let j=0;j<84;j++){
    //   let distance = dist(ptList[i].x,ptList[i].y,poses[0].nose.)
    //
    // }

    // End monitoring code for frames per second
    stats.end();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}

/**
 * Kicks off the demo by loading the posenet model, finding and loading
 * available camera devices, and setting off the detectPoseInRealTime function.
 */
export async function bindPage() {
  // Load the PoseNet model weights with architecture 0.75
  const net = await posenet.load(0.75);

  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'block';

  let video;

  try {
    video = await loadVideo();
  } catch (e) {
    let info = document.getElementById('info');
    info.textContent = 'this browser does not support video capture,' +
        'or this device does not have a camera';
    info.style.display = 'block';
    throw e;
  }

  setupGui([], net);
  setupFPS();
  detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
// kick off the demo
bindPage();
