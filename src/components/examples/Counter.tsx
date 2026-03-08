import { useState } from "react";
import DemoContainer from "./DemoContainer";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <DemoContainer>
      <button onClick={() => setCount(c => c - 1)}>−</button>
      <span> {count} </span>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </DemoContainer>
  );
}
