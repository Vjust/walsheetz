import React, { useRef, useEffect, useState } from 'react';

function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return mousePosition;
}

const BlizzardParticles = ({
  className = "",
  quantity = 150,
  color = "#ffffff",
}) => {
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const context = useRef(null);
  const particles = useRef([]);
  const mousePosition = useMousePosition();
  const mouse = useRef({ x: 0, y: 0 });
  const canvasSize = useRef({ w: 0, h: 0 });
  const animationFrameRef = useRef(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;

  useEffect(() => {
    if (canvasRef.current) {
      context.current = canvasRef.current.getContext('2d');
    }
    initCanvas();
    animate();
    window.addEventListener('resize', initCanvas);

    return () => {
      window.removeEventListener('resize', initCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onMouseMove();
  }, [mousePosition.x, mousePosition.y]);

  const initCanvas = () => {
    resizeCanvas();
    createParticles();
  };

  const onMouseMove = () => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const { w, h } = canvasSize.current;
      const x = mousePosition.x - rect.left - w / 2;
      const y = mousePosition.y - rect.top - h / 2;
      const inside = x < w / 2 && x > -w / 2 && y < h / 2 && y > -h / 2;
      if (inside) {
        mouse.current.x = x;
        mouse.current.y = y;
      }
    }
  };

  const resizeCanvas = () => {
    if (canvasContainerRef.current && canvasRef.current && context.current) {
      particles.current.length = 0;
      canvasSize.current.w = canvasContainerRef.current.offsetWidth;
      canvasSize.current.h = canvasContainerRef.current.offsetHeight;
      canvasRef.current.width = canvasSize.current.w * dpr;
      canvasRef.current.height = canvasSize.current.h * dpr;
      canvasRef.current.style.width = `${canvasSize.current.w}px`;
      canvasRef.current.style.height = `${canvasSize.current.h}px`;
      context.current.scale(dpr, dpr);
    }
  };

  const createParticles = () => {
    for (let i = 0; i < quantity; i++) {
      particles.current.push({
        x: Math.random() * canvasSize.current.w,
        y: Math.random() * canvasSize.current.h,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 3 + 1,
        size: Math.random() * 4 + 1,
        opacity: Math.random() * 0.8 + 0.2,
        life: 1
      });
    }
  };

  const animate = () => {
    if (!context.current) return;

    context.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);

    particles.current.forEach((particle, index) => {
      // Update particle position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Wind effect with sine wave
      particle.vx += Math.sin(Date.now() * 0.001 + particle.x * 0.01) * 0.1;

      // Mouse interaction
      const dx = mouse.current.x - particle.x;
      const dy = mouse.current.y - particle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 100) {
        const force = (100 - distance) / 100;
        particle.vx -= (dx / distance) * force * 0.5;
        particle.vy -= (dy / distance) * force * 0.5;
      }

      // Reset particle if it goes off screen
      if (particle.y > canvasSize.current.h + 10) {
        particle.y = -10;
        particle.x = Math.random() * canvasSize.current.w;
        particle.vx = (Math.random() - 0.5) * 2;
      }
      if (particle.x > canvasSize.current.w + 10) {
        particle.x = -10;
      }
      if (particle.x < -10) {
        particle.x = canvasSize.current.w + 10;
      }

      // Draw particle with glow effect
      if (context.current) {
        context.current.save();
        context.current.globalAlpha = particle.opacity;

        // Outer glow
        context.current.shadowBlur = 10;
        context.current.shadowColor = color;
        context.current.fillStyle = color;

        context.current.beginPath();
        context.current.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.current.fill();

        // Inner particle
        context.current.shadowBlur = 0;
        context.current.fillStyle = '#ffffff';
        context.current.beginPath();
        context.current.arc(particle.x, particle.y, particle.size * 0.5, 0, Math.PI * 2);
        context.current.fill();

        context.current.restore();
      }
    });

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  return (
    <div
      className={`blizzard-particles ${className}`}
      ref={canvasContainerRef}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="blizzard-canvas" />
    </div>
  );
};

export default BlizzardParticles;