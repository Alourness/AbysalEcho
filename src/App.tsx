import React from 'react';
import { GameCanvas } from './components/GameCanvas';

export default function App() {
  return (
    <div className="w-screen h-screen bg-[#030306] flex items-center justify-center m-0 p-0 overflow-hidden select-none">
      <GameCanvas />
    </div>
  );
}
