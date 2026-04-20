import { useEffect } from 'react';

export function useParallaxTilt() {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate normalized mouse coordinates (-1 to 1)
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;

      // Adjust these multipliers to control the intensity of the tilt
      const rotateX = y * -10; // Max 10 degrees tilt up/down
      const rotateY = x * 10;  // Max 10 degrees tilt left/right

      // Apply to root body or specific wrapper
      document.documentElement.style.setProperty('--mouse-x', x.toString());
      document.documentElement.style.setProperty('--mouse-y', y.toString());
      document.documentElement.style.setProperty('--rotate-x', `${rotateX}deg`);
      document.documentElement.style.setProperty('--rotate-y', `${rotateY}deg`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
}
