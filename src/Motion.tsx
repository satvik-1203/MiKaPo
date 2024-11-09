import { useEffect, useRef, useState } from "react"

import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision"
import { CircularProgress, Typography, IconButton, Tooltip } from "@mui/material"
import { Videocam, CloudUpload, Stop } from "@mui/icons-material"
import { styled } from "@mui/material/styles"
import DebugScene from "./DebugScene"
import { Body } from "./index"
const defaultVideoSrc = "https://storage.googleapis.com/captions-avatar-orc/orc/studio/ngvCCjHoasepMDbe3FCW/b58c201a-36b6-41e2-9569-e8b7d03069e3/cropped_result.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=cloud-run-captions-server%40captions-f6de9.iam.gserviceaccount.com%2F20241109%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20241109T213415Z&X-Goog-Expires=527145&X-Goog-SignedHeaders=host&X-Goog-Signature=a0860f1a3a50e30b8904010772372e3ff96813b363ea8afdb2fc7a3177571b76f3b9568df8dd9fcb863c7b897f5f0136d97da13c5d8eed6a95f19473d2916c924aa0b1f3a00e0c63ae688cfd739e3c0ffec245a40dd1c58490390c8df272341b43546467b4db1e4a5dd8ab99d8397c4c87c93c93d76312e17ab42e161e62bebac752dc019e6e4427fcaa91204e15fc66928dccc6dd566a51077c777b945a2bd96825ce334872d9fd074386bec87753f76ab6db8d8a132d165313b945801088ae90c901dfde36413ec88f9f65681c6d33ae69d1657f7df57b3109026b7fef9b8284cc8177189a995eeb0f3e947070ae8856bde29de63cf4bb9388777f55cf10e9"

const VisuallyHiddenInput = styled("input")({
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  bottom: 0,
  left: 0,
  whiteSpace: "nowrap",
  width: 1,
})

type CaptionsResponse = {
  url?: string;
  state?: 'QUEUED' | 'PROCESSING';
  progress?: number;
};

function Video({
  body,
  setBody,
  setLerpFactor,
  style,
}: {
  body: Body
  setBody: (body: Body) => void
  setLerpFactor: (lerpFactor: number) => void
  style: React.CSSProperties
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [videoSrc, setVideoSrc] = useState<string>(defaultVideoSrc)
  const [imgSrc, setImgSrc] = useState<string>("")
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false)
  const holisticLandmarkerRef = useRef<HolisticLandmarker | null>(null)
  const [lastMedia, setLastMedia] = useState<string>("VIDEO")
  const [operationId, setOperationId] = useState('');
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [processingState, setProcessingState] = useState<'IDLE' | 'QUEUED' | 'PROCESSING'>('IDLE');

  const handleSpeechToCaptions = async () => {
    const captionsSubmitRequest = await fetch('http://localhost:8080/api/captions-submit', {
      method: 'POST',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({
        script: `Hey there! Adjusts my lucky racing goggles that I pretend are just for cooking Welcome to Mika's Fusion Fleet - where the only thing faster than my service is... well, never mind about that! winks Today's special is our Neo-Tokyo Drift Tacos, with a secret sauce that'll give you the same rush as zooming through Sector 7's midnight airways- theoretically speaking, of course! What can I get started for you?`
      })
    });

    const { operationId } = await captionsSubmitRequest.json()
    setOperationId(operationId)
  }

  const pollCaptionsSubmit = async () => {
    const captionsSubmitRequest = await fetch('http://localhost:8080/api/captions-poll', {
      method: 'POST',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({
        operationId
      })
    });

    const data = await captionsSubmitRequest.json()
    return data;
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      if (file.type.includes("video")) {
        if (lastMedia === "IMAGE") {
          setLerpFactor(0.5)
          holisticLandmarkerRef.current?.setOptions({ runningMode: "VIDEO" }).then(() => {
            setVideoSrc(url)
            setImgSrc("")
            if (videoRef.current) {
              videoRef.current.currentTime = 0
            }
          })
        } else {
          setVideoSrc(url)
          if (videoRef.current) {
            videoRef.current.currentTime = 0
          }
        }
        setLastMedia("VIDEO")
      } else if (file.type.includes("image")) {
        setLerpFactor(1)
        holisticLandmarkerRef.current?.setOptions({ runningMode: "IMAGE" }).then(() => {
          setVideoSrc("")
          setImgSrc(url)
        })
        setLastMedia("IMAGE")
      }
    }
  }

  const toggleCamera = async () => {
    if (isCameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
      }
      setIsCameraActive(false)
      // Set the video source after disabling the camera
      setVideoSrc(defaultVideoSrc)
      if (videoRef.current) {
        videoRef.current.srcObject = null
        videoRef.current.load()
      }
    } else {
      try {
        setIsCameraActive(true)
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        if (lastMedia === "IMAGE") {
          await holisticLandmarkerRef.current?.setOptions({ runningMode: "VIDEO" })
          setLerpFactor(0.5)
          setImgSrc("")
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
        setLastMedia("VIDEO")
      } catch (error) {
        console.error("Error accessing camera:", error)
      }
    }
  }

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let intervalId: ReturnType<typeof setInterval>;

    const startPolling = async () => {
      const pollAndUpdate = async () => {
        const response = await pollCaptionsSubmit();
        const data = response as CaptionsResponse;

        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
        if (data.state) {
          setProcessingState(data.state);
        }

        if (data.url) {
          if (lastMedia === "IMAGE") {
            setLerpFactor(0.5)
            holisticLandmarkerRef.current?.setOptions({ runningMode: "VIDEO" }).then(() => {
              setVideoSrc(data?.url!)
              setImgSrc("")
              if (videoRef.current) {
                videoRef.current.currentTime = 0
              }
            })
          } else {
            setVideoSrc(data.url)
            if (videoRef.current) {
              videoRef.current.currentTime = 0
            }
          }

          setProcessingState('IDLE');
          setProgress(0);
          setLastMedia("VIDEO")
          setIsPolling(false);
          clearInterval(intervalId as NodeJS.Timeout);
        }
      };

      // Initial poll after 30 seconds
      timeoutId = setTimeout(() => {
        pollAndUpdate();
        // Continue polling every 5 seconds
        intervalId = setInterval(pollAndUpdate, 5000);
      }, 3000);
    };

    if (operationId && !isPolling) {
      setIsPolling(true);
      startPolling();
    }

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId as NodeJS.Timeout);
    };
  }, [operationId]);

  useEffect(() => {
    FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm").then(
      async (vision) => {
        holisticLandmarkerRef.current = await HolisticLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task",
            delegate: "GPU",
          },

          runningMode: "VIDEO",
        })

        let lastTime = performance.now()
        let lastImgSrc = ""
        const detect = () => {
          if (videoRef.current && lastTime != videoRef.current.currentTime && videoRef.current.videoWidth > 0) {
            lastTime = videoRef.current.currentTime
            holisticLandmarkerRef.current!.detectForVideo(videoRef.current, performance.now(), (result) => {
              setBody({
                mainBody: result.poseWorldLandmarks[0],
                leftHand: result.leftHandWorldLandmarks[0],
                rightHand: result.rightHandWorldLandmarks[0],
                face: result.faceLandmarks[0],
              })
            })
          } else if (
            imgRef.current &&
            imgRef.current.src.length > 0 &&
            imgRef.current.src != lastImgSrc &&
            imgRef.current.complete &&
            imgRef.current.naturalWidth > 0
          ) {
            lastImgSrc = imgRef.current.src

            holisticLandmarkerRef.current!.detect(imgRef.current!, (result) => {
              setBody({
                mainBody: result.poseWorldLandmarks[0],
                leftHand: result.leftHandWorldLandmarks[0],
                rightHand: result.rightHandWorldLandmarks[0],
                face: result.faceLandmarks[0],
              })
            })
          }
          requestAnimationFrame(detect)
        }
        detect()
      }
    )
  }, [setBody, imgRef, videoRef])

  return (
    <div className="motion" style={style}>
      <div className="toolbar">
        <Tooltip title='Speech to Captions video'>
          <IconButton className="toolbar-item" onClick={handleSpeechToCaptions}>
          <CircularProgress variant="determinate" value={progress} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {processingState === 'QUEUED' ? 'Queued for processing...' : 'Generating video...'}
              {progress > 0 && ` (${progress}%)`}
            </Typography>
            SPEECH TO CAPTIONS
          </IconButton>
        </Tooltip>
        <Tooltip title="Upload a video or image">
          <IconButton className="toolbar-item" color="primary" component="label" disabled={isCameraActive}>
            <CloudUpload />
            <VisuallyHiddenInput type="file" onChange={handleFileUpload} accept="video/*, image/*" />
          </IconButton>
        </Tooltip>
        <Tooltip title={isCameraActive ? "Stop webcam" : "Use your webcam"}>
          <IconButton className="toolbar-item" onClick={toggleCamera}>
            {isCameraActive ? <Stop sx={{ color: "red" }} /> : <Videocam sx={{ color: "green" }} />}
          </IconButton>
        </Tooltip>
      </div>
      <div className="video-player">
        {videoSrc || isCameraActive ? (
          <video
            ref={videoRef}
            controls={!isCameraActive}
            playsInline
            disablePictureInPicture
            controlsList="nofullscreen noremoteplayback"
            src={isCameraActive ? undefined : videoSrc}
          />
        ) : (
          <img ref={imgRef} src={imgSrc} style={{ width: "100%", height: "auto" }} />
        )}
      </div>

      {style.display == "block" && <DebugScene body={body} />}
    </div>
  )
}

export default Video
