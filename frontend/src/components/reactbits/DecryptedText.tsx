import React, { useEffect, useState, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  characters?: string;
  className?: string;
  parentClassName?: string;
  animateOn?: 'view' | 'hover';
  sequential?: boolean;
}

export default function DecryptedText({
  text,
  speed = 40,
  maxIterations = 8,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=',
  className = '',
  parentClassName = '',
  animateOn = 'view',
  sequential = true,
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const [isScrambling, setIsScrambling] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      setDisplayText(text);
      return;
    }

    let interval: any;
    let iteration = 0;

    const startScramble = () => {
      setIsScrambling(true);
      iteration = 0;

      interval = setInterval(() => {
        setDisplayText(() => {
          return text
            .split('')
            .map((char, idx) => {
              if (char === ' ') return ' ';
              if (sequential) {
                if (idx < iteration) return text[idx];
              }
              return characters[Math.floor(Math.random() * characters.length)];
            })
            .join('');
        });

        iteration += 1;

        if (iteration > (sequential ? text.length + 2 : maxIterations)) {
          clearInterval(interval);
          setDisplayText(text);
          setIsScrambling(false);
        }
      }, speed);
    };

    if (animateOn === 'view') {
      startScramble();
    } else if (animateOn === 'hover' && isHovering) {
      startScramble();
    } else {
      setDisplayText(text);
    }

    return () => clearInterval(interval);
  }, [text, speed, maxIterations, characters, animateOn, isHovering, sequential, reduceMotion]);

  return (
    <span
      ref={containerRef}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={parentClassName}
    >
      <span className={className}>{displayText}</span>
    </span>
  );
}
