import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Snowflake, Wind, Mountain, ArrowDown } from 'lucide-react';
import BlizzardParticles from './BlizzardParticles.jsx';

const IcyBlizzardHero = ({
  className = "",
  onConnectWallet,
  connectingWallet = false,
  error = null
}) => {
  const { scrollY } = useScroll();
  const heroRef = useRef(null);

  const backgroundY = useTransform(scrollY, [0, 1000], [0, -300]);
  const textY = useTransform(scrollY, [0, 500], [0, -150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  const handleScrollToContent = () => {
    const contentSection = document.getElementById('content-section');
    if (contentSection) {
      contentSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={`icy-blizzard-hero ${className}`}>
      {/* Background gradient */}
      <motion.div
        className="blizzard-background"
        style={{ y: backgroundY }}
      />

      {/* Blizzard particles */}
      <BlizzardParticles quantity={200} color="#B3E5FC" />

      {/* Mountain silhouettes */}
      <motion.div
        className="mountain-silhouettes"
        style={{ y: backgroundY }}
      >
        <div className="mountains-container">
          <Mountain className="mountain mountain-1" />
          <Mountain className="mountain mountain-2" />
          <Mountain className="mountain mountain-3" />
        </div>
      </motion.div>

      {/* Hero content */}
      <motion.div
        ref={heroRef}
        className="hero-content"
        style={{ y: textY, opacity }}
      >
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="hero-icon"
        >
          <Snowflake className="snowflake-icon" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="hero-title"
        >
          <span className="title-icy">WALRUS</span>
          <br />
          <span className="title-blizzard">SHEETZ</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="hero-subtitle"
        >
          Navigate your data like a walrus on ice sheets - Arctic collaborative spreadsheets on the blockchain
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1 }}
          className="hero-actions"
        >
          <button
            onClick={onConnectWallet}
            disabled={connectingWallet}
            className={`connect-wallet-button ${connectingWallet ? 'loading' : ''}`}
          >
            <Wind className="button-icon" />
            {connectingWallet ? '⏳ Connecting...' : '🦭 Connect Slush Wallet'}
          </button>

          {error && (
            <div className="error-message">
              ❌ {error}
            </div>
          )}

          <button
            onClick={handleScrollToContent}
            className="explore-button"
          >
            <ArrowDown className="button-icon" />
            Explore Features
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="scroll-indicator"
        >
          <ArrowDown className="scroll-arrow" />
        </motion.div>
      </motion.div>

      {/* Features section */}
      <section id="content-section" className="features-section">
        <div className="features-container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="features-header"
          >
            <h2 className="features-title">
              Embrace the <span className="features-accent">Ice</span>
            </h2>
            <p className="features-subtitle">
              Discover the power of blockchain spreadsheets through our immersive Arctic experience
            </p>
          </motion.div>

          <div className="features-grid">
            {[
              {
                icon: <Snowflake className="feature-icon" />,
                title: "Frozen Data",
                description: "Your spreadsheets are immutably stored on the Sui blockchain"
              },
              {
                icon: <Wind className="feature-icon" />,
                title: "Walrus Storage",
                description: "Large files flow through the decentralized Walrus network"
              },
              {
                icon: <Mountain className="feature-icon" />,
                title: "Arctic Security",
                description: "Navigate your data with cryptographic proof of ownership"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="feature-card"
              >
                <div className="feature-icon-container">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default IcyBlizzardHero;