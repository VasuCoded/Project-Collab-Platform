import { ImageResponse } from 'next/og'

export const alt = 'Collab Platform'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '96px',
          background: '#0a0a0a',
          color: '#ffffff',
        }}
      >
        <div style={{ fontSize: 40, color: '#8a8a8a', marginBottom: 20, letterSpacing: 2 }}>
          COLLAB PLATFORM
        </div>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>
          A workspace for small teams.
        </div>
        <div style={{ fontSize: 38, color: '#a8a8a8', marginTop: 28 }}>
          Chat, tasks, notes, and files in one place.
        </div>
      </div>
    ),
    { ...size },
  )
}
