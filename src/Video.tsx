import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  NormalizedLandmark,
  HolisticLandmarker,
} from "@mediapipe/tasks-vision";
import { Mic } from "@mui/icons-material";
import OpenAI from "openai";

type CaptionsResponse = {
  url?: string;
  state?: "QUEUED" | "PROCESSING";
  progress?: number;
};

const defaultVideoSrc =
  "https://res.cloudinary.com/du1vewppc/video/upload/videos/cropped_result_kl86y4.mp4";

function Video({
  setPose,
  setFace,
  setLeftHand,
  setRightHand,
}: {
  setPose: (pose: NormalizedLandmark[]) => void;
  setFace: (face: NormalizedLandmark[]) => void;
  setLeftHand: (leftHand: NormalizedLandmark[]) => void;
  setRightHand: (rightHand: NormalizedLandmark[]) => void;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string>("");
  const holisticLandmarkerRef = useRef<HolisticLandmarker | null>(null);
  const [lastMedia, setLastMedia] = useState<string>("VIDEO");
  const [operationId, setOperationId] = useState("");
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [inProgress, setInProgress] = useState<boolean>(false);
  const [selectedTool, setSelectedTool] = useState<string>("speech");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const openai = useRef<OpenAI>(
    new OpenAI({
      apiKey: "",
      dangerouslyAllowBrowser: true,
    })
  );
  const [processingState, setProcessingState] = useState<
    "IDLE" | "QUEUED" | "PROCESSING"
  >("IDLE");

  const [isRecording, setIsRecording] = useState<boolean>(false);

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
                setVideoSrc(data?.url!);
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                }
              });
          } else {
            setVideoSrc(data.url);
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
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
    ).then(async (vision) => {
      const holisticLandmarker = await HolisticLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
        }
      );

      if (videoRef.current) {
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
          holisticLandmarker.detectForVideo(
            videoRef.current,
            performance.now(),
            (result) => {
              if (result.poseWorldLandmarks[0]) {
                setPose(result.poseWorldLandmarks[0]);
              } else {
                setPose([]);
              }
              if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                setFace(result.faceLandmarks[0]);
              } else {
                setFace([]);
              }
              if (
                result.leftHandWorldLandmarks &&
                result.leftHandWorldLandmarks.length > 0
              ) {
                setLeftHand(result.leftHandWorldLandmarks[0]);
              } else {
                setLeftHand([]);
              }
              if (
                result.rightHandWorldLandmarks &&
                result.rightHandWorldLandmarks.length > 0
              ) {
                setRightHand(result.rightHandWorldLandmarks[0]);
              } else {
                setRightHand([]);
              }
            }
          );
        }
        requestAnimationFrame(detect);
      };
      detect();
    });
  }, [setPose, setFace, videoRef]);

  return (
    <div className="videoContainer">
      <div
        style={{
          position: "fixed",
          zIndex: 1000,
          top: 100,
          left: 100,
          width: "fit-content",
          height: "fit-content",
        }}
      >
        <Mic
          sx={{
            fontSize: 100,
            color: isRecording ? "#ff4444" : "#666666",
            cursor: "pointer",
          }}
          onClick={() => setIsRecording(!isRecording)}
        />
      </div>

      {videoSrc.trim() && (
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
      )}
    </div>
  );
}

export default Video;
