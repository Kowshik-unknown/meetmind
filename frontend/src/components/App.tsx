"use client";

import { useRef } from "react";
import { CursorAura, ScrollProgress } from "./Effects";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Navbar } from "./Navbar";
import { Workspace, type WorkspaceHandle } from "./Workspace";

export default function App() {
  const workspace = useRef<WorkspaceHandle>(null);
  const scrollToWorkspace = () => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <ScrollProgress />
      <CursorAura />
      <Navbar />
      <main className="relative z-10">
        <Hero
          onStart={() => {
            // getUserMedia needs the click's user activation, so start before scrolling.
            workspace.current?.start();
            scrollToWorkspace();
          }}
          onUpload={() => {
            workspace.current?.upload();
            scrollToWorkspace();
          }}
          onPaste={() => {
            scrollToWorkspace();
            setTimeout(() => workspace.current?.paste(), 500);
          }}
        />
        <Workspace handleRef={workspace} />
        <HowItWorks />
        <footer className="border-t border-line py-8 text-center text-xs text-dim">
          MeetMind · transcription runs locally with Whisper · notes, quizzes & flashcards by Gemini
        </footer>
      </main>
    </>
  );
}
