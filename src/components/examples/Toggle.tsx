import { useState } from "react";
import DemoContainer from "./DemoContainer";

export default function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <DemoContainer>
      <button onClick={() => setOn(v => !v)}>{on ? "ON" : "OFF"}</button>
    </DemoContainer>
  );
}
