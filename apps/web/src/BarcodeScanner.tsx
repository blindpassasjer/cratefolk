import { Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Record barcodes are EAN-13 / UPC-A (sometimes EAN-8 or UPC-E).
const FORMATS = ['ean_13', 'upc_a', 'ean_8', 'upc_e']

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector

// The camera needs a secure context (HTTPS or localhost) and getUserMedia.
export const canScan = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

export default function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    let stopped = false
    let stop = () => {}
    const found = (code: string) => {
      if (stopped) return
      stopped = true
      stop()
      onScan(code)
    }

    async function start() {
      const video = videoRef.current
      if (!video) return
      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      try {
        if (Native) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
          stop = () => stream.getTracks().forEach((t) => t.stop())
          if (stopped) return stop()
          video.srcObject = stream
          await video.play()
          setStarting(false)
          const detector = new Native({ formats: FORMATS })
          const timer = window.setInterval(async () => {
            if (video.readyState < 2) return
            const hits = await detector.detect(video).catch(() => [])
            if (hits[0]) found(hits[0].rawValue)
          }, 250)
          const release = stop
          stop = () => {
            clearInterval(timer)
            release()
          }
        } else {
          // Safari/Firefox have no BarcodeDetector: load the ZXing decoder only when someone taps Scan.
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const controls = await new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 }).decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            video,
            (result) => result && found(result.getText()),
          )
          stop = () => controls.stop()
          if (stopped) return stop()
          setStarting(false)
        }
      } catch (e) {
        setStarting(false)
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        setError(denied ? 'Camera access was blocked. Allow it in your browser settings to scan.' : 'Could not start the camera.')
      }
    }
    void start()

    return () => {
      stopped = true
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan a barcode" className="fixed inset-0 z-30 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <h2 className="font-semibold">Scan a barcode</h2>
          <button onClick={onClose} aria-label="Close scanner" className="text-ink-500 hover:text-ink-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} playsInline muted className="size-full object-cover" />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-ink-500">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {!error && !starting && <div className="pointer-events-none absolute inset-x-[10%] inset-y-[30%] rounded-lg border-2 border-wax/80" />}
          {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-300">{error}</p>}
        </div>
        <p className="px-4 py-3 text-center text-xs text-ink-500">Hold the barcode on the sleeve inside the frame.</p>
      </div>
    </div>
  )
}
