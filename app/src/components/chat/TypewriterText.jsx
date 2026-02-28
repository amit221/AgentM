import React, { useEffect, useState, memo } from 'react';

const TypewriterText = memo(({ text, speed = 5, onComplete }) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        // Batch update - add 2 characters at once to reduce re-renders by 50%
        const batchSize = Math.min(2, text.length - currentIndex);
        const newText = text.substring(0, currentIndex + batchSize);
        
        setDisplayText(newText);
        setCurrentIndex(currentIndex + batchSize);
      }, speed);
      return () => clearTimeout(timeout);
    }
    if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  return displayText;
});

TypewriterText.displayName = 'TypewriterText';

export default TypewriterText;


