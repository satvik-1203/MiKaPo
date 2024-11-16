import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  NormalizedLandmark,
  HolisticLandmarker,
  DrawingUtils,
  PoseLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";
import OpenAI from "openai";
import { DEFAULT_VIDEO_SRC } from "./lib/constants";
import { DailyVideo, useLocalSessionId } from "@daily-co/daily-react";

type CaptionsResponse = {
  url?: string;
  state?: "QUEUED" | "PROCESSING";
  progress?: number;
};

type VideoProps = {
  setPose: (pose: NormalizedLandmark[] | null) => void;
  setFace: (face: NormalizedLandmark[] | null) => void;
  setLeftHand: (leftHand: NormalizedLandmark[] | null) => void;
  setRightHand: (rightHand: NormalizedLandmark[] | null) => void;
  videoSrc?: string | null;
  setVideoSrc: (src: string | null) => void;
  isRecording: boolean;
  setIsRecording: (isListening: boolean) => void;
  processingState: "IDLE" | "QUEUED" | "PROCESSING";
  setProcessingState: (state: "IDLE" | "QUEUED" | "PROCESSING") => void;
  progress: number;
  setProgress: (progress: number) => void;
  className?: string;
};

function Video({
  setPose,
  setFace,
  setLeftHand,
  setRightHand,
  videoSrc,
  setVideoSrc,
  isRecording,
  setIsRecording,
  processingState,
  setProcessingState,
  progress,
  setProgress,
  className,
}: VideoProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holisticLandmarkerRef = useRef<HolisticLandmarker | null>(null);
  const [lastMedia, setLastMedia] = useState<string>("VIDEO");
  const [operationId, setOperationId] = useState("");
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const openai = useRef<OpenAI>(
    new OpenAI({
      apiKey: "",
      dangerouslyAllowBrowser: true,
    })
  );
  const sessionId = useLocalSessionId();

  const handleSpeechToCaptions = async (script: string) => {
    const captionsSubmitRequest = await fetch(
      "http://localhost:8080/api/captions-submit",
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({
          script,
        }),
      }
    );

    const { operationId } = await captionsSubmitRequest.json();
    setOperationId(operationId);
  };

  const pollCaptionsSubmit = async () => {
    const captionsSubmitRequest = await fetch(
      "http://localhost:8080/api/captions-poll",
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({
          operationId,
        }),
      }
    );

    const data = await captionsSubmitRequest.json();
    return data;
  };

  useEffect(() => {
    const handleAudioRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        mediaRecorderRef.current = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          chunks.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const blob = new Blob(chunks, { type: "audio/wav" });
          const arrayBuffer = await blob.arrayBuffer();
          setAudioBuffer(arrayBuffer);

          if (arrayBuffer) {
            const transcription =
              await openai.current.audio.transcriptions.create({
                model: "whisper-1",
                file: new File([arrayBuffer], "audio.wav", {
                  type: "audio/wav",
                  lastModified: Date.now(),
                }),
              });

            console.log("Final transcription:", transcription);
            const { text } = transcription;

            const prompt = `You are Mika, a cheerful street food vendor in the bustling city of Neo-Tokyo who secretly moonlights as an underground hoverboard racer. As a beloved figure in your neighborhood, you love chatting with passersby about everything from local gossip to your famous fusion tacos to the latest hoverboard modifications. If the conversation stalls, you enjoy asking about people's favorite foods, their opinions on the city's anti-gravity zones, or their thoughts on the upcoming underground race season. Keep your responses natural and conversational, typically between 3-7 sentences, and maintain your upbeat personality while mixing in occasional references to both your legitimate food business and your thrilling night life on the racing circuit.`;

            const response = await openai.current.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: prompt },
                { role: "user", content: text },
              ],
            });

            console.log("Response:", response.choices[0].message.content);
            handleSpeechToCaptions(response.choices[0].message.content || "");
          }

          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorderRef.current.start();
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    };

    if (isRecording) {
      handleAudioRecording();
    } else if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, [isRecording]);

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
            holisticLandmarkerRef.current
              ?.setOptions({ runningMode: "VIDEO" })
              .then(() => {
                // setVideoSrc(data?.url!);
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                }
              });
          } else {
            // setVideoSrc(data.url);
            if (videoRef.current) {
              videoRef.current.currentTime = 0;
            }
          }

          setProcessingState("IDLE");
          setProgress(0);
          setLastMedia("VIDEO");
          setIsPolling(false);
          clearInterval(intervalId as NodeJS.Timeout);
        }
      };

      // Initial poll after 30 seconds
      timeoutId = setTimeout(() => {
        pollAndUpdate();
        setVideoSrc(DEFAULT_VIDEO_SRC);
        // Continue polling every 5 seconds
        intervalId = setInterval(pollAndUpdate, 5000);
      }, 5000);
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
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
    ).then(async (vision) => {
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minPosePresenceConfidence: 0.5,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });

      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFacePresenceConfidence: 0.2,
        minFaceDetectionConfidence: 0.2,
      });

      const canvasCtx = canvasRef.current?.getContext("2d");
      if (canvasCtx) {
        canvasCtx.clearRect(
          0,
          0,
          canvasRef.current!.width,
          canvasRef.current!.height
        );
      }
      const drawingUtils = new DrawingUtils(
        canvasCtx as CanvasRenderingContext2D
      );

      const drawPose = (landmarks: NormalizedLandmark[]) => {
        drawingUtils.drawLandmarks(landmarks, {
          radius: 2,
        });
        drawingUtils.drawConnectors(
          landmarks,
          PoseLandmarker.POSE_CONNECTIONS,
          {
            color: "white",
            lineWidth: 3,
          }
        );
      };

      const drawFace = (landmarks: NormalizedLandmark[]) => {
        drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          {
            color: "white",
            lineWidth: 1,
          }
        );
      };

      if (videoRef.current && videoSrc) {
        videoRef.current.src = videoSrc;
        videoRef.current.play();
      }

      let lastTime = performance.now();
      const detect = (): void => {
        if (
          videoRef.current &&
          lastTime != videoRef.current.currentTime &&
          videoRef.current.videoWidth > 0
        ) {
          lastTime = videoRef.current.currentTime;
          poseLandmarker.detectForVideo(
            videoRef.current,
            performance.now(),
            (result) => {
              setPose(result.worldLandmarks[0]);
              if (canvasRef.current) {
                drawPose(result.landmarks[0]);
              }
            }
          );
          const faceResult = faceLandmarker.detectForVideo(
            videoRef.current,
            performance.now(),
            {}
          );
          setFace(faceResult.faceLandmarks[0]);
          if (canvasRef.current && faceResult.faceLandmarks.length > 0) {
            drawFace(faceResult.faceLandmarks[0]);
          }
        }
        requestAnimationFrame(detect);
      };
      detect();
    });
  }, [setPose, setFace, videoRef]);

  useEffect(() => {
    const resizeCanvas = () => {
      if (videoRef.current && canvasRef.current) {
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        const containerWidth = videoRef.current.clientWidth;
        const containerHeight = videoRef.current.clientHeight;

        const scale = Math.min(
          containerWidth / videoWidth,
          containerHeight / videoHeight
        );
        const scaledWidth = videoWidth * scale;
        const scaledHeight = videoHeight * scale;

        canvasRef.current.width = scaledWidth;
        canvasRef.current.height = scaledHeight;
        canvasRef.current.style.left = `${
          (containerWidth - scaledWidth) / 2
        }px`;
        canvasRef.current.style.top = `${
          (containerHeight - scaledHeight) / 2
        }px`;
      }
    };

    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.addEventListener("loadedmetadata", resizeCanvas);
      window.addEventListener("resize", resizeCanvas);
    }

    return () => {
      if (videoElement) {
        videoElement.removeEventListener("loadedmetadata", resizeCanvas);
      }
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current
        .getContext("2d")
        ?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [canvasRef]);

  return (
    <>
      <DailyVideo sessionId={sessionId} type="video" />
      {/* // <video
        //   className={className}
        //   crossOrigin="anonymous"
        //   ref={videoRef}
        //   controls
        //   disablePictureInPicture
        //   controlsList="nofullscreen noremoteplayback"
        //   playsInline
        //   autoPlay
        //   src={videoSrc}
        // /> */}

      {/* <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          zIndex: "1001",
          pointerEvents: "none",
        }}
      /> */}
    </>
  );
}

export default Video;
