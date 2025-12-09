import React from 'react'
import './arctic-sprite.css'

const ArcticSprite = ({ type = 'walrus' }) => {
  if (type === 'walrus') {
    return (
      <div className="arctic-sprite arctic-sprite--walrus">
        <svg
          className="arctic-sprite__svg"
          viewBox="0 0 220 160"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gradient for body depth */}
            <radialGradient id="bodyGradient" cx="50%" cy="40%">
              <stop offset="0%" stopColor="#7DC5DD" />
              <stop offset="60%" stopColor="#5FB3D1" />
              <stop offset="100%" stopColor="#4A9BB5" />
            </radialGradient>

            {/* Gradient for head */}
            <radialGradient id="headGradient" cx="45%" cy="35%">
              <stop offset="0%" stopColor="#8BD4E8" />
              <stop offset="70%" stopColor="#6DC5E0" />
              <stop offset="100%" stopColor="#5AB0C9" />
            </radialGradient>

            {/* Shadow filter */}
            <filter id="shadow">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
              <feOffset dx="2" dy="3" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Tail (back flipper) */}
          <ellipse
            cx="160"
            cy="110"
            rx="18"
            ry="25"
            fill="url(#bodyGradient)"
            opacity="0.9"
            transform="rotate(35 160 110)"
            filter="url(#shadow)"
          />

          {/* Main body with texture */}
          <ellipse
            cx="105"
            cy="95"
            rx="65"
            ry="48"
            fill="url(#bodyGradient)"
            className="arctic-sprite__body"
            filter="url(#shadow)"
          />

          {/* Body wrinkles/texture */}
          <ellipse cx="105" cy="105" rx="50" ry="8" fill="#4A9BB5" opacity="0.15" />
          <ellipse cx="105" cy="98" rx="55" ry="6" fill="#4A9BB5" opacity="0.1" />
          <ellipse cx="105" cy="90" rx="52" ry="7" fill="#4A9BB5" opacity="0.12" />

          {/* Belly highlight */}
          <ellipse
            cx="105"
            cy="100"
            rx="40"
            ry="25"
            fill="#A8DEF0"
            opacity="0.25"
          />

          {/* Left flipper - more separated */}
          <ellipse
            cx="55"
            cy="105"
            rx="20"
            ry="32"
            fill="url(#bodyGradient)"
            className="arctic-sprite__flipper"
            transform="rotate(-25 55 105)"
            filter="url(#shadow)"
          />
          <ellipse cx="55" cy="115" rx="12" ry="5" fill="#4A9BB5" opacity="0.2" transform="rotate(-25 55 115)" />

          {/* Right flipper - more separated */}
          <ellipse
            cx="155"
            cy="105"
            rx="20"
            ry="32"
            fill="url(#bodyGradient)"
            className="arctic-sprite__flipper"
            transform="rotate(25 155 105)"
            filter="url(#shadow)"
          />
          <ellipse cx="155" cy="115" rx="12" ry="5" fill="#4A9BB5" opacity="0.2" transform="rotate(25 155 115)" />

          {/* Head */}
          <ellipse
            cx="105"
            cy="60"
            rx="48"
            ry="42"
            fill="url(#headGradient)"
            className="arctic-sprite__head"
            filter="url(#shadow)"
          />

          {/* Head texture/wrinkles */}
          <ellipse cx="105" cy="55" rx="35" ry="5" fill="#5AB0C9" opacity="0.15" />
          <ellipse cx="105" cy="65" rx="38" ry="4" fill="#5AB0C9" opacity="0.12" />

          {/* Snout/muzzle */}
          <ellipse
            cx="105"
            cy="72"
            rx="20"
            ry="14"
            fill="#5AB0C9"
            className="arctic-sprite__snout"
          />
          <ellipse cx="105" cy="70" rx="18" ry="10" fill="#6DC5E0" opacity="0.3" />

          {/* Nostrils */}
          <ellipse cx="100" cy="74" rx="2" ry="3" fill="#3A7B95" opacity="0.7" />
          <ellipse cx="110" cy="74" rx="2" ry="3" fill="#3A7B95" opacity="0.7" />

          {/* Left tusk - more realistic */}
          <path
            d="M 88 78 Q 85 95, 83 110"
            stroke="#F5F9FA"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            className="arctic-sprite__tusk arctic-sprite__tusk--left"
            opacity="0.95"
          />
          <path
            d="M 88 78 Q 85 95, 83 110"
            stroke="#E8F4F8"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Right tusk - more realistic */}
          <path
            d="M 122 78 Q 125 95, 127 110"
            stroke="#F5F9FA"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            className="arctic-sprite__tusk arctic-sprite__tusk--right"
            opacity="0.95"
          />
          <path
            d="M 122 78 Q 125 95, 127 110"
            stroke="#E8F4F8"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Whisker spots */}
          <circle cx="72" cy="68" r="1.5" fill="#3A7B95" opacity="0.5" />
          <circle cx="76" cy="70" r="1.5" fill="#3A7B95" opacity="0.5" />
          <circle cx="80" cy="71" r="1.5" fill="#3A7B95" opacity="0.5" />
          <circle cx="138" cy="68" r="1.5" fill="#3A7B95" opacity="0.5" />
          <circle cx="134" cy="70" r="1.5" fill="#3A7B95" opacity="0.5" />
          <circle cx="130" cy="71" r="1.5" fill="#3A7B95" opacity="0.5" />

          {/* Eyes */}
          <circle
            cx="90"
            cy="55"
            r="4"
            fill="#1A3A45"
            className="arctic-sprite__eye"
          />
          <circle cx="91" cy="54" r="1.5" fill="#4A9BB5" opacity="0.6" />

          <circle
            cx="120"
            cy="55"
            r="4"
            fill="#1A3A45"
            className="arctic-sprite__eye"
          />
          <circle cx="121" cy="54" r="1.5" fill="#4A9BB5" opacity="0.6" />

          {/* Ice particles around walrus */}
          <circle cx="30" cy="50" r="1.5" fill="#B3E5FC" opacity="0.6" className="arctic-sprite__particle arctic-sprite__particle--1" />
          <circle cx="180" cy="60" r="1.5" fill="#B3E5FC" opacity="0.6" className="arctic-sprite__particle arctic-sprite__particle--2" />
          <circle cx="40" cy="90" r="1" fill="#B3E5FC" opacity="0.5" className="arctic-sprite__particle arctic-sprite__particle--3" />
          <circle cx="170" cy="100" r="1" fill="#B3E5FC" opacity="0.5" className="arctic-sprite__particle arctic-sprite__particle--4" />
          <circle cx="105" cy="25" r="2" fill="#B3E5FC" opacity="0.7" className="arctic-sprite__particle arctic-sprite__particle--5" />
        </svg>

        {/* Subtle shimmer effects on tusks */}
        <div className="arctic-sprite__shimmer arctic-sprite__shimmer--left"></div>
        <div className="arctic-sprite__shimmer arctic-sprite__shimmer--right"></div>
      </div>
    )
  }

  // Arctic fox variant (can be implemented later)
  return null
}

export default ArcticSprite
