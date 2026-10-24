'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';

interface NetworkVisualizationProps {
  progress: number;
}

function Scene({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.5;
    }
  });

  const layers = [3, 4, 4, 2];
  const spacingX = 2;
  const spacingY = 1.5;
  const nodes: [number, number, number][] = [];
  const links: { start: [number, number, number]; end: [number, number, number] }[] = [];

  layers.forEach((count, i) => {
    const x = (i - (layers.length - 1) / 2) * spacingX;
    for (let j = 0; j < count; j++) {
      const y = (j - (count - 1) / 2) * spacingY;
      nodes.push([x, y, 0]);

      if (i > 0) {
        const prevCount = layers[i - 1];
        for (let k = 0; k < prevCount; k++) {
          const prevY = (k - (prevCount - 1) / 2) * spacingY;
          links.push({
            start: [x - spacingX, prevY, 0],
            end: [x, y, 0],
          });
        }
      }
    }
  });

  const activeColor = new THREE.Color('#4caf50');
  const inactiveColor = new THREE.Color('#666666');
  const currentColor = inactiveColor.clone().lerp(activeColor, progress);

  return (
    <group ref={group}>
      {links.map((link, i) => (
        <Line
          key={`link-${i}`}
          points={[link.start, link.end]}
          color={currentColor}
          lineWidth={1}
          opacity={0.3}
          transparent
        />
      ))}
      {nodes.map((pos, i) => (
        <Sphere key={`node-${i}`} args={[0.2, 16, 16]} position={pos}>
          <meshBasicMaterial color={currentColor} />
        </Sphere>
      ))}
    </group>
  );
}

export default function NetworkVisualization({ progress }: NetworkVisualizationProps) {
  return (
    <div style={{ width: '100%', height: '200px' }}>
      <Canvas camera={{ position: [0, 0, 8] }}>
        <ambientLight intensity={0.5} />
        <Scene progress={progress} />
      </Canvas>
    </div>
  );
}
