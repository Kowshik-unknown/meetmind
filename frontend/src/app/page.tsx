import App from "@/components/App";
import BackgroundLoader from "@/components/BackgroundLoader";

export default function Home() {
  return (
    <>
      <BackgroundLoader />
      <div className="grain" />
      <App />
    </>
  );
}
