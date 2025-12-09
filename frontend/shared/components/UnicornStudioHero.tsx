import React from 'react'
import { useNavigate } from 'react-router-dom'
import ArcticSprite from './ArcticSprite.jsx'
import '@app/styles/unicorn-studio-hero.css'

const UnicornStudioHero = ({
  onConnectWallet,
  connectingWallet = false,
  error = null
}) => {
  const navigate = useNavigate()

  return (
    <main className="unicorn-hero">
      {/* Arctic Walrus Sprite */}
      <ArcticSprite type="walrus" />

      {/* Mobile stars background */}
      <div className="unicorn-hero__stars-mobile"></div>

      {/* Aurora overlay */}
      <div className="unicorn-hero__aurora"></div>

      {/* Top Header */}
      <div className="unicorn-hero__header">
        <div className="unicorn-hero__header-content">
          <div className="unicorn-hero__brand">
            <div className="unicorn-hero__brand-logo">
              WALSHEETZ
            </div>
            <div className="unicorn-hero__divider"></div>
            <span className="unicorn-hero__brand-est">EST. 2025</span>
          </div>

          <div className="unicorn-hero__coords">
            <span>Made by Dreamlit Apps</span>
          </div>
        </div>
      </div>

      {/* Corner Frame Accents */}
      <div className="unicorn-hero__frame unicorn-hero__frame--tl"></div>
      <div className="unicorn-hero__frame unicorn-hero__frame--tr"></div>
      <div className="unicorn-hero__frame unicorn-hero__frame--bl"></div>
      <div className="unicorn-hero__frame unicorn-hero__frame--br"></div>

      {/* CTA Content */}
      <div className="unicorn-hero__content-wrapper">
        <div className="unicorn-hero__content">
          <div className="unicorn-hero__content-inner">
            {/* Top decorative line */}
            <div className="unicorn-hero__decorative-line">
              <div className="unicorn-hero__decorative-line-start"></div>
              <span className="unicorn-hero__decorative-symbol">∞</span>
              <div className="unicorn-hero__decorative-line-end"></div>
            </div>

            {/* Title with dithered accent */}
            <div className="unicorn-hero__title-container">
              <div className="unicorn-hero__dither-accent"></div>
              <h1 className="unicorn-hero__title">
                WALSHEETZ
              </h1>
            </div>

            {/* Decorative dots pattern */}
            <div className="unicorn-hero__dots">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="unicorn-hero__dot"></div>
              ))}
            </div>

            {/* Description */}
            <div className="unicorn-hero__description-container">
              <p className="unicorn-hero__description">
                Navigate the frozen frontier of decentralized spreadsheets. Built on Sui and Walrus,
                your data flows through the ice like ancient glaciers—immutable, transparent, unstoppable.
              </p>
              <div className="unicorn-hero__corner-accent"></div>
            </div>

            {/* Error message */}
            {error && (
              <div className="unicorn-hero__error">
                ❌ {error}
              </div>
            )}

            {/* Buttons */}
            <div className="unicorn-hero__buttons">
              <button
                className="unicorn-hero__button unicorn-hero__button--primary"
                onClick={onConnectWallet}
                disabled={connectingWallet}
              >
                <span className="unicorn-hero__button-corner unicorn-hero__button-corner--tl"></span>
                <span className="unicorn-hero__button-corner unicorn-hero__button-corner--br"></span>
                {connectingWallet ? '⏳ CONNECTING...' : '🦭 CONNECT WALLET'}
              </button>

              <button
                className="unicorn-hero__button unicorn-hero__button--secondary"
                onClick={() => navigate('/explore')}
              >
                EXPLORE THE TUNDRA
              </button>
            </div>

            {/* Bottom technical notation */}
            <div className="unicorn-hero__technical-notation">
              <span className="unicorn-hero__technical-symbol">∞</span>
              <div className="unicorn-hero__technical-line"></div>
              <span className="unicorn-hero__technical-text">ICE.PROTOCOL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="unicorn-hero__footer">
        <div className="unicorn-hero__footer-content">
          <div className="unicorn-hero__footer-left">
            <span className="unicorn-hero__footer-status-desktop">SYSTEM.ACTIVE</span>
            <span className="unicorn-hero__footer-status-mobile">SYS.ACT</span>
            <div className="unicorn-hero__audio-bars">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="unicorn-hero__audio-bar"
                  style={{ height: `${Math.random() * 12 + 4}px` }}
                ></div>
              ))}
            </div>
            <span>V1.0.0</span>
          </div>

          <div className="unicorn-hero__footer-right">
            <a
              href="https://x.com/dreamlit_sui"
              target="_blank"
              rel="noopener noreferrer"
              className="unicorn-hero__footer-link"
            >
              @dreamlit_sui
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

export default UnicornStudioHero
