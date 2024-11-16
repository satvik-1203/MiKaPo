import { useState } from "react";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Mic, MicOff, Loader2 } from "lucide-react";
import MMDScene from "./MMDScene";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import Video from "./Video";
import { DailyProvider, useCallObject } from "@daily-co/daily-react";
import { createStore, Provider } from "jotai";

const jotaiStore = createStore();

export default function App() {
  const [pose, setPose] = useState<NormalizedLandmark[] | null>(null);
  const [face, setFace] = useState<NormalizedLandmark[] | null>(null);
  const [leftHand, setLeftHand] = useState<NormalizedLandmark[] | null>(null);
  const [rightHand, setRightHand] = useState<NormalizedLandmark[] | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [liveStreamUrl, setLiveStreamUrl] = useState(
    "https://tavus.daily.co/cc4ad5706aba"
  );
  const callObject = useCallObject({
    options: {
      url: liveStreamUrl,
    },
  });

  const [processingState, setProcessingState] = useState<
    "IDLE" | "QUEUED" | "PROCESSING"
  >("IDLE");
  const [progress, setProgress] = useState(0);
  const [videoSrc, setVideoSrc] = useState<string | null>();

  const handleMicToggle = () => {
    setIsRecording(!isRecording);
  };

  const getLoadingText = () => {
    switch (processingState) {
      case "QUEUED":
        return `Preparing to process... ${Math.round(progress)}%`;
      case "PROCESSING":
        return `Processing motion capture... ${Math.round(progress)}%`;
      default:
        return null;
    }
  };

  const isProcessing = processingState !== "IDLE";

  return (
    <Provider store={jotaiStore}>
      <DailyProvider callObject={callObject} jotaiStore={jotaiStore}>
        <div className="min-h-screen bg-gradient-to-b from-background to-background/80 p-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Motion Capture Studio
              </h1>
              <p className="mt-2 text-muted-foreground">
                Speak to animate the 3D model in real-time
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Video Feed Section */}
              <Card className="relative overflow-hidden rounded-xl border bg-card">
                <div className="aspect-square relative">
                  <Video
                    className="absolute inset-0 h-full w-full object-cover"
                    setPose={setPose}
                    setFace={setFace}
                    setLeftHand={setLeftHand}
                    setRightHand={setRightHand}
                    videoSrc={videoSrc}
                    setVideoSrc={setVideoSrc}
                    isRecording={isRecording}
                    setIsRecording={setIsRecording}
                    processingState={processingState}
                    setProcessingState={setProcessingState}
                    progress={progress}
                    setProgress={setProgress}
                  />
                  {!videoSrc && (
                    <div className="absolute inset-0 flex items-center justify-center bg-accent/10">
                      <p className="text-sm text-muted-foreground">
                        Video feed will appear here
                      </p>
                    </div>
                  )}

                  {/* Microphone Button */}
                  <div className="absolute left-1/2 bottom-6 -translate-x-1/2">
                    <div className="relative">
                      {isRecording && (
                        <>
                          <span className="absolute inset-0 rounded-full animate-ping-slow bg-red-500/20" />
                          <span className="absolute inset-0 rounded-full animate-ping-slower bg-red-500/10" />
                        </>
                      )}
                      <Button
                        size="lg"
                        className={`h-16 w-16 rounded-full ${
                          isRecording
                            ? "bg-red-500 hover:bg-red-600 animate-pulse scale-105"
                            : "bg-primary hover:bg-primary/90"
                        }`}
                        onClick={handleMicToggle}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : isRecording ? (
                          <MicOff className="h-6 w-6" />
                        ) : (
                          <Mic className="h-6 w-6" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 3D Model Section */}
              <Card className="relative overflow-hidden rounded-xl border bg-card">
                <div className="aspect-square relative bg-black">
                  {/* Replace with your 3D model renderer */}
                  <MMDScene
                    pose={pose}
                    face={face}
                    leftHand={leftHand}
                    rightHand={rightHand}
                  />

                  {/* Status Indicator */}
                  {isProcessing && (
                    <div className="absolute inset-x-0 top-4 flex justify-center">
                      <div className="rounded-full bg-black/50 px-4 py-2 text-sm text-white backdrop-blur-sm">
                        {getLoadingText()}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Instructions */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Click the microphone button and speak to interact with the model
            </div>
          </div>
        </div>
      </DailyProvider>
    </Provider>
  );
}
