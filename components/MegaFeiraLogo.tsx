export default function MegaFeiraLogo({ className = "h-16" }: { className?: string }) {
  return (
    <div className={`${className} flex items-center justify-center font-bold`}>
      <span className="text-neon">MEGA</span>
      <span className="text-white ml-2">FEIRA</span>
    </div>
  )
}