export default function MegaFeiraLogo({
  className = "h-16",
  showTagline = false,
  darkMode = true
}: {
  className?: string
  showTagline?: boolean
  darkMode?: boolean
}) {
  return (
    <div className={`${className} flex flex-col items-center justify-center`}>
      <div className="flex items-center font-black tracking-wide">
        <span style={{ color: '#7CC69B', fontStyle: 'italic' }}>MEGA</span>
        <span className={`ml-2 ${darkMode ? 'text-white' : 'text-gray-800'}`} style={!darkMode ? { color: '#2D3436' } : {}}>FEIRA</span>
      </div>
      {showTagline && (
        <span className="text-gray-400 text-sm mt-1 tracking-wider">acessando conexões</span>
      )}
    </div>
  )
}