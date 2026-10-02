export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
      Cratelog
    </span>
  )
}
