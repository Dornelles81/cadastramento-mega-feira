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
      <div className="flex items-center font-bold tracking-wide">
        <span className="text-verde-agua italic">MEGA</span>
        <span className={`ml-2 ${darkMode ? 'text-white' : 'text-azul-marinho'}`}>FEIRA</span>
      </div>
      {showTagline && (
        <span className="text-cinza text-sm mt-1">acessando conexões</span>
      )}
    </div>
  )
}