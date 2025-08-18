export default function MegaFeiraLogo({ className = "h-16" }: { className?: string }) {
  return (
    <div className={`${className} flex items-center justify-center font-bold`}>
      <span className="text-mega-500">MEGA</span>
      <span className="text-gray-800 ml-2">FEIRA</span>
    </div>
  )
}