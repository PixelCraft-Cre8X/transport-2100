import logoWithName from "../assets/logo-with-name.png";
import "./IntroScreen.css";

export default function IntroScreen() {
  return (
    <div className="intro-screen" aria-hidden="true">
      <div className="intro-logo">
        <img
          className="intro-logo-image"
          src={logoWithName}
          alt=""
        />
      </div>
    </div>
  );
}
