export default function Home() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: '#888',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 18, color: '#555' }}>Welcome 👋</div>
      <div style={{ fontSize: 14 }}>Pick a space on the left, or hit + to create one.</div>
    </div>
  )
}
