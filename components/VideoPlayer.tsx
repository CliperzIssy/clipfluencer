'use client'

interface VideoPlayerProps {
  videoPath: string
}

export default function VideoPlayer({ videoPath }: VideoPlayerProps) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <video
        src={videoPath}
        controls
        className="w-full"
        controlsList="nodownload"
      >
        Your browser does not support the video tag.
      </video>
    </div>
  )
}
