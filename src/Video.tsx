import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, NormalizedLandmark, HolisticLandmarker } from '@mediapipe/tasks-vision'

type CaptionsResponse = {
  url?: string;
  state?: 'QUEUED' | 'PROCESSING';
  progress?: number;
};

const defaultVideoSrc = 'https://res.cloudinary.com/du1vewppc/video/upload/videos/cropped_result_kl86y4.mp4'

function Video({
  setPose,
  setFace,
  setLeftHand,
  setRightHand
}: {
  setPose: (pose: NormalizedLandmark[]) => void
  setFace: (face: NormalizedLandmark[]) => void
  setLeftHand: (leftHand: NormalizedLandmark[]) => void
  setRightHand: (rightHand: NormalizedLandmark[]) => void
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoSrc, setVideoSrc] = useState<string>(defaultVideoSrc)
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
            holisticLandmarkerRef.current?.setOptions({ runningMode: "VIDEO" }).then(() => {
              setVideoSrc(data?.url!)
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
    FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
    ).then(async (vision) => {
      const holisticLandmarker = await HolisticLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO'
      })

      if (videoRef.current) {
        videoRef.current.src = videoSrc
        videoRef.current.play()
      }

      let lastTime = performance.now()
      const detect = (): void => {
        if (
          videoRef.current &&
          lastTime != videoRef.current.currentTime &&
          videoRef.current.videoWidth > 0
        ) {
          lastTime = videoRef.current.currentTime
          holisticLandmarker.detectForVideo(videoRef.current, performance.now(), (result) => {
            if (result.poseWorldLandmarks[0]) {
              setPose(result.poseWorldLandmarks[0])
            } else {
              setPose([])
            }
            if (result.faceLandmarks && result.faceLandmarks.length > 0) {
              setFace(result.faceLandmarks[0])
            } else {
              setFace([])
            }
            if (result.leftHandWorldLandmarks && result.leftHandWorldLandmarks.length > 0) {
              setLeftHand(result.leftHandWorldLandmarks[0])
            } else {
              setLeftHand([])
            }
            if (result.rightHandWorldLandmarks && result.rightHandWorldLandmarks.length > 0) {
              setRightHand(result.rightHandWorldLandmarks[0])
            } else {
              setRightHand([])
            }
          })
        }
        requestAnimationFrame(detect)
      }
      detect()
    })
  }, [setPose, setFace, videoRef])

  return (
    <div className="videoContainer">
      <video 
        crossOrigin="anonymous" 
        ref={videoRef} 
        controls 
        disablePictureInPicture
        controlsList="nofullscreen noremoteplayback" 
        playsInline 
        muted 
        autoPlay 
        src={videoSrc} 
      />
    </div>
  )
}

export default Video
